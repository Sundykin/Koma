import type { MediaAssetSource, ProviderAssetInput } from '../../../../../types';
import type { ImageResult } from '../../../../../providers/tti/types';
import type { LinghuiImageMediaItem } from '../../../../../types/linghui';
import type {
  GenerateImageVariantRequest,
  GenerateImageWithProviderParams,
} from './imageTypes';

export function buildTTIRequestOptions(params: GenerateImageWithProviderParams): Record<string, unknown> | undefined {
  const options: Record<string, unknown> = {};
  if (params.steps !== undefined) options.steps = params.steps;
  const aspectRatio = String(params.aspectRatio ?? '').trim();
  if (aspectRatio) options.aspectRatio = aspectRatio;
  const imageSize = String(params.resolution ?? '').trim();
  // 'auto' 表示让 provider 决定；只有用户显式挑了档位才透传。
  if (imageSize && imageSize.toLowerCase() !== 'auto') options.imageSize = imageSize;
  return Object.keys(options).length > 0 ? options : undefined;
}

function isImageResult(value: unknown): value is ImageResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ImageResult>;
  return typeof candidate.path === 'string' || typeof candidate.url === 'string';
}

export function omitBatchImagesMetadata(metadata?: ImageResult['metadata']): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const { batchImages: _batchImages, ...rest } = metadata;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

export function extractProviderImageResults(output: ImageResult): ImageResult[] {
  const batchImages = Array.isArray(output.metadata?.batchImages)
    ? output.metadata.batchImages.filter(isImageResult)
    : [];
  return batchImages.length > 0 ? batchImages : [output];
}

export function clampProgressValue(progress?: number): number {
  const numeric = Number(progress);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

export function resolveAverageVariantProgress(progresses: number[]): number {
  if (!progresses.length) {
    return 0;
  }
  return Math.round(progresses.reduce((sum, value) => sum + clampProgressValue(value), 0) / progresses.length);
}

export function withVariantImageMetadata(
  item: LinghuiImageMediaItem,
  variant: GenerateImageVariantRequest,
  index: number,
): LinghuiImageMediaItem {
  const mergedMetadata = {
    ...(item.metadata ?? {}),
    variantIndex: index + 1,
    ...(variant.metadata ?? {}),
  };

  return {
    ...item,
    label: String(variant.label ?? '').trim() || item.label || `#${index + 1}`,
    metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined,
  };
}

function buildImageReferenceSourceKey(source: MediaAssetSource | ProviderAssetInput): string {
  if (typeof source === 'string') {
    return source;
  }
  if (source && typeof source === 'object' && 'transport' in source && 'value' in source) {
    return `${source.transport}:${source.value}`;
  }

  const asset = source as Exclude<MediaAssetSource, string>;
  return asset.localPath || asset.remoteUrl || JSON.stringify(asset);
}

export function dedupeImageReferenceSources(
  sources: Array<MediaAssetSource | ProviderAssetInput | undefined>,
): Array<MediaAssetSource | ProviderAssetInput> {
  const seen = new Set<string>();
  const deduped: Array<MediaAssetSource | ProviderAssetInput> = [];

  for (const source of sources) {
    if (!source) continue;
    const key = buildImageReferenceSourceKey(source);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(source);
  }

  return deduped;
}
