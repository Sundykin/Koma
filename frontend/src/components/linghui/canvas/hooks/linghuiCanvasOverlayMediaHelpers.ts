import { nanoid } from 'nanoid';
import type {
  LinghuiGridType,
  LinghuiImageAssetItem,
  LinghuiMediaItem,
  LinghuiNodeRunState,
} from '../../../../types/linghui';
import {
  getLinghuiResultItems,
  getLinghuiResultPrimaryMedia,
} from '../../../../types/linghui';
import { getLinghuiWorkspaceDir } from '../../../../store/linghuiStorage';
import { getFileSystemPort, toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import { base64ToBytes, parseDataUrl, stripDataHeader } from '../../../../utils/encoding';
import { fromKomaLocalUrl } from '../../../../utils/urlUtils';
import { resolveImageAspectRatioLabel } from '../../editors/state/linghuiImageCollections';

export const GRID_SPLIT_SIZE_MAP: Record<Exclude<LinghuiGridType, 'none'>, 2 | 3 | 4 | 5> = {
  '2x2': 2,
  '3x3': 3,
  '4x4': 4,
  '5x5': 5,
};

export const decodeLinghuiLocalSource = fromKomaLocalUrl;

export function mergePromptSnippet(currentPrompt: string, snippet: string): string {
  const normalizedCurrent = currentPrompt.trim();
  const normalizedSnippet = snippet.trim();
  if (!normalizedSnippet) return normalizedCurrent;
  if (normalizedCurrent.includes(normalizedSnippet)) return normalizedCurrent;
  return normalizedCurrent ? `${normalizedCurrent}\n${normalizedSnippet}` : normalizedSnippet;
}

export function sanitizeAssetBaseName(label: string, fallback: string): string {
  return String(label || fallback)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    || fallback;
}

export function imageMediaToAssetItem(media: LinghuiMediaItem, index: number): LinghuiImageAssetItem | null {
  if (media.kind !== 'image') {
    return null;
  }

  const source = String(media.source ?? '').trim();
  if (!source) {
    return null;
  }

  return {
    id: `media:${source}`,
    source,
    label: media.label || `图片 ${index + 1}`,
    width: media.width,
    height: media.height,
    mimeType: media.mimeType,
    aspectRatio: resolveMediaAspectRatio(media),
  };
}

export function collectVideoItemsFromResult(runState?: LinghuiNodeRunState): LinghuiMediaItem[] {
  const result = runState?.result;
  if (!result) {
    return [];
  }

  const items: LinghuiMediaItem[] = [];
  const primary = getLinghuiResultPrimaryMedia(result);
  if (primary?.kind === 'video') {
    items.push(primary);
  }
  items.push(...getLinghuiResultItems(result).filter(item => item.kind === 'video'));

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.source ?? ''}|${item.posterSource ?? ''}`;
    if (!key.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isLocalVideoSourceForAudioSplit(source?: string): boolean {
  const videoSource = decodeLinghuiLocalSource(String(source ?? '').trim());
  return Boolean(videoSource) && (
    !videoSource.startsWith('http://') &&
    !videoSource.startsWith('https://') &&
    !videoSource.startsWith('data:') &&
    !videoSource.startsWith('blob:')
  );
}

export function uniqueVideoItems(items: LinghuiMediaItem[]): LinghuiMediaItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (item.kind !== 'video') return false;
    const key = `${item.source ?? ''}|${item.posterSource ?? ''}`;
    if (!key.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function writeTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('当前环境不支持剪贴板');
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    const copied = document.execCommand('copy');
    if (!copied) {
      throw new Error('复制失败');
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

export async function writeImageToClipboard(source: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('当前环境不支持复制图片');
  }

  const ClipboardItemCtor = getClipboardItemConstructor();
  if (!ClipboardItemCtor) {
    throw new Error('当前环境不支持复制图片');
  }

  const sourceBlob = await readImageBlobFromSource(source);
  const imageBlob = await normalizeImageBlobForClipboard(sourceBlob);
  await navigator.clipboard.write([
    new ClipboardItemCtor({ 'image/png': imageBlob }),
  ]);
}

export async function materializeGridSplitInputSource(params: {
  source: string;
  workspaceId: string;
  baseName: string;
}): Promise<string> {
  const { source, workspaceId, baseName } = params;
  const fileSystemPort = getFileSystemPort();
  const trimmedSource = String(source).trim();
  if (!trimmedSource) {
    throw new Error('缺少可拆分的图片');
  }

  if (trimmedSource.startsWith('koma-local://')) {
    return decodeLinghuiLocalSource(trimmedSource);
  }

  if (
    !trimmedSource.startsWith('http://') &&
    !trimmedSource.startsWith('https://') &&
    !trimmedSource.startsWith('data:') &&
    !trimmedSource.startsWith('blob:')
  ) {
    return trimmedSource;
  }

  const workspaceDir = await getLinghuiWorkspaceDir(workspaceId);
  const inputDir = `${workspaceDir}/assets/grid-split-sources`;
  await fileSystemPort.mkdir(inputDir);

  if (trimmedSource.startsWith('http://') || trimmedSource.startsWith('https://')) {
    const ext = getFileExtension(trimmedSource, 'png');
    const inputPath = `${inputDir}/${Date.now()}-${baseName}.${ext}`;
    await fileSystemPort.download(trimmedSource, inputPath);
    return inputPath;
  }

  if (trimmedSource.startsWith('data:')) {
    const { mimeType, base64 } = stripDataHeader(trimmedSource);
    const ext = getExtensionFromMimeType(mimeType, 'png');
    const inputPath = `${inputDir}/${Date.now()}-${baseName}.${ext}`;
    await fileSystemPort.writeBase64(inputPath, base64);
    return inputPath;
  }

  const response = await fetch(trimmedSource);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const ext = getExtensionFromMimeType(response.headers.get('content-type') ?? undefined, 'png');
  const inputPath = `${inputDir}/${Date.now()}-${baseName}.${ext}`;
  await fileSystemPort.writeBytes(inputPath, bytes);
  return inputPath;
}

export async function createLinghuiImageAssetItemFromSource(params: {
  source: string;
  label: string;
}): Promise<LinghuiImageAssetItem> {
  const previewSource = getPreviewSource(params.source);
  const metadata = await new Promise<{ width?: number; height?: number; aspectRatio?: string }>(resolve => {
    const image = new Image();
    image.onload = () => resolve({
      width: image.naturalWidth,
      height: image.naturalHeight,
      aspectRatio: resolveImageAspectRatioLabel(image.naturalWidth, image.naturalHeight),
    });
    image.onerror = () => resolve({});
    image.src = previewSource;
  });

  return {
    id: nanoid(10),
    source: params.source,
    label: params.label,
    width: metadata.width,
    height: metadata.height,
    aspectRatio: metadata.aspectRatio,
  };
}

function getPreviewSource(source?: string): string {
  return toFileSystemDisplayUrl(source) || '';
}

function getFileExtension(source: string, fallback = 'png'): string {
  const normalized = decodeLinghuiLocalSource(source).split('?')[0].split('#')[0];
  const matched = normalized.match(/\.([a-zA-Z0-9]+)$/);
  if (!matched?.[1]) {
    return fallback;
  }
  const ext = matched[1].toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
}

function getExtensionFromMimeType(mimeType?: string, fallback = 'png'): string {
  const normalized = String(mimeType ?? '').toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  return fallback;
}

function resolveMediaAspectRatio(media: LinghuiMediaItem): string | undefined {
  const metadata = media.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const aspectRatio = (metadata as Record<string, unknown>).aspectRatio;
    if (typeof aspectRatio === 'string' && aspectRatio.trim()) {
      return aspectRatio.trim();
    }
  }
  return resolveImageAspectRatioLabel(media.width, media.height);
}

function inferImageClipboardMimeType(source: string): string {
  const normalized = source.split('?')[0].split('#')[0].toLowerCase();
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.gif')) return 'image/gif';
  return 'image/png';
}

function getClipboardItemConstructor(): typeof ClipboardItem | undefined {
  if (typeof ClipboardItem !== 'undefined') {
    return ClipboardItem;
  }
  const globalClipboardItem = (globalThis as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
  return globalClipboardItem;
}

async function readImageBlobFromSource(source: string): Promise<Blob> {
  const trimmedSource = source.trim();
  if (!trimmedSource) {
    throw new Error('缺少可复制的图片');
  }

  if (trimmedSource.startsWith('data:')) {
    const { mimeType, bytes } = parseDataUrl(trimmedSource);
    return new Blob([bytes], { type: mimeType || 'image/png' });
  }

  if (trimmedSource.startsWith('http://') || trimmedSource.startsWith('https://') || trimmedSource.startsWith('blob:')) {
    const response = await fetch(trimmedSource);
    if (!response.ok) {
      throw new Error('图片读取失败');
    }
    return response.blob();
  }

  const localPath = decodeLinghuiLocalSource(trimmedSource);
  const base64 = await getFileSystemPort().readBase64(localPath);
  return new Blob([base64ToBytes(base64)], { type: inferImageClipboardMimeType(localPath) });
}

async function normalizeImageBlobForClipboard(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') {
    return blob;
  }

  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('无法创建图片复制画布');
    }
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        nextBlob ? resolve(nextBlob) : reject(new Error('图片转换失败'));
      }, 'image/png');
    });
  } finally {
    bitmap.close();
  }
}
