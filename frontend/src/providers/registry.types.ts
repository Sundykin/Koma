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
export type ChannelKind = 'llm' | 'tti' | 'itv' | 'tts' | 'image-hosting';

// 渠道能力
export type ChannelCapability = 'llm' | 'tti' | 'itv' | 'tts' | 'character-extract' | 'remix' | 'image-hosting';

export interface ProviderModelDefinition {
  id: string;
  label: string;
  description?: string;
  capabilities: string[];
  defaults?: Record<string, unknown>;
}

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

/**
 * 凭据/连接要求声明。
 * 由 channel/catalog 与 presets 派生使用，避免在 catalog 中按 provider id 写死 if 分支。
 *  - apiKey:   远程付费/付费兼容服务通常 required；免费/本地服务为 none
 *  - baseUrl:  本地自建服务（ComfyUI/GPT-SoVITS）通常 required；多数远程服务为 optional
 * 缺省时（未声明 auth）按"远程服务"语义处理：apiKey=required，baseUrl=optional。
 */
export interface ProviderAuthRequirements {
  apiKey?: 'required' | 'optional' | 'none';
  baseUrl?: 'required' | 'optional' | 'none';
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
  models?: ProviderModelDefinition[];
  pluginId?: string;         // 关联插件 ID
  configSchema?: Record<string, any>;  // JSON Schema for UI
  defaultConfig?: Record<string, any>;
  polling?: PollingConfig;
  /**
   * UI 元数据：用户在"添加渠道"下拉中看到的预设 baseUrl。
   * 用于派生 ProviderPreset 与 ChannelDefinition.configSchema 的 baseUrl.default，
   * 避免 store/settings/presets.ts 与 Registry 漂移。
   */
  presetBaseUrl?: string;
  /** UI 元数据：声明 apiKey/baseUrl 是否必填。catalog 据此推导 required[]。 */
  auth?: ProviderAuthRequirements;
  /**
   * UI 元数据：在 ChannelDefinition 中暴露的运行时 provider 类型标识。
   * 主要用于 LLM 渠道需要把多个"渠道身份"映射到同一套协议路由（如
   * openai/deepseek/qwen/zhipu/moonshot 均使用 'openai-compatible'）。
   * 缺省与 type 相同。
   */
  runtimeProviderType?: string;
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
