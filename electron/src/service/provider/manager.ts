/**
 * Provider 管理器
 * 统一管理 Provider 插件注册和实例化
 */
import { providerRegistry } from '../plugin/registries';
import type { ProviderDefinition } from '../plugin/types';
import type { ProviderKind } from './instance-store';

type AnyProvider = any;

interface RegisteredProvider {
  definition: ProviderDefinition;
}

class ProviderManager {
  /** @internal */
  _providerCache = new Map<string, AnyProvider>();

  /** 按 kind 列出已注册的 Provider */
  listByKind(kind: ProviderKind): ProviderDefinition[] {
    return providerRegistry.listByKind(kind);
  }

  /** 列出所有 Provider */
  listAll(): ProviderDefinition[] {
    return providerRegistry.list();
  }

  /** 创建 Provider 实例 */
  createProvider(type: string, config?: Record<string, unknown>): AnyProvider {
    const cacheKey = `${type}:${JSON.stringify(config || {})}`;
    if (this._providerCache.has(cacheKey)) {
      return this._providerCache.get(cacheKey)!;
    }

    const def = providerRegistry.get(type);
    if (!def) throw new Error(`Provider ${type} not found`);

    const provider = def.factory(config || def.defaultConfig || {}, {
      pluginId: def.pluginId,
    });

    this._providerCache.set(cacheKey, provider);
    return provider;
  }

  /** 清除缓存 */
  clearCache(type?: string): void {
    if (type) {
      for (const key of this._providerCache.keys()) {
        if (key.startsWith(`${type}:`)) {
          this._providerCache.delete(key);
        }
      }
    } else {
      this._providerCache.clear();
    }
  }
}

export const providerManager = new ProviderManager();
