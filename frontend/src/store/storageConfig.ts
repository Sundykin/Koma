/**
 * 存储根目录配置
 * 管理存储路径、验证和迁移
 */
import { electronService } from '../services/electronService';
import type { StorageConfig } from '../types';

const STORAGE_VERSION = 1;
const DEFAULT_FOLDER_NAME = '.koma';

// 获取默认存储路径
export async function getDefaultStoragePath(): Promise<string> {
  if (electronService.isElectron()) {
    const home = await electronService.app.getPath('home');
    return `${home}/${DEFAULT_FOLDER_NAME}`;
  }
  // 浏览器环境：使用 IndexedDB 或 localStorage（返回空路径表示内存存储）
  return '';
}

// 存储配置 key（使用 localStorage 存储，因为这是系统级配置）
const STORAGE_CONFIG_KEY = 'koma_storage_config';

// 检查路径是否有效（不包含 [object Object] 等无效字符串）
function isValidPath(path: string | undefined): boolean {
  if (!path || typeof path !== 'string') return false;
  if (path.includes('[object Object]') || path.includes('[object ')) return false;
  return true;
}

export function getStorageConfig(): StorageConfig | null {
  try {
    const data = localStorage.getItem(STORAGE_CONFIG_KEY);
    if (data) {
      const config = JSON.parse(data) as StorageConfig;
      // 验证路径有效性
      if (!isValidPath(config.rootPath)) {
        // 路径无效，清除缓存
        localStorage.removeItem(STORAGE_CONFIG_KEY);
        return null;
      }
      return config;
    }
  } catch {
    // ignore
  }
  return null;
}

export function setStorageConfig(config: StorageConfig): void {
  localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
}

// 初始化存储配置
export async function initStorageConfig(): Promise<StorageConfig> {
  let config = getStorageConfig();

  if (!config) {
    const rootPath = await getDefaultStoragePath();
    config = {
      rootPath,
      version: STORAGE_VERSION,
    };
    setStorageConfig(config);
  }

  // 确保存储目录存在
  if (config.rootPath && electronService.isElectron()) {
    await electronService.fs.mkdir(config.rootPath);
  }

  return config;
}

// 验证存储路径
export async function validateStoragePath(path: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  if (!electronService.isElectron()) {
    return { valid: false, error: '仅支持 Electron 环境' };
  }

  if (!path) {
    return { valid: false, error: '路径不能为空' };
  }

  try {
    // 尝试创建目录（如果不存在）
    await electronService.fs.mkdir(path);

    // 尝试写入测试文件
    const testFile = `${path}/.koma_write_test`;
    await electronService.fs.writeFile(testFile, 'test');
    await electronService.fs.remove(testFile);

    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: error.message || '路径无法访问' };
  }
}

// 迁移存储数据
export async function migrateStorage(
  oldPath: string,
  newPath: string,
  onProgress?: (progress: number, file: string) => void
): Promise<void> {
  if (!electronService.isElectron()) {
    throw new Error('仅支持 Electron 环境');
  }

  // 获取所有需要迁移的文件/目录
  const items = await electronService.fs.readdir(oldPath);
  const total = items.length;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const srcPath = `${oldPath}/${item}`;
    const destPath = `${newPath}/${item}`;

    onProgress?.(Math.round(((i + 1) / total) * 100), item);

    // 复制文件/目录
    const stat = await electronService.fs.stat(srcPath);
    if (stat?.isDirectory) {
      // 递归复制目录
      await copyDirectory(srcPath, destPath);
    } else {
      // 复制文件
      await electronService.fs.copy(srcPath, destPath);
    }
  }
}

// 递归复制目录
async function copyDirectory(src: string, dest: string): Promise<void> {
  await electronService.fs.mkdir(dest);
  const items = await electronService.fs.readdir(src);

  for (const item of items) {
    const srcPath = `${src}/${item}`;
    const destPath = `${dest}/${item}`;
    const stat = await electronService.fs.stat(srcPath);

    if (stat?.isDirectory) {
      await copyDirectory(srcPath, destPath);
    } else {
      await electronService.fs.copy(srcPath, destPath);
    }
  }
}

// 更新存储路径
export async function updateStoragePath(
  newPath: string,
  migrate: boolean = true,
  onProgress?: (progress: number, file: string) => void
): Promise<void> {
  const validation = await validateStoragePath(newPath);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const currentConfig = getStorageConfig();
  const oldPath = currentConfig?.rootPath;

  // 迁移数据
  if (migrate && oldPath && oldPath !== newPath) {
    await migrateStorage(oldPath, newPath, onProgress);
  }

  // 更新配置
  setStorageConfig({
    rootPath: newPath,
    version: STORAGE_VERSION,
  });
}

export default {
  getDefaultStoragePath,
  getStorageConfig,
  setStorageConfig,
  initStorageConfig,
  validateStoragePath,
  migrateStorage,
  updateStoragePath,
};
