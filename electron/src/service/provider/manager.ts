/**
 * Provider 管理器
 * 管理 Provider 插件注册和实例化
 */

import type {
  ProviderKind,
  ProviderPluginManifest,
  ProviderInstance,
  LLMProvider,
  TTSProvider,
  TTIProvider,
  ITVProvider,
  LLMProviderFactory,
  TTSProviderFactory,
  TTIProviderFactory,
  ITVProviderFactory,
} from '../../plugin/types';
import { instanceStore } from './instance-store';

/** Provider 类型联合 */
export type AnyProvider = LLMProvider | TTSProvider | TTIProvider | ITVProvider;
export type AnyProviderFactory =
  | LLMProviderFactory
  | TTSProviderFactory
  | TTIProviderFactory
  | ITVProviderFactory;

/** 已注册的插件 */
export interface RegisteredPlugin {
  manifest: ProviderPluginManifest;
  factory: AnyProviderFactory;
}

/**
 * Provider 管理器
 */
class ProviderManager {
  /** 按类型分类的插件注册表 */
  private plugins = new Map<ProviderKind, Map<string, RegisteredPlugin>>();

  /** Provider 实例缓存 */
  private providerCache = new Map<string, AnyProvider>();

  constructor() {
    this.plugins.set('llm', new Map());
    this.plugins.set('tts', new Map());
    this.plugins.set('tti', new Map());
    this.plugins.set('itv', new Map());
  }

  /** 注册插件 */
  registerPlugin(manifest: ProviderPluginManifest, factory: AnyProviderFactory): void {
    const registry = this.plugins.get(manifest.kind);
    if (!registry) {
      throw new Error(`Unknown provider kind: ${manifest.kind}`);
    }

    if (registry.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} already registered`);
    }

    registry.set(manifest.id, { manifest, factory });
  }

  /** 注销插件 */
  unregisterPlugin(pluginId: string, kind: ProviderKind): void {
    const registry = this.plugins.get(kind);
    if (registry) {
      registry.delete(pluginId);
    }

    for (const [key, provider] of this.providerCache.entries()) {
      if (provider.pluginId === pluginId) {
        this.providerCache.delete(key);
      }
    }
  }

  /** 获取插件 */
  getPlugin(pluginId: string, kind: ProviderKind): RegisteredPlugin | undefined {
    return this.plugins.get(kind)?.get(pluginId);
  }

  /** 列出指定类型的插件 */
  listPlugins(kind: ProviderKind): ProviderPluginManifest[] {
    const registry = this.plugins.get(kind);
    if (!registry) return [];
    return Array.from(registry.values()).map((p) => p.manifest);
  }

  /** 列出所有插件 */
  listAllPlugins(): ProviderPluginManifest[] {
    const result: ProviderPluginManifest[] = [];
    for (const registry of this.plugins.values()) {
      for (const plugin of registry.values()) {
        result.push(plugin.manifest);
      }
    }
    return result;
  }

  /** 创建 Provider 实例 */
  private createProvider(instance: ProviderInstance): AnyProvider {
    const cacheKey = instance.id;

    if (this.providerCache.has(cacheKey)) {
      return this.providerCache.get(cacheKey)!;
    }

    const plugin = this.getPlugin(instance.pluginId, instance.kind);
    if (!plugin) {
      throw new Error(`Plugin ${instance.pluginId} not found`);
    }

    const provider = plugin.factory(instance.config, {
      pluginId: instance.pluginId,
      instanceId: instance.id,
    });

    this.providerCache.set(cacheKey, provider);

    return provider;
  }

  /** 获取 LLM Provider */
  getLLM(instanceId?: string): LLMProvider | null {
    const instance = instanceId
      ? instanceStore.get(instanceId)
      : instanceStore.getDefault('llm');

    if (!instance || instance.kind !== 'llm') return null;
    return this.createProvider(instance) as LLMProvider;
  }

  /** 获取 TTS Provider */
  getTTS(instanceId?: string): TTSProvider | null {
    const instance = instanceId
      ? instanceStore.get(instanceId)
      : instanceStore.getDefault('tts');

    if (!instance || instance.kind !== 'tts') return null;
    return this.createProvider(instance) as TTSProvider;
  }

  /** 获取 TTI Provider */
  getTTI(instanceId?: string): TTIProvider | null {
    const instance = instanceId
      ? instanceStore.get(instanceId)
      : instanceStore.getDefault('tti');

    if (!instance || instance.kind !== 'tti') return null;
    return this.createProvider(instance) as TTIProvider;
  }

  /** 获取 ITV Provider */
  getITV(instanceId?: string): ITVProvider | null {
    const instance = instanceId
      ? instanceStore.get(instanceId)
      : instanceStore.getDefault('itv');

    if (!instance || instance.kind !== 'itv') return null;
    return this.createProvider(instance) as ITVProvider;
  }

  /** 清除缓存 */
  clearCache(instanceId?: string): void {
    if (instanceId) {
      this.providerCache.delete(instanceId);
    } else {
      this.providerCache.clear();
    }
  }

  /** 测试连接 */
  async testConnection(instanceId: string): Promise<{ success: boolean; message?: string }> {
    const instance = instanceStore.get(instanceId);
    if (!instance) {
      return { success: false, message: 'Instance not found' };
    }

    try {
      const provider = this.createProvider(instance);
      const result = await provider.validate();
      return { success: result.valid, message: result.message };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }
}

export const providerManager = new ProviderManager();
