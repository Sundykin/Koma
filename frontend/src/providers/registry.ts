/**
 * Provider 注册表
 * 统一管理内置和插件 Provider
 */
import type { ProgressInfo } from '../types';
import type { PollingConfig } from './polling';

// 重新导出 PollingConfig 和 DEFAULT_POLLING_CONFIG
export type { PollingConfig } from './polling';
export { DEFAULT_POLLING_CONFIG } from './polling';

// 渠道类型
export type ChannelKind = 'tti' | 'itv' | 'tts' | 'image-hosting';

// 渠道能力
export type ChannelCapability = 'tti' | 'itv' | 'tts' | 'character-extract' | 'remix' | 'image-hosting';

// Provider 上下文
export interface ProviderContext {
  pluginId?: string;
  sandboxedFetch: typeof fetch;
  logger?: {
    info(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
  };
}

// Provider 状态
export type ProviderStatus = 'available' | 'coming-soon' | 'community';

// Provider 定义
export interface ProviderDefinition<T> {
  type: string;              // 唯一标识，如 'kling', 'runway'
  kind: ChannelKind;         // 'tti' | 'itv'
  name: string;              // 显示名称
  description?: string;      // 描述
  status?: ProviderStatus;   // 实现状态
  factory: (config: Record<string, any>, ctx: ProviderContext) => T;
  capabilities?: ChannelCapability[];
  pluginId?: string;         // 关联插件 ID
  configSchema?: Record<string, any>;  // JSON Schema for UI
  defaultConfig?: Record<string, any>;
  polling?: PollingConfig;
}

// 注册表接口
export interface IProviderRegistry<T> {
  register(def: ProviderDefinition<T>): void;
  unregister(type: string): void;
  unregisterByPlugin(pluginId: string): void;
  get(type: string): ProviderDefinition<T> | undefined;
  list(kind?: ChannelKind): ProviderDefinition<T>[];
  has(type: string): boolean;
}

// 注册表实现
class ProviderRegistryImpl<T> implements IProviderRegistry<T> {
  private providers = new Map<string, ProviderDefinition<T>>();

  register(def: ProviderDefinition<T>): void {
    const existing = this.providers.get(def.type);
    if (existing && existing.pluginId !== def.pluginId) {
      throw new Error(`Provider type "${def.type}" already registered by ${existing.pluginId || 'built-in'}`);
    }
    this.providers.set(def.type, def);
  }

  unregister(type: string): void {
    this.providers.delete(type);
  }

  unregisterByPlugin(pluginId: string): void {
    for (const [type, def] of this.providers.entries()) {
      if (def.pluginId === pluginId) {
        this.providers.delete(type);
      }
    }
  }

  get(type: string): ProviderDefinition<T> | undefined {
    return this.providers.get(type);
  }

  list(kind?: ChannelKind): ProviderDefinition<T>[] {
    const all = Array.from(this.providers.values());
    if (kind) {
      return all.filter(def => def.kind === kind);
    }
    return all;
  }

  has(type: string): boolean {
    return this.providers.has(type);
  }
}

// 全局注册表实例
export const ttiRegistry = new ProviderRegistryImpl<any>();
export const itvRegistry = new ProviderRegistryImpl<any>();
export const ttsRegistry = new ProviderRegistryImpl<any>();
export const imageHostingRegistry = new ProviderRegistryImpl<any>();

// 获取注册表
export function getRegistry(kind: ChannelKind): IProviderRegistry<any> {
  switch (kind) {
    case 'tti': return ttiRegistry;
    case 'itv': return itvRegistry;
    case 'tts': return ttsRegistry;
    case 'image-hosting': return imageHostingRegistry;
  }
}

// 注册 Provider（通用入口）
export function registerProvider(def: ProviderDefinition<any>): void {
  const registry = getRegistry(def.kind);
  registry.register(def);
}

// 反注册 Provider
export function unregisterProvider(kind: ChannelKind, type: string): void {
  const registry = getRegistry(kind);
  registry.unregister(type);
}

// 反注册插件的所有 Provider
export function unregisterProvidersByPlugin(pluginId: string): void {
  ttiRegistry.unregisterByPlugin(pluginId);
  itvRegistry.unregisterByPlugin(pluginId);
  ttsRegistry.unregisterByPlugin(pluginId);
  imageHostingRegistry.unregisterByPlugin(pluginId);
}

// 列出所有 Provider
export function listProviders(kind?: ChannelKind): ProviderDefinition<any>[] {
  if (kind) {
    return getRegistry(kind).list();
  }
  return [...ttiRegistry.list(), ...itvRegistry.list(), ...ttsRegistry.list(), ...imageHostingRegistry.list()];
}

// 创建 Provider 实例（强制要求 kind）
export function createProviderInstance<T>(
  kind: ChannelKind,
  type: string,
  config: Record<string, any>,
  ctx?: Partial<ProviderContext>
): T {
  const registry = getRegistry(kind);
  const def = registry.get(type);

  if (!def) {
    throw new Error(`Provider type "${type}" not found in ${kind} registry`);
  }

  // 插件 Provider 必须提供 sandboxedFetch，内置 Provider 可以使用全局 fetch
  const isPluginProvider = !!def.pluginId;
  if (isPluginProvider && !ctx?.sandboxedFetch) {
    throw new Error(`Plugin provider "${type}" requires sandboxedFetch in context`);
  }

  const fullCtx: ProviderContext = {
    sandboxedFetch: ctx?.sandboxedFetch || fetch,
    pluginId: ctx?.pluginId || def.pluginId,
    logger: ctx?.logger || console,
  };

  return def.factory(config, fullCtx);
}
