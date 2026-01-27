/**
 * Provider 相关类型定义
 */

// 渠道类型
export type ChannelKind = 'tti' | 'itv' | 'tts';

// 渠道能力
export type ChannelCapability = 'tti' | 'itv' | 'tts' | 'character-extract' | 'remix';

// 轮询配置
export interface PollingConfig {
  interval: number;       // 轮询间隔（毫秒）
  maxDuration: number;    // 最大等待时间（毫秒）
  initialDelay?: number;  // 首次查询延迟（毫秒）
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
export interface ProviderDefinition<T = any> {
  type: string;              // 唯一标识，如 'sora2', 'vectorengine'
  kind: ChannelKind;         // 'tti' | 'itv' | 'tts'
  name: string;              // 显示名称
  description?: string;      // 描述
  factory: (config: Record<string, any>, ctx: ProviderContext) => T;
  capabilities?: ChannelCapability[];
  pluginId?: string;         // 关联插件 ID
  configSchema?: Record<string, any>;  // JSON Schema for UI
  defaultConfig?: Record<string, any>;
  polling?: PollingConfig;
}
