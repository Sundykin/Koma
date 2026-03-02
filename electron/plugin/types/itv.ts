/**
 * ITV (Image-to-Video) Provider 类型定义
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
  AsyncTaskProvider,
} from './provider-base';

/** ITV 参考输入 */
export interface ITVReference extends ReferenceInput {
  type: 'image' | 'video' | 'audio';
  role?:
    | 'start'
    | 'end'
    | 'character'
    | 'prop'
    | 'style'
    | 'motion'
    | 'audio';
  assetId?: string;
  timestamps?: string;
}

/** ITV 输入 */
export interface ITVInput extends GenerationInput {
  references?: ITVReference[];
  prompt?: string;
  options?: ITVOptions;
}

/** ITV 选项 */
export interface ITVOptions extends Record<string, unknown> {
  duration?: number;
  fps?: 24 | 30 | 60;
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3' | string;
  resolution?: '720p' | '1080p' | '4k';
  motionStrength?: number;
  cameraMotion?:
    | 'static'
    | 'zoom-in'
    | 'zoom-out'
    | 'pan-left'
    | 'pan-right'
    | 'tilt-up'
    | 'tilt-down'
    | 'orbit';
  seed?: number;
  format?: 'mp4' | 'webm' | 'gif';
  loop?: boolean;
}

/** 资产来源 */
export type AssetSource =
  | { kind: 'image'; url?: string; path?: string; base64?: string }
  | { kind: 'video'; url?: string; path?: string; timestamps?: string }
  | { kind: 'task'; taskId: string; timestamps?: string }
  | { kind: 'url'; url: string; timestamps?: string };

/** 资产提取输入 */
export interface AssetExtractionInput {
  type: 'character' | 'prop' | 'style' | 'motion';
  source: AssetSource;
  options?: AssetExtractionOptions;
}

/** 资产提取选项 */
export interface AssetExtractionOptions {
  name?: string;
  model?: string;
  timestamps?: string;
  [key: string]: unknown;
}

/** 资产信息 */
export interface AssetInfo {
  id: string;
  type: 'character' | 'prop' | 'style' | 'motion';
  name: string;
  thumbnail?: string;
  description?: string;
  createdAt: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

/** 资产提取状态 */
export interface AssetExtractionStatus extends TaskStatus {
  assets?: AssetInfo[];
}

/** 资产过滤 */
export interface AssetFilter {
  type?: 'character' | 'prop' | 'style' | 'motion';
  activeOnly?: boolean;
}

/** ITV 能力扩展 */
export interface ITVCapabilities extends ProviderCapabilities {
  features?: (
    | 'asset-extract'
    | 'asset-reuse'
    | 'end-frame'
    | 'camera-control'
    | 'motion-control'
    | 'audio-driven'
    | 'style-preset'
    | 'storyboard'
    | 'remix'
    | 'extend'
    | 'loop'
  )[];
  assetTypes?: ('character' | 'prop' | 'style' | 'motion')[];
  durationRange?: { min: number; max: number };
  resolutions?: string[];
}

/**
 * ITV Provider 接口
 */
export interface ITVProvider extends BaseProvider, AsyncTaskProvider {
  generate?(input: ITVInput): Promise<GenerationOutput>;
  generateAsync(input: ITVInput): Promise<TaskSubmitResult>;
  getTaskStatus(taskId: string): Promise<TaskStatus>;
  getTaskResult(taskId: string): Promise<TaskResult<GenerationOutput>>;
  cancelTask?(taskId: string): Promise<boolean>;
  extractAsset?(input: AssetExtractionInput): Promise<TaskSubmitResult>;
  getAssetExtractionStatus?(taskId: string): Promise<AssetExtractionStatus>;
  listAssets?(filter?: AssetFilter): Promise<AssetInfo[]>;
  deleteAsset?(assetId: string): Promise<boolean>;
  getCapabilities(): ITVCapabilities;
}

/** ITV Provider 工厂函数 */
export type ITVProviderFactory = (
  config: Record<string, unknown>,
  context: { pluginId: string; instanceId: string }
) => ITVProvider;
