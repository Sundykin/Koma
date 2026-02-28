/**
 * 插件状态管理 Store
 * 使用 Zustand + persist 实现持久化
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  InstalledPlugin,
  PluginManifest,
  PluginRuntimeState,
  PluginLoadStatus,
  PluginImportResult,
  PluginValidationResult,
} from '../types/plugin';
import { electronService } from '../services/electronService';
import type { PluginRuntimeSnapshot } from '../services/electronService';

interface PluginState {
  // 已安装的插件列表
  plugins: InstalledPlugin[];

  // 运行时状态 (内存态，不持久化)
  runtimeStates: Record<string, PluginRuntimeState>;

  // Actions
  registerPlugin: (manifest: PluginManifest, rootPath: string) => void;
  unregisterPlugin: (id: string) => void;
  togglePlugin: (id: string, enabled: boolean) => void;
  updatePlugin: (id: string, updates: Partial<InstalledPlugin>) => void;

  // Runtime Actions
  setRuntimeState: (id: string, state: Partial<PluginRuntimeState>) => void;
  clearRuntimeState: (id: string) => void;
  refreshRuntimeStates: () => Promise<void>;

  // Selectors
  getPlugin: (id: string) => InstalledPlugin | undefined;
  getActivePlugins: () => InstalledPlugin[];
  getGlobalPlugins: () => InstalledPlugin[];
  getProviderPlugins: () => InstalledPlugin[];
  getToolPlugins: () => InstalledPlugin[];
  getPluginsByCategory: (category: InstalledPlugin['category']) => InstalledPlugin[];
}

function mapSnapshotStateToLoadStatus(
  state: PluginRuntimeSnapshot['state']
): PluginLoadStatus {
  if (state === 'active' || state === 'loaded') {
    return 'loaded';
  }
  if (state === 'error') {
    return 'error';
  }
  if (state === 'disabled') {
    return 'disabled';
  }
  return 'loading';
}

function toRuntimeState(snapshot: PluginRuntimeSnapshot): PluginRuntimeState {
  return {
    id: snapshot.id,
    status: mapSnapshotStateToLoadStatus(snapshot.state),
    error: snapshot.error,
  };
}

export const usePluginStore = create<PluginState>()(
  persist(
    (set, get) => ({
      plugins: [],
      runtimeStates: {},

      // 注册新插件
      registerPlugin: (manifest, rootPath) => {
        const existing = get().plugins.find(p => p.id === manifest.id);
        if (existing) {
          // 更新已存在的插件
          set(state => ({
            plugins: state.plugins.map(p =>
              p.id === manifest.id
                ? {
                    ...manifest,
                    rootPath,
                    isEnabled: p.isEnabled,
                    installedAt: p.installedAt,
                    lastUpdatedAt: Date.now(),
                  }
                : p
            ),
          }));
        } else {
          // 新增插件
          const newPlugin: InstalledPlugin = {
            ...manifest,
            rootPath,
            isEnabled: true,
            installedAt: Date.now(),
          };
          set(state => ({
            plugins: [...state.plugins, newPlugin],
          }));
        }
      },

      // 注销插件
      unregisterPlugin: (id) => {
        set(state => ({
          plugins: state.plugins.filter(p => p.id !== id),
          runtimeStates: Object.fromEntries(
            Object.entries(state.runtimeStates).filter(([key]) => key !== id)
          ),
        }));
      },

      // 切换插件启用状态
      togglePlugin: (id, enabled) => {
        set(state => ({
          plugins: state.plugins.map(p =>
            p.id === id ? { ...p, isEnabled: enabled } : p
          ),
        }));
      },

      // 更新插件信息
      updatePlugin: (id, updates) => {
        set(state => ({
          plugins: state.plugins.map(p =>
            p.id === id ? { ...p, ...updates, lastUpdatedAt: Date.now() } : p
          ),
        }));
      },

      // 设置运行时状态
      setRuntimeState: (id, newState) => {
        set(state => ({
          runtimeStates: {
            ...state.runtimeStates,
            [id]: {
              ...(state.runtimeStates[id] || { id, status: 'loading' as PluginLoadStatus }),
              ...newState,
            },
          },
        }));
      },

      // 清除运行时状态
      clearRuntimeState: (id) => {
        set(state => {
          const { [id]: removed, ...rest } = state.runtimeStates;
          return { runtimeStates: rest };
        });
      },

      refreshRuntimeStates: async () => {
        try {
          const snapshots = await electronService.plugin.listRuntimeStates();
          const nextStates = snapshots.reduce<Record<string, PluginRuntimeState>>((acc, snapshot) => {
            acc[snapshot.id] = {
              ...toRuntimeState(snapshot),
              component: get().runtimeStates[snapshot.id]?.component,
            };
            return acc;
          }, {});

          set({ runtimeStates: nextStates });
        } catch (error) {
          console.warn('[PluginStore] 刷新插件运行时状态失败:', error);
        }
      },

      // Selectors
      getPlugin: (id) => get().plugins.find(p => p.id === id),

      getActivePlugins: () => get().plugins.filter(p => p.isEnabled),

      getGlobalPlugins: () =>
        get().plugins.filter(p => p.category === 'global' && p.isEnabled),

      getProviderPlugins: () =>
        get().plugins.filter(p => p.category === 'provider' && p.isEnabled),

      getToolPlugins: () =>
        get().plugins.filter(p => p.category === 'tool' && p.isEnabled),

      getPluginsByCategory: (category) =>
        get().plugins.filter(p => p.category === category),
    }),
    {
      name: 'koma-plugins',
      partialize: (state) => ({
        plugins: state.plugins,
        // 不持久化 runtimeStates
      }),
    }
  )
);

// 等待 persist 数据恢复完成
let rehydrateResolve: (() => void) | null = null;
const rehydratePromise = new Promise<void>((resolve) => {
  rehydrateResolve = resolve;
});

// 监听 rehydrate 完成
usePluginStore.persist.onFinishHydration(() => {
  console.log('[PluginStore] persist 数据恢复完成');
  rehydrateResolve?.();
});

// 如果已经 rehydrate 完成，立即 resolve
if (usePluginStore.persist.hasHydrated()) {
  rehydrateResolve?.();
}

/**
 * 等待 pluginStore 数据恢复完成
 */
export function waitForPluginStoreRehydration(): Promise<void> {
  return rehydratePromise;
}

// 辅助 hooks（直接使用 state.plugins 进行过滤，避免调用方法导致无限循环）
export function useGlobalPlugins() {
  return usePluginStore(state =>
    state.plugins.filter(p => p.category === 'global' && p.isEnabled)
  );
}

export function useProviderPlugins() {
  return usePluginStore(state =>
    state.plugins.filter(p => p.category === 'provider' && p.isEnabled)
  );
}

export function useToolPlugins() {
  return usePluginStore(state =>
    state.plugins.filter(p => p.category === 'tool' && p.isEnabled)
  );
}

export function usePluginRuntimeState(pluginId: string) {
  return usePluginStore(state => state.runtimeStates[pluginId]);
}
