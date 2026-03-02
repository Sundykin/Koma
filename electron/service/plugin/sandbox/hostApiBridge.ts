import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';
import { providerRegistry, mcpRegistry, agentRegistry } from '../registries';
import { capabilityRegistry } from '../capability';
import { configRegistry } from '../../config';
import type { ProviderConfigData } from '../../config';
import type {
  ChildProcessHandle,
  MCPResourceHandler,
  MCPServerDefinition,
  MCPToolHandler,
  PluginHostRpcErrorResponse,
  PluginHostRpcRequest,
  PluginHostRpcResponse,
  PluginManifest,
  ProviderDefinition,
  SpawnOptions,
  WorkerAgentDefinition,
} from '../types';

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
      // ignore
    }
  }
}

const providerConfigStore = new ProviderConfigStore();

type HostMethodHandler = (params: unknown[]) => Promise<unknown>;

interface HostApiBridgeContext {
  manifest: PluginManifest;
  pluginDir: string;
  dataDir: string;
  appVersion: string;
}

export class PluginHostApiBridge {
  private readonly scopes: Set<string>;
  private readonly handlers = new Map<string, HostMethodHandler>();

  constructor(private readonly context: HostApiBridgeContext) {
    this.scopes = new Set(context.manifest.scopes || []);
    this.registerHandlers();
  }

  async handleRequest(request: PluginHostRpcRequest): Promise<PluginHostRpcResponse> {
    const handler = this.handlers.get(request.method);
    if (!handler) {
      return this.createErrorResponse(request.requestId, `Unknown host method: ${request.method}`, 'unknown_method');
    }

    try {
      const result = await handler(request.params || []);
      return {
        requestId: request.requestId,
        success: true,
        result,
      };
    } catch (error: any) {
      return this.createErrorResponse(request.requestId, error?.message || String(error), error?.code);
    }
  }

  private createErrorResponse(requestId: string, message: string, code?: string): PluginHostRpcErrorResponse {
    return {
      requestId,
      success: false,
      error: {
        message,
        code,
      },
    };
  }

  private requireScope(scope: string, action: string): void {
    if (!this.scopes.has(scope)) {
      throw new Error(`插件 ${this.context.manifest.id} 未声明权限 "${scope}"，无法执行: ${action}`);
    }
  }

  private resolveSandboxPath(baseDir: string, filePath: string): string {
    const resolved = path.resolve(baseDir, filePath);
    if (!resolved.startsWith(baseDir)) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  private createChildProcess(command: string, args?: string[], options?: SpawnOptions): ChildProcessHandle {
    const child = spawn(command, args || [], {
      cwd: options?.cwd,
      env: { ...process.env, ...options?.env },
      shell: process.platform === 'win32',
    });

    const toAsyncIterable = async function* (stream: NodeJS.ReadableStream | null): AsyncIterable<string> {
      if (!stream) return;
      for await (const chunk of stream) {
        yield chunk.toString();
      }
    };

    const handle: ChildProcessHandle = {
      pid: child.pid || 0,
      stdout: toAsyncIterable(child.stdout),
      stderr: toAsyncIterable(child.stderr),
      stdin: {
        write: (data: string) => child.stdin?.write(data),
        end: () => child.stdin?.end(),
      },
      kill: (signal?: string) => child.kill(signal as any),
      wait: () =>
        new Promise((resolve, reject) => {
          child.on('exit', code => resolve(code || 0));
          child.on('error', reject);
        }),
    };

    if (options?.timeout) {
      setTimeout(() => child.kill(), options.timeout);
    }

    return handle;
  }

  private registerHandlers(): void {
    const { manifest, pluginDir, dataDir, appVersion } = this.context;
    const pluginId = manifest.id;

    this.handlers.set('core.getVersion', async () => appVersion);
    this.handlers.set('core.getPluginDir', async () => pluginDir);
    this.handlers.set('core.getDataDir', async () => dataDir);

    this.handlers.set('fs.readFile', async ([filePath]) => {
      const fullPath = this.resolveSandboxPath(dataDir, String(filePath));
      return fs.readFile(fullPath, 'utf-8');
    });
    this.handlers.set('fs.writeFile', async ([filePath, content]) => {
      const fullPath = this.resolveSandboxPath(dataDir, String(filePath));
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, String(content), 'utf-8');
      return null;
    });
    this.handlers.set('fs.deleteFile', async ([filePath]) => {
      const fullPath = this.resolveSandboxPath(dataDir, String(filePath));
      await fs.unlink(fullPath);
      return null;
    });
    this.handlers.set('fs.exists', async ([filePath]) => {
      const fullPath = this.resolveSandboxPath(dataDir, String(filePath));
      try {
        await fs.access(fullPath);
        return true;
      } catch {
        return false;
      }
    });
    this.handlers.set('fs.listDir', async ([dirPath]) => {
      const fullPath = this.resolveSandboxPath(dataDir, String(dirPath));
      return fs.readdir(fullPath);
    });

    this.handlers.set('net.fetch', async ([input, init]) => {
      this.requireScope('network:external', 'net.fetch');
      const response = await fetch(input as any, init as any);
      const text = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: text,
      };
    });

    this.handlers.set('spawn.run', async ([command, args, options]) => {
      this.requireScope('spawn:process', 'spawn.run');
      const handle = this.createChildProcess(String(command), Array.isArray(args) ? args : [], options as SpawnOptions);
      return {
        pid: handle.pid,
      };
    });

    this.handlers.set('channels.registerProvider', async ([def]) => {
      const providerDef = { ...(def as ProviderDefinition), pluginId };
      providerRegistry.register(providerDef);
      return null;
    });
    this.handlers.set('channels.unregisterProvider', async ([type]) => {
      providerRegistry.unregister(String(type));
      return null;
    });
    this.handlers.set('channels.listProviders', async ([kind]) => {
      if (kind) return providerRegistry.listByKind(kind as any);
      return providerRegistry.list();
    });
    this.handlers.set('channels.getProviderConfig', async ([type]) => {
      return providerConfigStore.get(String(type));
    });
    this.handlers.set('channels.updateProviderConfig', async ([type, config]) => {
      await providerConfigStore.set(String(type), (config || {}) as Record<string, unknown>);
      return null;
    });

    this.handlers.set('mcp.registerServer', async ([server]) => {
      this.requireScope('mcp:server', 'mcp.registerServer');
      const withPlugin = { ...(server as MCPServerDefinition), pluginId };
      mcpRegistry.registerServer(withPlugin);
      return null;
    });
    this.handlers.set('mcp.unregisterServer', async ([name]) => {
      this.requireScope('mcp:server', 'mcp.unregisterServer');
      mcpRegistry.unregisterServer(String(name));
      return null;
    });
    this.handlers.set('mcp.registerTool', async ([tool]) => {
      this.requireScope('mcp:tool', 'mcp.registerTool');
      const withPlugin: MCPToolHandler = {
        ...(tool as MCPToolHandler),
        definition: {
          ...(tool as MCPToolHandler).definition,
          pluginId,
        },
      };
      mcpRegistry.tools.register(withPlugin);
      return null;
    });
    this.handlers.set('mcp.unregisterTool', async ([name]) => {
      this.requireScope('mcp:tool', 'mcp.unregisterTool');
      mcpRegistry.tools.unregister(String(name));
      return null;
    });
    this.handlers.set('mcp.registerResource', async ([resource]) => {
      this.requireScope('mcp:resource', 'mcp.registerResource');
      const withPlugin: MCPResourceHandler = {
        ...(resource as MCPResourceHandler),
        definition: {
          ...(resource as MCPResourceHandler).definition,
          pluginId,
        },
      };
      mcpRegistry.resources.register(withPlugin);
      return null;
    });
    this.handlers.set('mcp.unregisterResource', async ([uri]) => {
      this.requireScope('mcp:resource', 'mcp.unregisterResource');
      mcpRegistry.resources.unregister(String(uri));
      return null;
    });
    this.handlers.set('mcp.listTools', async () => mcpRegistry.tools.listDefinitions());
    this.handlers.set('mcp.listResources', async () => mcpRegistry.resources.listDefinitions());

    this.handlers.set('agents.registerWorker', async ([worker]) => {
      this.requireScope('agent:register', 'agents.registerWorker');
      const withPlugin = { ...(worker as WorkerAgentDefinition), pluginId };
      agentRegistry.register(withPlugin);
      return null;
    });
    this.handlers.set('agents.unregisterWorker', async ([id]) => {
      this.requireScope('agent:register', 'agents.unregisterWorker');
      agentRegistry.unregister(String(id));
      return null;
    });
    this.handlers.set('agents.listWorkers', async () => agentRegistry.list());

    this.handlers.set('capability.list', async ([filter]) => capabilityRegistry.list(filter as any));
    this.handlers.set('capability.resolve', async ([requirements]) => capabilityRegistry.resolve((requirements as string[]) || []));
    this.handlers.set('capability.invoke', async ([id, args]) => capabilityRegistry.invoke(String(id), args));

    this.handlers.set('log.debug', async (params) => {
      console.debug(`[Plugin:${pluginId}]`, ...params);
      return null;
    });
    this.handlers.set('log.info', async (params) => {
      console.info(`[Plugin:${pluginId}]`, ...params);
      return null;
    });
    this.handlers.set('log.warn', async (params) => {
      console.warn(`[Plugin:${pluginId}]`, ...params);
      return null;
    });
    this.handlers.set('log.error', async (params) => {
      console.error(`[Plugin:${pluginId}]`, ...params);
      return null;
    });
  }
}
