/**
 * 模型预设管理
 *
 * 本变更中"预设"概念已被"渠道配置"取代（channel_configs 包含完整渠道定义）。
 * 保留导出以兼容旧调用方；内部读取全部渠道作为预设视图；写入走 channel IPC。
 */
import { ensureConfigReady, useConfigStore } from '../useConfigStore';
import { getConfigAPI } from '../../services/configBridge';
import { channelConfigToRow, rowToChannelConfig } from '../../providers/channel/rowMapper';
import type { ChannelConfig } from '../../providers/channel/types';

export interface ModelPreset {
  name: string;
  type: 'llm' | 'tti' | 'tts' | 'itv';
  config: ChannelConfig;
}

function rowsToPresets(): ModelPreset[] {
  const s = useConfigStore.getState();
  const result: ModelPreset[] = [];
  for (const kind of ['llm', 'tti', 'itv', 'tts'] as const) {
    for (const row of s.channels[kind]) {
      const config = rowToChannelConfig(row);
      result.push({ name: config.name, type: kind, config });
    }
  }
  return result;
}

export async function loadPresets(): Promise<ModelPreset[]> {
  await ensureConfigReady();
  return rowsToPresets();
}

export async function savePreset(preset: ModelPreset): Promise<void> {
  const api = getConfigAPI();
  await api.channel.upsert(channelConfigToRow(preset.config));
  await useConfigStore.getState().refreshDomain('channel');
}

export async function deletePreset(presetName: string): Promise<void> {
  await ensureConfigReady();
  const presets = rowsToPresets();
  const target = presets.find((p) => p.name === presetName);
  if (target) {
    const api = getConfigAPI();
    await api.channel.delete(target.config.id);
    await useConfigStore.getState().refreshDomain('channel');
  }
}
