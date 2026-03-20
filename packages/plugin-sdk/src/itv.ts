/**
 * ITV Provider 类型定义（OpenSpec: request-based + start/snapshot lifecycle）
 */
import type {
  ProviderAssetInput,
  ProviderStartResult,
  ProviderTaskSnapshot,
  ITVRequest as BaseITVRequest,
} from './provider';

// 进度信息（扩展能力可能仍会使用）
export interface ProgressInfo {
  taskId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  resultUrl?: string;
  error?: string;
}

export interface ITVResult {
  source: string;
  taskId?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  fps?: number;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface ITVOptions {
  duration?: number;
  aspectRatio?: string;
  model?: string;
  seed?: number;
  motionPrompt?: string;
  resolution?: string;
  fps?: number;
  motionStrength?: number;
  negativePrompt?: string;
  width?: number;
  height?: number;
  startFrame?: string;
  endFrame?: string;
}

export type ITVRequest = BaseITVRequest<ProviderAssetInput, ITVOptions>;

// 角色提取参数
export interface CharacterExtractionParams {
  url?: string;
  fromTask?: string;
  timestamps: string;
  model?: string;
}

export interface CharacterProgressInfo extends ProgressInfo {
  characters?: Array<{
    id: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
  }>;
}

export interface RemixOptions {
  model?: string;
  prompt: string;
  duration?: number;
  aspectRatio?: string;
}

export interface ITVProvider {
  type: string;
  config: Record<string, any>;

  validate(): boolean;
  testConnection(): Promise<boolean>;

  start(request: ITVRequest): Promise<ProviderStartResult<ITVResult>>;
  getTaskSnapshot?(taskId: string): Promise<ProviderTaskSnapshot<ITVResult>>;
  cancelTask?(taskId: string): Promise<void>;

  // 扩展能力
  extractCharacter?(params: CharacterExtractionParams): Promise<string | CharacterProgressInfo>;
  checkCharacterProgress?(taskId: string): Promise<CharacterProgressInfo>;
  extractProp?(taskId: string, timestamps?: string): Promise<string>;
  remixVideo?(videoId: string, options: RemixOptions): Promise<string | ProgressInfo>;
}

