import type { MediaAssetSource, ProviderAssetInput, StoredMediaAsset } from '../../../types';
import type { LinghuiMediaItem } from '../../../types/linghui';
import { fromKomaLocalUrl } from '../../../utils/urlUtils';

export type LinghuiVisualAssetSource = MediaAssetSource | ProviderAssetInput;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeText(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function normalizeLocalPath(value: unknown): string | undefined {
  const text = normalizeText(value);
  return text ? fromKomaLocalUrl(text) : undefined;
}

function getPersistRecord(media?: LinghuiMediaItem): Record<string, unknown> | undefined {
  const metadata = media?.metadata;
  if (!isRecord(metadata) || !isRecord(metadata.persist)) {
    return undefined;
  }
  return metadata.persist;
}

function getCreatedAt(media: LinghuiMediaItem, persist?: Record<string, unknown>): number {
  const fromPersist = Number(persist?.createdAt);
  if (Number.isFinite(fromPersist) && fromPersist > 0) {
    return fromPersist;
  }

  const fromMetadata = Number(media.metadata?.createdAt);
  return Number.isFinite(fromMetadata) && fromMetadata > 0 ? fromMetadata : 0;
}

export function buildLinghuiStoredMediaAsset(
  media?: LinghuiMediaItem,
  options?: {
    kind?: StoredMediaAsset['kind'];
    sourceOverride?: string;
    usePersist?: boolean;
  },
): StoredMediaAsset | undefined {
  if (!media) return undefined;

  const usePersist = options?.usePersist !== false;
  const persist = usePersist ? getPersistRecord(media) : undefined;
  const localPath = normalizeLocalPath(persist?.localPath);
  const remoteUrl = normalizeText(persist?.remoteUrl);

  if (!localPath && !remoteUrl) {
    return undefined;
  }

  const metadata = {
    ...(isRecord(media.metadata) ? media.metadata : undefined),
    ...(normalizeText(options?.sourceOverride) ? { sourceOverride: normalizeText(options?.sourceOverride) } : undefined),
  };

  return {
    kind: options?.kind ?? media.kind,
    localPath,
    remoteUrl,
    mimeType: media.mimeType,
    width: media.width,
    height: media.height,
    durationMs: typeof media.durationSec === 'number' ? Math.max(0, Math.round(media.durationSec * 1000)) : undefined,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    createdAt: getCreatedAt(media, persist),
  };
}

export function resolveLinghuiMediaAssetSource(
  media?: LinghuiMediaItem,
  options?: {
    kind?: StoredMediaAsset['kind'];
    sourceOverride?: string;
    usePersist?: boolean;
  },
): MediaAssetSource | undefined {
  if (!media) return undefined;

  const stored = buildLinghuiStoredMediaAsset(media, options);
  if (stored) {
    return stored;
  }

  const source = normalizeText(options?.sourceOverride ?? media.source);
  return source;
}

export function getLinghuiSourceDisplayValue(source?: LinghuiVisualAssetSource): string | undefined {
  if (!source) return undefined;
  if (typeof source === 'string') {
    return normalizeText(source);
  }
  if ('transport' in source && 'value' in source) {
    return normalizeText(source.value);
  }
  return normalizeText(source.remoteUrl) ?? normalizeText(source.localPath);
}

export function buildLinghuiVisualSourceKey(source?: LinghuiVisualAssetSource): string {
  if (!source) return '';
  if (typeof source === 'string') return source.trim();
  if ('transport' in source && 'value' in source) {
    return `${source.transport}:${source.value}`;
  }
  return source.remoteUrl || source.localPath || JSON.stringify(source);
}
