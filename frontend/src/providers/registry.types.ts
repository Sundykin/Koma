/**
 * Provider 注册表类型定义
 * 用于静态导入，避免动态/静态导入冲突
 */
import type { PollingConfig } from './polling';

// 重新导出 PollingConfig 和 DEFAULT_POLLING_CONFIG
export type { PollingConfig } from './polling';
export { DEFAULT_POLLING_CONFIG } from './polling';

export const MEDIA_PROVIDER_CONTRACT_VERSION = 'media-request-v1';

// 渠道类型
export type ChannelKind = 'tti' | 'itv' | 'tts' | 'image-hosting';

// 渠道能力
export type ChannelCapability = 'tti' | 'itv' | 'tts' | 'character-extract' | 'remix' | 'image-hosting';

export function requiresMediaContractVersion(kind: ChannelKind): boolean {
  return kind === 'tti' || kind === 'itv' || kind === 'tts';
}

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

// Provider 定义
export interface ProviderDefinition<T> {
  type: string;              // 唯一标识，如 'sora2', 'vectorengine'
  kind: ChannelKind;         // 'tti' | 'itv'
  name: string;              // 显示名称
  description?: string;      // 描述
  factory: (config: Record<string, any>, ctx: ProviderContext) => T;
  contractVersion?: string;
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
