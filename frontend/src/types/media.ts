export type MediaKind = 'image' | 'video' | 'audio';

/**
 * 媒体输入源（服务层接收的“松散”形态）。
 *
 * - string: 本地路径 / 远程 URL / data: / blob:
 * - StoredMediaAsset: 已结构化的项目资产
 */
export type MediaAssetSource = string | StoredMediaAsset;

export interface ProviderAssetInput {
  transport: 'remote-url' | 'data-url';
  value: string;
  mimeType?: string;
}

/**
 * 结构化媒体资产。
 */
export interface StoredMediaAsset {
  kind: MediaKind;
  localPath?: string;
  remoteUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  fps?: number;
  provider?: string;
  providerTaskId?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface MediaOwnerRef {
  projectId: string;
  ownerType: 'character' | 'scene' | 'prop' | 'shot' | 'shot-version';
  ownerId: string;
  slot:
    | 'costumePhoto'
    | 'previewImage'
    | 'previewVideo'
    | 'referenceImage'
    | 'image'
    | 'video'
    | 'audio';
  episodeId?: string;
  versionId?: string;
}

export type ProviderStartResult<T> =
  | { mode: 'immediate'; output: T }
  | { mode: 'async'; taskId: string };

export interface ProviderTaskSnapshot<T> {
  state: 'queued' | 'running' | 'succeeded' | 'failed';
  progress?: number;
  output?: T;
  error?: string;
}

/**
 * 统一 request-based 媒体输入契约。
 *
 * - Provider 边界使用 ProviderAssetInput
 * - Service/workflow 边界可以用 MediaAssetSource（见泛型默认参数）
 */
export interface TTIRequest<TAsset = ProviderAssetInput, TOptions = Record<string, unknown>> {
  prompt: string;
  references?: TAsset[];
  options?: TOptions;
}

export interface ITVRequest<TAsset = ProviderAssetInput, TOptions = Record<string, unknown>> {
  prompt: string;
  primaryImage: TAsset;
  additionalReferences?: TAsset[];
  options?: TOptions;
}

export interface TTSRequest<TOptions = Record<string, unknown>> {
  text: string;
  voiceId: string;
  options?: TOptions;
}

export interface CharacterMediaSlots {
  costumePhoto?: StoredMediaAsset;
  previewVideo?: StoredMediaAsset;
}

export interface SceneMediaSlots {
  previewImage?: StoredMediaAsset;
}

export interface PropMediaSlots {
  previewImage?: StoredMediaAsset;
  previewVideo?: StoredMediaAsset;
}

export interface ShotMediaState {
  references?: StoredMediaAsset[];
  images?: StoredMediaAsset[];
  videos?: StoredMediaAsset[];
  selectedReferenceIndex?: number;
  currentImageIndex?: number;
  currentVideoIndex?: number;
}

export interface ShotVersionMediaState {
  image?: StoredMediaAsset;
  video?: StoredMediaAsset;
  audio?: StoredMediaAsset;
}

export function isRemoteMediaUri(value?: string): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}

export function isDataUri(value?: string): value is string {
  return Boolean(value && value.startsWith('data:'));
}

export function isBlobUri(value?: string): value is string {
  return Boolean(value && value.startsWith('blob:'));
}

export function getMediaAssetSource(asset?: StoredMediaAsset): string | undefined {
  return asset?.localPath || asset?.remoteUrl;
}
