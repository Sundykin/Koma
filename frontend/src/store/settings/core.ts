/**
 * 核心设置存储
 * 通过 configBridge 访问后端 ConfigRegistry
 */
import { configBridge } from '../../services/configBridge';
import { getStorageConfig, initStorageConfig } from '../storageConfig';
import type { AppSettings } from '../../types';

export async function getGlobalPath(filename: string): Promise<string> {
  const config = getStorageConfig() || (await initStorageConfig());
  return `${config.rootPath}/${filename}`;
}

export const DEFAULT_SETTINGS: AppSettings = {
  llmConfigs: [],
  ttiConfigs: [],
  itvConfigs: [],
  ttsConfigs: [],
};

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const remote = await configBridge.get<AppSettings>('app-settings');
    if (remote && (remote.llmConfigs || remote.ttiConfigs)) {
      return { ...DEFAULT_SETTINGS, ...remote };
    }
  } catch (err) {
    console.error('[loadSettings] configBridge error:', err);
  }
  return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await configBridge.set('app-settings', settings);
}

export async function importSettingsFromFile(filePath: string): Promise<AppSettings | null> {
  const imported = await configBridge.import<AppSettings>('app-settings', { filePath });
  if (!imported) return null;
  return { ...DEFAULT_SETTINGS, ...imported };
}

export async function exportSettingsToFile(filePath: string): Promise<boolean> {
  const exported = await configBridge.export<AppSettings>('app-settings', filePath);
  return Boolean(exported);
}
