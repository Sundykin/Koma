import { electronService } from '../../../../services/electronService';
import { stripDataHeader } from '../../../../utils/encoding';
import { fromKomaLocalUrl } from '../../../../utils/urlUtils';

const decodeLinghuiSource = fromKomaLocalUrl;

export function sanitizeFileSegment(value: string, fallback: string): string {
  const normalized = value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ');
  return normalized || fallback;
}

function isRemoteMediaUri(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

function isDataUri(source: string): boolean {
  return /^data:/i.test(source);
}

function isBlobUri(source: string): boolean {
  return /^blob:/i.test(source);
}

function getFileExtensionFromMimeType(mimeType?: string, fallback = 'png'): string {
  if (!mimeType) {
    return fallback;
  }

  const normalized = mimeType.toLowerCase();
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('bmp')) return 'bmp';
  if (normalized.includes('tiff')) return 'tiff';
  return fallback;
}

export function getFileExtensionFromSource(source: string, mimeType?: string): string {
  const normalized = decodeLinghuiSource(source);
  const matched = normalized.match(/\.([a-zA-Z0-9]+)(?:$|[?#])/);
  if (matched?.[1]) {
    return matched[1].toLowerCase();
  }
  return getFileExtensionFromMimeType(mimeType, 'png');
}

export async function writeImageSourceToPath(source: string, targetPath: string): Promise<void> {
  const normalized = decodeLinghuiSource(source);

  if (isRemoteMediaUri(normalized)) {
    await electronService.fs.downloadFile(normalized, targetPath);
    return;
  }

  if (isDataUri(normalized)) {
    await electronService.fs.writeFile(targetPath, stripDataHeader(normalized).base64, true);
    return;
  }

  if (isBlobUri(normalized)) {
    const response = await fetch(normalized);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await electronService.fs.writeFileBuffer(targetPath, bytes);
    return;
  }

  await electronService.fs.copy(normalized, targetPath);
}
