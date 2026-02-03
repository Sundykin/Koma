/**
 * TTI Provider 类型定义
 */
import type { TTIModelConfig, ProgressInfo } from '../../types';
import type { PollingConfig } from '../registry';

export interface ImageResult {
  path: string;
  url?: string;
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
  referenceImages?: string[]; // 参考图列表（别名）
}

// 图像生成输入参数（统一接口）
export interface TTIGenerateInput {
  prompt: string;
  options?: TTIOptions;
}

/**
 * TTI Provider 接口
 *
 * 统一同步/异步模式：
 * - generateImage(): 返回 ImageResult（同步）或 string（异步 taskId）
 * - 如需进度回调，使用 generateImageWithProgress()
 * - 异步 Provider 需要调用方使用 checkProgress() 轮询
 */
export interface TTIProvider {
  type: string;
  config: TTIModelConfig;

  // 验证配置
  validate(): boolean;
  testConnection(): Promise<boolean>;

  // ========== 核心方法 ==========

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

  // ========== 底层方法（异步 Provider 实现） ==========

  /**
   * 查询进度（异步 Provider 实现）
   */
  checkProgress?(taskId: string): Promise<ProgressInfo>;

  /**
   * 轮询配置
   */
  polling?: PollingConfig;
}
