/**
 * Provider 管理器
 * 管理 Provider 插件注册和实例化
 * 包含版本化缓存、断路器保护
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
import { logger } from 'ee-core/log';

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

// ── Circuit breaker config ──
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_RESET_MS = 60_000;

interface CachedProvider {
  provider: AnyProvider;
  /** updatedAt timestamp from instance store at cache time */
  version: number;
}

interface CircuitState {
  failures: number;
  lastFailure: number;
  /** When true, calls to this instance are short-circuited */
  open: boolean;
}

/**
 * Provider 管理器
 */
class ProviderManager {
  /** 按类型分类的插件注册表 */
  private plugins = new Map<ProviderKind, Map<string, RegisteredPlugin>>();

  /** Provider 实例缓存 (version-aware) */
  private providerCache = new Map<string, CachedProvider>();

  /** Per-instance circuit breaker state */
  private circuits = new Map<string, CircuitState>();

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

    for (const [key, cached] of this.providerCache.entries()) {
      if (cached.provider.pluginId === pluginId) {
        this.providerCache.delete(key);
        this.circuits.delete(key);
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

  /** 创建 Provider 实例 (version-aware cache) */
  private createProvider(instance: ProviderInstance): AnyProvider {
    const cacheKey = instance.id;
    const version = instance.updatedAt ?? 0;

    // Check cache — invalidate if version changed
    const cached = this.providerCache.get(cacheKey);
    if (cached && cached.version === version) {
      return cached.provider;
    }

    if (cached && cached.version !== version) {
      logger.info(`[Provider] Cache invalidated for ${instance.name} (version ${cached.version} → ${version})`);
    }

    const plugin = this.getPlugin(instance.pluginId, instance.kind);
    if (!plugin) {
      throw new Error(`Plugin ${instance.pluginId} not found`);
    }

    const provider = plugin.factory(instance.config, {
      pluginId: instance.pluginId,
      instanceId: instance.id,
    });

    this.providerCache.set(cacheKey, { provider, version });

    return provider;
  }

  // ── Circuit breaker helpers ──

  private getCircuit(instanceId: string): CircuitState {
    let state = this.circuits.get(instanceId);
    if (!state) {
      state = { failures: 0, lastFailure: 0, open: false };
      this.circuits.set(instanceId, state);
    }
    // Auto-reset after cooldown
    if (state.open && Date.now() - state.lastFailure > CIRCUIT_RESET_MS) {
      state.open = false;
      state.failures = 0;
      logger.info(`[Provider] Circuit reset for ${instanceId}`);
    }
    return state;
  }

  /** Record a failure for circuit breaker */
  recordFailure(instanceId: string): void {
    const circuit = this.getCircuit(instanceId);
    circuit.failures++;
    circuit.lastFailure = Date.now();
    if (circuit.failures >= CIRCUIT_FAILURE_THRESHOLD) {
      circuit.open = true;
      logger.warn(`[Provider] Circuit opened for ${instanceId} after ${circuit.failures} consecutive failures`);
    }
  }

  /** Record a success — resets circuit */
  recordSuccess(instanceId: string): void {
    const circuit = this.circuits.get(instanceId);
    if (circuit && circuit.failures > 0) {
      circuit.failures = 0;
      circuit.open = false;
    }
  }

  /** Check if circuit is open */
  isCircuitOpen(instanceId: string): boolean {
    return this.getCircuit(instanceId).open;
  }

  /** 获取 LLM Provider */
  getLLM(instanceId?: string): LLMProvider | null {
    const instance = instanceId
      ? instanceStore.get(instanceId)
      : instanceStore.getDefault('llm');

    if (!instance || instance.kind !== 'llm') return null;

    if (this.isCircuitOpen(instance.id)) {
      logger.warn(`[Provider] Circuit open for LLM ${instance.id}, skipping`);
      return null;
    }

    return this.createProvider(instance) as LLMProvider;
  }

  /** 获取 TTS Provider */
  getTTS(instanceId?: string): TTSProvider | null {
    const instance = instanceId
      ? instanceStore.get(instanceId)
      : instanceStore.getDefault('tts');

    if (!instance || instance.kind !== 'tts') return null;

    if (this.isCircuitOpen(instance.id)) {
      logger.warn(`[Provider] Circuit open for TTS ${instance.id}, skipping`);
      return null;
    }

    return this.createProvider(instance) as TTSProvider;
  }

  /** 获取 TTI Provider */
  getTTI(instanceId?: string): TTIProvider | null {
    const instance = instanceId
      ? instanceStore.get(instanceId)
      : instanceStore.getDefault('tti');

    if (!instance || instance.kind !== 'tti') return null;

    if (this.isCircuitOpen(instance.id)) {
      logger.warn(`[Provider] Circuit open for TTI ${instance.id}, skipping`);
      return null;
    }

    return this.createProvider(instance) as TTIProvider;
  }

  /** 获取 ITV Provider */
  getITV(instanceId?: string): ITVProvider | null {
    const instance = instanceId
      ? instanceStore.get(instanceId)
      : instanceStore.getDefault('itv');

    if (!instance || instance.kind !== 'itv') return null;

    if (this.isCircuitOpen(instance.id)) {
      logger.warn(`[Provider] Circuit open for ITV ${instance.id}, skipping`);
      return null;
    }

    return this.createProvider(instance) as ITVProvider;
  }

  /** 清除缓存 */
  clearCache(instanceId?: string): void {
    if (instanceId) {
      this.providerCache.delete(instanceId);
      this.circuits.delete(instanceId);
    } else {
      this.providerCache.clear();
      this.circuits.clear();
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
      if (result.valid) {
        this.recordSuccess(instanceId);
      } else {
        this.recordFailure(instanceId);
      }
      return { success: result.valid, message: result.message };
    } catch (error) {
      this.recordFailure(instanceId);
      return { success: false, message: (error as Error).message };
    }
  }
}

export const providerManager = new ProviderManager();
