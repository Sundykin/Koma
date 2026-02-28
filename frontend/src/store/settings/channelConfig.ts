/**
 * 渠道配置存储
 * 重构版：移除模板配置，改为 Provider 注入
 */
import { loadSettings, saveSettings } from './core';
import type { ChannelConfig, ChannelCapability } from '../../providers/channel/types';
import { hasChannelCapability } from '../../providers/channel/types';

const DEFAULT_CHANNEL_PRIORITY = 100;

function normalizeChannelConfig(config: ChannelConfig): ChannelConfig {
  return {
    ...config,
    priority: typeof config.priority === 'number' ? config.priority : DEFAULT_CHANNEL_PRIORITY,
  };
}

// ========== 渠道配置 CRUD ==========

/**
 * 获取所有渠道配置
 */
export async function getChannelConfigs(): Promise<ChannelConfig[]> {
  const settings = await loadSettings();
  return (settings.channelConfigs || []).map(normalizeChannelConfig);
}

/**
 * 按能力获取渠道配置
 */
export async function getChannelsByCapability(
  capability: ChannelCapability
): Promise<ChannelConfig[]> {
  const configs = await getChannelConfigs();
  return configs.filter(c => c.enabled && hasChannelCapability(c, capability));
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
  capability: ChannelCapability
): Promise<boolean> {
  const settings = await loadSettings();
  if (!settings.channelConfigs) return false;

  const target = settings.channelConfigs.find(c => c.id === id);
  if (!target || !target.capabilities.includes(capability)) return false;

  // 清除同能力其他渠道的默认状态
  settings.channelConfigs = settings.channelConfigs.map(c => {
    if (c.capabilities.includes(capability)) {
      return { ...c, isDefault: c.id === id, updatedAt: c.id === id ? Date.now() : c.updatedAt };
    }
    return c;
  });

  await saveSettings(settings);
  return true;
}

/**
 * 获取指定能力的默认渠道
 */
export async function getDefaultChannelConfig(
  capability: ChannelCapability
): Promise<ChannelConfig | null> {
  const configs = await getChannelsByCapability(capability);
  return configs.find(c => c.isDefault) || configs[0] || null;
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
    console.log(`[channelConfig] 已清理 ${toRemove.length} 条重复渠道配置`);
  }

  return toRemove.length;
}
