/**
 * TTI Provider 类型定义（OpenSpec: request-based + start/snapshot lifecycle）
 */
import type { TTIModelConfig } from '../../types';
import type {
  ProviderAssetInput,
  ProviderStartResult,
  ProviderTaskSnapshot,
  TTIRequest as BaseTTIRequest,
} from '../../types';
import type { PollingConfig } from '../registry.types';

export interface ImageResult {
  /**
   * 生成结果来源：
   * - http/https URL
   * - data: URL
   * - 本地文件路径
   */
  path: string;
  url?: string;
  width?: number;
  height?: number;
  seed?: number;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface TTIOptions {
  width?: number;
  height?: number;
  seed?: number;
  negativePrompt?: string;
  steps?: number;
  cfgScale?: number;
  aspectRatio?: string; // nano-banana 用
  imageSize?: string;   // nano-banana 用：1K, 2K, 4K
}

export type TTIRequest = BaseTTIRequest<ProviderAssetInput, TTIOptions>;

export interface TTIProvider {
  type: string;
  config: TTIModelConfig;

  validate(): boolean;
  testConnection(): Promise<boolean>;

  start(request: TTIRequest): Promise<ProviderStartResult<ImageResult>>;
  getTaskSnapshot?(taskId: string): Promise<ProviderTaskSnapshot<ImageResult>>;
  cancelTask?(taskId: string): Promise<void>;

  polling?: PollingConfig;
}

