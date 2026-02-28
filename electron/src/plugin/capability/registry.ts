/**
 * 能力点注册表
 * 管理插件能力点的注册、查询和调用
 */

/** 能力点描述 */
export interface CapabilityDescriptor {
  pluginId: string;
  kind: string;
  name: string;
  version?: string;
  metadata?: Record<string, unknown>;
}

/** 能力点贡献 */
export interface CapabilityContribution {
  kind: string;
  name: string;
  version?: string;
  config?: Record<string, unknown>;
}

/** 能力点上下文 */
export interface CapabilityContext {
  capability: { kind: string; name: string };
  callerId?: string;
  [key: string]: unknown;
}

/** 能力点处理器 */
export type CapabilityHandler = (
  input: unknown,
  ctx: CapabilityContext
) => Promise<unknown>;

interface RegisteredCapability {
  descriptor: CapabilityDescriptor;
  handler: CapabilityHandler;
}

class CapabilityRegistry {
  /** 能力点存储: kind -> name -> RegisteredCapability */
  private capabilities = new Map<string, Map<string, RegisteredCapability>>();

  /** 插件 -> 能力点列表 (用于批量注销) */
  private pluginCapabilities = new Map<string, Array<{ kind: string; name: string }>>();

  /** 注册能力点 */
  register(
    pluginId: string,
    contribution: CapabilityContribution,
    handler: CapabilityHandler
  ): void {
    const { kind, name, version, config } = contribution;

    if (!this.capabilities.has(kind)) {
      this.capabilities.set(kind, new Map());
    }
    const kindMap = this.capabilities.get(kind)!;

    const descriptor: CapabilityDescriptor = {
      pluginId,
      kind,
      name,
      version,
      metadata: config,
    };
    kindMap.set(name, { descriptor, handler });

    if (!this.pluginCapabilities.has(pluginId)) {
      this.pluginCapabilities.set(pluginId, []);
    }
    this.pluginCapabilities.get(pluginId)!.push({ kind, name });
  }

  /** 注销能力点 */
  unregister(pluginId: string, kind: string, name: string): void {
    const kindMap = this.capabilities.get(kind);
    if (!kindMap) return;

    const capability = kindMap.get(name);
    if (!capability || capability.descriptor.pluginId !== pluginId) return;

    kindMap.delete(name);
    if (kindMap.size === 0) {
      this.capabilities.delete(kind);
    }

    const pluginCaps = this.pluginCapabilities.get(pluginId);
    if (pluginCaps) {
      const idx = pluginCaps.findIndex((c) => c.kind === kind && c.name === name);
      if (idx !== -1) pluginCaps.splice(idx, 1);
    }
  }

  /** 注销插件的所有能力点 */
  unregisterByPlugin(pluginId: string): void {
    const caps = this.pluginCapabilities.get(pluginId);
    if (!caps) return;

    for (const { kind, name } of [...caps]) {
      const kindMap = this.capabilities.get(kind);
      if (kindMap) {
        kindMap.delete(name);
        if (kindMap.size === 0) {
          this.capabilities.delete(kind);
        }
      }
    }

    this.pluginCapabilities.delete(pluginId);
  }

  /** 列出能力点 */
  list(kind?: string): CapabilityDescriptor[] {
    const result: CapabilityDescriptor[] = [];

    if (kind) {
      const kindMap = this.capabilities.get(kind);
      if (kindMap) {
        for (const { descriptor } of kindMap.values()) {
          result.push(descriptor);
        }
      }
    } else {
      for (const kindMap of this.capabilities.values()) {
        for (const { descriptor } of kindMap.values()) {
          result.push(descriptor);
        }
      }
    }

    return result;
  }

  /** 解析能力点 */
  resolve(kind: string, name: string): CapabilityDescriptor | undefined {
    return this.capabilities.get(kind)?.get(name)?.descriptor;
  }

  /** 调用能力点 */
  async invoke(
    kind: string,
    name: string,
    input: unknown,
    ctx: Omit<CapabilityContext, 'capability'>
  ): Promise<unknown> {
    const kindMap = this.capabilities.get(kind);
    if (!kindMap) {
      throw new Error(`Capability kind ${kind} not found`);
    }

    const capability = kindMap.get(name);
    if (!capability) {
      throw new Error(`Capability ${kind}:${name} not found`);
    }

    const fullCtx: CapabilityContext = {
      ...ctx,
      capability: { kind, name },
    };

    return await capability.handler(input, fullCtx);
  }

  /** 清空所有能力点 */
  clear(): void {
    this.capabilities.clear();
    this.pluginCapabilities.clear();
  }

  /** 获取统计信息 */
  getStats(): { totalKinds: number; totalCapabilities: number; byKind: Record<string, number> } {
    const byKind: Record<string, number> = {};
    let total = 0;

    for (const [kind, kindMap] of this.capabilities) {
      byKind[kind] = kindMap.size;
      total += kindMap.size;
    }

    return {
      totalKinds: this.capabilities.size,
      totalCapabilities: total,
      byKind,
    };
  }
}

/** 全局能力点注册表实例 */
export const capabilityRegistry = new CapabilityRegistry();
