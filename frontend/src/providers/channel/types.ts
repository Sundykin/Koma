/**
 * 渠道配置类型定义
 * 重构版：移除模板引擎，改为 Provider 注入
 */
import type { ProgressInfo } from '../../types';
import type { PollingConfig, ChannelCapability } from '../registry';

// 重新导出 PollingConfig 和 ChannelCapability
export type { PollingConfig, ChannelCapability };

// 渠道类型
export type ChannelType = 'tti' | 'itv' | 'character' | 'remix' | 'tts';

// 鉴权配置
export interface AuthConfig {
  type: 'bearer' | 'header' | 'query' | 'none';
  keyName?: string;
  keyValue: string;
  prefix?: string;
}

// 渠道进度信息
export interface ChannelProgressInfo extends ProgressInfo {
  rawResponse?: any;
  extra?: Record<string, any>;
}

// 渠道验证结果
export interface ChannelValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 渠道配置（Provider 注入版）
 * 不再包含模板配置，改为引用 Provider 类型
 */
export interface ChannelConfig {
  id: string;
  name: string;
  description?: string;

  // Provider 类型（对应 ProviderRegistry 中的 type）
  providerType: string;

  // Provider 配置（传给 factory 的参数）
  providerConfig: Record<string, any>;

  // 能力列表
  capabilities: ChannelCapability[];

  // 轮询配置（可覆盖 Provider 默认值）
  polling?: PollingConfig;

  // 是否启用
  enabled: boolean;

  // 来源标识
  source: 'builtin' | 'plugin';
  pluginId?: string;

  // 元数据
  createdAt: number;
  updatedAt: number;
}

// 获取渠道能力列表
export function getChannelCapabilities(config: ChannelConfig): ChannelCapability[] {
  return config.capabilities || [];
}

// 检查渠道是否具有指定能力
export function hasChannelCapability(config: ChannelConfig, capability: ChannelCapability): boolean {
  return config.capabilities?.includes(capability) ?? false;
}

/**
 * @deprecated 使用 ChannelConfig 代替
 * 兼容旧代码，将在后续版本删除
 */
export type UnifiedChannelConfig = ChannelConfig;
