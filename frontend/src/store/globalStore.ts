/**
 * 全局存储
 * 管理全局设置、最近项目、模型预设
 */
import { electronService } from '../services/electronService';
import { getStorageConfig, initStorageConfig } from './storageConfig';
import { encryptSettings, decryptSettings } from './encryption';
import type {
  AppSettings,
  RecentProject,
  LLMModelConfig,
  LLMChannelPreset,
  TTIModelConfig,
  ITVModelConfig,
  TTSModelConfig,
  ProviderPreset,
} from '../types';

// ========== 路径工具 ==========

async function getGlobalPath(filename: string): Promise<string> {
  const config = getStorageConfig() || (await initStorageConfig());
  return `${config.rootPath}/${filename}`;
}

// ========== OpenAI 兼容渠道预设 ==========

export const LLM_CHANNEL_PRESETS: LLMChannelPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'qwen',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
  },
  {
    id: 'zhipu',
    name: '智谱 AI',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-flash', 'glm-4-plus', 'glm-4'],
  },
  {
    id: 'moonshot',
    name: '月之暗面',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  },
];

// ========== TTI 厂商预设 ==========

export const TTI_PRESETS: ProviderPreset[] = [
  { id: 'comfyui', name: 'ComfyUI (本地)', baseUrl: 'http://127.0.0.1:8188' },
  { id: 'jimeng', name: '即梦 AI', baseUrl: 'https://jimeng.jianying.com' },
  { id: 'qwen-image', name: '通义万相', baseUrl: 'https://dashscope.aliyuncs.com', models: ['wanx-v1', 'wanx2.1-t2i-turbo'] },
  { id: 'midjourney', name: 'Midjourney', baseUrl: 'https://api.midjourney.com' },
  { id: 'dall-e', name: 'DALL-E 3', baseUrl: 'https://api.openai.com/v1', models: ['dall-e-3', 'dall-e-2'] },
  { id: 'flux', name: 'Flux (Replicate)', baseUrl: 'https://api.replicate.com/v1', models: ['flux-1.1-pro', 'flux-schnell'] },
];

// ========== ITV 厂商预设 ==========

export const ITV_PRESETS: ProviderPreset[] = [
  { id: 'runway', name: 'Runway Gen-3', baseUrl: 'https://api.runwayml.com' },
  { id: 'kling', name: '可灵 AI', baseUrl: 'https://api.klingai.com' },
  { id: 'pika', name: 'Pika Labs', baseUrl: 'https://api.pika.art' },
  { id: 'minimax', name: 'MiniMax 海螺', baseUrl: 'https://api.minimax.chat' },
  { id: 'comfyui-animatediff', name: 'ComfyUI AnimateDiff', baseUrl: 'http://127.0.0.1:8188' },
];

// ========== TTS 厂商预设 ==========

export const TTS_PRESETS: ProviderPreset[] = [
  { id: 'edge-tts', name: 'Edge TTS (免费)' },
  { id: 'openai-tts', name: 'OpenAI TTS', baseUrl: 'https://api.openai.com/v1', models: ['tts-1', 'tts-1-hd'] },
  { id: 'doubao-tts', name: '豆包 TTS', baseUrl: 'https://openspeech.bytedance.com' },
  { id: 'fish-audio', name: 'Fish Audio', baseUrl: 'https://api.fish.audio' },
  { id: 'gpt-sovits', name: 'GPT-SoVITS (本地)', baseUrl: 'http://127.0.0.1:9880' },
];

// ========== 全局设置 ==========

const DEFAULT_SETTINGS: AppSettings = {
  llmConfigs: [],
  ttiConfigs: [],
  itvConfigs: [],
  ttsConfigs: [],
};

// 生成唯一 ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function loadSettings(): Promise<AppSettings> {
  if (!electronService.isElectron()) {
    try {
      const data = localStorage.getItem('koma_settings');
      if (data) {
        const parsed = JSON.parse(data);
        const decrypted = await decryptSettings(parsed);
        return { ...DEFAULT_SETTINGS, ...decrypted };
      }
    } catch {
      // ignore
    }
    return DEFAULT_SETTINGS;
  }

  try {
    const path = await getGlobalPath('settings.json');
    const exists = await electronService.fs.exists(path);
    if (exists) {
      const data = await electronService.fs.readFile(path);
      const parsed = JSON.parse(data);
      const decrypted = await decryptSettings(parsed);
      return { ...DEFAULT_SETTINGS, ...decrypted };
    }
  } catch (err) {
    console.error('[loadSettings] error:', err);
  }
  return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const encrypted = await encryptSettings(settings);

  if (!electronService.isElectron()) {
    localStorage.setItem('koma_settings', JSON.stringify(encrypted));
    return;
  }

  const path = await getGlobalPath('settings.json');
  await electronService.fs.writeFile(path, JSON.stringify(encrypted, null, 2));
}

// ========== LLM 配置 CRUD ==========

export async function addLLMConfig(config: Omit<LLMModelConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<LLMModelConfig> {
  const settings = await loadSettings();
  const now = Date.now();

  const newConfig: LLMModelConfig = {
    ...config,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  // 如果设为默认，取消其他配置的默认状态
  if (newConfig.isDefault) {
    settings.llmConfigs = settings.llmConfigs.map(c => ({ ...c, isDefault: false }));
  }
  // 如果是第一个配置，自动设为默认
  if (settings.llmConfigs.length === 0) {
    newConfig.isDefault = true;
  }

  settings.llmConfigs.push(newConfig);
  await saveSettings(settings);
  return newConfig;
}

export async function updateLLMConfig(id: string, updates: Partial<Omit<LLMModelConfig, 'id' | 'createdAt'>>): Promise<LLMModelConfig | null> {
  const settings = await loadSettings();
  const index = settings.llmConfigs.findIndex(c => c.id === id);

  if (index === -1) return null;

  // 如果设为默认，取消其他配置的默认状态
  if (updates.isDefault) {
    settings.llmConfigs = settings.llmConfigs.map(c => ({ ...c, isDefault: false }));
  }

  settings.llmConfigs[index] = {
    ...settings.llmConfigs[index],
    ...updates,
    updatedAt: Date.now(),
  };

  await saveSettings(settings);
  return settings.llmConfigs[index];
}

export async function deleteLLMConfig(id: string): Promise<boolean> {
  const settings = await loadSettings();
  const index = settings.llmConfigs.findIndex(c => c.id === id);

  if (index === -1) return false;

  const wasDefault = settings.llmConfigs[index].isDefault;
  settings.llmConfigs.splice(index, 1);

  // 如果删除的是默认配置，将第一个设为默认
  if (wasDefault && settings.llmConfigs.length > 0) {
    settings.llmConfigs[0].isDefault = true;
  }

  await saveSettings(settings);
  return true;
}

export async function setDefaultLLMConfig(id: string): Promise<boolean> {
  const settings = await loadSettings();
  const config = settings.llmConfigs.find(c => c.id === id);

  if (!config) return false;

  settings.llmConfigs = settings.llmConfigs.map(c => ({
    ...c,
    isDefault: c.id === id,
    updatedAt: c.id === id ? Date.now() : c.updatedAt,
  }));

  await saveSettings(settings);
  return true;
}

export async function getDefaultLLMConfig(): Promise<LLMModelConfig | null> {
  const settings = await loadSettings();
  return settings.llmConfigs.find(c => c.isDefault) || settings.llmConfigs[0] || null;
}

export async function getLLMConfigById(id: string): Promise<LLMModelConfig | null> {
  const settings = await loadSettings();
  return settings.llmConfigs.find(c => c.id === id) || null;
}

// 获取项目应使用的 LLM 配置（项目级 > 全局默认）
export async function getActiveLLMConfig(projectLLMConfigId?: string): Promise<LLMModelConfig | null> {
  if (projectLLMConfigId) {
    const projectConfig = await getLLMConfigById(projectLLMConfigId);
    if (projectConfig) return projectConfig;
  }
  return getDefaultLLMConfig();
}

// ========== TTI 配置 CRUD ==========

export async function addTTIConfig(config: Omit<TTIModelConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<TTIModelConfig> {
  const settings = await loadSettings();
  const now = Date.now();

  const newConfig: TTIModelConfig = {
    ...config,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  if (newConfig.isDefault) {
    settings.ttiConfigs = settings.ttiConfigs.map(c => ({ ...c, isDefault: false }));
  }
  if (settings.ttiConfigs.length === 0) {
    newConfig.isDefault = true;
  }

  settings.ttiConfigs.push(newConfig);
  await saveSettings(settings);
  return newConfig;
}

export async function updateTTIConfig(id: string, updates: Partial<Omit<TTIModelConfig, 'id' | 'createdAt'>>): Promise<TTIModelConfig | null> {
  const settings = await loadSettings();
  const index = settings.ttiConfigs.findIndex(c => c.id === id);
  if (index === -1) return null;

  if (updates.isDefault) {
    settings.ttiConfigs = settings.ttiConfigs.map(c => ({ ...c, isDefault: false }));
  }

  settings.ttiConfigs[index] = { ...settings.ttiConfigs[index], ...updates, updatedAt: Date.now() };
  await saveSettings(settings);
  return settings.ttiConfigs[index];
}

export async function deleteTTIConfig(id: string): Promise<boolean> {
  const settings = await loadSettings();
  const index = settings.ttiConfigs.findIndex(c => c.id === id);
  if (index === -1) return false;

  const wasDefault = settings.ttiConfigs[index].isDefault;
  settings.ttiConfigs.splice(index, 1);
  if (wasDefault && settings.ttiConfigs.length > 0) {
    settings.ttiConfigs[0].isDefault = true;
  }

  await saveSettings(settings);
  return true;
}

export async function setDefaultTTIConfig(id: string): Promise<boolean> {
  const settings = await loadSettings();
  if (!settings.ttiConfigs.find(c => c.id === id)) return false;

  settings.ttiConfigs = settings.ttiConfigs.map(c => ({
    ...c,
    isDefault: c.id === id,
    updatedAt: c.id === id ? Date.now() : c.updatedAt,
  }));

  await saveSettings(settings);
  return true;
}

export async function getDefaultTTIConfig(): Promise<TTIModelConfig | null> {
  const settings = await loadSettings();
  return settings.ttiConfigs.find(c => c.isDefault) || settings.ttiConfigs[0] || null;
}

export async function getTTIConfigById(id: string): Promise<TTIModelConfig | null> {
  const settings = await loadSettings();
  return settings.ttiConfigs.find(c => c.id === id) || null;
}

export async function getActiveTTIConfig(projectConfigId?: string): Promise<TTIModelConfig | null> {
  if (projectConfigId) {
    const config = await getTTIConfigById(projectConfigId);
    if (config) return config;
  }
  return getDefaultTTIConfig();
}

// ========== ITV 配置 CRUD ==========

export async function addITVConfig(config: Omit<ITVModelConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<ITVModelConfig> {
  const settings = await loadSettings();
  const now = Date.now();

  const newConfig: ITVModelConfig = {
    ...config,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  if (newConfig.isDefault) {
    settings.itvConfigs = settings.itvConfigs.map(c => ({ ...c, isDefault: false }));
  }
  if (settings.itvConfigs.length === 0) {
    newConfig.isDefault = true;
  }

  settings.itvConfigs.push(newConfig);
  await saveSettings(settings);
  return newConfig;
}

export async function updateITVConfig(id: string, updates: Partial<Omit<ITVModelConfig, 'id' | 'createdAt'>>): Promise<ITVModelConfig | null> {
  const settings = await loadSettings();
  const index = settings.itvConfigs.findIndex(c => c.id === id);
  if (index === -1) return null;

  if (updates.isDefault) {
    settings.itvConfigs = settings.itvConfigs.map(c => ({ ...c, isDefault: false }));
  }

  settings.itvConfigs[index] = { ...settings.itvConfigs[index], ...updates, updatedAt: Date.now() };
  await saveSettings(settings);
  return settings.itvConfigs[index];
}

export async function deleteITVConfig(id: string): Promise<boolean> {
  const settings = await loadSettings();
  const index = settings.itvConfigs.findIndex(c => c.id === id);
  if (index === -1) return false;

  const wasDefault = settings.itvConfigs[index].isDefault;
  settings.itvConfigs.splice(index, 1);
  if (wasDefault && settings.itvConfigs.length > 0) {
    settings.itvConfigs[0].isDefault = true;
  }

  await saveSettings(settings);
  return true;
}

export async function setDefaultITVConfig(id: string): Promise<boolean> {
  const settings = await loadSettings();
  if (!settings.itvConfigs.find(c => c.id === id)) return false;

  settings.itvConfigs = settings.itvConfigs.map(c => ({
    ...c,
    isDefault: c.id === id,
    updatedAt: c.id === id ? Date.now() : c.updatedAt,
  }));

  await saveSettings(settings);
  return true;
}

export async function getDefaultITVConfig(): Promise<ITVModelConfig | null> {
  const settings = await loadSettings();
  return settings.itvConfigs.find(c => c.isDefault) || settings.itvConfigs[0] || null;
}

export async function getITVConfigById(id: string): Promise<ITVModelConfig | null> {
  const settings = await loadSettings();
  return settings.itvConfigs.find(c => c.id === id) || null;
}

export async function getActiveITVConfig(projectConfigId?: string): Promise<ITVModelConfig | null> {
  if (projectConfigId) {
    const config = await getITVConfigById(projectConfigId);
    if (config) return config;
  }
  return getDefaultITVConfig();
}

// ========== TTS 配置 CRUD ==========

export async function addTTSConfig(config: Omit<TTSModelConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<TTSModelConfig> {
  const settings = await loadSettings();
  const now = Date.now();

  const newConfig: TTSModelConfig = {
    ...config,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  if (newConfig.isDefault) {
    settings.ttsConfigs = settings.ttsConfigs.map(c => ({ ...c, isDefault: false }));
  }
  if (settings.ttsConfigs.length === 0) {
    newConfig.isDefault = true;
  }

  settings.ttsConfigs.push(newConfig);
  await saveSettings(settings);
  return newConfig;
}

export async function updateTTSConfig(id: string, updates: Partial<Omit<TTSModelConfig, 'id' | 'createdAt'>>): Promise<TTSModelConfig | null> {
  const settings = await loadSettings();
  const index = settings.ttsConfigs.findIndex(c => c.id === id);
  if (index === -1) return null;

  if (updates.isDefault) {
    settings.ttsConfigs = settings.ttsConfigs.map(c => ({ ...c, isDefault: false }));
  }

  settings.ttsConfigs[index] = { ...settings.ttsConfigs[index], ...updates, updatedAt: Date.now() };
  await saveSettings(settings);
  return settings.ttsConfigs[index];
}

export async function deleteTTSConfig(id: string): Promise<boolean> {
  const settings = await loadSettings();
  const index = settings.ttsConfigs.findIndex(c => c.id === id);
  if (index === -1) return false;

  const wasDefault = settings.ttsConfigs[index].isDefault;
  settings.ttsConfigs.splice(index, 1);
  if (wasDefault && settings.ttsConfigs.length > 0) {
    settings.ttsConfigs[0].isDefault = true;
  }

  await saveSettings(settings);
  return true;
}

export async function setDefaultTTSConfig(id: string): Promise<boolean> {
  const settings = await loadSettings();
  if (!settings.ttsConfigs.find(c => c.id === id)) return false;

  settings.ttsConfigs = settings.ttsConfigs.map(c => ({
    ...c,
    isDefault: c.id === id,
    updatedAt: c.id === id ? Date.now() : c.updatedAt,
  }));

  await saveSettings(settings);
  return true;
}

export async function getDefaultTTSConfig(): Promise<TTSModelConfig | null> {
  const settings = await loadSettings();
  return settings.ttsConfigs.find(c => c.isDefault) || settings.ttsConfigs[0] || null;
}

export async function getTTSConfigById(id: string): Promise<TTSModelConfig | null> {
  const settings = await loadSettings();
  return settings.ttsConfigs.find(c => c.id === id) || null;
}

export async function getActiveTTSConfig(projectConfigId?: string): Promise<TTSModelConfig | null> {
  if (projectConfigId) {
    const config = await getTTSConfigById(projectConfigId);
    if (config) return config;
  }
  return getDefaultTTSConfig();
}

// ========== 最近项目 ==========

export async function loadRecentProjects(): Promise<RecentProject[]> {
  if (!electronService.isElectron()) {
    try {
      const data = localStorage.getItem('koma_recent_projects');
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // ignore
    }
    return [];
  }

  try {
    const path = await getGlobalPath('recent-projects.json');
    const exists = await electronService.fs.exists(path);
    if (exists) {
      const data = await electronService.fs.readFile(path);
      return JSON.parse(data);
    }
  } catch {
    // ignore
  }
  return [];
}

export async function saveRecentProjects(
  projects: RecentProject[]
): Promise<void> {
  // 最多保留 20 个
  const trimmed = projects.slice(0, 20);

  if (!electronService.isElectron()) {
    localStorage.setItem('koma_recent_projects', JSON.stringify(trimmed));
    return;
  }

  const path = await getGlobalPath('recent-projects.json');
  await electronService.fs.writeFile(path, JSON.stringify(trimmed, null, 2));
}

export async function addRecentProject(project: RecentProject): Promise<void> {
  const projects = await loadRecentProjects();
  // 移除重复
  const filtered = projects.filter((p) => p.id !== project.id);
  // 添加到开头
  filtered.unshift({ ...project, lastOpened: Date.now() });
  await saveRecentProjects(filtered);
}

export async function removeRecentProject(projectId: string): Promise<void> {
  const projects = await loadRecentProjects();
  const filtered = projects.filter((p) => p.id !== projectId);
  await saveRecentProjects(filtered);
}

// ========== 模型预设 ==========

export interface ModelPreset {
  name: string;
  type: 'llm' | 'tti' | 'tts' | 'itv';
  config: any;
}

export async function loadPresets(): Promise<ModelPreset[]> {
  if (!electronService.isElectron()) {
    try {
      const data = localStorage.getItem('koma_presets');
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // ignore
    }
    return [];
  }

  try {
    const presetsDir = await getGlobalPath('model-presets');
    const exists = await electronService.fs.exists(presetsDir);
    if (!exists) {
      return [];
    }

    const files = await electronService.fs.readdir(presetsDir);
    const presets: ModelPreset[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const data = await electronService.fs.readFile(
          `${presetsDir}/${file}`
        );
        presets.push(JSON.parse(data));
      }
    }

    return presets;
  } catch {
    return [];
  }
}

export async function savePreset(preset: ModelPreset): Promise<void> {
  if (!electronService.isElectron()) {
    const presets = await loadPresets();
    const filtered = presets.filter((p) => p.name !== preset.name);
    filtered.push(preset);
    localStorage.setItem('koma_presets', JSON.stringify(filtered));
    return;
  }

  const presetsDir = await getGlobalPath('model-presets');
  await electronService.fs.mkdir(presetsDir);
  const path = `${presetsDir}/${preset.name}.json`;
  await electronService.fs.writeFile(path, JSON.stringify(preset, null, 2));
}

export async function deletePreset(presetName: string): Promise<void> {
  if (!electronService.isElectron()) {
    const presets = await loadPresets();
    const filtered = presets.filter((p) => p.name !== presetName);
    localStorage.setItem('koma_presets', JSON.stringify(filtered));
    return;
  }

  const presetsDir = await getGlobalPath('model-presets');
  const path = `${presetsDir}/${presetName}.json`;
  await electronService.fs.remove(path);
}

export default {
  loadSettings,
  saveSettings,
  loadRecentProjects,
  saveRecentProjects,
  addRecentProject,
  removeRecentProject,
  loadPresets,
  savePreset,
  deletePreset,
  // LLM 配置管理
  addLLMConfig,
  updateLLMConfig,
  deleteLLMConfig,
  setDefaultLLMConfig,
  getDefaultLLMConfig,
  getLLMConfigById,
  getActiveLLMConfig,
  LLM_CHANNEL_PRESETS,
  // TTI 配置管理
  addTTIConfig,
  updateTTIConfig,
  deleteTTIConfig,
  setDefaultTTIConfig,
  getDefaultTTIConfig,
  getTTIConfigById,
  getActiveTTIConfig,
  TTI_PRESETS,
  // ITV 配置管理
  addITVConfig,
  updateITVConfig,
  deleteITVConfig,
  setDefaultITVConfig,
  getDefaultITVConfig,
  getITVConfigById,
  getActiveITVConfig,
  ITV_PRESETS,
  // TTS 配置管理
  addTTSConfig,
  updateTTSConfig,
  deleteTTSConfig,
  setDefaultTTSConfig,
  getDefaultTTSConfig,
  getTTSConfigById,
  getActiveTTSConfig,
  TTS_PRESETS,
};
