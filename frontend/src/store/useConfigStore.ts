/**
 * 全局配置 Store（Zustand）
 *
 * 启动时通过 `electronAPI.config.bootstrap()` 一次性拉取全部配置快照，
 * 后续变更通过 `config:changed` 事件增量更新本地状态。
 *
 * 读：直接访问 `useConfigStore.getState()` 或组件里 `useConfigStore(selector)`
 * 写：通过 `electronAPI.config.<domain>.*` IPC；主进程广播事件，store 自动同步
 */
import { create } from 'zustand';
import {
  getConfigAPI,
  type ChannelConfigRow,
  type ChannelKind,
  type ConfigBootstrap,
  type ConfigChangePayload,
  type PromptTemplateRow,
  type VisualStylePresetRow,
  type PluginRegistryRow,
  type MCPServerRow,
  type AgentProfileRow,
  type RecentProjectRow,
} from '../services/configBridge';

export interface ConfigStoreState {
  ready: boolean;
  channels: {
    llm: ChannelConfigRow[];
    tti: ChannelConfigRow[];
    itv: ChannelConfigRow[];
    tts: ChannelConfigRow[];
  };
  prompts: PromptTemplateRow[];
  styles: VisualStylePresetRow[];
  plugins: PluginRegistryRow[];
  mcp: MCPServerRow[];
  agents: AgentProfileRow[];
  recent: RecentProjectRow[];
  kv: Record<string, Array<{ key: string; value: unknown }>>;

  bootstrap(): Promise<void>;
  refreshDomain(domain: ConfigChangePayload['domain']): Promise<void>;
}

const INITIAL: ConfigBootstrap = {
  channels: { llm: [], tti: [], itv: [], tts: [] },
  prompts: [],
  styles: [],
  plugins: [],
  mcp: [],
  agents: [],
  recent: [],
  kv: {},
};

let _bootstrapPromise: Promise<void> | null = null;
let _unsubscribe: (() => void) | null = null;

export const useConfigStore = create<ConfigStoreState>((set, get) => ({
  ready: false,
  ...INITIAL,

  async bootstrap() {
    if (get().ready) return;
    if (_bootstrapPromise) return _bootstrapPromise;

    const api = getConfigAPI();
    _bootstrapPromise = (async () => {
      const snap = await api.bootstrap();
      set({ ...snap, ready: true });

      if (!_unsubscribe) {
        _unsubscribe = api.onChanged(async (_event, payload) => {
          await get().refreshDomain(payload.domain);
        });
      }
    })();
    return _bootstrapPromise;
  },

  async refreshDomain(domain) {
    const api = getConfigAPI();
    switch (domain) {
      case 'channel': {
        const [llm, tti, itv, tts] = await Promise.all([
          api.channel.list('llm'),
          api.channel.list('tti'),
          api.channel.list('itv'),
          api.channel.list('tts'),
        ]);
        set({ channels: { llm, tti, itv, tts } });
        break;
      }
      case 'prompt':
        set({ prompts: await api.prompt.list() });
        break;
      case 'style':
        set({ styles: await api.style.list() });
        break;
      case 'plugin':
        set({ plugins: await api.plugin.list() });
        break;
      case 'mcp':
        set({ mcp: await api.mcp.list() });
        break;
      case 'agent':
        set({ agents: await api.agent.list() });
        break;
      case 'recent':
        set({ recent: await api.recent.list() });
        break;
      case 'kv': {
        const namespaces = Object.keys(get().kv);
        const next: Record<string, Array<{ key: string; value: unknown }>> = {};
        await Promise.all(
          namespaces.map(async (ns) => {
            next[ns] = await api.kv.listNamespace(ns);
          }),
        );
        set({ kv: { ...get().kv, ...next } });
        break;
      }
    }
  },
}));

/** 便捷选择器 */
export function selectChannels(kind: ChannelKind) {
  return (s: ConfigStoreState) => s.channels[kind];
}

/** 同步读取（非响应式）——用于非 React 作用域 */
export function getChannelsSync(kind: ChannelKind): ChannelConfigRow[] {
  return useConfigStore.getState().channels[kind];
}

export function getKvSync<T = unknown>(namespace: string, key: string): T | undefined {
  const ns = useConfigStore.getState().kv[namespace];
  if (!ns) return undefined;
  const entry = ns.find((e) => e.key === key);
  return entry ? (entry.value as T) : undefined;
}

/** 确保启动时加载完成 */
export async function ensureConfigReady(): Promise<void> {
  await useConfigStore.getState().bootstrap();
}
