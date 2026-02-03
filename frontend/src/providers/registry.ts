/**
 * Provider 注册表实现
 * 统一管理内置和插件 Provider
 * 
 * 注意：如果只需要类型定义，请从 './registry.types' 导入
 * 这样可以避免动态/静态导入冲突
 */

// 重新导出类型定义
export type {
  ChannelKind,
  ChannelCapability,
  ProviderContext,
  ProviderDefinition,
  IProviderRegistry,
  PollingConfig
} from './registry.types';
export { DEFAULT_POLLING_CONFIG } from './registry.types';

import type {
  ChannelKind,
  ProviderDefinition,
  IProviderRegistry,
  ProviderContext
} from './registry.types';

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
  return [...ttiRegistry.list(), ...itvRegistry.list(), ...ttsRegistry.list()];
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
