/**
 * TTI (Text-to-Image) Provider 类型定义
 */

import type {
  BaseProvider,
  ProviderCapabilities,
  GenerationInput,
  GenerationOutput,
  ReferenceInput,
  TaskSubmitResult,
  TaskStatus,
  TaskResult,
} from './provider-base';

/** TTI 参考输入 */
export interface TTIReference extends ReferenceInput {
  type: 'image';
  role?:
    | 'init'
    | 'controlnet'
    | 'style'
    | 'face'
    | 'pose'
    | 'depth'
    | 'canny'
    | 'mask';
  preprocessor?: string;
}

/** TTI 输入 */
export interface TTIInput extends GenerationInput {
  prompt?: string;
  references?: TTIReference[];
  options?: TTIOptions;
}

/** TTI 选项 */
export interface TTIOptions extends Record<string, unknown> {
  width?: number;
  height?: number;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | string;
  steps?: number;
  cfgScale?: number;
  sampler?: string;
  seed?: number;
  denoise?: number;
  batchSize?: number;
  model?: string;
  loras?: Array<{ name: string; weight: number }>;
  format?: 'png' | 'jpg' | 'webp';
  quality?: number;
}

/** TTI 能力扩展 */
export interface TTICapabilities extends ProviderCapabilities {
  features?: (
    | 'img2img'
    | 'inpaint'
    | 'outpaint'
    | 'upscale'
    | 'controlnet'
    | 'ip-adapter'
    | 'lora'
    | 'face-swap'
  )[];
  controlnetTypes?: string[];
  maxResolution?: { width: number; height: number };
}

/**
 * TTI Provider 接口
 */
export interface TTIProvider extends BaseProvider {
  generate?(input: TTIInput): Promise<GenerationOutput>;
  generateAsync?(input: TTIInput): Promise<TaskSubmitResult>;
  generateBatch?(inputs: TTIInput[], concurrency?: number): Promise<GenerationOutput[]>;
  getTaskStatus?(taskId: string): Promise<TaskStatus>;
  getTaskResult?(taskId: string): Promise<TaskResult<GenerationOutput>>;
  getCapabilities(): TTICapabilities;
}

/** TTI Provider 工厂函数 */
export type TTIProviderFactory = (
  config: Record<string, unknown>,
  context: { pluginId: string; instanceId: string }
) => TTIProvider;
