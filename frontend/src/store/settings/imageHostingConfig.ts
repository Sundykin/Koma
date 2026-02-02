/**
 * 图床配置管理
 */
import type { ImageHostingConfig } from '../../types';
import { loadSettings, saveSettings } from './core';

// 默认图床配置
export const DEFAULT_IMAGE_HOSTING_CONFIG: ImageHostingConfig = {
  enabled: false,
  apiEndpoint: 'https://img.scdn.io/api/v1.php',
  outputFormat: 'webp',
  cdnDomain: '',
};

/**
 * 获取图床配置
 */
export async function getImageHostingConfig(): Promise<ImageHostingConfig> {
  const settings = await loadSettings();
  return settings.imageHostingConfig || DEFAULT_IMAGE_HOSTING_CONFIG;
}

/**
 * 更新图床配置
 */
export async function updateImageHostingConfig(config: Partial<ImageHostingConfig>): Promise<void> {
  const settings = await loadSettings();
  settings.imageHostingConfig = {
    ...DEFAULT_IMAGE_HOSTING_CONFIG,
    ...settings.imageHostingConfig,
    ...config,
  };
  await saveSettings(settings);
}

/**
 * 启用/禁用图床
 */
export async function setImageHostingEnabled(enabled: boolean): Promise<void> {
  await updateImageHostingConfig({ enabled });
}

/**
 * 检查图床是否已启用
 */
export async function isImageHostingEnabled(): Promise<boolean> {
  const config = await getImageHostingConfig();
  return config.enabled;
}
