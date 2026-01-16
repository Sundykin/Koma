/**
 * 全局存储
 * 管理全局设置、最近项目、模型预设
 */
import { electronService } from '../services/electronService';
import { getStorageConfig, initStorageConfig } from './storageConfig';
import { encryptSettings, decryptSettings } from './encryption';
import type { AppSettings, RecentProject, TTSConfig, ITVConfig } from '../types';

// ========== 路径工具 ==========

async function getGlobalPath(filename: string): Promise<string> {
  const config = getStorageConfig() || (await initStorageConfig());
  return `${config.rootPath}/${filename}`;
}

// ========== 全局设置 ==========

const DEFAULT_SETTINGS: AppSettings = {
  llm: {
    provider: 'gemini',
    apiKey: '',
    modelName: 'gemini-2.0-flash',
  },
  tti: {
    provider: 'comfyui',
    apiKey: '',
    baseUrl: 'http://127.0.0.1:8188',
    modelName: '',
  },
  itv: {
    provider: 'runway',
    apiKey: '',
    defaultDuration: 4,
    defaultResolution: '1280x720',
  },
  tts: {
    provider: 'edge-tts',
    defaultVoice: 'zh-CN-XiaoxiaoNeural',
  },
  customChannels: [],
};

export async function loadSettings(): Promise<AppSettings> {
  if (!electronService.isElectron()) {
    // 浏览器环境：使用 localStorage
    try {
      const data = localStorage.getItem('koma_settings');
      if (data) {
        const parsed = JSON.parse(data);
        // 解密 API Key
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
      // 解密 API Key
      const decrypted = await decryptSettings(parsed);
      return { ...DEFAULT_SETTINGS, ...decrypted };
    }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  // 加密 API Key
  const encrypted = await encryptSettings(settings);

  if (!electronService.isElectron()) {
    localStorage.setItem('koma_settings', JSON.stringify(encrypted));
    return;
  }

  const path = await getGlobalPath('settings.json');
  await electronService.fs.writeFile(path, JSON.stringify(encrypted, null, 2));
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
};
