/**
 * Remote URL normalization for image assets and sources.
 *
 * Motivation:
 * - Remote providers (especially ITV) typically cannot access local file paths.
 * - Some providers return base64/data-url outputs; after landing on disk we still need a remote URL
 *   for future referencing (tti refs / itv primary+refs).
 *
 * Design:
 * - Keep conversion logic centralized here.
 * - Keep resolver (mediaAssetResolver) pure: it resolves to ProviderAssetInput, it does not upload.
 */

import type { MediaAssetSource, ProviderAssetInput, StoredMediaAsset } from '../types';
import { isDataUri, isRemoteMediaUri } from '../types';
import { electronService } from './electronService';
import { createLogger } from '../store/logger';
import { uploadBytesToImageHostingWithRetry } from './imageHostingService';
import { base64ToBytes, stripDataHeader } from '../utils/encoding';

const logger = createLogger('MediaRemoteUrl');

export type RemoteUrlPolicy = 'best-effort' | 'required';

function safeFilenameFromPath(path: string): string {
  const name = path.split(/[/\\]/).pop() || 'image.png';
  // Avoid accidentally persisting huge data-url strings as a "filename".
  if (name.startsWith('data:')) return 'image.png';
  return name.length > 200 ? 'image.png' : name;
}

async function uploadImageBytesToRemoteUrl(
  bytes: Uint8Array,
  filename: string,
  policy: RemoteUrlPolicy
): Promise<string | undefined> {
  const result = await uploadBytesToImageHostingWithRetry(bytes, { filename });
  if (result.success && result.url) return result.url;

  if (policy === 'required') {
    throw new Error(result.error || '图床上传失败');
  }

  logger.warn('图床上传失败 (best-effort)', { error: result.error });
  return undefined;
}

async function readBytesFromLocalFile(path: string): Promise<Uint8Array> {
  if (!electronService.isElectron()) {
    throw new Error('不支持的环境（需要 Electron）');
  }

  const exists = await electronService.fs.exists(path);
  if (!exists) {
    throw new Error(`本地文件不存在: ${path}`);
  }

  const base64 = await electronService.fs.readFileAsBase64(path);
  return base64ToBytes(base64);
}

async function readBytesFromDataUrl(dataUrl: string): Promise<Uint8Array> {
  const { base64 } = stripDataHeader(dataUrl);
  return base64ToBytes(base64);
}

/**
 * Ensure a StoredMediaAsset has a remoteUrl if possible.
 * Only applies to image assets.
 */
export async function ensureRemoteUrlForImageAsset(params: {
  projectId: string;
  asset: StoredMediaAsset;
  policy: RemoteUrlPolicy;
  filenameHint?: string;
}): Promise<StoredMediaAsset> {
  const { asset, policy, filenameHint } = params;

  if (asset.kind !== 'image') return asset;

  if (asset.remoteUrl && isRemoteMediaUri(asset.remoteUrl)) {
    return asset;
  }

  // If someone stored a remote URL in localPath, normalize it (no upload needed).
  if (asset.localPath && isRemoteMediaUri(asset.localPath)) {
    return {
      ...asset,
      remoteUrl: asset.localPath,
    };
  }

  const source = asset.localPath;
  if (!source) {
    if (policy === 'required') {
      throw new Error('缺少可上传的图片来源（localPath 为空）');
    }
    return asset;
  }

  let bytes: Uint8Array;
  if (isDataUri(source)) {
    bytes = await readBytesFromDataUrl(source);
  } else {
    bytes = await readBytesFromLocalFile(source);
  }

  const filename = filenameHint || safeFilenameFromPath(source);
  const remoteUrl = await uploadImageBytesToRemoteUrl(bytes, filename, policy);
  if (!remoteUrl) return asset;

  return {
    ...asset,
    remoteUrl,
  };
}

/**
 * Ensure a media source is remote-url compatible for remote providers.
 *
 * For strings: returns a remote URL string if possible.
 * For ProviderAssetInput: upgrades data-url to remote-url if policy requires.
 * For StoredMediaAsset: fills remoteUrl (and returns the updated asset).
 */
export async function ensureRemoteUrlForImageSource(params: {
  projectId: string;
  source: MediaAssetSource | ProviderAssetInput | undefined;
  policy: RemoteUrlPolicy;
  filenameHint?: string;
}): Promise<MediaAssetSource | ProviderAssetInput | undefined> {
  const { source, policy, filenameHint } = params;
  if (!source) return undefined;

  // Provider boundary input
  if (typeof source === 'object' && 'transport' in source && 'value' in source) {
    if (source.transport === 'remote-url') return source;
    // data-url -> remote-url
    const bytes = await readBytesFromDataUrl(source.value);
    const filename = filenameHint || 'image.png';
    const remoteUrl = await uploadImageBytesToRemoteUrl(bytes, filename, policy);
    if (!remoteUrl) return source;
    return {
      transport: 'remote-url',
      value: remoteUrl,
      mimeType: source.mimeType,
    };
  }

  // StoredMediaAsset
  if (typeof source === 'object') {
    return ensureRemoteUrlForImageAsset({
      projectId: params.projectId,
      asset: source as StoredMediaAsset,
      policy,
      filenameHint,
    });
  }

  // string source
  if (isRemoteMediaUri(source)) return source;

  const bytes = isDataUri(source)
    ? await readBytesFromDataUrl(source)
    : await readBytesFromLocalFile(source);

  const filename = filenameHint || safeFilenameFromPath(source);
  const remoteUrl = await uploadImageBytesToRemoteUrl(bytes, filename, policy);
  return remoteUrl || source;
}

export async function ensureRemoteUrlForImageSources(params: {
  projectId: string;
  sources: Array<MediaAssetSource | ProviderAssetInput | undefined>;
  policy: RemoteUrlPolicy;
  filenameHint?: string;
}): Promise<Array<MediaAssetSource | ProviderAssetInput | undefined>> {
  const { sources, ...rest } = params;
  return Promise.all(sources.map(source => ensureRemoteUrlForImageSource({ ...rest, source })));
}

