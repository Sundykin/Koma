import type { ProviderAssetInput, StoredMediaAsset } from '../types';
import {
  getMediaAssetSource,
  isBlobUri,
  isDataUri,
  isRemoteMediaUri,
} from '../types';
import { electronService } from './electronService';

export interface ResolveProviderAssetInputOptions {
  preferLocalFile?: boolean;
}

function inferMimeTypeFromSource(source: string, fallback = 'application/octet-stream'): string {
  if (source.startsWith('data:')) {
    const mime = source.slice(5, source.indexOf(';'));
    return mime || fallback;
  }

  const ext = source.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    default:
      return fallback;
  }
}

function toDataUrl(bytes: Uint8Array, mimeType: string): string {
  const binary = Array.from(bytes)
    .map(byte => String.fromCharCode(byte))
    .join('');
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export async function resolveProviderAssetInput(
  source: string | StoredMediaAsset | undefined,
  options?: ResolveProviderAssetInputOptions,
): Promise<ProviderAssetInput | undefined> {
  const candidates = typeof source === 'string'
    ? [source]
    : options?.preferLocalFile
      ? [
          getMediaAssetSource(source),
          source.remoteUrl && isRemoteMediaUri(source.remoteUrl) ? source.remoteUrl : undefined,
        ]
      : [
          source.remoteUrl && isRemoteMediaUri(source.remoteUrl) ? source.remoteUrl : undefined,
          getMediaAssetSource(source),
        ];

  const visited = new Set<string>();

  for (const resolved of candidates) {
    if (!resolved || visited.has(resolved)) {
      continue;
    }
    visited.add(resolved);

    if (isRemoteMediaUri(resolved)) {
      return {
        transport: 'remote-url',
        value: resolved,
        mimeType: typeof source === 'string' ? inferMimeTypeFromSource(resolved) : source?.mimeType,
      };
    }

    if (isDataUri(resolved)) {
      return {
        transport: 'data-url',
        value: resolved,
        mimeType: typeof source === 'string' ? inferMimeTypeFromSource(resolved) : source?.mimeType,
      };
    }

    if (isBlobUri(resolved)) {
      const response = await fetch(resolved);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const mimeType = response.headers.get('content-type') || 'application/octet-stream';
      return {
        transport: 'data-url',
        value: toDataUrl(bytes, mimeType),
        mimeType,
      };
    }

    if (!electronService.isElectron()) {
      continue;
    }

    const exists = await electronService.fs.exists(resolved);
    if (!exists) {
      continue;
    }

    const base64 = await electronService.fs.readFileAsBase64(resolved);
    const mimeType = typeof source === 'string'
      ? inferMimeTypeFromSource(resolved)
      : source?.mimeType || inferMimeTypeFromSource(resolved);

    return {
      transport: 'data-url',
      value: `data:${mimeType};base64,${base64}`,
      mimeType,
    };
  }

  return undefined;
}

export async function resolveProviderAssetInputs(
  sources: Array<string | StoredMediaAsset | undefined>,
  options?: ResolveProviderAssetInputOptions,
): Promise<ProviderAssetInput[]> {
  const resolved = await Promise.all(sources.map(source => resolveProviderAssetInput(source, options)));
  return resolved.filter(Boolean) as ProviderAssetInput[];
}
