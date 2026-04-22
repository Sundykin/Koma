/**
 * 核心设置适配层
 *
 * 新版本：所有配置都落在 SQLite，状态由 `useConfigStore` 持有。
 * 本文件仅提供 `loadSettings` / `saveSettings` 等**兼容签名**函数，内部转发到
 * 对应 IPC。旧调用者的"加载 -> 修改 -> 回写"模式仍可工作，但每次 save 会触发
 * 多次 IPC；新代码应直接调用 `electronAPI.config.*`。
 */
import type { AppSettings } from '../../types';
import type { ChannelConfig } from '../../providers/channel/types';
import { ensureConfigReady, useConfigStore } from '../useConfigStore';
import { getConfigAPI } from '../../services/configBridge';
import { channelConfigToRow, rowToChannelConfig } from '../../providers/channel/rowMapper';

export const DEFAULT_SETTINGS: AppSettings = {
  channelConfigs: [],
  mediaDefaults: {},
  promptTemplates: {},
};

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @deprecated 保留路径工具以兼容残留调用方；存储根目录相关操作应走 `electronAPI.config.kv` (namespace=`storage`)
 */
export async function getGlobalPath(filename: string): Promise<string> {
  const api = getConfigAPI();
  const root = await api.kv.get<string>('storage', 'rootPath');
  return `${root || ''}/${filename}`;
}

function synthesizeSettings(): AppSettings {
  const state = useConfigStore.getState();
  const channels: ChannelConfig[] = [
    ...state.channels.llm,
    ...state.channels.tti,
    ...state.channels.itv,
    ...state.channels.tts,
  ].map(rowToChannelConfig);

  const mediaDefaults: AppSettings['mediaDefaults'] = {};
  const channelKv = state.kv['channel'] || [];
  for (const entry of channelKv) {
    // key 格式: default.llm / default.tti / ...
    if (typeof entry.key === 'string' && entry.key.startsWith('default.')) {
      const kind = entry.key.slice('default.'.length) as 'llm' | 'tti' | 'itv' | 'tts';
      if (entry.value && typeof entry.value === 'object') {
        mediaDefaults![kind] = entry.value as { channelId: string; modelId: string };
      }
    }
  }

  const promptTemplates: Record<string, { template: string; updatedAt: number }> = {};
  for (const row of state.prompts) {
    promptTemplates[row.type] = { template: row.template, updatedAt: row.updated_at };
  }

  return {
    channelConfigs: channels,
    mediaDefaults,
    promptTemplates,
  };
}

export async function loadSettings(): Promise<AppSettings> {
  await ensureConfigReady();
  return synthesizeSettings();
}

/**
 * 写回整组设置：拆成 channel / kv / prompt 三条 IPC 线。
 * 保持旧调用者的"load → mutate → save"语义。
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  await ensureConfigReady();
  const api = getConfigAPI();
  const state = useConfigStore.getState();

  // 1) 渠道配置
  const existingIds = new Set(
    [...state.channels.llm, ...state.channels.tti, ...state.channels.itv, ...state.channels.tts].map((r) => r.id),
  );
  const incomingIds = new Set((settings.channelConfigs ?? []).map((c) => c.id));

  for (const channel of settings.channelConfigs ?? []) {
    await api.channel.upsert(channelConfigToRow(channel));
  }
  // 删除本次 save 缺失的渠道
  for (const id of existingIds) {
    if (!incomingIds.has(id)) {
      await api.channel.delete(id);
    }
  }

  // 2) 媒体默认值
  for (const kind of ['llm', 'tti', 'itv', 'tts'] as const) {
    const selection = settings.mediaDefaults?.[kind];
    if (selection) {
      await api.kv.set('channel', `default.${kind}`, selection);
    } else {
      await api.kv.delete('channel', `default.${kind}`);
    }
  }

  // 3) Prompt 模板覆写
  if (settings.promptTemplates) {
    for (const [type, payload] of Object.entries(settings.promptTemplates)) {
      const existing = state.prompts.find((r) => r.type === type);
      const now = Date.now();
      await api.prompt.upsert({
        id: existing?.id ?? `tpl_${type}`,
        type,
        name: existing?.name ?? type,
        template: payload.template,
        variables_json: existing?.variables_json,
        description: existing?.description,
        is_builtin: existing?.is_builtin ?? 0,
        user_modified_at: now,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      });
    }
  }

  // 注意：customThemePresets / stylePrompts 等字段若存在应通过各自的 store
  // (themePresets.ts) 写入；本适配层不再直接处理，避免双写。

  // 强制刷新本地 store：config:changed 事件是异步投递的，调用方紧随其后的
  // loadSettings() 可能读到旧数据。显式 refresh 确保写入立即反映。
  const store = useConfigStore.getState();
  await Promise.all([
    store.refreshDomain('channel'),
    store.refreshDomain('prompt'),
    store.refreshDomain('kv'),
  ]);
}
