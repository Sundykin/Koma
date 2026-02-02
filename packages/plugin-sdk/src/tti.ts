/**
 * TTI Provider 类型定义
 */
import type { PollingConfig } from './provider';

// 图像结果
export interface ImageResult {
  path: string;
  width: number;
  height: number;
  seed?: number;
}

// TTI 选项
export interface TTIOptions {
  width?: number;
  height?: number;
  seed?: number;
  negativePrompt?: string;
  steps?: number;
  cfgScale?: number;
  aspectRatio?: string;
  imageSize?: string;       // 1K, 2K, 4K
  imageUrls?: string[];     // 参考图（图生图）
}

// 图像生成输入参数
export interface TTIGenerateInput {
  prompt: string;
  options?: TTIOptions;
}

// 进度信息
export interface ProgressInfo {
  taskId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  resultUrl?: string;
  error?: string;
}

/**
 * TTI Provider 接口
 */
export interface TTIProvider {
  type: string;
  config: Record<string, any>;

  validate(): boolean;
  testConnection(): Promise<boolean>;

  /**
   * 生成图像
   * 同步 Provider 返回 ImageResult
   * 异步 Provider 返回 taskId (string) 用于轮询
   */
  generateImage(prompt: string, options?: TTIOptions): Promise<ImageResult | string>;

  /**
   * 生成图像（带进度回调，可选）
   */
  generateImageWithProgress?(
    input: TTIGenerateInput,
    onProgress?: (progress: ProgressInfo) => void
  ): Promise<ImageResult>;

  /**
   * 查询进度（异步 Provider 实现）
   */
  checkProgress?(taskId: string): Promise<ProgressInfo>;

  /**
   * 轮询配置
   */
  polling?: PollingConfig;
}
