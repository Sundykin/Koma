/**
 * 渠道配置存储
 * 重构版：移除模板配置，改为 Provider 注入
 */
import { loadSettings, saveSettings } from './core';
import type { ChannelConfig, ChannelCapability } from '../../providers/channel/types';
import { hasChannelCapability } from '../../providers/channel/types';

// ========== 渠道配置 CRUD ==========

/**
 * 获取所有渠道配置
 */
export async function getChannelConfigs(): Promise<ChannelConfig[]> {
  const settings = await loadSettings();
  return settings.channelConfigs || [];
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
 * 清理旧版配置数据
 * 删除 customChannels 和 unifiedChannels
 */
export async function cleanupLegacyConfigs(): Promise<{
  customChannelsDeleted: number;
  unifiedChannelsDeleted: number;
}> {
  const settings = await loadSettings();
  const result = {
    customChannelsDeleted: settings.customChannels?.length || 0,
    unifiedChannelsDeleted: settings.unifiedChannels?.length || 0,
  };

  // 删除旧配置
  delete settings.customChannels;
  delete settings.unifiedChannels;

  if (result.customChannelsDeleted > 0 || result.unifiedChannelsDeleted > 0) {
    await saveSettings(settings);
    console.log('[channelConfig] 已清理旧版配置:', result);
  }

  return result;
}
