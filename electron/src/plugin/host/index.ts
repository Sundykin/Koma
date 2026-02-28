/**
 * 插件宿主管理器
 * 管理插件的安装、加载、激活和停用
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { app } from 'electron';
import { EventEmitter } from 'events';
import { capabilityRegistry } from '../capability/registry';
import { mcpGateway } from '../mcp/gateway';

/** 插件 Manifest */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  category: string;
  capabilities: Array<{
    kind: string;
    name: string;
    version?: string;
    config?: Record<string, unknown>;
  }>;
  permissions?: Array<{ id: string; reason?: string }>;
  entry?: {
    main?: string;
    ui?: string;
    backend?: string;
  };
  mcp?: {
    tools?: Array<{ name: string; description: string }>;
    resources?: Array<{ name: string; description: string }>;
    prompts?: Array<{ name: string; description: string }>;
  };
}

/** 插件状态 */
export type PluginStatus =
  | 'installed'
  | 'loading'
  | 'active'
  | 'disabled'
  | 'error';

/** 插件运行时信息 */
export interface PluginRuntime {
  manifest: PluginManifest;
  pluginDir: string;
  status: PluginStatus;
  error?: string;
  installedAt: string;
  updatedAt: string;
}

/** 插件信息 */
export interface PluginInfo {
  manifest: PluginManifest;
  status: PluginStatus;
  error?: string;
  installedAt: string;
  updatedAt: string;
}

class PluginHost extends EventEmitter {
  private plugins = new Map<string, PluginRuntime>();
  private pluginsDir = '';

  /** 初始化 */
  async init(): Promise<void> {
    this.pluginsDir = path.join(app.getPath('userData'), 'plugins');
    await fs.mkdir(this.pluginsDir, { recursive: true });
  }

  /** 扫描并加载所有已安装插件 */
  async scanPlugins(): Promise<void> {
    try {
      const entries = await fs.readdir(this.pluginsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const manifestPath = path.join(this.pluginsDir, entry.name, 'manifest.json');
        try {
          const content = await fs.readFile(manifestPath, 'utf-8');
          const manifest = JSON.parse(content) as PluginManifest;
          this.registerPlugin(manifest, path.join(this.pluginsDir, entry.name));
        } catch {
          // Skip invalid plugins
        }
      }
    } catch {
      // Plugins dir may not exist yet
    }
  }

  /** 注册插件 */
  private registerPlugin(manifest: PluginManifest, pluginDir: string): void {
    const now = new Date().toISOString();
    this.plugins.set(manifest.id, {
      manifest,
      pluginDir,
      status: 'installed',
      installedAt: now,
      updatedAt: now,
    });
  }

  /** 激活插件 */
  async activatePlugin(pluginId: string): Promise<void> {
    const runtime = this.plugins.get(pluginId);
    if (!runtime) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (runtime.status === 'active') return;

    runtime.status = 'loading';
    runtime.updatedAt = new Date().toISOString();

    try {
      // Register capabilities
      for (const cap of runtime.manifest.capabilities) {
        capabilityRegistry.register(pluginId, cap, async (input, ctx) => {
          // Default handler - plugins override this
          return { pluginId, capability: cap, input };
        });
      }

      runtime.status = 'active';
      runtime.error = undefined;
      runtime.updatedAt = new Date().toISOString();

      this.emit('activated', pluginId);
    } catch (error) {
      runtime.status = 'error';
      runtime.error = (error as Error).message;
      runtime.updatedAt = new Date().toISOString();
      throw error;
    }
  }

  /** 停用插件 */
  async deactivatePlugin(pluginId: string): Promise<void> {
    const runtime = this.plugins.get(pluginId);
    if (!runtime || runtime.status !== 'active') return;

    try {
      capabilityRegistry.unregisterByPlugin(pluginId);
      mcpGateway.unregisterByPlugin(pluginId);

      runtime.status = 'disabled';
      runtime.updatedAt = new Date().toISOString();

      this.emit('deactivated', pluginId);
    } catch (error) {
      runtime.status = 'error';
      runtime.error = (error as Error).message;
      throw error;
    }
  }

  /** 安装插件 */
  async installPlugin(manifest: PluginManifest, sourcePath: string): Promise<void> {
    const pluginDir = path.join(this.pluginsDir, manifest.id);
    await fs.mkdir(pluginDir, { recursive: true });

    // Copy plugin files
    await fs.cp(sourcePath, pluginDir, { recursive: true });

    this.registerPlugin(manifest, pluginDir);
    this.emit('installed', manifest.id);
  }

  /** 卸载插件 */
  async uninstallPlugin(pluginId: string): Promise<void> {
    await this.deactivatePlugin(pluginId);

    const runtime = this.plugins.get(pluginId);
    if (runtime) {
      await fs.rm(runtime.pluginDir, { recursive: true, force: true });
      this.plugins.delete(pluginId);
    }

    this.emit('uninstalled', pluginId);
  }

  /** 获取插件信息 */
  getPlugin(pluginId: string): PluginInfo | undefined {
    const runtime = this.plugins.get(pluginId);
    if (!runtime) return undefined;

    return {
      manifest: runtime.manifest,
      status: runtime.status,
      error: runtime.error,
      installedAt: runtime.installedAt,
      updatedAt: runtime.updatedAt,
    };
  }

  /** 列出所有插件 */
  listPlugins(): PluginInfo[] {
    return Array.from(this.plugins.values()).map((runtime) => ({
      manifest: runtime.manifest,
      status: runtime.status,
      error: runtime.error,
      installedAt: runtime.installedAt,
      updatedAt: runtime.updatedAt,
    }));
  }

  /** 列出活跃插件 */
  listActivePlugins(): PluginInfo[] {
    return this.listPlugins().filter((p) => p.status === 'active');
  }
}

/** 全局插件宿主实例 */
export const pluginHost = new PluginHost();
