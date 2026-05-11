/**
 * 全局资产参考图上传 helper。
 *
 * 用户在"存到全局库"流程里选 1-3 张参考图：
 *   electron dialog 选本地文件 → persistMediaAsset 落盘到全局资产目录 →
 *   返回 koma-local URL 数组，写入 globalAsset.referenceImages。
 *
 * 仅在桌面端可用；浏览器环境抛错让上层 toast 提示。
 */
import { electronService } from '../../../services/electronService';
import { persistMediaAsset } from '../../../services/mediaPersistenceService';
import { toFileSystemDisplayUrl } from '../../../services/fileSystemPort';

export interface PickReferenceImagesOptions {
  /** 最多允许选几张（默认 3） */
  maxCount?: number;
  /** 写盘归属：用于 metadata 标识来源 */
  assetIdHint?: string;
}

export async function pickReferenceImagesAndPersist(options: PickReferenceImagesOptions = {}): Promise<string[]> {
  if (!electronService.isElectron()) {
    throw new Error('参考图上传仅在桌面端可用');
  }
  const maxCount = Math.max(1, Math.min(8, options.maxCount ?? 3));

  const result = await electronService.dialog.openFile({
    title: `选择参考图（最多 ${maxCount} 张）`,
    multiple: true,
    filters: [
      { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }

  const filesToImport = result.filePaths.slice(0, maxCount);
  const persistedUrls: string[] = [];

  for (const filePath of filesToImport) {
    try {
      const stored = await persistMediaAsset({
        projectId: 'linghui',
        kind: 'image',
        source: filePath,
        provider: 'global-asset-reference',
        metadata: {
          origin: 'global-asset-reference',
          assetIdHint: options.assetIdHint,
        },
      });
      if (stored.localPath) {
        const url = toFileSystemDisplayUrl(stored.localPath) ?? stored.localPath;
        persistedUrls.push(url);
      }
    } catch {
      // 单张失败不影响其他，继续下一张
    }
  }

  return persistedUrls;
}
