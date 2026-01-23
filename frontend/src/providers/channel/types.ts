/**
 * 可扩展渠道框架 - 类型定义
 */
import type { ProgressInfo } from '../../types';

// 渠道类型
export type ChannelType = 'tti' | 'itv' | 'character' | 'remix' | 'tts';

// 鉴权配置
export interface AuthConfig {
  type: 'bearer' | 'header' | 'query' | 'none';
  keyName?: string;  // header 名或 query 参数名，bearer 时默认为 Authorization
  keyValue: string;  // API Key 值
  prefix?: string;   // 值前缀，如 "Bearer "
}

// 请求体字段映射
export interface FieldMapping {
  name: string;           // API 字段名
  source: string;         // 来源变量名，如 "prompt", "imageUrl", "duration"
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  defaultValue?: any;     // 默认值
  transform?: string;     // 转换表达式，如 "parseInt(value)" 或 "value.split(',')"
  required?: boolean;     // 是否必填
  condition?: string;     // 条件表达式，如 "options.imageUrl"
}

// 生成接口配置
export interface GenerateEndpointConfig {
  url: string;                          // 接口 URL，支持 {{baseUrl}} 占位符
  method: 'POST' | 'PUT';
  headers?: Record<string, string>;     // 额外的请求头
  contentType?: 'json' | 'form-data';   // 请求体类型，默认 json
  bodyTemplate?: string;                // JSON 模板字符串
  bodyMapping?: FieldMapping[];         // 字段映射（与 bodyTemplate 二选一）
  responseMapping: {
    taskId: string;                     // JSONPath 表达式，如 "$.id" 或 "$.data.task_id"
    error?: string;                     // 错误信息路径
  };
}

// 查询接口配置
export interface QueryEndpointConfig {
  url: string;                          // 支持 {{taskId}} 占位符
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;                        // POST 时的请求体模板
  responseMapping: {
    status: string;                     // JSONPath
    progress?: string;                  // JSONPath
    resultUrl?: string;                 // JSONPath
    error?: string;                     // JSONPath
    // 扩展字段（角色提取等）
    extra?: Record<string, string>;     // 额外字段映射
  };
  statusMapping: {
    pending: string[];                  // 原始状态值列表
    processing: string[];
    completed: string[];
    failed: string[];
  };
}

// 轮询配置
export interface PollingConfig {
  interval: number;                     // 轮询间隔（毫秒）
  maxDuration: number;                  // 最大等待时间（毫秒）
  initialDelay?: number;                // 首次查询延迟（毫秒）
}

// 完整的渠道配置
export interface ChannelConfig {
  id: string;
  name: string;
  type: ChannelType;
  description?: string;
  baseUrl: string;

  // 鉴权配置
  auth: AuthConfig;

  // 生成接口配置
  generate: GenerateEndpointConfig;

  // 查询接口配置
  query: QueryEndpointConfig;

  // 轮询配置
  polling: PollingConfig;

  // 是否启用
  enabled: boolean;

  // 元数据
  createdAt: number;
  updatedAt: number;
}

// 渠道执行上下文（传入模板引擎的变量）
export interface ChannelContext {
  // 通用变量
  baseUrl: string;
  apiKey: string;

  // TTI 变量
  prompt?: string;
  negativePrompt?: string;
  imageUrl?: string;
  imageUrls?: string[];
  aspectRatio?: string;
  width?: number;
  height?: number;
  seed?: number;
  steps?: number;
  model?: string;
  n?: number;

  // ITV 变量
  duration?: number;
  fps?: number;
  motionStrength?: number;

  // 角色提取变量
  timestamps?: string;
  fromTask?: string;
  videoUrl?: string;

  // 混音变量
  videoId?: string;

  // 任务查询变量
  taskId?: string;

  // 扩展变量
  [key: string]: any;
}

// 渠道执行结果
export interface ChannelResult {
  taskId: string;
  rawResponse?: any;
}

// 渠道进度信息（扩展自 ProgressInfo）
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

// ============ 统一渠道配置（新版） ============

// 接口对（生成+查询）
export interface EndpointPair {
  generate: GenerateEndpointConfig;
  query: QueryEndpointConfig;
}

// 渠道能力类型
export type ChannelCapability = 'tti' | 'itv' | 'character-extract' | 'remix';

// 统一渠道配置
export interface UnifiedChannelConfig {
  id: string;
  name: string;
  description?: string;
  baseUrl: string;

  // 鉴权配置
  auth: AuthConfig;

  // 能力接口配置（按需定义）
  tti?: EndpointPair;              // 文生图
  itv?: EndpointPair;              // 图生视频
  characterExtract?: EndpointPair; // 角色提取
  remix?: EndpointPair;            // 视频混音

  // 轮询配置
  polling: PollingConfig;

  // 是否启用
  enabled: boolean;

  // 元数据
  createdAt: number;
  updatedAt: number;
}

// 获取渠道能力列表
export function getChannelCapabilities(config: UnifiedChannelConfig): ChannelCapability[] {
  const caps: ChannelCapability[] = [];
  if (config.tti) caps.push('tti');
  if (config.itv) caps.push('itv');
  if (config.characterExtract) caps.push('character-extract');
  if (config.remix) caps.push('remix');
  return caps;
}

// 检查渠道是否具有指定能力
export function hasChannelCapability(config: UnifiedChannelConfig, capability: ChannelCapability): boolean {
  switch (capability) {
    case 'tti': return !!config.tti;
    case 'itv': return !!config.itv;
    case 'character-extract': return !!config.characterExtract;
    case 'remix': return !!config.remix;
    default: return false;
  }
}
