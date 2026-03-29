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
  return configs.filter(c => c.category === category);
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
      return config.category === 'image-hosting';
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
        : undefined;
  if (!category) {
    return null;
  }
  const selection = getDefaultMediaSelection(settings, category);
  if (!selection) {
    return null;
  }
  return settings.channelConfigs.find(c => c.id === selection.channelId) || null;
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
