/**
 * electronAPI.config.* 的前端封装 + 非 Electron 环境下的内存 Mock。
 */
import { isElectron } from './electronService';

export type ChannelKind = 'llm' | 'tti' | 'itv' | 'tts';

export interface ChannelConfigRow {
  id: string;
  kind: ChannelKind;
  name: string;
  provider: string;
  base_url?: string;
  api_key?: string;
  model_name?: string;
  is_default?: number;
  meta_json?: string;
  created_at: number;
  updated_at: number;
}

export interface PromptTemplateRow {
  id: string;
  type: string;
  name: string;
  description?: string;
  template: string;
  variables_json?: string;
  is_builtin?: number;
  user_modified_at?: number | null;
  created_at: number;
  updated_at: number;
}

export interface VisualStylePresetRow {
  id: string;
  name: string;
  description?: string;
  tti_prefix?: string;
  llm_suffix?: string;
  thumbnail_path?: string;
  is_builtin?: number;
  sort_order?: number;
  created_at: number;
  updated_at: number;
}

export interface PluginRegistryRow {
  id: string;
  name: string;
  version: string;
  source: 'local' | 'url' | 'builtin';
  source_ref?: string;
  enabled?: number;
  manifest_json: string;
  permissions_json?: string;
  installed_at: number;
  updated_at: number;
}

export interface MCPServerRow {
  id: string;
  name: string;
  transport: 'stdio' | 'sse' | 'http';
  command?: string;
  args_json?: string;
  env_json?: string;
  url?: string;
  auth_token?: string;
  enabled?: number;
  created_at: number;
  updated_at: number;
}

export interface AgentProfileRow {
  id: string;
  name: string;
  description?: string;
  system_prompt?: string;
  tools_json?: string;
  channel_config_id?: string;
  is_builtin?: number;
  created_at: number;
  updated_at: number;
}

export interface RecentProjectRow {
  project_id: string;
  last_opened_at: number;
  pinned?: number;
}

export interface ConfigBootstrap {
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
}

export type ConfigDomain = 'channel' | 'prompt' | 'style' | 'plugin' | 'mcp' | 'agent' | 'recent' | 'kv';

export interface ConfigChangePayload {
  domain: ConfigDomain;
  action: string;
  id?: string;
  meta?: Record<string, unknown>;
}

interface ConfigAPI {
  bootstrap(): Promise<ConfigBootstrap>;
  channel: {
    list(kind: ChannelKind): Promise<ChannelConfigRow[]>;
    getDefault(kind: ChannelKind): Promise<ChannelConfigRow | null>;
    upsert(row: ChannelConfigRow): Promise<{ id: string }>;
    delete(id: string): Promise<{ success: boolean }>;
    setDefault(kind: ChannelKind, id: string): Promise<{ success: boolean }>;
  };
  prompt: {
    list(): Promise<PromptTemplateRow[]>;
    upsert(row: PromptTemplateRow): Promise<{ id: string }>;
    reset(id: string): Promise<{ success: boolean }>;
    delete(id: string): Promise<{ success: boolean }>;
  };
  style: {
    list(): Promise<VisualStylePresetRow[]>;
    upsert(row: VisualStylePresetRow): Promise<{ id: string }>;
    delete(id: string): Promise<{ success: boolean }>;
  };
  plugin: {
    list(): Promise<PluginRegistryRow[]>;
    upsert(row: PluginRegistryRow): Promise<{ id: string }>;
    setEnabled(id: string, enabled: boolean): Promise<{ success: boolean }>;
    delete(id: string): Promise<{ success: boolean }>;
  };
  mcp: {
    list(): Promise<MCPServerRow[]>;
    upsert(row: MCPServerRow): Promise<{ id: string }>;
    delete(id: string): Promise<{ success: boolean }>;
  };
  agent: {
    list(): Promise<AgentProfileRow[]>;
    upsert(row: AgentProfileRow): Promise<{ id: string }>;
    delete(id: string): Promise<{ success: boolean }>;
  };
  kv: {
    get<T = unknown>(namespace: string, key: string): Promise<T | null>;
    listNamespace<T = unknown>(namespace: string): Promise<Array<{ key: string; value: T }>>;
    set<T = unknown>(namespace: string, key: string, value: T): Promise<{ success: boolean }>;
    delete(namespace: string, key: string): Promise<{ success: boolean }>;
  };
  recent: {
    list(limit?: number): Promise<RecentProjectRow[]>;
    touch(projectId: string): Promise<{ success: boolean }>;
    remove(projectId: string): Promise<{ success: boolean }>;
    setPinned(projectId: string, pinned: boolean): Promise<{ success: boolean }>;
  };
  onChanged(callback: (event: unknown, data: ConfigChangePayload) => void): () => void;
}

// ===== 非 Electron 环境：内存 Mock =====
class MockConfigStore implements ConfigAPI {
  private state: ConfigBootstrap = {
    channels: { llm: [], tti: [], itv: [], tts: [] },
    prompts: [],
    styles: [],
    plugins: [],
    mcp: [],
    agents: [],
    recent: [],
    kv: {},
  };
  private listeners = new Set<(data: ConfigChangePayload) => void>();

  private emit(payload: ConfigChangePayload) {
    for (const cb of this.listeners) cb(payload);
  }

  async bootstrap(): Promise<ConfigBootstrap> {
    return JSON.parse(JSON.stringify(this.state));
  }
  channel = {
    list: async (kind: ChannelKind) => [...this.state.channels[kind]],
    getDefault: async (kind: ChannelKind) => this.state.channels[kind].find((r) => r.is_default === 1) ?? null,
    upsert: async (row: ChannelConfigRow) => {
      const list = this.state.channels[row.kind];
      const idx = list.findIndex((r) => r.id === row.id);
      if (idx >= 0) list[idx] = row; else list.push(row);
      this.emit({ domain: 'channel', action: 'upsert', id: row.id });
      return { id: row.id };
    },
    delete: async (id: string) => {
      for (const k of Object.keys(this.state.channels) as ChannelKind[]) {
        this.state.channels[k] = this.state.channels[k].filter((r) => r.id !== id);
      }
      this.emit({ domain: 'channel', action: 'delete', id });
      return { success: true };
    },
    setDefault: async (kind: ChannelKind, id: string) => {
      this.state.channels[kind] = this.state.channels[kind].map((r) => ({ ...r, is_default: r.id === id ? 1 : 0 }));
      this.emit({ domain: 'channel', action: 'setDefault', id, meta: { kind } });
      return { success: true };
    },
  };
  prompt = {
    list: async () => [...this.state.prompts],
    upsert: async (row: PromptTemplateRow) => {
      const idx = this.state.prompts.findIndex((r) => r.id === row.id);
      if (idx >= 0) this.state.prompts[idx] = row; else this.state.prompts.push(row);
      this.emit({ domain: 'prompt', action: 'upsert', id: row.id });
      return { id: row.id };
    },
    reset: async (id: string) => {
      this.emit({ domain: 'prompt', action: 'reset', id });
      return { success: true };
    },
    delete: async (id: string) => {
      this.state.prompts = this.state.prompts.filter((r) => r.id !== id);
      this.emit({ domain: 'prompt', action: 'delete', id });
      return { success: true };
    },
  };
  style = {
    list: async () => [...this.state.styles],
    upsert: async (row: VisualStylePresetRow) => {
      const idx = this.state.styles.findIndex((r) => r.id === row.id);
      if (idx >= 0) this.state.styles[idx] = row; else this.state.styles.push(row);
      this.emit({ domain: 'style', action: 'upsert', id: row.id });
      return { id: row.id };
    },
    delete: async (id: string) => {
      this.state.styles = this.state.styles.filter((r) => r.id !== id);
      this.emit({ domain: 'style', action: 'delete', id });
      return { success: true };
    },
  };
  plugin = {
    list: async () => [...this.state.plugins],
    upsert: async (row: PluginRegistryRow) => {
      const idx = this.state.plugins.findIndex((r) => r.id === row.id);
      if (idx >= 0) this.state.plugins[idx] = row; else this.state.plugins.push(row);
      this.emit({ domain: 'plugin', action: 'upsert', id: row.id });
      return { id: row.id };
    },
    setEnabled: async (id: string, enabled: boolean) => {
      const p = this.state.plugins.find((r) => r.id === id);
      if (p) p.enabled = enabled ? 1 : 0;
      this.emit({ domain: 'plugin', action: 'setEnabled', id });
      return { success: true };
    },
    delete: async (id: string) => {
      this.state.plugins = this.state.plugins.filter((r) => r.id !== id);
      this.emit({ domain: 'plugin', action: 'delete', id });
      return { success: true };
    },
  };
  mcp = {
    list: async () => [...this.state.mcp],
    upsert: async (row: MCPServerRow) => {
      const idx = this.state.mcp.findIndex((r) => r.id === row.id);
      if (idx >= 0) this.state.mcp[idx] = row; else this.state.mcp.push(row);
      this.emit({ domain: 'mcp', action: 'upsert', id: row.id });
      return { id: row.id };
    },
    delete: async (id: string) => {
      this.state.mcp = this.state.mcp.filter((r) => r.id !== id);
      this.emit({ domain: 'mcp', action: 'delete', id });
      return { success: true };
    },
  };
  agent = {
    list: async () => [...this.state.agents],
    upsert: async (row: AgentProfileRow) => {
      const idx = this.state.agents.findIndex((r) => r.id === row.id);
      if (idx >= 0) this.state.agents[idx] = row; else this.state.agents.push(row);
      this.emit({ domain: 'agent', action: 'upsert', id: row.id });
      return { id: row.id };
    },
    delete: async (id: string) => {
      this.state.agents = this.state.agents.filter((r) => r.id !== id);
      this.emit({ domain: 'agent', action: 'delete', id });
      return { success: true };
    },
  };
  kv = {
    get: async <T,>(namespace: string, key: string): Promise<T | null> => {
      const ns = this.state.kv[namespace];
      if (!ns) return null;
      const entry = ns.find((e) => e.key === key);
      return entry ? (entry.value as T) : null;
    },
    listNamespace: async <T,>(namespace: string): Promise<Array<{ key: string; value: T }>> => {
      return (this.state.kv[namespace] ?? []).map((e) => ({ key: e.key, value: e.value as T }));
    },
    set: async <T,>(namespace: string, key: string, value: T) => {
      const ns = (this.state.kv[namespace] = this.state.kv[namespace] ?? []);
      const idx = ns.findIndex((e) => e.key === key);
      if (idx >= 0) ns[idx] = { key, value }; else ns.push({ key, value });
      this.emit({ domain: 'kv', action: 'upsert', id: `${namespace}/${key}` });
      return { success: true };
    },
    delete: async (namespace: string, key: string) => {
      const ns = this.state.kv[namespace];
      if (ns) this.state.kv[namespace] = ns.filter((e) => e.key !== key);
      this.emit({ domain: 'kv', action: 'delete', id: `${namespace}/${key}` });
      return { success: true };
    },
  };
  recent = {
    list: async (limit?: number) => {
      const sorted = [...this.state.recent].sort((a, b) => b.last_opened_at - a.last_opened_at);
      return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
    },
    touch: async (projectId: string) => {
      const existing = this.state.recent.find((r) => r.project_id === projectId);
      const now = Date.now();
      if (existing) existing.last_opened_at = now;
      else this.state.recent.push({ project_id: projectId, last_opened_at: now, pinned: 0 });
      this.emit({ domain: 'recent', action: 'touch', id: projectId });
      return { success: true };
    },
    remove: async (projectId: string) => {
      this.state.recent = this.state.recent.filter((r) => r.project_id !== projectId);
      this.emit({ domain: 'recent', action: 'delete', id: projectId });
      return { success: true };
    },
    setPinned: async (projectId: string, pinned: boolean) => {
      const existing = this.state.recent.find((r) => r.project_id === projectId);
      if (existing) existing.pinned = pinned ? 1 : 0;
      this.emit({ domain: 'recent', action: 'pin', id: projectId });
      return { success: true };
    },
  };
  onChanged(callback: (event: unknown, data: ConfigChangePayload) => void): () => void {
    const fn = (data: ConfigChangePayload) => callback(null, data);
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

const mock = new MockConfigStore();

export function getConfigAPI(): ConfigAPI {
  if (isElectron()) {
    const api = (window as any).electronAPI?.config as ConfigAPI | undefined;
    if (api) return api;
  }
  return mock;
}
