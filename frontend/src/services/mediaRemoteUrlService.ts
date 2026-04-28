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
import { decodeKomaLocalToFsPath } from './mediaAssetResolver';

const logger = createLogger('MediaRemoteUrl');

export type RemoteUrlPolicy = 'best-effort' | 'required';

export interface RemoteUrlUploadFailureOptions {
  /**
   * Keep the original source instead of throwing when a required image-hosting upload fails.
   * Default is false to preserve strict required behavior outside explicit fallback paths.
   */
  fallbackToSourceOnUploadFailure?: boolean;
}

function safeFilenameFromPath(path: string): string {
  if (path.startsWith('data:')) return 'image.png';
  const name = path.split(/[/\\]/).pop() || 'image.png';
  // Avoid accidentally persisting huge data-url strings as a "filename".
  if (name.startsWith('data:')) return 'image.png';
  return name.length > 200 ? 'image.png' : name;
}

function appendIndexToFilename(filename: string, index: number): string {
  const safe = filename || 'image.png';
  const dot = safe.lastIndexOf('.');
  if (dot <= 0) {
    return `${safe}-${index + 1}`;
  }
  return `${safe.slice(0, dot)}-${index + 1}${safe.slice(dot)}`;
}

function inferFilenameHintFromSource(
  source: MediaAssetSource | ProviderAssetInput | undefined,
): string {
  if (!source) {
    return 'image.png';
  }
  if (typeof source === 'object' && 'value' in source) {
    return safeFilenameFromPath(source.value);
  }
  if (typeof source === 'object') {
    return safeFilenameFromPath(String(source.localPath || source.remoteUrl || 'image.png'));
  }
  return safeFilenameFromPath(source);
}

function stringifyUploadError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function uploadImageBytesToRemoteUrl(
  bytes: Uint8Array,
  filename: string,
  policy: RemoteUrlPolicy,
  options?: RemoteUrlUploadFailureOptions
): Promise<string | undefined> {
  logger.info('开始上传图片到图床', {
    filename,
    bytes: bytes.byteLength,
    policy,
  });
  let result: Awaited<ReturnType<typeof uploadBytesToImageHostingWithRetry>>;
  try {
    result = await uploadBytesToImageHostingWithRetry(bytes, { filename });
  } catch (error: unknown) {
    if (policy === 'required' && options?.fallbackToSourceOnUploadFailure) {
      logger.warn('图床 required 上传失败，已按方案 B fallback 到 data-url', {
        filename,
        policy,
        error: stringifyUploadError(error),
      });
      return undefined;
    }
    throw error;
  }

  if (result.success && result.url) {
    logger.info('图片上传到图床成功', {
      filename,
      policy,
      remoteUrl: result.url,
    });
    return result.url;
  }

  if (policy === 'required') {
    if (options?.fallbackToSourceOnUploadFailure) {
      logger.warn('图床 required 上传失败，已按方案 B fallback 到 data-url', {
        filename,
        policy,
        error: result.error || '图床上传失败',
      });
      return undefined;
    }
    throw new Error(result.error || '图床上传失败');
  }

  logger.warn('图床上传失败 (best-effort)', { error: result.error });
  return undefined;
}

async function readBytesFromLocalFile(path: string): Promise<Uint8Array> {
  if (!electronService.isElectron()) {
    throw new Error('不支持的环境（需要 Electron）');
  }

  // 上游产物可能是 `koma-local://...` 显示 URL，先还原为真实文件系统路径。
  const fsPath = decodeKomaLocalToFsPath(path);

  const exists = await electronService.fs.exists(fsPath);
  if (!exists) {
    throw new Error(`本地文件不存在: ${fsPath}`);
  }

  const base64 = await electronService.fs.readFileAsBase64(fsPath);
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
} & RemoteUrlUploadFailureOptions): Promise<StoredMediaAsset> {
  const { asset, policy, filenameHint, fallbackToSourceOnUploadFailure } = params;

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
  const remoteUrl = await uploadImageBytesToRemoteUrl(bytes, filename, policy, {
    fallbackToSourceOnUploadFailure,
  });
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
} & RemoteUrlUploadFailureOptions): Promise<MediaAssetSource | ProviderAssetInput | undefined> {
  const { source, policy, filenameHint, fallbackToSourceOnUploadFailure } = params;
  if (!source) return undefined;

  // Provider boundary input
  if (typeof source === 'object' && 'transport' in source && 'value' in source) {
    if (source.transport === 'remote-url') return source;
    // data-url -> remote-url
    const bytes = await readBytesFromDataUrl(source.value);
    const filename = filenameHint || 'image.png';
    const remoteUrl = await uploadImageBytesToRemoteUrl(bytes, filename, policy, {
      fallbackToSourceOnUploadFailure,
    });
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
      fallbackToSourceOnUploadFailure,
    });
  }

  // string source
  if (isRemoteMediaUri(source)) return source;

  const bytes = isDataUri(source)
    ? await readBytesFromDataUrl(source)
    : await readBytesFromLocalFile(source);

  const filename = filenameHint || safeFilenameFromPath(source);
  const remoteUrl = await uploadImageBytesToRemoteUrl(bytes, filename, policy, {
    fallbackToSourceOnUploadFailure,
  });
  return remoteUrl || source;
}

export async function ensureRemoteUrlForImageSources(params: {
  projectId: string;
  sources: Array<MediaAssetSource | ProviderAssetInput | undefined>;
  policy: RemoteUrlPolicy;
  filenameHint?: string;
} & RemoteUrlUploadFailureOptions): Promise<Array<MediaAssetSource | ProviderAssetInput | undefined>> {
  const { sources, ...rest } = params;
  const results: Array<MediaAssetSource | ProviderAssetInput | undefined> = [];

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const indexedFilenameHint = appendIndexToFilename(
      rest.filenameHint || inferFilenameHintFromSource(source),
      index,
    );
    logger.info('准备归一化图片远程地址', {
      index,
      policy: rest.policy,
      filenameHint: indexedFilenameHint,
    });
    const normalized = await ensureRemoteUrlForImageSource({
      ...rest,
      source,
      filenameHint: indexedFilenameHint,
    });
    results.push(normalized);
  }

  return results;
}
