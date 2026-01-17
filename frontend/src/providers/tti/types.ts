/**
 * TTI Provider 类型定义
 */
import type { TTIModelConfig, ProgressInfo } from '../../types';

export interface ImageResult {
  path: string;
  width: number;
  height: number;
  seed?: number;
}

export interface TTIOptions {
  width?: number;
  height?: number;
  seed?: number;
  negativePrompt?: string;
  steps?: number;
  cfgScale?: number;
  aspectRatio?: string;      // nano-banana 用
  imageSize?: string;        // nano-banana 用：1K, 2K, 4K
  imageUrls?: string[];      // 参考图（图生图）
}

export interface TTIProvider {
  type: string;
  config: TTIModelConfig;
  validate(): boolean;
  testConnection(): Promise<boolean>;
  generateImage(prompt: string, options?: TTIOptions): Promise<ImageResult | string>; // 返回结果或 taskId
  checkProgress?(taskId: string): Promise<ProgressInfo>;
}
