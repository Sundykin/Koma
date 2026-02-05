/**
 * 核心设置存储
 * 负责设置的加载和保存
 */
import { electronService } from '../../services/electronService';
import { getStorageConfig, initStorageConfig } from '../storageConfig';
import type { AppSettings } from '../../types';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { createLogger } from '../logger';

const logger = createLogger('Settings');

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

// 加载设置
export async function loadSettings(): Promise<AppSettings> {
  if (!electronService.isElectron()) {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (data) {
        let parsed = JSON.parse(data);
        parsed = migrateEncryptedData(parsed);
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (err) {
      logger.error('loadSettings error', err);
    }
    return DEFAULT_SETTINGS;
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
    logger.error('loadSettings error', err);
  }
  return DEFAULT_SETTINGS;
}

// 保存设置
export async function saveSettings(settings: AppSettings): Promise<void> {
  if (!electronService.isElectron()) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    return;
  }

  const path = await getGlobalPath('settings.json');
  await electronService.fs.writeFile(path, JSON.stringify(settings, null, 2));
}
