/**
 * Frontend IPC utilities
 * Unified around domain-action IPC contract
 */
import { createCachedInvoke } from './ipcCache';
import { getElectronAPI as getBaseElectronAPI } from '../services/electronService';

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

const electronAPI = getBaseElectronAPI() as any;
if (!electronAPI?.rpc?.invoke) {
  throw new Error('Electron RPC bridge is not available');
}

const rawIpcRenderer = {
  invoke: (channel: string, args?: unknown) => electronAPI.rpc.invoke(channel, args),
};

/**
 * IPC 对象（带缓存和去重优化）
 */
export const ipc = {
  ...rawIpcRenderer,
  invoke: createCachedInvoke(rawIpcRenderer.invoke.bind(rawIpcRenderer)),
};

export async function invokeDomainAction<T = any>(
  channel: string,
  args?: Record<string, any>
): Promise<T> {
  const response = await ipc.invoke(channel, args);
  return unwrapIPCResponse<T>(response);
}

export type PersistenceEntity =
  | 'project'
  | 'episode'
  | 'episodeAnalysis'
  | 'episodeTimeline'
  | 'shot'
  | 'character'
  | 'scene'
  | 'prop'
  | 'timeline'
  | 'asset';

export const persistenceClient = {
  list: <T = any>(projectId: string, entity: PersistenceEntity) =>
    invokeDomainAction<T[]>('persistence:list', { projectId, entity }),
  find: <T = any>(projectId: string, entity: PersistenceEntity, query?: Record<string, unknown>) =>
    invokeDomainAction<T[]>('persistence:find', { projectId, entity, query }),
  findById: <T = any>(projectId: string, entity: PersistenceEntity, id: string) =>
    invokeDomainAction<T | null>('persistence:findById', { projectId, entity, id }),
  save: <T = any>(projectId: string, entity: PersistenceEntity, data: T | T[]) =>
    invokeDomainAction<T | T[]>('persistence:save', { projectId, entity, data }),
  delete: (projectId: string, entity: PersistenceEntity, id: string) =>
    invokeDomainAction<{ success: boolean }>('persistence:delete', { projectId, entity, id }),
  batchSave: (projectId: string, operations: Array<{ entity: PersistenceEntity; data: unknown }>) =>
    invokeDomainAction<{ success: boolean }>('persistence:batchSave', { projectId, operations }),
};

export function createEventBusClient(owner = 'renderer'): {
  emit: <T = unknown>(event: string, payload?: T) => Promise<void>;
  on: <T = unknown>(event: string, handler: (payload: T, eventName: string) => void) => Promise<() => Promise<void>>;
  once: <T = unknown>(event: string, handler: (payload: T, eventName: string) => void) => Promise<() => Promise<void>>;
  off: (event: string, handler?: (payload: unknown, eventName: string) => void) => Promise<void>;
  clear: () => Promise<void>;
} {
  const electronAPI = getBaseElectronAPI() as any;
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
    await electronEventBus.subscribe(event);
    subscribedChannels.add(event);
    ensureMessageListener();
  };

  const unsubscribeChannel = async (event: string) => {
    if (!subscribedChannels.has(event)) return;
    await electronEventBus.unsubscribe(event);
    subscribedChannels.delete(event);
  };

  return {
    emit: async (event, payload) => {
      await electronEventBus.emit(event, payload);
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
      await electronEventBus.unsubscribe();
      subscribedChannels.clear();
      if (removeMessageListener) {
        removeMessageListener();
        removeMessageListener = null;
      }
    },
  };
}
