import type {
  MediaKind,
  MediaOwnerRef,
  StoredMediaAsset,
} from '../types';
import {
  getMediaAssetSource,
  isBlobUri,
  isDataUri,
  isRemoteMediaUri,
} from '../types';
import { electronService, fsWriteFileBuffer } from './electronService';
import { getProjectPath } from '../store/project/core';

interface PersistMediaParams {
  projectId: string;
  kind: MediaKind;
  source: string | StoredMediaAsset;
  destPath?: string;
  ownerRef?: MediaOwnerRef;
  mimeType?: string;
  provider?: string;
  providerTaskId?: string;
  metadata?: Record<string, unknown>;
}

function getExtension(kind: MediaKind, mimeType?: string, source?: string): string {
  const lower = mimeType?.toLowerCase();
  if (lower === 'image/jpeg') return 'jpg';
  if (lower === 'image/png') return 'png';
  if (lower === 'image/webp') return 'webp';
  if (lower === 'video/mp4') return 'mp4';
  if (lower === 'video/quicktime') return 'mov';
  if (lower === 'audio/mpeg') return 'mp3';
  if (lower === 'audio/wav') return 'wav';

  const ext = source?.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext) return ext;

  switch (kind) {
    case 'image':
      return 'png';
    case 'video':
      return 'mp4';
    case 'audio':
      return 'mp3';
    default:
      return 'bin';
  }
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  const idx = filePath.lastIndexOf('/');
  if (idx === -1) return;
  await electronService.fs.mkdir(filePath.slice(0, idx));
}

async function buildDefaultDestPath(
  projectId: string,
  kind: MediaKind,
  ownerRef?: MediaOwnerRef,
  source?: string,
  mimeType?: string
): Promise<string> {
  const projectPath = await getProjectPath(projectId);
  const extension = getExtension(kind, mimeType, source);

  if (ownerRef?.ownerType === 'shot-version' && ownerRef.versionId) {
    return `${projectPath}/shots/${ownerRef.ownerId}/versions/${ownerRef.versionId}/${ownerRef.slot}.${extension}`;
  }

  if (ownerRef) {
    const folder = ownerRef.ownerType === 'scene'
      ? 'scenes'
      : ownerRef.ownerType === 'prop'
        ? 'props'
        : ownerRef.ownerType === 'character'
          ? 'characters'
          : `${ownerRef.ownerType}s`;

    return `${projectPath}/assets/${folder}/${ownerRef.ownerId}/${ownerRef.slot}.${extension}`;
  }

  return `${projectPath}/assets/generated/${kind}/${Date.now()}.${extension}`;
}

function stripDataHeader(dataUrl: string): string {
  const index = dataUrl.indexOf(',');
  return index >= 0 ? dataUrl.slice(index + 1) : dataUrl;
}

export async function persistMediaAsset({
  projectId,
  kind,
  source,
  destPath,
  ownerRef,
  mimeType,
  provider,
  providerTaskId,
  metadata,
}: PersistMediaParams): Promise<StoredMediaAsset> {
  if (!electronService.isElectron()) {
    throw new Error('仅支持 Electron 环境');
  }

  const assetSource = typeof source === 'string' ? source : getMediaAssetSource(source);
  if (!assetSource) {
    throw new Error('缺少可持久化的媒体来源');
  }

  const finalMimeType = mimeType || (typeof source === 'string' ? undefined : source.mimeType);
  const targetPath = destPath || await buildDefaultDestPath(projectId, kind, ownerRef, assetSource, finalMimeType);

  await ensureParentDirectory(targetPath);

  if (isRemoteMediaUri(assetSource)) {
    await electronService.fs.downloadFile(assetSource, targetPath);
  } else if (isDataUri(assetSource)) {
    await electronService.fs.writeFile(targetPath, stripDataHeader(assetSource), true);
  } else if (isBlobUri(assetSource)) {
    const response = await fetch(assetSource);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await fsWriteFileBuffer(targetPath, bytes);
  } else {
    await electronService.fs.copy(assetSource, targetPath);
  }

  return {
    kind,
    localPath: targetPath,
    remoteUrl: typeof source === 'string'
      ? (isRemoteMediaUri(source) ? source : undefined)
      : source.remoteUrl,
    mimeType: finalMimeType || (typeof source === 'string' ? undefined : source.mimeType),
    provider: provider || (typeof source === 'string' ? undefined : source.provider),
    providerTaskId: providerTaskId || (typeof source === 'string' ? undefined : source.providerTaskId),
    width: typeof source === 'string' ? undefined : source.width,
    height: typeof source === 'string' ? undefined : source.height,
    durationMs: typeof source === 'string' ? undefined : source.durationMs,
    fps: typeof source === 'string' ? undefined : source.fps,
    metadata: {
      ...(typeof source === 'string' ? undefined : source.metadata),
      ...metadata,
    },
    createdAt: Date.now(),
  };
}
