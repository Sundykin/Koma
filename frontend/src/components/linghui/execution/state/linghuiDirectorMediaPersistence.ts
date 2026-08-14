import { persistMediaAsset } from '../../../../services/mediaPersistenceService';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';

/**
 * 把 director3d / panorama 编辑器写到 properties 的 PNG dataUrl 落盘成 koma-local URL。
 *
 * 为什么必须落盘：
 *  - 视频 provider 多数要求文件路径，dataUrl 直接 fail
 *  - 工作区文档存 base64 字符串会撑爆 IndexedDB（一张 1280px lineart ≈ 500KB）
 *
 * 落盘失败（非 Electron / 写盘异常）时回退到原 dataUrl，保证不阻塞用户。
 */
export async function persistDirectorMediaSource(params: {
  source: string;
  nodeId: string;
  slot: string;
  mimeType?: string;
}): Promise<string> {
  const { source, nodeId, slot, mimeType = 'image/png' } = params;
  if (!source || !source.startsWith('data:')) {
    return source;
  }
  try {
    const stored = await persistMediaAsset({
      projectId: 'linghui',
      kind: 'image',
      source,
      mimeType,
      provider: 'director3d-local',
      metadata: { nodeId, slot, origin: 'director3d-capture' },
    });
    if (stored.localPath) {
      // toFileSystemDisplayUrl 把绝对路径转 koma-local://files/...
      return toFileSystemDisplayUrl(stored.localPath) ?? stored.localPath;
    }
    return source;
  } catch {
    // 在非 Electron 环境 / 写盘异常时静默回退
    return source;
  }
}
