/**
 * 渠道配置存储
 * 重构版：移除模板配置，改为 Provider 注入
 */
import { loadSettings, saveSettings } from './core';
import type {
  ChannelConfig,
  ChannelCapability,
  MediaCategory,
  MediaModelSelection,
} from '../../providers/channel/types';
import { getChannelCategory } from '../../providers/channel/types';
import {
  getDefaultMediaSelection,
  resolveConfiguredChannelModel,
} from '../../providers/channel/resolver';

// ========== 渠道配置 CRUD ==========

/**
 * 获取所有渠道配置
 */
export async function getChannelConfigs(): Promise<ChannelConfig[]> {
  const settings = await loadSettings();
  return settings.channelConfigs || [];
}

export async function getChannelsByCategory(category: MediaCategory): Promise<ChannelConfig[]> {
  const configs = await getChannelConfigs();
  return configs.filter(config => getChannelCategory(config) === category);
}

/**
 * 按能力获取渠道配置
 */
export async function getChannelsByCapability(
  capability: ChannelCapability
): Promise<ChannelConfig[]> {
  const configs = await getChannelConfigs();
  return configs.filter((config) => {
    if (!config.enabled) {
      return false;
    }
    if (capability === 'image-hosting') {
      return getChannelCategory(config) === 'image-hosting';
    }
    const models = config.models || [];
    if (!models.length) {
      return false;
    }
    return models.some((model) => {
      if (capability === 'tti') return model.capabilities.includes('image.text-to-image');
      if (capability === 'itv') return model.capabilities.some(item => item.startsWith('video.'));
      if (capability === 'tts') return model.capabilities.includes('speech.text-to-speech');
      return false;
    });
  });
}

/**
 * 添加渠道配置
 */
export async function addChannelConfig(
  config: Omit<ChannelConfig, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ChannelConfig> {
  const settings = await loadSettings();
  if (!settings.channelConfigs) {
    settings.channelConfigs = [];
  }

  const now = Date.now();
  const newConfig: ChannelConfig = {
    ...config,
    id: `channel_${now}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: now,
    updatedAt: now,
  };

  settings.channelConfigs.push(newConfig);
  await saveSettings(settings);
  return newConfig;
}

/**
 * 更新渠道配置
 */
export async function updateChannelConfig(
  id: string,
  updates: Partial<Omit<ChannelConfig, 'id' | 'createdAt'>>
): Promise<ChannelConfig | null> {
  const settings = await loadSettings();
  if (!settings.channelConfigs) return null;

  const index = settings.channelConfigs.findIndex(c => c.id === id);
  if (index === -1) return null;

  settings.channelConfigs[index] = {
    ...settings.channelConfigs[index],
    ...updates,
    id,
    updatedAt: Date.now(),
  };
  await saveSettings(settings);
  return settings.channelConfigs[index];
}

/**
 * 删除渠道配置
 */
export async function deleteChannelConfig(id: string): Promise<boolean> {
  const settings = await loadSettings();
  if (!settings.channelConfigs) return false;

  const index = settings.channelConfigs.findIndex(c => c.id === id);
  if (index === -1) return false;

  settings.channelConfigs.splice(index, 1);
  if (settings.mediaDefaults) {
    for (const category of Object.keys(settings.mediaDefaults) as MediaCategory[]) {
      if (settings.mediaDefaults[category]?.channelId === id) {
        delete settings.mediaDefaults[category];
      }
    }
  }
  await saveSettings(settings);
  return true;
}

/**
 * 删除插件的所有渠道配置
 */
export async function deleteChannelsByPlugin(pluginId: string): Promise<number> {
  const settings = await loadSettings();
  if (!settings.channelConfigs) return 0;

  const before = settings.channelConfigs.length;
  settings.channelConfigs = settings.channelConfigs.filter(c => c.pluginId !== pluginId);
  const deleted = before - settings.channelConfigs.length;

  if (deleted > 0) {
    await saveSettings(settings);
  }
  return deleted;
}

/**
 * 设置指定能力的默认渠道
 * 会清除同能力的其他渠道的默认状态
 */
export async function setDefaultChannelConfig(
  id: string,
  capability: ChannelCapability,
): Promise<boolean> {
  const settings = await loadSettings();
  if (!settings.channelConfigs) return false;

  const target = settings.channelConfigs.find(c => c.id === id);
  if (!target) return false;

  const category = capability === 'tti'
    ? 'tti'
    : capability === 'itv'
      ? 'itv'
      : capability === 'tts'
        ? 'tts'
        : undefined;
  if (!category) {
    return false;
  }

  const modelId = target.defaultModelId || target.models?.[0]?.id;
  if (!modelId) {
    return false;
  }

  settings.mediaDefaults = {
    ...(settings.mediaDefaults || {}),
    [category]: {
      channelId: id,
      modelId,
    },
  };

  await saveSettings(settings);
  return true;
}

/**
 * 获取指定能力的默认渠道
 */
export async function getDefaultChannelConfig(
  capability: ChannelCapability
): Promise<ChannelConfig | null> {
  const settings = await loadSettings();
  const category = capability === 'tti'
    ? 'tti'
    : capability === 'itv'
      ? 'itv'
      : capability === 'tts'
        ? 'tts'
        : capability === 'image-hosting'
          ? 'image-hosting'
        : undefined;
  if (!category) {
    return null;
  }

  if (category === 'image-hosting') {
    return settings.channelConfigs.find(config => (
      config.enabled &&
      getChannelCategory(config) === 'image-hosting'
    )) || null;
  }

  const selection = getDefaultMediaSelection(settings, category);
  if (!selection) {
    return null;
  }
  return settings.channelConfigs.find(config => (
    config.id === selection.channelId &&
    getChannelCategory(config) === category
  )) || null;
}

export async function setDefaultMediaModelSelection(
  category: MediaCategory,
  selection: MediaModelSelection,
): Promise<boolean> {
  const settings = await loadSettings();
  const resolved = resolveConfiguredChannelModel(settings, category, selection);
  if (!resolved) {
    return false;
  }

  settings.mediaDefaults = {
    ...(settings.mediaDefaults || {}),
    [category]: selection,
  };
  await saveSettings(settings);
  return true;
}

export async function getDefaultMediaModelSelection(
  category: MediaCategory,
): Promise<MediaModelSelection | null> {
  const settings = await loadSettings();
  return getDefaultMediaSelection(settings, category) || null;
}

/**
 * 按 Provider 类型删除渠道配置（用于 unregisterProvider 清理）
 */
export async function deleteChannelByProviderType(
  providerType: string,
  pluginId: string
): Promise<boolean> {
  const settings = await loadSettings();
  if (!settings.channelConfigs) return false;

  const index = settings.channelConfigs.findIndex(
    c => c.providerType === providerType && c.pluginId === pluginId
  );
  if (index === -1) return false;

  settings.channelConfigs.splice(index, 1);
  await saveSettings(settings);
  return true;
}

// ========== 迁移：删除旧配置 ==========

/**
 * 清理重复的渠道配置
 * 保留每个 (providerType, pluginId) 组合的最新一条
 */
export async function cleanupDuplicateChannels(): Promise<number> {
  const settings = await loadSettings();
  if (!settings.channelConfigs || settings.channelConfigs.length === 0) return 0;

  const seen = new Map<string, ChannelConfig>();
  const toRemove: string[] = [];

  // 按 updatedAt 降序排列，保留最新的
  const sorted = [...settings.channelConfigs].sort((a, b) => b.updatedAt - a.updatedAt);

  for (const config of sorted) {
    const key = `${config.providerType}:${config.pluginId || 'builtin'}`;
    if (seen.has(key)) {
      toRemove.push(config.id);
    } else {
      seen.set(key, config);
    }
  }

  if (toRemove.length > 0) {
    settings.channelConfigs = settings.channelConfigs.filter(c => !toRemove.includes(c.id));
    await saveSettings(settings);
  }

  return toRemove.length;
}

/**
 * 清理旧版配置数据
 * 删除 customChannels 和 unifiedChannels
 */
export async function cleanupLegacyConfigs(): Promise<{
  customChannelsDeleted: number;
  unifiedChannelsDeleted: number;
}> {
  const settings = await loadSettings();
  const legacySettings = settings as Record<string, any>;
  const result = {
    customChannelsDeleted: legacySettings.customChannels?.length || 0,
    unifiedChannelsDeleted: legacySettings.unifiedChannels?.length || 0,
  };

  // 删除旧配置
  delete legacySettings.customChannels;
  delete legacySettings.unifiedChannels;

  if (result.customChannelsDeleted > 0 || result.unifiedChannelsDeleted > 0) {
    await saveSettings(settings);
  }

  return result;
}

// ========== Koma 官方渠道统一激活 ==========

const KOMA_BASE_URL = 'https://api.568069.xyz';

const KOMA_OFFICIAL_CHANNELS = {
  llm: {
    providerType: 'koma-official-llm',
    category: 'llm' as MediaCategory,
    name: 'Koma 官方',
    baseUrl: `${KOMA_BASE_URL}/v1`,
    defaultModels: [
      { id: 'gpt-4o', name: 'GPT-4o', capabilities: ['chat'] as string[] },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', capabilities: ['chat'] as string[] },
    ],
  },
  tti: {
    providerType: 'koma-official-tti',
    category: 'tti' as MediaCategory,
    name: 'Koma 官方（文生图）',
    baseUrl: KOMA_BASE_URL,
    defaultModels: [
      { id: 'gpt-image-1', name: 'GPT Image 1', capabilities: ['image.text-to-image'] as string[] },
    ],
  },
  itv: {
    providerType: 'koma-official',
    category: 'itv' as MediaCategory,
    name: 'Koma 官方',
    baseUrl: KOMA_BASE_URL,
    defaultModels: [
      { id: 'vidu-2.0', name: 'Vidu 2.0', capabilities: ['video.image-to-video'] as string[] },
    ],
  },
} as const;

/**
 * 通过 IPC 桥接发起外部 HTTP 请求（绕过渲染进程 CORS 限制）
 */
async function ipcFetch(url: string, headers?: Record<string, string>): Promise<{
  ok: boolean;
  status: number;
  body: string;
}> {
  if (typeof window !== 'undefined' && (window as any).electron?.ipcRenderer) {
    return (window as any).electron.ipcRenderer.invoke('controller/net/fetch', {
      url,
      method: 'GET',
      headers,
    });
  }
  // fallback: 非 Electron 环境直接 fetch
  const resp = await fetch(url, { headers });
  return { ok: resp.ok, status: resp.status, body: await resp.text() };
}

/**
 * 测试 API Key 是否有效（调用 /v1/models）
 */
export async function testKomaApiKey(apiKey: string): Promise<boolean> {
  try {
    const resp = await ipcFetch(`${KOMA_BASE_URL}/v1/models`, {
      Authorization: `Bearer ${apiKey}`,
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * 查询 new-api 额度
 * 1. 优先 /api/user/self（需 session token，部分部署支持 API key）
 * 2. fallback 到 billing 端点（subscription + usage，token 级别额度）
 */
export async function queryKomaQuota(apiKey: string): Promise<{
  quota: number;
  usedQuota: number;
  balanceUSD: number;
} | null> {
  const bearerHeader = { Authorization: `Bearer ${apiKey}` };

  // 方式 1：/api/user/self —— 返回用户级完整额度（需 session token）
  for (const headers of [bearerHeader, { Authorization: apiKey }]) {
    try {
      const resp = await ipcFetch(`${KOMA_BASE_URL}/api/user/self`, headers);
      if (!resp.ok) continue;
      const json = JSON.parse(resp.body);
      if (json.success === false) continue;
      const data = json.data ?? json;
      if (data.quota !== undefined) {
        const quota = data.quota ?? 0;
        const usedQuota = data.used_quota ?? 0;
        return { quota, usedQuota, balanceUSD: (quota - usedQuota) / 500000 };
      }
    } catch { /* try next */ }
  }

  // 方式 2：billing 端点 —— token 级别额度
  try {
    const subResp = await ipcFetch(
      `${KOMA_BASE_URL}/v1/dashboard/billing/subscription`,
      bearerHeader,
    );
    if (subResp.ok) {
      const subJson = JSON.parse(subResp.body);
      const limitUSD = subJson.hard_limit_usd ?? 0;

      let usedUSD = 0;
      try {
        const usageResp = await ipcFetch(
          `${KOMA_BASE_URL}/v1/dashboard/billing/usage?start_date=2000-01-01&end_date=2099-12-31`,
          bearerHeader,
        );
        if (usageResp.ok) {
          const usageJson = JSON.parse(usageResp.body);
          usedUSD = (usageJson.total_usage ?? 0) / 100; // cents → USD
        }
      } catch { /* usage query failed, show limit only */ }

      return {
        quota: limitUSD * 500000,
        usedQuota: usedUSD * 500000,
        balanceUSD: limitUSD - usedUSD,
      };
    }
  } catch { /* give up */ }

  return null;
}

/**
 * 激活 Koma 官方渠道
 * 测试 API Key → 创建/更新三个 ChannelConfig
 */
export async function activateKomaOfficial(apiKey: string): Promise<{
  activated: string[];
  errors: string[];
}> {
  const activated: string[] = [];
  const errors: string[] = [];

  const settings = await loadSettings();
  if (!settings.channelConfigs) settings.channelConfigs = [];

  for (const [key, def] of Object.entries(KOMA_OFFICIAL_CHANNELS)) {
    try {
      const existing = settings.channelConfigs.find(
        c => c.providerType === def.providerType && c.source === 'builtin'
      );

      if (existing) {
        // 更新 apiKey 和 models
        existing.providerConfig = { ...existing.providerConfig, apiKey, baseUrl: def.baseUrl };
        existing.models = def.defaultModels.map(m => ({ ...m }));
        existing.enabled = true;
        existing.updatedAt = Date.now();
      } else {
        const now = Date.now();
        const newConfig: ChannelConfig = {
          id: `channel_koma_${key}_${now}`,
          providerType: def.providerType,
          name: def.name,
          source: 'builtin',
          category: def.category,
          enabled: true,
          providerConfig: { apiKey, baseUrl: def.baseUrl },
          models: def.defaultModels.map(m => ({ ...m })),
          createdAt: now,
          updatedAt: now,
        };
        settings.channelConfigs.push(newConfig);
      }

      // 如果该 category 没有默认选择，设为默认
      const cat = def.category;
      if (cat !== 'llm' && !settings.mediaDefaults?.[cat]) {
        const ch = settings.channelConfigs.find(
          c => c.providerType === def.providerType && c.source === 'builtin'
        );
        if (ch && def.defaultModels[0]) {
          settings.mediaDefaults = {
            ...(settings.mediaDefaults || {}),
            [cat]: { channelId: ch.id, modelId: def.defaultModels[0].id },
          };
        }
      }

      activated.push(key);
    } catch (e) {
      errors.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await saveSettings(settings);
  return { activated, errors };
}

/**
 * 取消激活 Koma 官方渠道
 * 禁用所有官方 ChannelConfig，清除对应 mediaDefaults
 */
export async function deactivateKomaOfficial(): Promise<void> {
  const settings = await loadSettings();
  if (!settings.channelConfigs) return;

  const officialProviders: string[] = Object.values(KOMA_OFFICIAL_CHANNELS).map(d => d.providerType);

  for (const config of settings.channelConfigs) {
    if (officialProviders.includes(config.providerType) && config.source === 'builtin') {
      config.enabled = false;
      config.updatedAt = Date.now();
    }
  }

  // 清除指向官方渠道的 mediaDefaults
  if (settings.mediaDefaults) {
    for (const category of Object.keys(settings.mediaDefaults) as MediaCategory[]) {
      const sel = settings.mediaDefaults[category];
      if (sel) {
        const ch = settings.channelConfigs.find(c => c.id === sel.channelId);
        if (ch && officialProviders.includes(ch.providerType) && ch.source === 'builtin') {
          delete settings.mediaDefaults[category];
        }
      }
    }
  }

  await saveSettings(settings);
}

/**
 * 获取官方渠道激活状态
 */
export async function getKomaOfficialStatus(): Promise<{
  activated: boolean;
  apiKey: string | null;
}> {
  const configs = await getChannelConfigs();
  const officialProviders: string[] = Object.values(KOMA_OFFICIAL_CHANNELS).map(d => d.providerType);
  const found = configs.find(
    c => officialProviders.includes(c.providerType) && c.source === 'builtin' && c.enabled
  );
  return {
    activated: !!found,
    apiKey: (found?.providerConfig?.apiKey as string) ?? null,
  };
}
