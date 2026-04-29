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
import type {
  LinghuiMultiAngleAzimuth,
  LinghuiMultiAngleDistance,
  LinghuiMultiAngleElevation,
  LinghuiMultiAnglePromptProtocol,
} from '../../types/linghui';

export interface ImageResultMetadata extends Record<string, unknown> {
  batchImages?: ImageResult[];
}

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
  metadata?: ImageResultMetadata;
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

export interface MultiAngleTTIRequest {
  endpointPath?: string;
  promptProtocol: LinghuiMultiAnglePromptProtocol;
  azimuth: LinghuiMultiAngleAzimuth;
  elevation: LinghuiMultiAngleElevation;
  distance: LinghuiMultiAngleDistance;
  sourceReferenceIndex?: number;
  originalPrompt: string;
  anglePrompt: string;
  compiledPrompt: string;
}

export interface TTIRequest extends BaseTTIRequest<ProviderAssetInput, TTIOptions> {
  count?: number;
  requestType?: 'text-to-image' | 'multi-angle';
  multiAngle?: MultiAngleTTIRequest;
}

export interface TTIProvider {
  type: string;
  config: TTIModelConfig;
  supportsMultiAngle?: boolean;

  validate(): boolean;
  testConnection(): Promise<boolean>;

  start(request: TTIRequest): Promise<ProviderStartResult<ImageResult>>;
  getTaskSnapshot?(taskId: string): Promise<ProviderTaskSnapshot<ImageResult>>;
  cancelTask?(taskId: string): Promise<void>;

  polling?: PollingConfig;
}
