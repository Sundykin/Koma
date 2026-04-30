import * as fs from 'fs';
import * as path from 'path';
import { validateUrl } from '../url-validator';

function getExtensionFromPath(filePath: string, fallback = 'png'): string {
  const match = filePath.match(/\.([a-zA-Z0-9]+)(?:$|\?)/);
  return match?.[1]?.toLowerCase() || fallback;
}

function getExtensionFromMimeType(mimeType: string | undefined, fallback = 'bin'): string {
  switch ((mimeType || '').toLowerCase()) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'video/mp4':
      return 'mp4';
    case 'video/webm':
      return 'webm';
    case 'video/quicktime':
      return 'mov';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/wav':
      return 'wav';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/aac':
      return 'aac';
    case 'audio/flac':
      return 'flac';
    case 'text/plain':
      return 'txt';
    case 'application/json':
      return 'json';
    default:
      return fallback;
  }
}

// 与前端 utils/urlUtils.ts 严格对称：唯一规范 koma-local://files/<encoded path>。
// 不接受其它格式（无兼容）。
function decodeKomaLocalSource(source: string): string {
  if (!source.startsWith('koma-local://files/')) return source;
  const tail = source.slice('koma-local://files'.length); // '/Users/...' 或 '/C:/...'
  let decoded: string;
  try {
    decoded = decodeURIComponent(tail);
  } catch {
    decoded = tail;
  }
  if (/^\/[a-zA-Z]:\//.test(decoded)) return decoded.slice(1);
  return decoded;
}

function getRawAssetSource(source?: string): string {
  if (!source) return '';
  if (source.startsWith('koma-local://')) {
    return decodeKomaLocalSource(source);
  }
  return source;
}

async function downloadRemoteFile(url: string, destPath: string): Promise<void> {
  await validateUrl(url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载失败: HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  await fs.promises.writeFile(destPath, Buffer.from(arrayBuffer));
}

export async function materializeLinghuiSource(params: {
  assetDir: string;
  filename: string;
  source?: string;
  fallbackExt: string;
  mimeType?: string;
}): Promise<string | undefined> {
  const rawSource = getRawAssetSource(String(params.source ?? '').trim());
  if (!rawSource) return undefined;

  await fs.promises.mkdir(params.assetDir, { recursive: true });

  if (rawSource.startsWith('data:')) {
    const match = rawSource.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return rawSource;
    }
    const ext = getExtensionFromMimeType(match[1], params.fallbackExt);
    const targetPath = path.join(params.assetDir, `${params.filename}.${ext}`);
    await fs.promises.writeFile(targetPath, Buffer.from(match[2], 'base64'));
    return targetPath;
  }

  if (rawSource.startsWith('http://') || rawSource.startsWith('https://')) {
    const ext = getExtensionFromPath(rawSource, getExtensionFromMimeType(params.mimeType, params.fallbackExt));
    const targetPath = path.join(params.assetDir, `${params.filename}.${ext}`);
    await downloadRemoteFile(rawSource, targetPath);
    return targetPath;
  }

  if (rawSource.startsWith('blob:')) {
    throw new Error('当前资源为浏览器临时 blob 链接，请先转换为本地文件后再保存');
  }

  const ext = getExtensionFromPath(rawSource, getExtensionFromMimeType(params.mimeType, params.fallbackExt));
  const targetPath = path.join(params.assetDir, `${params.filename}.${ext}`);
  if (path.resolve(rawSource) === path.resolve(targetPath)) {
    return targetPath;
  }
  await fs.promises.copyFile(rawSource, targetPath);
  return targetPath;
}

export async function copyLinghuiWorkspaceAsset(params: {
  workspaceDir: string;
  sourcePath: string;
  filenameHint?: string;
}): Promise<string> {
  const ext = getExtensionFromPath(params.filenameHint || params.sourcePath);
  const baseName = (params.filenameHint || params.sourcePath)
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]+$/, '')
    ?.replace(/[\\/:*?"<>|\s]+/g, '-')
    ?.replace(/-+/g, '-')
    ?.replace(/^-|-$/g, '') || 'reference';
  const assetDir = path.join(params.workspaceDir, 'assets', 'references');
  const targetPath = path.join(assetDir, `${Date.now()}-${baseName}.${ext}`);

  await fs.promises.mkdir(assetDir, { recursive: true });
  await fs.promises.copyFile(params.sourcePath, targetPath);
  return targetPath;
}
