/**
 * 插件桥接层
 * 将前端 Provider 调用代理到 Electron 侧
 */
import { providerRegistry, mcpRegistry, agentRegistry } from './registries';
import type {
  ProviderDefinition,
  ProviderStatusSnapshot,
  MCPToolDefinition,
  WorkerAgentDefinition,
} from './types';
import { configRegistry } from '../config';
import type { AppSettingsData } from '../config/modules/appSettings';

const HEALTH_CHECK_TTL_MS = 5 * 60 * 1000;

class PluginBridge {
  /**
   * 调用 Provider
   */
  async callProvider(
    kind: 'tti' | 'itv' | 'tts' | 'llm' | 'image-hosting',
    type: string,
    method: string,
    args: unknown[]
  ): Promise<unknown> {
    await this.syncProviderPriorities();

    const orderedProviders = providerRegistry.selectProviders(kind, type);
    if (orderedProviders.length === 0) {
      throw new Error(`No provider available for kind "${kind}"`);
    }

    const candidates = orderedProviders;
    const triedProviders: string[] = [];
    const errors: Array<{ provider: string; error: string }> = [];

    for (const def of candidates) {
      triedProviders.push(def.type);

      try {
        await this.ensureProviderHealth(def, args[0]);
        return await this.invokeProvider(def, method, args);
      } catch (err: any) {
        this.clearProviderCache(def.type);
        errors.push({ provider: def.type, error: err?.message || String(err) });
      }
    }

    throw new Error(
      `All providers failed for ${kind}. Tried: ${triedProviders.join(', ')}. Errors: ${errors
        .map(item => `${item.provider}:${item.error}`)
        .join(' | ')}`
    );
  }

  private async invokeProvider(def: ProviderDefinition, method: string, args: unknown[]): Promise<unknown> {
    const start = Date.now();
    try {
      const instance = this.getProviderInstance(def, args[0]);

      if (typeof (instance as any)[method] !== 'function') {
        throw new Error(`Method "${method}" not found on provider "${def.type}"`);
      }

      const result = await (instance as any)[method](...args.slice(1));
      providerRegistry.recordCallResult(def.type, {
        success: true,
        latencyMs: Date.now() - start,
      });
      return result;
    } catch (err: any) {
      providerRegistry.recordCallResult(def.type, {
        success: false,
        latencyMs: Date.now() - start,
        errorCode: err?.name || 'invoke_error',
      });
      throw err;
    }
  }

  private async ensureProviderHealth(def: ProviderDefinition, config: unknown): Promise<void> {
    const state = providerRegistry.getRuntimeState(def.type);
    const now = Date.now();
    if (state.lastCheckedAt && now - state.lastCheckedAt < HEALTH_CHECK_TTL_MS) {
      if (state.health === 'unhealthy') {
        throw new Error(`Provider "${def.type}" is unhealthy`);
      }
      return;
    }

    const testResult = await this.runProviderHealthCheck(def, config);
    providerRegistry.updateHealth(def.type, testResult.success ? 'healthy' : 'degraded', now);

    if (!testResult.success) {
      throw new Error(testResult.error || `Provider "${def.type}" health check failed`);
    }
  }

  async testProvider(
    kind: 'tti' | 'itv' | 'tts' | 'llm' | 'image-hosting',
    type: string,
    config: Record<string, unknown>
  ): Promise<{ success: boolean; latency: number; error?: string }> {
    const def = providerRegistry.get(type);
    if (!def) {
      return { success: false, latency: 0, error: `Provider "${type}" not found` };
    }

    if (def.kind !== kind) {
      return { success: false, latency: 0, error: `Provider "${type}" is not a ${kind} provider` };
    }

    const result = await this.runProviderHealthCheck(def, config);
    providerRegistry.updateHealth(type, result.success ? 'healthy' : 'degraded');
    providerRegistry.recordCallResult(type, {
      success: result.success,
      latencyMs: result.latency,
      errorCode: result.success ? undefined : 'test_failed',
    });
    return result;
  }

  async listProviderStatus(kind?: 'tti' | 'itv' | 'tts' | 'llm' | 'image-hosting'): Promise<ProviderStatusSnapshot[]> {
    await this.syncProviderPriorities();
    return providerRegistry.listStatuses(kind);
  }

  private async runProviderHealthCheck(
    def: ProviderDefinition,
    config: unknown
  ): Promise<{ success: boolean; latency: number; error?: string }> {
    const start = Date.now();
    try {
      const instance = this.getProviderInstance(def, config);
      if (typeof (instance as any).testConnection === 'function') {
        const ok = await (instance as any).testConnection();
        return {
          success: Boolean(ok),
          latency: Date.now() - start,
          error: ok ? undefined : '连接测试失败',
        };
      }

      return { success: true, latency: Date.now() - start };
    } catch (err: any) {
      return {
        success: false,
        latency: Date.now() - start,
        error: err?.message || String(err),
      };
    }
  }

  private async syncProviderPriorities(): Promise<void> {
    try {
      const settings = await configRegistry.get<AppSettingsData>('app-settings');
      const channelConfigs = settings.channelConfigs || [];
      for (const config of channelConfigs) {
        const priority = typeof config.priority === 'number' ? config.priority : undefined;
        providerRegistry.setPriority(config.providerType, priority);
      }
    } catch {
      // ignore config sync failures
    }
  }

  // Provider 实例缓存
  private providerInstances = new Map<string, unknown>();

  private getProviderInstance(def: ProviderDefinition, config: unknown): unknown {
    const cacheKey = `${def.type}:${JSON.stringify(config)}`;

    if (!this.providerInstances.has(cacheKey)) {
      const instance = def.factory(config, {});
      this.providerInstances.set(cacheKey, instance);
    }

    return this.providerInstances.get(cacheKey);
  }

  /**
   * 清除 Provider 实例缓存
   */
  clearProviderCache(type?: string): void {
    if (type) {
      for (const key of this.providerInstances.keys()) {
        if (key.startsWith(`${type}:`)) {
          this.providerInstances.delete(key);
        }
      }
    } else {
      this.providerInstances.clear();
    }
  }

  /**
   * 列出可用 Provider
   */
  listProviders(kind?: 'tti' | 'itv' | 'tts' | 'llm' | 'image-hosting'): ProviderDefinition[] {
    if (kind) {
      return providerRegistry.listByKind(kind);
    }
    return providerRegistry.list();
  }

  /**
   * 调用 MCP 工具
   */
  async callMCPTool(name: string, args: unknown): Promise<unknown> {
    return mcpRegistry.tools.callTool(name, args);
  }

  /**
   * 列出 MCP 工具
   */
  listMCPTools(): MCPToolDefinition[] {
    return mcpRegistry.tools.listDefinitions();
  }

  /**
   * 读取 MCP 资源
   */
  async readMCPResource(uri: string): Promise<{ content: string; mimeType?: string }> {
    return mcpRegistry.resources.readResource(uri);
  }

  /**
   * 列出 Worker Agent
   */
  listAgents(): WorkerAgentDefinition[] {
    return agentRegistry.list();
  }

  /**
   * 按能力查找 Agent
   */
  findAgentsByCapability(capability: string): WorkerAgentDefinition[] {
    return agentRegistry.listByCapability(capability);
  }
}

export const pluginBridge = new PluginBridge();
