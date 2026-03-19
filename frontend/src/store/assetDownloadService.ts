/**
 * 远程资产下载服务
 * 下载远程 API 返回的图片/视频到本地存储
 */
import { electronService } from '../services/electronService';
import { createLogger } from './logger';

const logger = createLogger('AssetDownload');

export interface DownloadResult {
  success: boolean;
  localPath?: string;
  error?: string;
}

/**
 * 下载远程资产到本地
 * 通过 IPC 在主进程下载，绕过 CORS 限制
 */
export async function downloadRemoteAsset(
  url: string,
  localPath: string
): Promise<DownloadResult> {
  if (!electronService.isElectron()) {
    return { success: false, error: '仅支持 Electron 环境' };
  }

  try {
    logger.info(`开始下载: ${url.startsWith('data:') ? 'data:image/...(base64)' : url} -> ${localPath}`);

    // 确保目标目录存在
    const dir = localPath.substring(0, localPath.lastIndexOf('/'));
    await electronService.fs.mkdir(dir);

    if (url.startsWith('data:')) {
      // data URL 模式（base64）：直接写入文件
      const base64Data = url.replace(/^data:image\/\w+;base64,/, '');
      await electronService.fs.writeFile(localPath, base64Data, true);
      logger.info(`base64 写入完成: ${localPath}`);
      return { success: true, localPath };
    }

    // 通过 IPC 调用主进程下载，绕过 CORS
    const result = await electronService.fs.downloadFile(url, localPath);

    if (!result.success) {
      throw new Error('下载失败');
    }

    logger.info(`下载完成: ${localPath}, 大小: ${result.size} bytes`);
    return { success: true, localPath };
  } catch (err: any) {
    logger.error(`下载失败: ${url.startsWith('data:') ? 'data:image/...' : url}`, { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * 下载图片资产
 */
export async function downloadImageAsset(
  url: string,
  projectPath: string,
  targetType: 'character' | 'scene' | 'prop',
  targetId: string,
  filename: string
): Promise<DownloadResult> {
  const localPath = `${projectPath}/assets/${targetType}s/${targetId}/${filename}`;
  return downloadRemoteAsset(url, localPath);
}

/**
 * 下载视频资产
 */
export async function downloadVideoAsset(
  url: string,
  projectPath: string,
  targetType: 'character' | 'shot',
  targetId: string,
  filename: string
): Promise<DownloadResult> {
  const localPath = `${projectPath}/assets/${targetType}s/${targetId}/${filename}`;
  return downloadRemoteAsset(url, localPath);
}

/**
 * 检查本地文件是否存在
 */
export async function checkLocalAsset(localPath: string): Promise<boolean> {
  if (!electronService.isElectron()) return false;
  return electronService.fs.exists(localPath);
}

/**
 * 获取可用的资产路径（优先本地，备用远程）
 */
export async function getAssetPath(
  localPath?: string,
  remoteUrl?: string
): Promise<string | null> {
  if (localPath) {
    const exists = await checkLocalAsset(localPath);
    if (exists) return localPath;
  }
  return remoteUrl || null;
}

/**
 * 将图片源解析为远程 API 可用的格式（URL 或 data URI）
 * - http/https URL → 直接返回
 * - data: URI → 直接返回
 * - 本地文件路径 → 读取文件并转为 data URI
 * - 空值 → 返回 undefined
 *
 * 用于 ITV 等远程 API 调用前，确保 image_url 参数合法
 */
export async function resolveImageSourceForAPI(
  source?: string
): Promise<string | undefined> {
  if (!source) return undefined;

  // 已经是远程 URL
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return source;
  }

  // 已经是 data URI
  if (source.startsWith('data:')) {
    return source;
  }

  // 本地文件路径 → 读取并转为 data URI
  if (!electronService.isElectron()) return undefined;

  try {
    const exists = await electronService.fs.exists(source);
    if (!exists) {
      logger.warn(`本地文件不存在，跳过: ${source}`);
      return undefined;
    }

    const base64 = await electronService.fs.readFileAsBase64(source);
    // 根据扩展名推断 MIME 类型
    const ext = source.split('.').pop()?.toLowerCase() || 'png';
    const mimeMap: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'bmp': 'image/bmp',
    };
    const mime = mimeMap[ext] || 'image/png';
    logger.info(`本地文件转 data URI: ${source} (${mime})`);
    return `data:${mime};base64,${base64}`;
  } catch (err: any) {
    logger.warn(`读取本地文件失败: ${source}`, { error: err.message });
    return undefined;
  }
}
