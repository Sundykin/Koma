/**
 * 分镜宫格切分逻辑（从 ShotCard.tsx 拆出）。
 *
 * 网格模式（grid-9 / grid-4）生成的整张大图可拆成 3×3 / 2×2 子图：
 *   - 预览 modal 的分割线 / 缩放 / 落点计算（gridSplitPreviewMeta）
 *   - 确认拆分：远端图先落盘（ffmpeg 只吃本地路径）→ ffmpeg splitGridImage
 *     → 子图追加到 images 并选中第一张
 */
import { useCallback, useMemo, useState } from 'react';
import type { Shot, StoredMediaAsset } from '../../../types';
import { electronService } from '../../../services/electronService';
import { ffmpegManager } from '../../../services/ffmpegManager';
import { persistMediaAsset } from '../../../services/mediaPersistenceService';
import { getProjectPath } from '../../../store/projectStore';
import { getMediaAssetEditingSource, isRemoteMediaUri } from '../../../types';
import { createStoredMediaAsset } from '../../../utils/mediaAssets';

export interface ShotGridSplitDeps {
  projectId: string;
  shot: Shot;
  images: StoredMediaAsset[];
  onImagesChange: (shotId: string, assets: StoredMediaAsset[], selectedIndex: number) => void;
  message: {
    success: (c: string) => void;
    info: (c: string) => void;
    error: (c: string) => void;
  };
}

export function useShotGridSplit(deps: ShotGridSplitDeps) {
  const { projectId, shot, images, onImagesChange, message } = deps;

  const [isSplittingGridImage, setIsSplittingGridImage] = useState(false);
  const [gridSplitModalOpen, setGridSplitModalOpen] = useState(false);
  const [gridSplitTargetIndex, setGridSplitTargetIndex] = useState<number | null>(null);
  const [gridSplitImageSize, setGridSplitImageSize] = useState<{ w: number; h: number } | null>(null);

  const gridSplitAsset = useMemo(() => {
    if (gridSplitTargetIndex == null) return null;
    return images[gridSplitTargetIndex] || null;
  }, [images, gridSplitTargetIndex]);

  // grid-4 → 2×2（4 子图）；其它 grid 变体（grid / grid-9）→ 3×3（9 子图）。
  // 这一份 gridSize 同步驱动预览 modal 的分割线 / 网格 / 缩放计算 / 拆分调用。
  const gridSize: 2 | 3 = shot.imageMode === 'grid-4' ? 2 : 3;
  const gridCellCount = gridSize * gridSize;

  const gridSplitAspectStyle = useMemo(() => {
    const w = gridSplitImageSize?.w || gridSplitAsset?.width || 0;
    const h = gridSplitImageSize?.h || gridSplitAsset?.height || 0;
    if (w > 0 && h > 0) return `${w} / ${h}`;
    return '16 / 9';
  }, [gridSplitAsset, gridSplitImageSize]);

  const gridSplitPreviewMeta = useMemo(() => {
    const w = gridSplitImageSize?.w || gridSplitAsset?.width || 0;
    const h = gridSplitImageSize?.h || gridSplitAsset?.height || 0;
    if (!w || !h) return null;

    const aspect = h > w ? '9:16' : '16:9';
    const defaultCell = aspect === '16:9'
      ? { w: 1280, h: 720 }
      : { w: 720, h: 1280 };
    const minW = defaultCell.w * gridSize;
    const minH = defaultCell.h * gridSize;
    const scaleFactor = Math.max(minW / w, minH / h, 1);
    const scaledW = Math.round(w * scaleFactor);
    const scaledH = Math.round(h * scaleFactor);
    const finalW = Math.ceil(scaledW / gridSize) * gridSize;
    const finalH = Math.ceil(scaledH / gridSize) * gridSize;
    const padRight = finalW - scaledW;
    const padBottom = finalH - scaledH;
    const cellW = Math.floor(finalW / gridSize);
    const cellH = Math.floor(finalH / gridSize);

    return { aspect, scaleFactor, finalW, finalH, padRight, padBottom, cellW, cellH };
  }, [gridSplitAsset, gridSplitImageSize, gridSize]);

  const handleOpenGridSplitPreview = useCallback((idx: number) => {
    setGridSplitTargetIndex(idx);
    setGridSplitImageSize(null);
    setGridSplitModalOpen(true);
  }, []);

  const handleCloseGridSplitPreview = useCallback(() => {
    if (isSplittingGridImage) return;
    setGridSplitModalOpen(false);
    setGridSplitTargetIndex(null);
    setGridSplitImageSize(null);
  }, [isSplittingGridImage]);

  const handleConfirmGridSplit = useCallback(async () => {
    if (!electronService.isElectron()) {
      message.error('仅支持 Electron 环境');
      return;
    }
    if (gridSplitTargetIndex == null) {
      message.info('未选择要拆分的图片');
      return;
    }
    const targetAsset = images[gridSplitTargetIndex];
    if (!targetAsset) {
      message.info('没有可拆分的图片');
      return;
    }
    if (isSplittingGridImage) return;

    setIsSplittingGridImage(true);
    try {
      const available = await ffmpegManager.isAvailable();
      if (!available) {
        throw new Error('FFmpeg 不可用');
      }

      const w = gridSplitImageSize?.w || targetAsset.width || 0;
      const h = gridSplitImageSize?.h || targetAsset.height || 0;
      const aspectRatio: '16:9' | '9:16' = (w > 0 && h > 0 && h > w) ? '9:16' : '16:9';

      let inputAsset: StoredMediaAsset = targetAsset;
      let baseImages: StoredMediaAsset[] = images;

      const isUsableLocalPath = Boolean(
        inputAsset.localPath && !isRemoteMediaUri(inputAsset.localPath)
      );

      // 远端图先落盘到项目目录，ffmpeg 才能读
      if (!isUsableLocalPath) {
        const projectPath = await getProjectPath(projectId);
        const sourceHint = getMediaAssetEditingSource(inputAsset) || inputAsset.remoteUrl || '';
        const ext = (() => {
          const clean = sourceHint.split('?')[0].split('#')[0];
          const dot = clean.lastIndexOf('.');
          const raw = dot >= 0 ? clean.slice(dot + 1).toLowerCase() : '';
          if (raw === 'jpeg') return 'jpg';
          if (raw === 'png' || raw === 'jpg' || raw === 'webp') return raw;
          return 'png';
        })();
        const destPath = `${projectPath}/assets/shots/${shot.id}/images/grid_source_${Date.now()}.${ext}`;

        const persisted = await persistMediaAsset({
          projectId,
          kind: 'image',
          source: inputAsset,
          destPath,
        });

        inputAsset = persisted;
        baseImages = images.map((a, i) => (i === gridSplitTargetIndex ? persisted : a));
      }

      const inputPath = inputAsset.localPath;
      if (!inputPath || isRemoteMediaUri(inputPath)) {
        throw new Error('缺少可用的本地图片路径');
      }

      const projectPath = await getProjectPath(projectId);
      const outputDir = `${projectPath}/assets/shots/${shot.id}/grid-splits/${Date.now()}`;
      const outputs = await ffmpegManager.splitGridImage({
        input: inputPath,
        outputDir,
        aspectRatio,
        format: 'png',
        sharpenAmount: 0.9,
        gridSize,
      });

      if (!Array.isArray(outputs) || outputs.length !== gridCellCount) {
        throw new Error(`网格拆分失败：期望 ${gridCellCount} 张，实际 ${outputs?.length ?? 0} 张`);
      }

      const newAssets = outputs.map((p, i) => createStoredMediaAsset('image', {
        localPath: p,
        metadata: {
          gridCell: i + 1,
          gridSource: inputPath,
        },
      }));

      const nextImages = [...baseImages, ...newAssets];
      onImagesChange(shot.id, nextImages, baseImages.length);
      const gridLabel = gridSize === 2 ? '四宫格' : '九宫格';
      message.success(`${gridLabel}已拆分为 ${gridCellCount} 张图片`);
      setGridSplitModalOpen(false);
      setGridSplitTargetIndex(null);
      setGridSplitImageSize(null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const gridLabel = gridSize === 2 ? '四宫格' : '九宫格';
      message.error(errorMessage || `${gridLabel}拆分失败`);
    } finally {
      setIsSplittingGridImage(false);
    }
  }, [
    gridSplitImageSize,
    gridSplitTargetIndex,
    images,
    isSplittingGridImage,
    message,
    onImagesChange,
    projectId,
    shot.id,
    gridSize,
    gridCellCount,
  ]);

  return {
    isSplittingGridImage,
    gridSplitModalOpen,
    gridSplitTargetIndex,
    gridSplitImageSize,
    gridSplitAsset,
    gridSize,
    gridCellCount,
    gridSplitAspectStyle,
    gridSplitPreviewMeta,
    setGridSplitImageSize,
    handleOpenGridSplitPreview,
    handleCloseGridSplitPreview,
    handleConfirmGridSplit,
  };
}
