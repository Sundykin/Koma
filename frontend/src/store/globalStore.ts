/**
 * 全局存储
 * 管理全局设置、最近项目、模型预设
 *
 * 注意：此文件已重构为重新导出 settings 模块
 * 实际实现已迁移到 store/settings/ 目录
 */

// 核心函数使用动态导入包装（避免与 PluginAPI.ts 动态导入冲突）
export const loadSettings = async () => {
  const { loadSettings: fn } = await import('./settings');
  return fn();
};

export const saveSettings = async (settings: any) => {
  const { saveSettings: fn } = await import('./settings');
  return fn(settings);
};

// 其他静态导出
export {
  // 核心（非冲突项）
  generateId,
  getGlobalPath,
  DEFAULT_SETTINGS,
  // 预设常量
  LLM_CHANNEL_PRESETS,
  TTI_PRESETS,
  ITV_PRESETS,
  TTS_PRESETS,
  // LLM 配置
  addLLMConfig,
  updateLLMConfig,
  deleteLLMConfig,
  setDefaultLLMConfig,
  getDefaultLLMConfig,
  getLLMConfigById,
  getActiveLLMConfig,
  // TTI 配置
  addTTIConfig,
  updateTTIConfig,
  deleteTTIConfig,
  setDefaultTTIConfig,
  getDefaultTTIConfig,
  getTTIConfigById,
  getActiveTTIConfig,
  // ITV 配置
  addITVConfig,
  updateITVConfig,
  deleteITVConfig,
  setDefaultITVConfig,
  getDefaultITVConfig,
  getITVConfigById,
  getActiveITVConfig,
  // TTS 配置
  addTTSConfig,
  updateTTSConfig,
  deleteTTSConfig,
  setDefaultTTSConfig,
  getDefaultTTSConfig,
  getTTSConfigById,
  getActiveTTSConfig,
  // 最近项目
  loadRecentProjects,
  saveRecentProjects,
  addRecentProject,
  removeRecentProject,
  // 模型预设
  loadPresets,
  savePreset,
  deletePreset,
  // 视觉风格预设
  getCustomThemePresets,
  addCustomThemePreset,
  updateCustomThemePreset,
  deleteCustomThemePreset,
  // 渠道配置（重构版）
  getChannelConfigs,
  getChannelsByCapability,
  addChannelConfig,
  updateChannelConfig,
  deleteChannelConfig,
  deleteChannelsByPlugin,
  setDefaultChannelConfig,
  getDefaultChannelConfig,
  cleanupDuplicateChannels,
  cleanupLegacyConfigs,
  // 图床配置
  getImageHostingConfig,
  updateImageHostingConfig,
  setImageHostingEnabled,
  isImageHostingEnabled,
  DEFAULT_IMAGE_HOSTING_CONFIG,
} from './settings';

// 重新导出类型（用于外部引用）
export type { ModelPreset } from './settings';
