/**
 * 存储根目录配置（SQLite kv_configs 版本）
 *
 * 旧版本通过 localStorage 缓存 + Electron fs 操作管理 `rootPath`。
 * 新版本：rootPath 由后端 `kv_configs(namespace='storage', key='rootPath')`
 * 持有。前端启动时随 `useConfigStore` 批量拉回；需要时按需写回。
 */
import { electronService } from '../services/electronService';
import type { StorageConfig } from '../types';
import { getConfigAPI } from '../services/configBridge';
import { ensureConfigReady, useConfigStore } from './useConfigStore';

const STORAGE_VERSION = 1;
const DEFAULT_FOLDER_NAME = '.koma';
const KV_NAMESPACE = 'storage';
const KV_KEY_ROOT_PATH = 'rootPath';

let _memCache: StorageConfig | null = null;

function readFromStore(): StorageConfig | null {
  const kv = useConfigStore.getState().kv[KV_NAMESPACE];
  if (!kv) return null;
  const entry = kv.find((e) => e.key === KV_KEY_ROOT_PATH);
  if (!entry || typeof entry.value !== 'string') return null;
  return { rootPath: entry.value, version: STORAGE_VERSION };
}

export async function getDefaultStoragePath(): Promise<string> {
  if (electronService.isElectron()) {
    const home = await electronService.app.getPath('home');
    return `${home}/${DEFAULT_FOLDER_NAME}`;
  }
  return '';
}

/** 同步快照：仅在 bootstrap 之后才可能有值 */
export function getStorageConfig(): StorageConfig | null {
  if (_memCache) return _memCache;
  const fromStore = readFromStore();
  if (fromStore) {
    _memCache = fromStore;
    return fromStore;
  }
  return null;
}

export function setStorageConfig(config: StorageConfig): void {
  _memCache = config;
  const api = getConfigAPI();
  void api.kv.set(KV_NAMESPACE, KV_KEY_ROOT_PATH, config.rootPath);
}

export async function initStorageConfig(): Promise<StorageConfig> {
  await ensureConfigReady();
  const current = readFromStore();
  if (current) {
    _memCache = current;
    return current;
  }

  const rootPath = await getDefaultStoragePath();
  const config: StorageConfig = { rootPath, version: STORAGE_VERSION };
  setStorageConfig(config);
  return config;
}

export async function validateStoragePath(
  path: string,
): Promise<{ valid: boolean; error?: string }> {
  if (!electronService.isElectron()) {
    return { valid: false, error: '仅支持 Electron 环境' };
  }
  if (!path) return { valid: false, error: '路径不能为空' };

  try {
    await electronService.fs.mkdir(path);
    const testFile = `${path}/.koma_write_test`;
    await electronService.fs.writeFile(testFile, 'test');
    await electronService.fs.remove(testFile);
    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: error.message || '路径无法访问' };
  }
}

/**
 * @deprecated 不再提供数据迁移能力（本变更不兼容旧数据）。保留签名以兼容调用方。
 */
export async function migrateStorage(): Promise<void> {
  // no-op
}

export async function updateStoragePath(
  newPath: string,
): Promise<void> {
  const validation = await validateStoragePath(newPath);
  if (!validation.valid) throw new Error(validation.error);
  setStorageConfig({ rootPath: newPath, version: STORAGE_VERSION });
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
