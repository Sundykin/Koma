/**
 * Electron 插件运行时
 * 负责加载和管理 Electron 侧插件（backend 模块）
 */
import * as path from 'path';
import * as fs from 'fs/promises';
import { app } from 'electron';
import { EventEmitter } from 'events';
import type {
  PluginManifest,
  LoadedPlugin,
  PluginRuntimeSnapshot,
} from './types';
import { providerRegistry, mcpRegistry, agentRegistry } from './registries';
import { syncProviders, syncAllMCP } from './capability';
import { PluginWorkerHost } from './sandbox/workerHost';
import { PluginHostApiBridge } from './sandbox/hostApiBridge';

class ElectronPluginRuntime extends EventEmitter {
  private plugins = new Map<string, LoadedPlugin>();
  private runtimeStates = new Map<string, PluginRuntimeSnapshot>();
  private workerHosts = new Map<string, PluginWorkerHost>();
  private pluginsDir = '';
  private workerEntryFile = '';

  async init(): Promise<void> {
    this.pluginsDir = path.join(app.getPath('userData'), 'plugins-runtime');
    this.workerEntryFile = path.join(__dirname, 'sandbox', 'pluginWorkerEntry.js');
    await fs.mkdir(this.pluginsDir, { recursive: true });
  }

  private hasBackendEntry(manifest: PluginManifest): boolean {
    return Boolean(manifest.entry?.backend);
  }

  private getSandboxType(manifest: PluginManifest): PluginRuntimeSnapshot['sandboxType'] {
    return this.hasBackendEntry(manifest) ? 'worker' : 'none';
  }

  private upsertRuntimeState(
    pluginId: string,
    patch: Partial<PluginRuntimeSnapshot> & Pick<PluginRuntimeSnapshot, 'state' | 'sandboxType'>
  ): void {
    const previous = this.runtimeStates.get(pluginId);
    const next: PluginRuntimeSnapshot = {
      id: pluginId,
      category: patch.category || previous?.category || this.plugins.get(pluginId)?.manifest.category || 'provider',
      state: patch.state,
      sandboxType: patch.sandboxType,
      loadedAt: patch.loadedAt ?? previous?.loadedAt,
      activatedAt: patch.activatedAt ?? previous?.activatedAt,
      deactivatedAt: patch.deactivatedAt ?? previous?.deactivatedAt,
      updatedAt: Date.now(),
      error: patch.error,
    };
    this.runtimeStates.set(pluginId, next);
  }

  /**
   * 加载插件
   */
  async loadPlugin(manifest: PluginManifest): Promise<LoadedPlugin> {
    const pluginId = manifest.id;
    const sandboxType = this.getSandboxType(manifest);

    if (this.plugins.has(pluginId)) {
      const existing = this.plugins.get(pluginId)!;
      if (existing.status === 'active') {
        return existing;
      }
    }

    const plugin: LoadedPlugin = {
      manifest,
      module: null,
      status: 'installed',
    };

    try {
      if (this.hasBackendEntry(manifest)) {
        const modulePath = path.join(this.pluginsDir, pluginId, manifest.entry.backend!);
        await fs.access(modulePath);
      }

      plugin.status = 'loaded';
      plugin.loadedAt = Date.now();
      plugin.error = undefined;
      this.plugins.set(pluginId, plugin);

      this.upsertRuntimeState(pluginId, {
        category: manifest.category,
        state: 'loaded',
        sandboxType,
        loadedAt: plugin.loadedAt,
      });

      console.log(`[PluginRuntime] Loaded plugin: ${pluginId}`);
      return plugin;
    } catch (err: any) {
      plugin.status = 'error';
      plugin.error = err.message;
      this.plugins.set(pluginId, plugin);

      this.upsertRuntimeState(pluginId, {
        category: manifest.category,
        state: 'error',
        sandboxType,
        loadedAt: plugin.loadedAt,
        error: err.message,
      });

      console.error(`[PluginRuntime] Failed to load plugin ${pluginId}:`, err);
      throw err;
    }
  }

  /**
   * 激活插件
   */
  async activatePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin "${pluginId}" not loaded`);
    }

    if (plugin.status === 'active') {
      return;
    }

    if (plugin.status === 'error') {
      throw new Error(`Plugin "${pluginId}" is in error state: ${plugin.error}`);
    }

    const sandboxType = this.getSandboxType(plugin.manifest);
    this.upsertRuntimeState(pluginId, {
      category: plugin.manifest.category,
      state: 'activating',
      sandboxType,
      loadedAt: plugin.loadedAt,
    });

    try {
      if (this.hasBackendEntry(plugin.manifest)) {
        const pluginDir = path.join(this.pluginsDir, pluginId);
        const modulePath = path.join(pluginDir, plugin.manifest.entry.backend!);
        const dataDir = path.join(pluginDir, 'data');

        await fs.mkdir(dataDir, { recursive: true });

        const bridge = new PluginHostApiBridge({
          manifest: plugin.manifest,
          pluginDir,
          dataDir,
          appVersion: app.getVersion(),
        });

        const host = new PluginWorkerHost({
          entryFile: this.workerEntryFile,
          onHostRequest: request => bridge.handleRequest(request),
          onRuntimeError: error => {
            const current = this.plugins.get(pluginId);
            if (!current) return;
            current.status = 'error';
            current.error = error.message;
            this.upsertRuntimeState(pluginId, {
              category: current.manifest.category,
              state: 'error',
              sandboxType: this.getSandboxType(current.manifest),
              loadedAt: current.loadedAt,
              activatedAt: this.runtimeStates.get(pluginId)?.activatedAt,
              error: error.message,
            });
          },
        });

        await host.activate({
          pluginId,
          modulePath,
          pluginDir,
          dataDir,
          appVersion: app.getVersion(),
          manifest: plugin.manifest,
        });

        this.workerHosts.set(pluginId, host);
      }

      plugin.status = 'active';
      plugin.error = undefined;
      this.emit('activated', pluginId);

      this.upsertRuntimeState(pluginId, {
        category: plugin.manifest.category,
        state: 'active',
        sandboxType,
        loadedAt: plugin.loadedAt,
        activatedAt: Date.now(),
      });

      console.log(`[PluginRuntime] Activated plugin: ${pluginId}`);
      syncProviders();
      syncAllMCP();
    } catch (err: any) {
      const host = this.workerHosts.get(pluginId);
      if (host) {
        this.workerHosts.delete(pluginId);
        await host.dispose('activate failed');
      }

      plugin.status = 'error';
      plugin.error = err.message;

      this.upsertRuntimeState(pluginId, {
        category: plugin.manifest.category,
        state: 'error',
        sandboxType,
        loadedAt: plugin.loadedAt,
        error: err.message,
      });

      console.error(`[PluginRuntime] Failed to activate plugin ${pluginId}:`, err);
      throw err;
    }
  }

  /**
   * 停用插件
   */
  async deactivatePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || plugin.status !== 'active') {
      return;
    }

    const sandboxType = this.getSandboxType(plugin.manifest);
    this.upsertRuntimeState(pluginId, {
      category: plugin.manifest.category,
      state: 'deactivating',
      sandboxType,
      loadedAt: plugin.loadedAt,
      activatedAt: this.runtimeStates.get(pluginId)?.activatedAt,
    });

    try {
      const host = this.workerHosts.get(pluginId);
      if (host) {
        await host.deactivate(pluginId);
        await host.dispose('plugin deactivated');
        this.workerHosts.delete(pluginId);
      }

      providerRegistry.unregisterByPlugin(pluginId);
      mcpRegistry.unregisterByPlugin(pluginId);
      agentRegistry.unregisterByPlugin(pluginId);

      plugin.status = 'loaded';
      plugin.error = undefined;
      this.emit('deactivated', pluginId);

      this.upsertRuntimeState(pluginId, {
        category: plugin.manifest.category,
        state: 'loaded',
        sandboxType,
        loadedAt: plugin.loadedAt,
        activatedAt: this.runtimeStates.get(pluginId)?.activatedAt,
        deactivatedAt: Date.now(),
      });

      console.log(`[PluginRuntime] Deactivated plugin: ${pluginId}`);
      syncProviders();
      syncAllMCP();
    } catch (err: any) {
      plugin.status = 'error';
      plugin.error = err.message;

      this.upsertRuntimeState(pluginId, {
        category: plugin.manifest.category,
        state: 'error',
        sandboxType,
        loadedAt: plugin.loadedAt,
        activatedAt: this.runtimeStates.get(pluginId)?.activatedAt,
        error: err.message,
      });

      console.error(`[PluginRuntime] Error deactivating plugin ${pluginId}:`, err);
    }
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    await this.deactivatePlugin(pluginId);

    const host = this.workerHosts.get(pluginId);
    if (host) {
      this.workerHosts.delete(pluginId);
      await host.dispose('plugin unloaded');
    }

    this.plugins.delete(pluginId);
    this.runtimeStates.delete(pluginId);
    this.emit('unloaded', pluginId);
    console.log(`[PluginRuntime] Unloaded plugin: ${pluginId}`);
  }

  getPlugin(pluginId: string): LoadedPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  listPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  listActivePlugins(): LoadedPlugin[] {
    return this.listPlugins().filter(p => p.status === 'active');
  }

  listRuntimeStates(): PluginRuntimeSnapshot[] {
    return Array.from(this.runtimeStates.values());
  }

  getRuntimeState(pluginId: string): PluginRuntimeSnapshot | undefined {
    return this.runtimeStates.get(pluginId);
  }
}

export const pluginRuntime = new ElectronPluginRuntime();
