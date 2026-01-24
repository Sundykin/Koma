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

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  category: 'provider' | 'global' | 'tool';
  engine: { minAppVersion: string; sdkVersion: string };
  scopes: string[];
  entry: { backend?: string; frontend?: string };
  [key: string]: any;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  manifest?: PluginManifest;
}

export interface InstallResult {
  success: boolean;
  rootPath?: string;
  error?: string;
}

class PluginService {
  private pluginsDir: string = '';
  private stagingDir: string = '';

  async init(): Promise<void> {
    const userDataPath = app.getPath('userData');
    this.pluginsDir = path.join(userDataPath, 'plugins-runtime');
    this.stagingDir = path.join(userDataPath, 'plugins-staging');

    // 确保目录存在
    await fs.mkdir(this.pluginsDir, { recursive: true });
    await fs.mkdir(this.stagingDir, { recursive: true });
  }

  /**
   * 验证插件包
   */
  async validate(zipPath: string): Promise<ValidationResult> {
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

      // 清理临时目录
      await this.cleanup(stagingPath);

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        manifest: errors.length === 0 ? manifest : undefined,
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
   */
  async install(zipPath: string, manifest: PluginManifest): Promise<InstallResult> {
    try {
      const pluginDir = path.join(this.pluginsDir, manifest.id);

      // 如果已存在，先删除
      if (await this.fileExists(pluginDir)) {
        await fs.rm(pluginDir, { recursive: true });
      }

      // 创建目录
      await fs.mkdir(pluginDir, { recursive: true });

      // 解压
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(pluginDir, true);

      // 检查是否解压到了子目录
      const entries = await fs.readdir(pluginDir);
      if (entries.length === 1) {
        const subPath = path.join(pluginDir, entries[0]);
        const stat = await fs.stat(subPath);
        if (stat.isDirectory()) {
          // 移动子目录内容到根目录
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
   */
  async installFromFolder(folderPath: string, manifest: PluginManifest): Promise<InstallResult> {
    try {
      const pluginDir = path.join(this.pluginsDir, manifest.id);

      // 如果已存在，先删除
      if (await this.fileExists(pluginDir)) {
        await fs.rm(pluginDir, { recursive: true });
      }

      // 创建符号链接（开发模式）或复制
      if (process.env.NODE_ENV === 'development') {
        // 开发模式：创建符号链接
        await fs.symlink(folderPath, pluginDir, 'junction');
      } else {
        // 生产模式：复制文件
        await this.copyDir(folderPath, pluginDir);
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
        await fs.rm(pluginPath, { recursive: true });
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
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async cleanup(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true });
    } catch {
      // 忽略
    }
  }

  private async copyDir(src: string, dest: string): Promise<void> {
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
}

export const pluginService = new PluginService();
