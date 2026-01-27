/**
 * 插件管理服务
 * 负责插件的安装、卸载、验证等操作
 */
import * as path from 'path';
import * as fs from 'fs/promises';
import { app } from 'electron';
import AdmZip from 'adm-zip';

// 必填字段
const REQUIRED_FIELDS = ['id', 'name', 'version', 'category', 'engine', 'scopes', 'entry'];

// 有效的分类
const VALID_CATEGORIES = ['provider', 'global', 'tool'];

// 有效的权限
const VALID_SCOPES = [
  'settings:read', 'settings:write',
  'projects:read', 'projects:write',
  'prompts:override', 'storage:limited', 'network:external',
];

// 安装时允许复制的顶级文件/目录（排除 node_modules 等开发依赖）
const DEFAULT_ALLOWLIST = new Set([
  'manifest.json',
  'README.md',
  'README.zh.md',
  'LICENSE',
  'dist',
  'assets',
  'public',
  'data',
]);

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  category: 'provider' | 'global' | 'tool';
  engine: { minAppVersion: string; sdkVersion: string };
  scopes: string[];
  entry: { backend?: string; frontend?: string; logic?: string; ui?: string };
  [key: string]: any;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  manifest?: PluginManifest;
  stagingId?: string; // 用于 install 复用解压结果
}

export interface InstallResult {
  success: boolean;
  rootPath?: string;
  error?: string;
}

/**
 * 根据 manifest 构建 allowlist
 * 包含默认允许项 + 入口文件所在的顶级目录
 */
function buildAllowlist(manifest: PluginManifest): Set<string> {
  const entries = [
    manifest.entry?.frontend,
    manifest.entry?.backend,
    manifest.entry?.logic,
    manifest.entry?.ui,
  ].filter(Boolean) as string[];

  // 从入口路径提取顶级目录（如 ./dist/ui/main.js -> dist）
  const topLevels = entries.map(p => {
    const normalized = p.replace(/\\/g, '/').replace(/^\.\//, '');
    return normalized.split('/')[0];
  });

  return new Set([...DEFAULT_ALLOWLIST, ...topLevels]);
}

class PluginService {
  pluginsDir: string = '';
  stagingDir: string = '';

  // staging 缓存：存储解压后的临时目录，供 install 复用（内部使用）
  _stagingCache = new Map<string, { path: string; createdAt: number }>();
  _stagingTtlMs = 10 * 60 * 1000; // 10 分钟过期

  async init(): Promise<void> {
    const userDataPath = app.getPath('userData');
    this.pluginsDir = path.join(userDataPath, 'plugins-runtime');
    this.stagingDir = path.join(userDataPath, 'plugins-staging');

    // 确保目录存在
    await fs.mkdir(this.pluginsDir, { recursive: true });
    await fs.mkdir(this.stagingDir, { recursive: true });

    // 清理过期的 staging 缓存
    this._purgeExpiredStaging();
  }

  /**
   * 清理过期的 staging 缓存
   */
  async _purgeExpiredStaging(): Promise<void> {
    const now = Date.now();
    for (const [id, entry] of this._stagingCache) {
      if (now - entry.createdAt > this._stagingTtlMs) {
        await this.cleanup(entry.path);
        this._stagingCache.delete(id);
      }
    }
  }

  /**
   * 生成 staging ID
   */
  _generateStagingId(): string {
    return `staging_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * 强制删除目录（带重试机制，解决 Windows ENOTEMPTY 问题）
   */
  async forceRemoveDir(dirPath: string, maxRetries = 3): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await fs.rm(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        return;
      } catch (err: any) {
        if (i === maxRetries - 1) throw err;
        // 等待一段时间后重试，让文件句柄释放
        await new Promise(resolve => setTimeout(resolve, 200 * (i + 1)));
      }
    }
  }

  /**
   * 验证插件包
   * @param keepExtracted 是否保留解压结果供后续 install 复用
   */
  async validate(zipPath: string, keepExtracted = true): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 解压到临时目录
      const stagingPath = path.join(this.stagingDir, `temp-${Date.now()}`);
      await fs.mkdir(stagingPath, { recursive: true });

      const zip = new AdmZip(zipPath);
      zip.extractAllTo(stagingPath, true);

      // 查找 manifest.json（可能在根目录或子目录中）
      let manifestPath = path.join(stagingPath, 'manifest.json');
      if (!(await this.fileExists(manifestPath))) {
        // 检查是否在子目录中
        const entries = await fs.readdir(stagingPath);
        for (const entry of entries) {
          const subPath = path.join(stagingPath, entry, 'manifest.json');
          if (await this.fileExists(subPath)) {
            manifestPath = subPath;
            break;
          }
        }
      }

      if (!(await this.fileExists(manifestPath))) {
        errors.push('找不到 manifest.json 文件');
        await this.cleanup(stagingPath);
        return { valid: false, errors, warnings };
      }

      // 读取并解析 manifest
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      let manifest: any;

      try {
        manifest = JSON.parse(manifestContent);
      } catch {
        errors.push('manifest.json 格式无效');
        await this.cleanup(stagingPath);
        return { valid: false, errors, warnings };
      }

      // 验证必填字段
      for (const field of REQUIRED_FIELDS) {
        if (manifest[field] === undefined) {
          errors.push(`缺少必填字段: ${field}`);
        }
      }

      if (errors.length > 0) {
        await this.cleanup(stagingPath);
        return { valid: false, errors, warnings };
      }

      // 验证 ID 格式
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(manifest.id)) {
        warnings.push('id 建议使用反向域名格式，如 com.example.my-plugin');
      }

      // 验证版本号
      if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(manifest.version)) {
        errors.push('version 必须符合语义版本规范 (如 1.0.0)');
      }

      // 验证分类
      if (!VALID_CATEGORIES.includes(manifest.category)) {
        errors.push('category 必须是 provider, global 或 tool');
      }

      // 验证入口配置
      if (manifest.category === 'global' && !manifest.entry?.frontend) {
        errors.push('global 类型插件必须提供 entry.frontend');
      }

      if (manifest.category === 'provider' && !manifest.entry?.backend) {
        errors.push('provider 类型插件必须提供 entry.backend');
      }

      // 验证 scopes
      for (const scope of manifest.scopes || []) {
        if (!VALID_SCOPES.includes(scope)) {
          warnings.push(`未知的权限作用域: ${scope}`);
        }
      }

      // 验证分类特定元数据
      if (manifest.category === 'global' && !manifest.globalMeta) {
        errors.push('global 类型插件必须提供 globalMeta');
      }

      // 验证成功时，保留 staging 供 install 复用
      const isValid = errors.length === 0;
      let stagingId: string | undefined;

      if (isValid && keepExtracted) {
        stagingId = this._generateStagingId();
        this._stagingCache.set(stagingId, { path: stagingPath, createdAt: Date.now() });
      } else {
        // 验证失败或不需要保留，清理临时目录
        await this.cleanup(stagingPath);
      }

      return {
        valid: isValid,
        errors,
        warnings,
        manifest: isValid ? manifest : undefined,
        stagingId,
      };
    } catch (err: any) {
      return {
        valid: false,
        errors: [`验证失败: ${err.message}`],
        warnings,
      };
    }
  }

  /**
   * 安装插件
   * @param stagingId 可选，复用 validate 的解压结果
   */
  async install(zipPath: string, manifest: PluginManifest, stagingId?: string): Promise<InstallResult> {
    try {
      const pluginDir = path.join(this.pluginsDir, manifest.id);

      // 如果已存在，先删除
      if (await this.fileExists(pluginDir)) {
        await this.forceRemoveDir(pluginDir);
      }

      // 创建目录
      await fs.mkdir(pluginDir, { recursive: true });

      // 尝试复用 staging 缓存
      const staging = stagingId ? this._stagingCache.get(stagingId) : null;
      if (staging) {
        // 从 staging 移动文件到 pluginDir
        await this._moveStagingToPlugin(staging.path, pluginDir);
        this._stagingCache.delete(stagingId!);
      } else {
        // 重新解压
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(pluginDir, true);

        // 检查是否解压到了子目录
        await this._flattenSubdirectory(pluginDir);
      }

      // 创建数据目录（沙箱）
      await fs.mkdir(path.join(pluginDir, 'data'), { recursive: true });

      return {
        success: true,
        rootPath: pluginDir,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * 从文件夹安装（开发模式）
   * 使用 allowlist 过滤，避免复制 node_modules 等开发依赖
   */
  async installFromFolder(folderPath: string, manifest: PluginManifest): Promise<InstallResult> {
    try {
      const pluginDir = path.join(this.pluginsDir, manifest.id);

      // 如果已存在，先删除
      if (await this.fileExists(pluginDir)) {
        await this.forceRemoveDir(pluginDir);
      }

      // 构建 allowlist（排除 node_modules 等）
      const allowlist = buildAllowlist(manifest);

      // 创建目标目录
      await fs.mkdir(pluginDir, { recursive: true });

      // 只复制 allowlist 中的文件/目录
      const entries = await fs.readdir(folderPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!allowlist.has(entry.name)) {
          continue; // 跳过不在 allowlist 中的项
        }

        const srcPath = path.join(folderPath, entry.name);
        const destPath = path.join(pluginDir, entry.name);

        if (entry.isDirectory()) {
          await this.copyDir(srcPath, destPath);
        } else {
          await fs.copyFile(srcPath, destPath);
        }
      }

      // 确保数据目录存在
      await fs.mkdir(path.join(pluginDir, 'data'), { recursive: true });

      return {
        success: true,
        rootPath: pluginDir,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * 卸载插件
   */
  async uninstall(pluginPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (await this.fileExists(pluginPath)) {
        await this.forceRemoveDir(pluginPath);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * 获取已安装插件列表
   */
  async listInstalled(): Promise<PluginManifest[]> {
    const plugins: PluginManifest[] = [];

    try {
      const entries = await fs.readdir(this.pluginsDir);

      for (const entry of entries) {
        const manifestPath = path.join(this.pluginsDir, entry, 'manifest.json');
        if (await this.fileExists(manifestPath)) {
          try {
            const content = await fs.readFile(manifestPath, 'utf-8');
            plugins.push(JSON.parse(content));
          } catch {
            // 忽略无效的插件
          }
        }
      }
    } catch {
      // 目录不存在
    }

    return plugins;
  }

  // 辅助方法
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async cleanup(dirPath: string): Promise<void> {
    try {
      await this.forceRemoveDir(dirPath);
    } catch {
      // 忽略
    }
  }

  async copyDir(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDir(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * 从 staging 移动文件到插件目录
   */
  async _moveStagingToPlugin(stagingPath: string, pluginDir: string): Promise<void> {
    // 检查是否有子目录包装
    const entries = await fs.readdir(stagingPath);
    let sourceDir = stagingPath;

    if (entries.length === 1) {
      const subPath = path.join(stagingPath, entries[0]);
      const stat = await fs.stat(subPath);
      if (stat.isDirectory() && await this.fileExists(path.join(subPath, 'manifest.json'))) {
        sourceDir = subPath;
      }
    }

    // 移动文件
    const sourceEntries = await fs.readdir(sourceDir);
    for (const entry of sourceEntries) {
      await fs.rename(
        path.join(sourceDir, entry),
        path.join(pluginDir, entry)
      );
    }

    // 清理 staging 目录
    await this.cleanup(stagingPath);
  }

  /**
   * 如果解压到了子目录，将内容移到根目录
   */
  async _flattenSubdirectory(pluginDir: string): Promise<void> {
    const entries = await fs.readdir(pluginDir);
    if (entries.length === 1) {
      const subPath = path.join(pluginDir, entries[0]);
      const stat = await fs.stat(subPath);
      if (stat.isDirectory()) {
        const subEntries = await fs.readdir(subPath);
        for (const entry of subEntries) {
          await fs.rename(
            path.join(subPath, entry),
            path.join(pluginDir, entry)
          );
        }
        await fs.rmdir(subPath);
      }
    }
  }
}

export const pluginService = new PluginService();
