import { parentPort } from 'worker_threads';
import type {
  ElectronPluginAPI,
  PluginHostRpcRequest,
  PluginHostRpcResponse,
  PluginManifest,
  PluginModule,
  PluginWorkerIncomingMessage,
} from '../types';

if (!parentPort) {
  throw new Error('Plugin worker must run in worker_threads context');
}

let currentPluginId = '';
let currentModule: PluginModule | null = null;
let currentManifest: PluginManifest | null = null;
const pendingHostCalls = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

function sendMessage(message: any): void {
  parentPort!.postMessage(message);
}

function callHost(method: string, ...params: unknown[]): Promise<unknown> {
  const requestId = `${method}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const request: PluginHostRpcRequest = {
    requestId,
    method,
    params,
  };

  return new Promise((resolve, reject) => {
    pendingHostCalls.set(requestId, { resolve, reject });
    sendMessage({ type: 'host:request', payload: request });
  });
}

function createPluginApi(): ElectronPluginAPI {
  const api: ElectronPluginAPI = {
    core: {
      getVersion: () => {
        throw new Error('sync core.getVersion is not available in worker sandbox');
      },
      getPluginDir: () => {
        throw new Error('sync core.getPluginDir is not available in worker sandbox');
      },
      getDataDir: () => {
        throw new Error('sync core.getDataDir is not available in worker sandbox');
      },
    },
    fs: {
      readFile: async (filePath: string) => callHost('fs.readFile', filePath) as Promise<string>,
      writeFile: async (filePath: string, content: string) => {
        await callHost('fs.writeFile', filePath, content);
      },
      deleteFile: async (filePath: string) => {
        await callHost('fs.deleteFile', filePath);
      },
      exists: async (filePath: string) => callHost('fs.exists', filePath) as Promise<boolean>,
      listDir: async (dirPath: string) => callHost('fs.listDir', dirPath) as Promise<string[]>,
    },
    net: {
      fetch: async (input: any, init?: any) => {
        const result = (await callHost('net.fetch', input, init)) as {
          ok: boolean;
          status: number;
          statusText: string;
          headers: Record<string, string>;
          body: string;
        };
        return new Response(result.body, {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers,
        });
      },
    },
    spawn: (command, args, options) => {
      // Worker sandbox 仅保留兼容签名，不提供完整流式句柄。
      const resultPromise = callHost('spawn.run', command, args, options) as Promise<{ pid: number }>;
      const toEmptyAsyncIterable = async function* (): AsyncIterable<string> {
        return;
      };
      return {
        pid: 0,
        stdout: toEmptyAsyncIterable(),
        stderr: toEmptyAsyncIterable(),
        stdin: {
          write: () => {
            throw new Error('spawn stdin not supported in worker sandbox');
          },
          end: () => {
            throw new Error('spawn stdin not supported in worker sandbox');
          },
        },
        kill: () => {
          throw new Error('spawn kill not supported in worker sandbox');
        },
        wait: async () => {
          const result = await resultPromise;
          return result.pid ? 0 : 1;
        },
      };
    },
    channels: {
      registerProvider: async (def) => {
        await callHost('channels.registerProvider', def);
      },
      unregisterProvider: async (type) => {
        await callHost('channels.unregisterProvider', type);
      },
      listProviders: (kind?: string) => {
        throw new Error('sync channels.listProviders is not available in worker sandbox');
      },
      getProviderConfig: async (type: string) => callHost('channels.getProviderConfig', type) as Promise<Record<string, unknown> | null>,
      updateProviderConfig: async (type: string, config: Record<string, unknown>) => {
        await callHost('channels.updateProviderConfig', type, config);
      },
    },
    mcp: {
      registerServer: async (server) => {
        await callHost('mcp.registerServer', server);
      },
      unregisterServer: async (name) => {
        await callHost('mcp.unregisterServer', name);
      },
      registerTool: async (tool) => {
        await callHost('mcp.registerTool', tool);
      },
      unregisterTool: async (name) => {
        await callHost('mcp.unregisterTool', name);
      },
      registerResource: async (resource) => {
        await callHost('mcp.registerResource', resource);
      },
      unregisterResource: async (uri) => {
        await callHost('mcp.unregisterResource', uri);
      },
      listTools: () => {
        throw new Error('sync mcp.listTools is not available in worker sandbox');
      },
      listResources: () => {
        throw new Error('sync mcp.listResources is not available in worker sandbox');
      },
    },
    agents: {
      registerWorker: async (worker) => {
        await callHost('agents.registerWorker', worker);
      },
      unregisterWorker: async (id) => {
        await callHost('agents.unregisterWorker', id);
      },
      listWorkers: () => {
        throw new Error('sync agents.listWorkers is not available in worker sandbox');
      },
    },
    capability: {
      list: () => {
        throw new Error('sync capability.list is not available in worker sandbox');
      },
      resolve: () => {
        throw new Error('sync capability.resolve is not available in worker sandbox');
      },
      invoke: async (id: string, args: unknown) => callHost('capability.invoke', id, args),
    },
    log: {
      debug: (...args: unknown[]) => sendMessage({ type: 'log', level: 'debug', args }),
      info: (...args: unknown[]) => sendMessage({ type: 'log', level: 'info', args }),
      warn: (...args: unknown[]) => sendMessage({ type: 'log', level: 'warn', args }),
      error: (...args: unknown[]) => sendMessage({ type: 'log', level: 'error', args }),
    },
  };

  return api;
}

async function handleActivate(message: Extract<PluginWorkerIncomingMessage, { type: 'activate' }>): Promise<void> {
  currentPluginId = message.pluginId;
  currentManifest = message.manifest;
  const moduleExport = require(message.modulePath) as PluginModule;
  currentModule = moduleExport;

  if (moduleExport.onActivate) {
    const api = createPluginApi();
    await moduleExport.onActivate(api);
  }

  sendMessage({ type: 'activate:result', requestId: message.requestId, success: true });
}

async function handleDeactivate(message: Extract<PluginWorkerIncomingMessage, { type: 'deactivate' }>): Promise<void> {
  if (currentModule?.onDeactivate) {
    await currentModule.onDeactivate();
  }
  sendMessage({ type: 'deactivate:result', requestId: message.requestId, success: true });
}

parentPort.on('message', async (message: PluginWorkerIncomingMessage) => {
  try {
    if (message.type === 'host:response') {
      const response: PluginHostRpcResponse = message.payload;
      const pending = pendingHostCalls.get(response.requestId);
      if (!pending) return;
      pendingHostCalls.delete(response.requestId);
      if (response.success) {
        pending.resolve(response.result);
      } else {
        pending.reject(new Error(response.error.message));
      }
      return;
    }

    if (message.type === 'activate') {
      await handleActivate(message);
      return;
    }

    if (message.type === 'deactivate') {
      await handleDeactivate(message);
      return;
    }

    if (message.type === 'dispose') {
      process.exit(0);
    }
  } catch (error: any) {
    const requestId = (message as any)?.requestId;
    if (message.type === 'activate' && requestId) {
      sendMessage({ type: 'activate:result', requestId, success: false, error: error?.message || String(error) });
      return;
    }
    if (message.type === 'deactivate' && requestId) {
      sendMessage({ type: 'deactivate:result', requestId, success: false, error: error?.message || String(error) });
      return;
    }
    sendMessage({
      type: 'error',
      stage: 'runtime',
      message: error?.message || String(error),
      stack: error?.stack,
    });
  }
});

sendMessage({ type: 'ready' });
