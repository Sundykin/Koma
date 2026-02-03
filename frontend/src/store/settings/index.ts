/**
 * Settings Store 统一导出
 */

// 核心
export { loadSettings, saveSettings, generateId, getGlobalPath, DEFAULT_SETTINGS } from './core';

// 预设常量
export { LLM_CHANNEL_PRESETS, TTI_PRESETS, ITV_PRESETS, TTS_PRESETS } from './presets';

// LLM 配置
export {
  addLLMConfig,
  updateLLMConfig,
  deleteLLMConfig,
  setDefaultLLMConfig,
  getDefaultLLMConfig,
  getLLMConfigById,
  getActiveLLMConfig,
} from './llmConfig';

// 媒体配置 (TTI/ITV/TTS)
export {
  // TTI
  addTTIConfig,
  updateTTIConfig,
  deleteTTIConfig,
  setDefaultTTIConfig,
  getDefaultTTIConfig,
  getTTIConfigById,
  getActiveTTIConfig,
  // ITV
  addITVConfig,
  updateITVConfig,
  deleteITVConfig,
  setDefaultITVConfig,
  getDefaultITVConfig,
  getITVConfigById,
  getActiveITVConfig,
  // TTS
  addTTSConfig,
  updateTTSConfig,
  deleteTTSConfig,
  setDefaultTTSConfig,
  getDefaultTTSConfig,
  getTTSConfigById,
  getActiveTTSConfig,
} from './mediaConfig';

// 最近项目
export {
  loadRecentProjects,
  saveRecentProjects,
  addRecentProject,
  removeRecentProject,
} from './recentProjects';

// 模型预设
export {
  loadPresets,
  savePreset,
  deletePreset,
} from './modelPresets';
export type { ModelPreset } from './modelPresets';

// 视觉风格预设
export {
  getCustomThemePresets,
  addCustomThemePreset,
  updateCustomThemePreset,
  deleteCustomThemePreset,
} from './themePresets';

// 渠道配置（重构版）- 使用动态导入避免与 PluginAPI.ts 冲突
export type { ChannelConfig, ChannelCapability } from '../../providers/channel/types';

export const getChannelConfigs = async () => {
  const { getChannelConfigs: fn } = await import('./channelConfig');
  return fn();
};

export const getChannelsByCapability = async (capability: import('../../providers/channel/types').ChannelCapability) => {
  const { getChannelsByCapability: fn } = await import('./channelConfig');
  return fn(capability);
};

export const addChannelConfig = async (config: Omit<import('../../providers/channel/types').ChannelConfig, 'id' | 'createdAt' | 'updatedAt'>) => {
  const { addChannelConfig: fn } = await import('./channelConfig');
  return fn(config);
};

export const updateChannelConfig = async (id: string, updates: Partial<Omit<import('../../providers/channel/types').ChannelConfig, 'id' | 'createdAt'>>) => {
  const { updateChannelConfig: fn } = await import('./channelConfig');
  return fn(id, updates);
};

export const deleteChannelConfig = async (id: string) => {
  const { deleteChannelConfig: fn } = await import('./channelConfig');
  return fn(id);
};

export const deleteChannelsByPlugin = async (pluginId: string) => {
  const { deleteChannelsByPlugin: fn } = await import('./channelConfig');
  return fn(pluginId);
};

export const deleteChannelByProviderType = async (providerType: string, pluginId: string) => {
  const { deleteChannelByProviderType: fn } = await import('./channelConfig');
  return fn(providerType, pluginId);
};

export const setDefaultChannelConfig = async (id: string, capability: import('../../providers/channel/types').ChannelCapability) => {
  const { setDefaultChannelConfig: fn } = await import('./channelConfig');
  return fn(id, capability);
};

export const getDefaultChannelConfig = async (capability: import('../../providers/channel/types').ChannelCapability) => {
  const { getDefaultChannelConfig: fn } = await import('./channelConfig');
  return fn(capability);
};

export const cleanupDuplicateChannels = async () => {
  const { cleanupDuplicateChannels: fn } = await import('./channelConfig');
  return fn();
};

export const cleanupLegacyConfigs = async () => {
  const { cleanupLegacyConfigs: fn } = await import('./channelConfig');
  return fn();
};

// 图床配置
export {
  getImageHostingConfig,
  updateImageHostingConfig,
  setImageHostingEnabled,
  isImageHostingEnabled,
  DEFAULT_IMAGE_HOSTING_CONFIG,
} from './imageHostingConfig';
