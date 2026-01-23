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

// 渠道配置
export {
  // 自定义渠道
  getCustomChannels,
  addCustomChannel,
  updateCustomChannel,
  deleteCustomChannel,
  testCustomChannel,
  // 统一渠道
  getUnifiedChannels,
  getUnifiedChannelsByCapability,
  addUnifiedChannel,
  updateUnifiedChannel,
  deleteUnifiedChannel,
  testUnifiedChannel,
} from './channelConfig';
