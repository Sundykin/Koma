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
 */
export async function downloadRemoteAsset(
  url: string,
  localPath: string
): Promise<DownloadResult> {
  if (!electronService.isElectron()) {
    return { success: false, error: '仅支持 Electron 环境' };
  }

  try {
    logger.info(`开始下载: ${url} -> ${localPath}`);

    // 确保目标目录存在
    const dir = localPath.substring(0, localPath.lastIndexOf('/'));
    await electronService.fs.mkdir(dir);

    // 使用 fetch 下载
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // 写入文件
    await electronService.fs.writeFileBuffer(localPath, buffer);

    logger.info(`下载完成: ${localPath}`);
    return { success: true, localPath };
  } catch (err: any) {
    logger.error(`下载失败: ${url}`, { error: err.message });
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
