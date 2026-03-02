/**
 * Provider 注册表
 * 管理 TTI/ITV/TTS/LLM Provider 定义
 */
import type {
  ProviderDefinition,
  ProviderHealthStatus,
  ProviderRuntimeState,
  ProviderStatusSnapshot,
  ProviderTelemetry,
  IRegistry,
} from '../types';

const DEFAULT_PRIORITY = 100;

const createEmptyTelemetry = (): ProviderTelemetry => ({
  totalCalls: 0,
  successCalls: 0,
  failedCalls: 0,
  avgLatencyMs: 0,
  errorDistribution: {},
});

const createRuntimeState = (): ProviderRuntimeState => ({
  priority: DEFAULT_PRIORITY,
  health: 'unknown',
  consecutiveFailures: 0,
  telemetry: createEmptyTelemetry(),
});

class ProviderRegistry implements IRegistry<ProviderDefinition> {
  private providers = new Map<string, ProviderDefinition>();
  private runtimeStates = new Map<string, ProviderRuntimeState>();

  register(def: ProviderDefinition): void {
    if (this.providers.has(def.type)) {
      console.warn(`[ProviderRegistry] Provider "${def.type}" already registered, overwriting`);
    }

    this.providers.set(def.type, def);

    if (!this.runtimeStates.has(def.type)) {
      this.runtimeStates.set(def.type, createRuntimeState());
    } else {
      const previous = this.runtimeStates.get(def.type)!;
      this.runtimeStates.set(def.type, {
        ...previous,
        health: 'unknown',
        lastCheckedAt: undefined,
        consecutiveFailures: 0,
      });
    }

    console.log(`[ProviderRegistry] Registered provider: ${def.type} (${def.kind})`);
  }

  unregister(type: string): void {
    if (this.providers.delete(type)) {
      this.runtimeStates.delete(type);
      console.log(`[ProviderRegistry] Unregistered provider: ${type}`);
    }
  }

  get(type: string): ProviderDefinition | undefined {
    return this.providers.get(type);
  }

  list(): ProviderDefinition[] {
    return Array.from(this.providers.values());
  }

  listByKind(kind: 'tti' | 'itv' | 'tts' | 'llm' | 'image-hosting'): ProviderDefinition[] {
    return this.list().filter(p => p.kind === kind);
  }

  listByPlugin(pluginId: string): ProviderDefinition[] {
    return this.list().filter(p => p.pluginId === pluginId);
  }

  unregisterByPlugin(pluginId: string): void {
    const toRemove = this.listByPlugin(pluginId).map(p => p.type);
    toRemove.forEach(type => this.unregister(type));
  }

  setPriority(type: string, priority?: number): void {
    const state = this.ensureRuntimeState(type);
    state.priority = typeof priority === 'number' ? priority : DEFAULT_PRIORITY;
  }

  getPriority(type: string): number {
    return this.ensureRuntimeState(type).priority;
  }

  updateHealth(type: string, health: ProviderHealthStatus, checkedAt = Date.now()): void {
    const state = this.ensureRuntimeState(type);
    state.health = health;
    state.lastCheckedAt = checkedAt;
  }

  getRuntimeState(type: string): ProviderRuntimeState {
    return this.ensureRuntimeState(type);
  }

  recordCallResult(type: string, args: { success: boolean; latencyMs: number; errorCode?: string }): void {
    const state = this.ensureRuntimeState(type);
    const telemetry = state.telemetry;

    telemetry.totalCalls += 1;
    telemetry.avgLatencyMs =
      (telemetry.avgLatencyMs * (telemetry.totalCalls - 1) + args.latencyMs) / telemetry.totalCalls;

    if (args.success) {
      telemetry.successCalls += 1;
      state.consecutiveFailures = 0;
      state.health = 'healthy';
      state.lastCheckedAt = Date.now();
      return;
    }

    telemetry.failedCalls += 1;
    state.consecutiveFailures += 1;
    state.lastCheckedAt = Date.now();

    if (args.errorCode) {
      telemetry.errorDistribution[args.errorCode] = (telemetry.errorDistribution[args.errorCode] || 0) + 1;
    }

    state.health = state.consecutiveFailures >= 3 ? 'unhealthy' : 'degraded';
  }

  getStatus(type: string): ProviderStatusSnapshot | null {
    const def = this.providers.get(type);
    if (!def) return null;
    const state = this.ensureRuntimeState(type);
    return {
      type: def.type,
      kind: def.kind,
      name: def.name,
      pluginId: def.pluginId,
      priority: state.priority,
      health: state.health,
      lastCheckedAt: state.lastCheckedAt,
      consecutiveFailures: state.consecutiveFailures,
      telemetry: { ...state.telemetry, errorDistribution: { ...state.telemetry.errorDistribution } },
    };
  }

  listStatuses(kind?: 'tti' | 'itv' | 'tts' | 'llm' | 'image-hosting'): ProviderStatusSnapshot[] {
    const defs = kind ? this.listByKind(kind) : this.list();
    return defs
      .map(def => this.getStatus(def.type))
      .filter((status): status is ProviderStatusSnapshot => Boolean(status));
  }

  selectProviders(kind: 'tti' | 'itv' | 'tts' | 'llm' | 'image-hosting', preferredType?: string): ProviderDefinition[] {
    const candidates = this.listByKind(kind);

    return candidates.sort((a, b) => {
      if (preferredType) {
        if (a.type === preferredType && b.type !== preferredType) return -1;
        if (b.type === preferredType && a.type !== preferredType) return 1;
      }

      const aState = this.ensureRuntimeState(a.type);
      const bState = this.ensureRuntimeState(b.type);

      const healthRank = (health: ProviderHealthStatus): number => {
        switch (health) {
          case 'healthy':
            return 0;
          case 'unknown':
            return 1;
          case 'degraded':
            return 2;
          case 'unhealthy':
            return 3;
          default:
            return 4;
        }
      };

      const aUnhealthy = aState.health === 'unhealthy';
      const bUnhealthy = bState.health === 'unhealthy';
      if (aUnhealthy !== bUnhealthy) {
        return aUnhealthy ? 1 : -1;
      }

      const priorityDiff = aState.priority - bState.priority;
      if (priorityDiff !== 0) return priorityDiff;

      const healthDiff = healthRank(aState.health) - healthRank(bState.health);
      if (healthDiff !== 0) return healthDiff;

      return a.type.localeCompare(b.type);
    });
  }

  clear(): void {
    this.providers.clear();
    this.runtimeStates.clear();
  }

  private ensureRuntimeState(type: string): ProviderRuntimeState {
    let state = this.runtimeStates.get(type);
    if (!state) {
      state = createRuntimeState();
      this.runtimeStates.set(type, state);
    }
    return state;
  }
}

export const providerRegistry = new ProviderRegistry();
