/**
 * 存储格式迁移系统
 * 支持版本升级、自动备份、迁移脚本注册
 */
import { electronService } from '../services/electronService';
import { getStorageConfig, setStorageConfig } from './storageConfig';
import { createLogger } from './logger';

const logger = createLogger('Migration');

// 当前存储格式版本
export const CURRENT_STORAGE_VERSION = 1;

// 迁移脚本类型
export interface MigrationScript {
  fromVersion: number;
  toVersion: number;
  description: string;
  migrate: (rootPath: string) => Promise<void>;
}

// 迁移脚本注册表
const migrationScripts: MigrationScript[] = [];

/**
 * 注册迁移脚本
 */
export function registerMigration(script: MigrationScript): void {
  migrationScripts.push(script);
  migrationScripts.sort((a, b) => a.fromVersion - b.fromVersion);
}

/**
 * 获取需要执行的迁移脚本
 */
export function getMigrationPath(fromVersion: number, toVersion: number): MigrationScript[] {
  const path: MigrationScript[] = [];
  let currentVersion = fromVersion;

  while (currentVersion < toVersion) {
    const script = migrationScripts.find(
      (s) => s.fromVersion === currentVersion && s.toVersion > currentVersion
    );
    if (!script) {
      throw new Error(`无法找到从版本 ${currentVersion} 升级的迁移脚本`);
    }
    path.push(script);
    currentVersion = script.toVersion;
  }

  return path;
}

/**
 * 创建迁移备份
 */
export async function createMigrationBackup(rootPath: string): Promise<string> {
  if (!electronService.isElectron()) {
    throw new Error('仅支持 Electron 环境');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${rootPath}_backup_${timestamp}`;

  logger.info(`创建迁移备份: ${backupPath}`);

  // 复制整个存储目录
  await copyDirectoryRecursive(rootPath, backupPath);

  return backupPath;
}

/**
 * 递归复制目录
 */
async function copyDirectoryRecursive(src: string, dest: string): Promise<void> {
  await electronService.fs.mkdir(dest);
  const items = await electronService.fs.readdir(src);

  for (const item of items) {
    const srcPath = `${src}/${item}`;
    const destPath = `${dest}/${item}`;
    const stat = await electronService.fs.stat(srcPath);

    if (stat?.isDirectory) {
      await copyDirectoryRecursive(srcPath, destPath);
    } else {
      await electronService.fs.copy(srcPath, destPath);
    }
  }
}

/**
 * 执行存储迁移
 */
export async function runMigration(
  onProgress?: (step: string, progress: number) => void
): Promise<{ success: boolean; fromVersion: number; toVersion: number; backupPath?: string }> {
  const config = getStorageConfig();
  if (!config) {
    return { success: true, fromVersion: CURRENT_STORAGE_VERSION, toVersion: CURRENT_STORAGE_VERSION };
  }

  const currentVersion = config.version || 0;
  if (currentVersion >= CURRENT_STORAGE_VERSION) {
    logger.info(`存储版本已是最新 (v${currentVersion})`);
    return { success: true, fromVersion: currentVersion, toVersion: currentVersion };
  }

  logger.info(`需要迁移: v${currentVersion} → v${CURRENT_STORAGE_VERSION}`);

  try {
    // 获取迁移路径
    const scripts = getMigrationPath(currentVersion, CURRENT_STORAGE_VERSION);
    if (scripts.length === 0) {
      // 没有迁移脚本，直接更新版本号
      setStorageConfig({ ...config, version: CURRENT_STORAGE_VERSION });
      return { success: true, fromVersion: currentVersion, toVersion: CURRENT_STORAGE_VERSION };
    }

    // 创建备份
    onProgress?.('创建备份...', 0);
    const backupPath = await createMigrationBackup(config.rootPath);

    // 执行迁移脚本
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      const progress = Math.round(((i + 1) / scripts.length) * 100);
      onProgress?.(`迁移 v${script.fromVersion} → v${script.toVersion}: ${script.description}`, progress);

      logger.info(`执行迁移: ${script.description}`);
      await script.migrate(config.rootPath);
    }

    // 更新版本号
    setStorageConfig({ ...config, version: CURRENT_STORAGE_VERSION });

    logger.info('迁移完成');
    return {
      success: true,
      fromVersion: currentVersion,
      toVersion: CURRENT_STORAGE_VERSION,
      backupPath,
    };
  } catch (error: any) {
    logger.error('迁移失败', { error: error.message });
    throw error;
  }
}

/**
 * 检查是否需要迁移
 */
export function needsMigration(): boolean {
  const config = getStorageConfig();
  if (!config) return false;
  return (config.version || 0) < CURRENT_STORAGE_VERSION;
}

/**
 * 获取当前存储版本
 */
export function getStorageVersion(): number {
  const config = getStorageConfig();
  return config?.version || 0;
}

// ========== 迁移脚本示例（未来版本升级时添加）==========

// 示例：v0 → v1 迁移（当前不需要，因为 v1 是初始版本）
// registerMigration({
//   fromVersion: 0,
//   toVersion: 1,
//   description: '初始化存储结构',
//   migrate: async (rootPath) => {
//     // 迁移逻辑
//   },
// });

export default {
  CURRENT_STORAGE_VERSION,
  registerMigration,
  getMigrationPath,
  createMigrationBackup,
  runMigration,
  needsMigration,
  getStorageVersion,
};
