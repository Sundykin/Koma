/**
 * AI Provider 基础类型定义
 * 所有 Provider 类型的公共接口和类型
 */

/** Provider 类型 */
export type ProviderKind = 'llm' | 'tti' | 'itv' | 'tts';

/** 执行模式 */
export type ExecutionMode = 'sync' | 'async' | 'stream';

/** 生成模式 */
export type GenerationMode = 'text-to-X' | 'reference-to-X' | 'hybrid';

/** 验证结果 */
export interface ValidationResult {
  valid: boolean;
  message?: string;
  details?: Record<string, string>;
}

/** Provider 能力声明 */
export interface ProviderCapabilities {
  executionModes: ExecutionMode[];
  generationModes: GenerationMode[];
  features?: string[];
}

/**
 * Provider 基类接口
 */
export interface BaseProvider {
  readonly pluginId: string;
  readonly instanceId: string;
  validate(): Promise<ValidationResult>;
  getCapabilities(): ProviderCapabilities;
}

/** 任务状态枚举 */
export type TaskStatusEnum = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/** 任务提交结果 */
export interface TaskSubmitResult {
  taskId: string;
  status: TaskStatusEnum;
  estimatedTime?: number;
}

/** 任务状态 */
export interface TaskStatus {
  taskId: string;
  status: TaskStatusEnum;
  progress?: number;
  message?: string;
  createdAt: number;
  updatedAt: number;
  estimatedTime?: number;
}

/** 任务结果 */
export interface TaskResult<T = unknown> {
  taskId: string;
  status: 'completed' | 'failed';
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/** 异步任务 Provider 接口 */
export interface AsyncTaskProvider {
  submitTask(request: TaskRequest): Promise<TaskSubmitResult>;
  getTaskStatus(taskId: string): Promise<TaskStatus>;
  getTaskResult(taskId: string): Promise<TaskResult>;
  cancelTask?(taskId: string): Promise<boolean>;
}

/** 任务请求 */
export interface TaskRequest {
  type: string;
  params: Record<string, unknown>;
  callbackUrl?: string;
}

/** 参考输入 */
export interface ReferenceInput {
  type: 'image' | 'audio' | 'video' | 'text';
  url?: string;
  path?: string;
  base64?: string;
  weight?: number;
  role?: string;
}

/** 生成输入 */
export interface GenerationInput {
  prompt?: string;
  negativePrompt?: string;
  references?: ReferenceInput[];
  options?: Record<string, unknown>;
}

/** 生成输出 */
export interface GenerationOutput {
  type: 'image' | 'audio' | 'video' | 'text';
  url?: string;
  path?: string;
  base64?: string;
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    format?: string;
    seed?: number;
    [key: string]: unknown;
  };
}

/** Provider 实例 */
export interface ProviderInstance {
  id: string;
  pluginId: string;
  kind: ProviderKind;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Provider 插件 Manifest */
export interface ProviderPluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  kind: ProviderKind;
  capabilities?: ProviderCapabilities;
  configSchema: ConfigSchema;
  defaultConfig?: Record<string, unknown>;
}

/** 配置 Schema */
export interface ConfigSchema {
  type: 'object';
  properties: Record<string, ConfigProperty>;
  required?: string[];
}

/** 配置属性 */
export interface ConfigProperty {
  type: 'string' | 'number' | 'boolean' | 'array';
  title: string;
  description?: string;
  default?: unknown;
  secret?: boolean;
  enum?: string[];
  minimum?: number;
  maximum?: number;
}
