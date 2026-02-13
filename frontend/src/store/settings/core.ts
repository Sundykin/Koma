/**
 * 核心设置存储
 * 负责设置的加载和保存
 * 优先通过 configBridge 访问后端 ConfigRegistry，fallback 到旧逻辑
 */
import { electronService } from '../../services/electronService';
import { configBridge } from '../../services/configBridge';
import { getStorageConfig, initStorageConfig } from '../storageConfig';
import type { AppSettings } from '../../types';

// 路径工具
export async function getGlobalPath(filename: string): Promise<string> {
  const config = getStorageConfig() || (await initStorageConfig());
  return `${config.rootPath}/${filename}`;
}

// 默认设置
export const DEFAULT_SETTINGS: AppSettings = {
  llmConfigs: [],
  ttiConfigs: [],
  itvConfigs: [],
  ttsConfigs: [],
};

// 生成唯一 ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// 迁移旧的加密数据格式
function migrateEncryptedData<T>(data: T): T {
  if (Array.isArray(data)) {
    return data.map(item => migrateEncryptedData(item)) as T;
  }
  if (data && typeof data === 'object') {
    const result = { ...data } as Record<string, any>;
    for (const key of Object.keys(result)) {
      const value = result[key];
      if (value && typeof value === 'object' && value.encrypted === true) {
        result[key] = '';
      } else if (value && typeof value === 'object') {
        result[key] = migrateEncryptedData(value);
      }
    }
    return result as T;
  }
  return data;
}

// 旧逻辑：从文件/localStorage 加载
async function loadSettingsLegacy(): Promise<AppSettings | null> {
  if (!electronService.isElectron()) {
    try {
      const data = localStorage.getItem('koma_settings');
      if (data) {
        let parsed = JSON.parse(data);
        parsed = migrateEncryptedData(parsed);
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (err) {
      console.error('[loadSettings] legacy error:', err);
    }
    return null;
  }
  try {
    const path = await getGlobalPath('settings.json');
    const exists = await electronService.fs.exists(path);
    if (exists) {
      const data = await electronService.fs.readFile(path);
      let parsed = JSON.parse(data);
      parsed = migrateEncryptedData(parsed);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (err) {
    console.error('[loadSettings] legacy error:', err);
  }
  return null;
}

// 加载设置：优先从后端 ConfigRegistry 读取
export async function loadSettings(): Promise<AppSettings> {
  try {
    const remote = await configBridge.get<AppSettings>('app-settings');
    if (remote && (remote.llmConfigs || remote.ttiConfigs)) {
      return { ...DEFAULT_SETTINGS, ...migrateEncryptedData(remote) };
    }
  } catch {
    // fallback
  }
  // 后端无数据，走旧逻辑并同步到后端
  const legacy = await loadSettingsLegacy();
  if (legacy) {
    configBridge.set('app-settings', legacy).catch(() => {});
    return legacy;
  }
  return DEFAULT_SETTINGS;
}

// 保存设置：写后端 ConfigRegistry
export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    await configBridge.set('app-settings', settings);
  } catch (err) {
    console.error('[saveSettings] configBridge error:', err);
    // 后端不可用时 fallback 到旧逻辑
    if (!electronService.isElectron()) {
      localStorage.setItem('koma_settings', JSON.stringify(settings));
      return;
    }
    const path = await getGlobalPath('settings.json');
    await electronService.fs.writeFile(path, JSON.stringify(settings, null, 2));
  }
}
