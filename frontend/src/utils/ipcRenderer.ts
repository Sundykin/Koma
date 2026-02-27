/**
 * Electron-Egg 前端 IPC 封装
 * 提供 controller.xxx.method 格式的调用方式
 * 集成缓存和请求去重优化
 */
import { createCachedInvoke } from './ipcCache';

interface IPCErrorEnvelope {
  code: string;
  message: string;
  stack?: string;
  details?: unknown;
}

type IPCResponseEnvelope<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: IPCErrorEnvelope };

function unwrapIPCResponse<T>(response: IPCResponseEnvelope<T>): T {
  if (response?.ok) {
    return response.data;
  }

  const error = response?.error;
  const message = error?.message || 'IPC request failed';
  const err = new Error(message) as Error & { code?: string; details?: unknown };
  err.code = error?.code;
  err.details = error?.details;
  throw err;
}

// 获取 Electron 对象
const Renderer = (window as any).electron || {};

const rawIpcRenderer = Renderer.ipcRenderer || {
  invoke: () => Promise.reject(new Error('Not in Electron environment')),
  sendSync: () => null,
  on: () => {},
  once: () => {},
  removeListener: () => {},
  removeAllListeners: () => {},
  send: () => {},
};

/**
 * IPC 对象（带缓存和去重优化）
 */
export const ipc = {
  ...rawIpcRenderer,
  invoke: createCachedInvoke(rawIpcRenderer.invoke.bind(rawIpcRenderer)),
};

/**
 * 是否为 Electron-Egg 环境
 */
export const isEE = Renderer.isEE || false;

/**
 * IPC 路由定义
 * 使用 controller.xxx.method 格式
 */
export const ipcApiRoute = {
  // App 控制器
  app: {
    getPath: 'controller.app.getPath',
    getVersion: 'controller.app.getVersion',
    openExternal: 'controller.app.openExternal',
    showItemInFolder: 'controller.app.showItemInFolder',
  },
  // 窗口控制器
  window: {
    minimize: 'controller.window.minimize',
    maximize: 'controller.window.maximize',
    close: 'controller.window.close',
    isMaximized: 'controller.window.isMaximized',
  },
  // 对话框控制器
  dialog: {
    openFile: 'controller.dialog.openFile',
    openDirectory: 'controller.dialog.openDirectory',
    saveFile: 'controller.dialog.saveFile',
  },
  // 文件系统控制器
  fs: {
    readFile: 'controller.fs.readFile',
    writeFile: 'controller.fs.writeFile',
    exists: 'controller.fs.exists',
    mkdir: 'controller.fs.mkdir',
    readdir: 'controller.fs.readdir',
    stat: 'controller.fs.stat',
    remove: 'controller.fs.remove',
    copy: 'controller.fs.copy',
  },
};

export async function invokeDomainAction<T = any>(
  channel: string,
  args?: Record<string, any>
): Promise<T> {
  const response = await ipc.invoke('rpc:invoke', { channel, args });
  return unwrapIPCResponse<T>(response);
}

export function createEventBusClient(owner = 'renderer'): {
  emit: <T = unknown>(event: string, payload?: T) => Promise<void>;
  on: <T = unknown>(event: string, handler: (payload: T, eventName: string) => void) => Promise<() => Promise<void>>;
  once: <T = unknown>(event: string, handler: (payload: T, eventName: string) => void) => Promise<() => Promise<void>>;
  off: (event: string, handler?: (payload: unknown, eventName: string) => void) => Promise<void>;
  clear: () => Promise<void>;
} {
  const electronAPI = (window as any).electronAPI;
  const electronEventBus = electronAPI?.eventBus;

  if (!electronEventBus) {
    return {
      emit: async () => {},
      on: async () => async () => {},
      once: async () => async () => {},
      off: async () => {},
      clear: async () => {},
    };
  }

  const channelToHandlers = new Map<string, Set<(payload: unknown, eventName: string) => void>>();
  const subscribedChannels = new Set<string>();
  let removeMessageListener: (() => void) | null = null;

  const toWildcardChannel = (eventName: string) => `${eventName.split(':')[0]}:*`;

  const ensureMessageListener = () => {
    if (removeMessageListener) return;

    removeMessageListener = electronEventBus.onMessage((data: { event: string; payload?: unknown }) => {
      const targets = [data.event, toWildcardChannel(data.event)];
      for (const target of targets) {
        const handlers = channelToHandlers.get(target);
        if (!handlers?.size) continue;

        for (const handler of handlers) {
          try {
            handler(data.payload, data.event);
          } catch (error) {
            console.error(`[EventBusClient:${owner}] listener error for ${data.event}:`, error);
          }
        }
      }
    });
  };

  const subscribeChannel = async (event: string) => {
    if (subscribedChannels.has(event)) return;
    const response = await electronEventBus.subscribe(event);
    unwrapIPCResponse(response);
    subscribedChannels.add(event);
    ensureMessageListener();
  };

  const unsubscribeChannel = async (event: string) => {
    if (!subscribedChannels.has(event)) return;
    const response = await electronEventBus.unsubscribe(event);
    unwrapIPCResponse(response);
    subscribedChannels.delete(event);
  };

  return {
    emit: async (event, payload) => {
      const response = await electronEventBus.emit(event, payload);
      unwrapIPCResponse(response);
    },
    on: async (event, handler) => {
      if (!channelToHandlers.has(event)) {
        channelToHandlers.set(event, new Set());
      }

      const handlers = channelToHandlers.get(event)!;
      handlers.add(handler as (payload: unknown, eventName: string) => void);

      if (handlers.size === 1) {
        await subscribeChannel(event);
      }

      return async () => {
        const current = channelToHandlers.get(event);
        if (!current?.size) return;

        current.delete(handler as (payload: unknown, eventName: string) => void);
        if (!current.size) {
          channelToHandlers.delete(event);
          await unsubscribeChannel(event);
        }
      };
    },
    once: async (event, handler) => {
      let off: (() => Promise<void>) | null = null;
      const wrapped = async (payload: unknown, eventName: string) => {
        if (off) {
          await off();
        }
        handler(payload as never, eventName);
      };

      off = await (async () => {
        const unsubscribe = await (async () => {
          if (!channelToHandlers.has(event)) {
            channelToHandlers.set(event, new Set());
          }

          const handlers = channelToHandlers.get(event)!;
          handlers.add(wrapped as (payload: unknown, eventName: string) => void);

          if (handlers.size === 1) {
            await subscribeChannel(event);
          }

          return async () => {
            handlers.delete(wrapped as (payload: unknown, eventName: string) => void);
            if (!handlers.size) {
              channelToHandlers.delete(event);
              await unsubscribeChannel(event);
            }
          };
        })();

        return unsubscribe;
      })();

      return off;
    },
    off: async (event, handler) => {
      const handlers = channelToHandlers.get(event);
      if (!handlers?.size) return;

      if (handler) {
        handlers.delete(handler as (payload: unknown, eventName: string) => void);
      } else {
        handlers.clear();
      }

      if (!handlers.size) {
        channelToHandlers.delete(event);
        await unsubscribeChannel(event);
      }
    },
    clear: async () => {
      channelToHandlers.clear();
      const response = await electronEventBus.unsubscribe();
      unwrapIPCResponse(response);
      subscribedChannels.clear();
      if (removeMessageListener) {
        removeMessageListener();
        removeMessageListener = null;
      }
    },
  };
}

/**
 * 便捷调用方法
 */
export async function invokeController<T = any>(
  channel: string,
  args?: Record<string, any>
): Promise<T> {
  return ipc.invoke(channel, args);
}

export default {
  ipc,
  isEE,
  ipcApiRoute,
  invokeController,
};
