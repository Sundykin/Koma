/**
 * Electron 插件运行时
 * 负责加载和管理 Electron 侧插件（backend 模块）
 */
import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn, ChildProcess } from 'child_process';
import { app } from 'electron';
import { EventEmitter } from 'events';
import type {
  PluginManifest,
  PluginModule,
  LoadedPlugin,
  ElectronPluginAPI,
  ProviderDefinition,
  MCPServerDefinition,
  MCPToolHandler,
  MCPResourceHandler,
  WorkerAgentDefinition,
  SpawnOptions,
  ChildProcessHandle,
} from './types';
import { providerRegistry, mcpRegistry, agentRegistry } from './registries';
import { syncProviders, syncAllMCP, capabilityRegistry } from './capability';
import { configRegistry } from '../config';
import type { ProviderConfigData } from '../config';

// Provider 配置存储（通过 ConfigRegistry）
class ProviderConfigStore {
  async get(type: string): Promise<Record<string, unknown> | null> {
    try {
      const configs = await configRegistry.get<ProviderConfigData>('provider-config');
      return configs[type] || null;
    } catch {
      return null;
    }
  }

  async set(type: string, config: Record<string, unknown>): Promise<void> {
    try {
      const configs = await configRegistry.get<ProviderConfigData>('provider-config');
      configs[type] = config;
      await configRegistry.set('provider-config', configs);
    } catch {
      // ConfigRegistry 未初始化时静默失败
    }
  }
}

const providerConfigStore = new ProviderConfigStore();

class ElectronPluginRuntime extends EventEmitter {
  private plugins = new Map<string, LoadedPlugin>();
  private pluginsDir: string = '';

  async init(): Promise<void> {
    this.pluginsDir = path.join(app.getPath('userData'), 'plugins-runtime');
    await fs.mkdir(this.pluginsDir, { recursive: true });
  }

  /**
   * 加载插件
   */
  async loadPlugin(manifest: PluginManifest): Promise<LoadedPlugin> {
    const pluginId = manifest.id;

    // 检查是否已加载
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
      // 只有有 backend 入口的插件才需要加载模块
      if (manifest.entry.backend) {
        const modulePath = path.join(this.pluginsDir, pluginId, manifest.entry.backend);

        // 检查模块文件是否存在
        try {
          await fs.access(modulePath);
        } catch {
          throw new Error(`Backend module not found: ${modulePath}`);
        }

        // 动态加载模块
        // 使用 require 而非 import 以支持 CommonJS
        const module = require(modulePath) as PluginModule;
        plugin.module = module;
        plugin.status = 'loaded';
        plugin.loadedAt = Date.now();

        console.log(`[PluginRuntime] Loaded plugin: ${pluginId}`);
      } else {
        // 没有 backend 入口，标记为已加载
        plugin.status = 'loaded';
        plugin.loadedAt = Date.now();
      }

      this.plugins.set(pluginId, plugin);
      return plugin;
    } catch (err: any) {
      plugin.status = 'error';
      plugin.error = err.message;
      this.plugins.set(pluginId, plugin);
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
      return; // 已激活
    }

    if (plugin.status === 'error') {
      throw new Error(`Plugin "${pluginId}" is in error state: ${plugin.error}`);
    }

    try {
      // 创建插件 API
      const api = this.createPluginAPI(plugin.manifest);

      // 调用 onActivate
      if (plugin.module?.onActivate) {
        await plugin.module.onActivate(api);
      }

      // 根据插件类型进行特殊处理
      await this.handlePluginActivation(plugin, api);

      plugin.status = 'active';
      this.emit('activated', pluginId);
      console.log(`[PluginRuntime] Activated plugin: ${pluginId}`);

      // 同步 Capability（插件激活后新能力可用）
      syncProviders();
      syncAllMCP();
    } catch (err: any) {
      plugin.status = 'error';
      plugin.error = err.message;
      console.error(`[PluginRuntime] Failed to activate plugin ${pluginId}:`, err);
      throw err;
    }
  }

  /**
   * 根据插件类型进行特殊激活处理
   */
  private async handlePluginActivation(plugin: LoadedPlugin, _api: ElectronPluginAPI): Promise<void> {
    const { manifest, module } = plugin;
    console.log(`[PluginRuntime] handlePluginActivation: ${manifest.id}, category: ${manifest.category}`);
    console.log(`[PluginRuntime] module.createProvider exists: ${!!module?.createProvider}`);
    console.log(`[PluginRuntime] manifest.providerMeta exists: ${!!manifest.providerMeta}`);

    switch (manifest.category) {
      case 'provider':
        // Provider 插件：如果提供了 createProvider 工厂
        if (module?.createProvider && manifest.providerMeta) {
          const def: ProviderDefinition = {
            type: manifest.id,
            kind: manifest.providerMeta.channelType,
            name: manifest.name,
            capabilities: manifest.providerMeta.capabilities,
            factory: module.createProvider,
            defaultConfig: manifest.providerMeta.defaultConfig,
            pluginId: manifest.id,
          };
          console.log(`[PluginRuntime] Registering provider: ${def.type}, kind: ${def.kind}`);
          providerRegistry.register(def);
        } else {
          console.log(`[PluginRuntime] Provider plugin ${manifest.id} missing createProvider or providerMeta`);
        }
        break;

      case 'mcp':
        // MCP 插件：如果提供了 createMCPServer 工厂
        if (module?.createMCPServer) {
          const server = module.createMCPServer();
          server.pluginId = manifest.id;
          mcpRegistry.registerServer(server);
        }
        break;

      case 'agent':
        // Agent 插件：如果提供了 createAgent 工厂
        if (module?.createAgent) {
          const agent = module.createAgent();
          agent.pluginId = manifest.id;
          agentRegistry.register(agent);
        }
        break;
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

    try {
      // 调用 onDeactivate
      if (plugin.module?.onDeactivate) {
        await plugin.module.onDeactivate();
      }

      // 清理注册的资源
      providerRegistry.unregisterByPlugin(pluginId);
      mcpRegistry.unregisterByPlugin(pluginId);
      agentRegistry.unregisterByPlugin(pluginId);

      plugin.status = 'loaded';
      this.emit('deactivated', pluginId);
      console.log(`[PluginRuntime] Deactivated plugin: ${pluginId}`);

      // 同步 Capability（插件停用后能力不再可用）
      syncProviders();
      syncAllMCP();
    } catch (err: any) {
      console.error(`[PluginRuntime] Error deactivating plugin ${pluginId}:`, err);
    }
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    await this.deactivatePlugin(pluginId);

    const plugin = this.plugins.get(pluginId);
    if (plugin?.module) {
      // 清除 require 缓存
      const modulePath = path.join(this.pluginsDir, pluginId, plugin.manifest.entry.backend || '');
      delete require.cache[require.resolve(modulePath)];
    }

    this.plugins.delete(pluginId);
    this.emit('unloaded', pluginId);
    console.log(`[PluginRuntime] Unloaded plugin: ${pluginId}`);
  }

  /**
   * 创建插件 API
   */
  private createPluginAPI(manifest: PluginManifest): ElectronPluginAPI {
    const pluginId = manifest.id;
    const pluginDir = path.join(this.pluginsDir, pluginId);
    const dataDir = path.join(pluginDir, 'data');
    const scopes = new Set(manifest.scopes || []);

    // scope 守卫：未声明的 scope 抛出错误
    const requireScope = (scope: string, action: string) => {
      if (!scopes.has(scope)) {
        throw new Error(`插件 ${pluginId} 未声明权限 "${scope}"，无法执行: ${action}`);
      }
    };

    return {
      core: {
        getVersion: () => app.getVersion(),
        getPluginDir: () => pluginDir,
        getDataDir: () => dataDir,
      },

      fs: {
        readFile: async (filePath: string) => {
          const fullPath = this.resolveSandboxPath(dataDir, filePath);
          return fs.readFile(fullPath, 'utf-8');
        },
        writeFile: async (filePath: string, content: string) => {
          const fullPath = this.resolveSandboxPath(dataDir, filePath);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content, 'utf-8');
        },
        deleteFile: async (filePath: string) => {
          const fullPath = this.resolveSandboxPath(dataDir, filePath);
          await fs.unlink(fullPath);
        },
        exists: async (filePath: string) => {
          const fullPath = this.resolveSandboxPath(dataDir, filePath);
          try {
            await fs.access(fullPath);
            return true;
          } catch {
            return false;
          }
        },
        listDir: async (dirPath: string) => {
          const fullPath = this.resolveSandboxPath(dataDir, dirPath);
          return fs.readdir(fullPath);
        },
      },

      net: {
        fetch: (...args: Parameters<typeof globalThis.fetch>) => {
          requireScope('network:external', 'net.fetch');
          return globalThis.fetch(...args);
        },
      },

      spawn: (command: string, args?: string[], options?: SpawnOptions): ChildProcessHandle => {
        requireScope('spawn:process', 'spawn');
        return this.createChildProcess(command, args, options);
      },

      channels: {
        registerProvider: async (def: ProviderDefinition) => {
          def.pluginId = pluginId;
          providerRegistry.register(def);
        },
        unregisterProvider: async (type: string) => {
          providerRegistry.unregister(type);
        },
        listProviders: (kind?: string) => {
          if (kind) {
            return providerRegistry.listByKind(kind as any);
          }
          return providerRegistry.list();
        },
        getProviderConfig: async (type: string) => {
          return providerConfigStore.get(type);
        },
        updateProviderConfig: async (type: string, config: Record<string, unknown>) => {
          await providerConfigStore.set(type, config);
        },
      },

      mcp: {
        registerServer: async (server: MCPServerDefinition) => {
          requireScope('mcp:server', 'mcp.registerServer');
          server.pluginId = pluginId;
          mcpRegistry.registerServer(server);
        },
        unregisterServer: async (name: string) => {
          requireScope('mcp:server', 'mcp.unregisterServer');
          mcpRegistry.unregisterServer(name);
        },
        registerTool: async (tool: MCPToolHandler) => {
          requireScope('mcp:tool', 'mcp.registerTool');
          tool.definition.pluginId = pluginId;
          mcpRegistry.tools.register(tool);
        },
        unregisterTool: async (name: string) => {
          requireScope('mcp:tool', 'mcp.unregisterTool');
          mcpRegistry.tools.unregister(name);
        },
        registerResource: async (resource: MCPResourceHandler) => {
          requireScope('mcp:resource', 'mcp.registerResource');
          resource.definition.pluginId = pluginId;
          mcpRegistry.resources.register(resource);
        },
        unregisterResource: async (uri: string) => {
          requireScope('mcp:resource', 'mcp.unregisterResource');
          mcpRegistry.resources.unregister(uri);
        },
        listTools: () => mcpRegistry.tools.listDefinitions(),
        listResources: () => mcpRegistry.resources.listDefinitions(),
      },

      agents: {
        registerWorker: async (worker: WorkerAgentDefinition) => {
          requireScope('agent:register', 'agents.registerWorker');
          worker.pluginId = pluginId;
          agentRegistry.register(worker);
        },
        unregisterWorker: async (id: string) => {
          requireScope('agent:register', 'agents.unregisterWorker');
          agentRegistry.unregister(id);
        },
        listWorkers: () => agentRegistry.list(),
      },

      capability: {
        list: (filter?: { type?: string; tags?: string[] }) =>
          capabilityRegistry.list(filter as any),
        resolve: (requirements: string[]) =>
          capabilityRegistry.resolve(requirements),
        invoke: (id: string, args: unknown) =>
          capabilityRegistry.invoke(id, args),
      },

      log: {
        debug: (...args) => console.debug(`[Plugin:${pluginId}]`, ...args),
        info: (...args) => console.info(`[Plugin:${pluginId}]`, ...args),
        warn: (...args) => console.warn(`[Plugin:${pluginId}]`, ...args),
        error: (...args) => console.error(`[Plugin:${pluginId}]`, ...args),
      },
    };
  }

  /**
   * 解析沙箱路径（防止路径遍历）
   */
  private resolveSandboxPath(baseDir: string, filePath: string): string {
    const resolved = path.resolve(baseDir, filePath);
    if (!resolved.startsWith(baseDir)) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  /**
   * 创建子进程句柄
   */
  private createChildProcess(command: string, args?: string[], options?: SpawnOptions): ChildProcessHandle {
    const child = spawn(command, args || [], {
      cwd: options?.cwd,
      env: { ...process.env, ...options?.env },
      shell: process.platform === 'win32',
    });

    const handle: ChildProcessHandle = {
      pid: child.pid || 0,
      stdout: this.createAsyncIterable(child.stdout),
      stderr: this.createAsyncIterable(child.stderr),
      stdin: {
        write: (data: string) => child.stdin?.write(data),
        end: () => child.stdin?.end(),
      },
      kill: (signal?: string) => child.kill(signal as any),
      wait: () => new Promise((resolve, reject) => {
        child.on('exit', (code) => resolve(code || 0));
        child.on('error', reject);
      }),
    };

    // 超时处理
    if (options?.timeout) {
      setTimeout(() => child.kill(), options.timeout);
    }

    return handle;
  }

  /**
   * 将流转换为异步可迭代对象
   */
  private async *createAsyncIterable(stream: NodeJS.ReadableStream | null): AsyncIterable<string> {
    if (!stream) return;

    for await (const chunk of stream) {
      yield chunk.toString();
    }
  }

  /**
   * 获取已加载插件
   */
  getPlugin(pluginId: string): LoadedPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * 获取所有已加载插件
   */
  listPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * 获取活跃插件
   */
  listActivePlugins(): LoadedPlugin[] {
    return this.listPlugins().filter(p => p.status === 'active');
  }
}

export const pluginRuntime = new ElectronPluginRuntime();
