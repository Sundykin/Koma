/**
 * Provider 注册表
 * 管理 TTI/ITV/TTS/LLM Provider 定义
 */
import type { ProviderDefinition, IRegistry } from '../types';

class ProviderRegistry implements IRegistry<ProviderDefinition> {
  private providers = new Map<string, ProviderDefinition>();

  register(def: ProviderDefinition): void {
    if (this.providers.has(def.type)) {
      console.warn(`[ProviderRegistry] Provider "${def.type}" already registered, overwriting`);
    }
    this.providers.set(def.type, def);
    console.log(`[ProviderRegistry] Registered provider: ${def.type} (${def.kind})`);
  }

  unregister(type: string): void {
    if (this.providers.delete(type)) {
      console.log(`[ProviderRegistry] Unregistered provider: ${type}`);
    }
  }

  get(type: string): ProviderDefinition | undefined {
    return this.providers.get(type);
  }

  list(): ProviderDefinition[] {
    return Array.from(this.providers.values());
  }

  listByKind(kind: 'tti' | 'itv' | 'tts' | 'llm'): ProviderDefinition[] {
    return this.list().filter(p => p.kind === kind);
  }

  listByPlugin(pluginId: string): ProviderDefinition[] {
    return this.list().filter(p => p.pluginId === pluginId);
  }

  unregisterByPlugin(pluginId: string): void {
    const toRemove = this.listByPlugin(pluginId).map(p => p.type);
    toRemove.forEach(type => this.unregister(type));
  }

  clear(): void {
    this.providers.clear();
  }
}

export const providerRegistry = new ProviderRegistry();
