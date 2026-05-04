/**
 * 分镜卡片 - Compact Grid 布局
 * 操作按钮在左侧列直接显示，参考图使用引用样式
 */
import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Tag,
  Checkbox,
  Tooltip,
  Button,
  Popconfirm,
  Input,
  InputNumber,
  Modal,
  Progress,
  Select,
  Spin,
  Segmented,
  App,
} from 'antd';
import {
  DeleteOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  InsertRowAboveOutlined,
  InsertRowBelowOutlined,
  MergeCellsOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  PlayCircleFilled,
  PictureOutlined,
  VideoCameraOutlined,
  CloseOutlined,
  PlusOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import type { Shot, ShotScriptLine, Character, Scene, Prop, StoredMediaAsset } from '../../types';
import { ShotScriptLines } from './ShotScriptLines';
import {
  getMediaAssetDisplaySource,
  getMediaAssetEditingSource,
  isRemoteMediaUri,
} from '../../types';
import { ScriptEditor } from '../../editor';
import type { MentionItem } from '../../editor';
import { useTheme } from '../../theme/runtime';
import { ImageCardGrid } from '../asset/ImageCardGrid';
import { VideoCardGrid } from '../asset/VideoCardGrid';
import { StagePlayer } from '../video/StagePlayer';
import { electronService, fsRemove } from '../../services/electronService';
import { ffmpegManager } from '../../services/ffmpegManager';
import { persistMediaAsset } from '../../services/mediaPersistenceService';
import { ensureRemoteUrlForImageAsset } from '../../services/mediaRemoteUrlService';
import { getProjectPath } from '../../store/projectStore';
import { SHOT_LAYOUT, COL_ACTION_WIDTH } from '../../constants/storyboardConstants';
import { AssetSelector } from './components/AssetSelector';
import { createStoredMediaAsset } from '../../utils/mediaAssets';
import { ALLOWED_VIDEO_DURATIONS, normalizeVideoDurationSeconds } from '../../utils/videoDuration';
import {
  clampDurationToSpec,
  type VideoDurationSpec,
} from '../../providers/itv/durationSpec';
import './ShotCard.scss';
import { cssVars } from '../../theme/runtime';

const { TextArea } = Input;

function toCssUrl(value?: string): string {
  if (!value) return 'none';
  return `url("${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}")`;
}

/**
 * 判断 imageMode 是否为任一网格变体（grid / grid-9 / grid-4）。'grid' 是老数据值，
 * 等价于 grid-9。
 */
function isGridImageMode(mode?: Shot['imageMode']): boolean {
  return mode === 'grid' || mode === 'grid-9' || mode === 'grid-4';
}

// Phase 3: 旧 ShotScriptInput textarea 已被 ShotScriptLines 块列表组件取代

export interface ShotCardProps {
  projectId: string;
  shot: Shot;
  index: number;
  totalCount: number;
  characters: Character[];
  scenes: Scene[];
  props: Prop[];
  mentionItems: MentionItem[];
  isSelected: boolean;
  isActive?: boolean;
  // 状态拆分：图片/视频提示词生成分离
  isGeneratingImagePrompt: boolean;
  isGeneratingVideoPrompt: boolean;
  isGeneratingImage: boolean;
  isGeneratingVideo: boolean;
  onSelectChange: (shotId: string, selected: boolean) => void;
  onActivate?: (shotId: string | null) => void;
  /** 单分镜内字幕行变更（编辑 / 添加 / 删除 / 同分镜内排序 / 任意位置插入） */
  onScriptLinesChange: (shotId: string, lines: ShotScriptLine[]) => void;
  onImagePromptChange: (shotId: string, imagePrompt: string) => void;
  onVideoPromptChange: (shotId: string, videoPrompt: string) => void;
  onDurationChange?: (shotId: string, duration: number) => void;
  onImageModeChange: (shotId: string, mode: 'normal' | 'grid-9' | 'grid-4') => void;
  onVideoModeChange?: (shotId: string, mode: 'multi-ref' | 'first-frame') => void;
  onCharactersChange: (shotId: string, characterIds: string[]) => void;
  onScenesChange?: (shotId: string, sceneIds: string[]) => void;
  onPropsChange?: (shotId: string, propIds: string[]) => void;
  onReferenceImagesChange?: (shotId: string, assets: StoredMediaAsset[], selectedIndex: number) => void;
  onImagesChange: (shotId: string, assets: StoredMediaAsset[], selectedIndex: number) => void;
  onVideosChange: (shotId: string, assets: StoredMediaAsset[], selectedIndex: number) => void;
  // 回调拆分：生成 vs 优化，图片 vs 视频
  onGenerateImagePrompt: (shotId: string) => void;
  onGenerateVideoPrompt: (shotId: string) => void;
  onOptimizeImagePrompt: (shotId: string, currentPrompt: string) => void;
  onOptimizeVideoPrompt: (shotId: string, currentPrompt: string) => void;
  onGenerateImage: (shotId: string) => void;
  onGenerateVideo: (shotId: string) => void;
  videoCapabilityLabel?: string;
  videoGenerateDisabledReason?: string;
  onToggleConfirm: (shot: Shot) => void;
  onDelete: (shotId: string) => void;
  onMergeUp: (shotId: string) => void;
  onMergeDown: (shotId: string) => void;
  onMoveUp: (shotId: string) => void;
  onMoveDown: (shotId: string) => void;
  onInsertAbove: (shotId: string) => void;
  onInsertBelow: (shotId: string) => void;
  /**
   * 当前项目选择的 ITV 渠道支持的时长规格。
   * - enum：渲染 Select（如 grok 6/12/16/20）
   * - range：渲染 InputNumber min/max/step（如 即梦 4-16）
   * 不传则用 ALLOWED_VIDEO_DURATIONS 兜底（向后兼容）。
   */
  durationSpec?: VideoDurationSpec;
  /**
   * 单镜头视频生成进度。父组件按 shotId 维护一个 Map，传当前 shot 对应的项；
   * 不在生成中时为 undefined。用于在视频结果区域渲染百分比 + 阶段文本。
   */
  videoProgress?: { progress: number; step: string };
}

export const ShotCard: React.FC<ShotCardProps> = ({
  projectId,
  shot,
  index,
  totalCount,
  characters,
  scenes,
  props,
  mentionItems,
  isSelected,
  isActive,
  isGeneratingImagePrompt,
  isGeneratingVideoPrompt,
  isGeneratingImage,
  isGeneratingVideo,
  onSelectChange,
  onActivate,
  onScriptLinesChange,
  onImagePromptChange,
  onVideoPromptChange,
  onDurationChange,
  onImageModeChange,
  onVideoModeChange,
  onCharactersChange,
  onScenesChange,
  onPropsChange,
  onReferenceImagesChange,
  onImagesChange,
  onVideosChange,
  onGenerateImagePrompt,
  onGenerateVideoPrompt,
  onOptimizeImagePrompt,
  onOptimizeVideoPrompt,
  onGenerateImage,
  onGenerateVideo,
  videoCapabilityLabel,
  videoGenerateDisabledReason,
  onToggleConfirm,
  onDelete,
  onMergeUp,
  onMergeDown: _onMergeDown,
  onMoveUp,
  onMoveDown,
  onInsertAbove,
  onInsertBelow,
  durationSpec,
  videoProgress,
}) => {
  const { message } = App.useApp();
  const { theme } = useTheme();
  const isDarkTheme = theme.meta.mode === 'dark';
  const { t } = useTranslation();
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [isSplittingGridImage, setIsSplittingGridImage] = useState(false);
  const [gridSplitModalOpen, setGridSplitModalOpen] = useState(false);
  const [gridSplitTargetIndex, setGridSplitTargetIndex] = useState<number | null>(null);
  const [gridSplitImageSize, setGridSplitImageSize] = useState<{ w: number; h: number } | null>(null);

  // 使用 useMemo 缓存计算值，避免不必要的重渲染
  const hasImagePrompt = useMemo(
    () => !!shot.imagePrompt?.trim(),
    [shot.imagePrompt]
  );
  const hasVideoPrompt = useMemo(
    () => !!shot.videoPrompt?.trim(),
    [shot.videoPrompt]
  );
  const isFirst = index === 0;
  const isLast = index === totalCount - 1;

  // 图片提示词按钮点击处理
  const handleImagePromptClick = useCallback(() => {
    if (hasImagePrompt) {
      onOptimizeImagePrompt(shot.id, shot.imagePrompt || '');
    } else {
      onGenerateImagePrompt(shot.id);
    }
  }, [shot.id, shot.imagePrompt, hasImagePrompt, onOptimizeImagePrompt, onGenerateImagePrompt]);

  // 视频提示词按钮点击处理
  const handleVideoPromptClick = useCallback(() => {
    if (hasVideoPrompt) {
      onOptimizeVideoPrompt(shot.id, shot.videoPrompt || '');
    } else {
      onGenerateVideoPrompt(shot.id);
    }
  }, [shot.id, shot.videoPrompt, hasVideoPrompt, onOptimizeVideoPrompt, onGenerateVideoPrompt]);

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.ant-btn, .ant-checkbox, .ant-input, .ant-select, .ant-tabs, .cm-editor, .ant-modal, .ant-popover')) {
      return;
    }
    onActivate?.(shot.id);
  }, [shot.id, onActivate]);

  const images = shot.media?.images || [];
  const referenceImages = shot.media?.references || [];
  const videos = shot.media?.videos || [];

  const imageSources = useMemo(
    () => images.map(a => getMediaAssetDisplaySource(a) || '').filter(Boolean),
    [images]
  );

  const currentVideo = useMemo(() => {
    if (!videos.length) return null;
    const idx = shot.media?.currentVideoIndex ?? videos.length - 1;
    return videos[idx] || videos[videos.length - 1];
  }, [videos, shot.media?.currentVideoIndex]);

  const currentImage = useMemo(() => {
    if (!images.length) return null;
    return images[shot.media?.currentImageIndex || 0];
  }, [images, shot.media?.currentImageIndex]);

  const gridSplitAsset = useMemo(() => {
    if (gridSplitTargetIndex == null) return null;
    return images[gridSplitTargetIndex] || null;
  }, [images, gridSplitTargetIndex]);

  // grid-4 → 2×2（4 子图）；其它 grid 变体（grid / grid-9）→ 3×3（9 子图）。
  // 这一份 gridSize 同步驱动预览 modal 的分割线 / 网格 / 缩放计算 / 拆分调用，
  // 保证 UI 选了四宫格时拆分一定按 2×2 走，不会再硬切成 9 张。
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

    return {
      aspect,
      scaleFactor,
      finalW,
      finalH,
      padRight,
      padBottom,
      cellW,
      cellH,
    };
  }, [gridSplitAsset, gridSplitImageSize, gridSize]);

  // 图片操作
  const handleImageSelect = (idx: number) => onImagesChange(shot.id, images, idx);
  const handleImageAdd = (path: string) => {
    const asset = createStoredMediaAsset('image', isRemoteMediaUri(path)
      ? { remoteUrl: path }
      : { localPath: path });
    const newImages: StoredMediaAsset[] = [
      ...images,
      asset,
    ];
    onImagesChange(shot.id, newImages, newImages.length - 1);
  };
  const handleImageDelete = async (idx: number) => {
    const target = images[idx];
    if (!target) return;

    const localPath = target.localPath;
    const shouldDeleteLocalFile = Boolean(localPath && !isRemoteMediaUri(localPath));

    try {
      if (shouldDeleteLocalFile && localPath) {
        await fsRemove(localPath);
      }

      const newImages = images.filter((_, i) => i !== idx);
      const newIdx = Math.min(shot.media?.currentImageIndex || 0, newImages.length - 1);
      onImagesChange(shot.id, newImages, Math.max(0, newIdx));

      if (shouldDeleteLocalFile) {
        message.success(t('asset.imageDeleted'));
      } else {
        message.warning(t('asset.remoteImageReferenceRemoved'));
      }
    } catch (err: any) {
      message.error(err.message || t('error.deleteFailed'));
    }
  };

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
    if (!isGridImageMode(shot.imageMode)) {
      message.info('当前分镜不是网格模式');
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
        inputAsset.localPath &&
        !isRemoteMediaUri(inputAsset.localPath)
      );

      // If the selected image is remote-only, download it into the project so ffmpeg can access it.
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
    shot.imageMode,
  ]);

  // 参考图操作
  const handleRefImageSelect = (idx: number) => onReferenceImagesChange?.(shot.id, referenceImages, idx);
  const handleRefImageAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!electronService.isElectron()) {
        e.target.value = '';
        return;
      }

      const blobUrl = URL.createObjectURL(file);
      try {
        const projectPath = await getProjectPath(projectId);
        const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
        const destPath = `${projectPath}/assets/shots/${shot.id}/references/${Date.now()}.${ext}`;

        const stored = await persistMediaAsset({
          projectId,
          kind: 'image',
          source: blobUrl,
          destPath,
          ownerRef: {
            projectId,
            ownerType: 'shot',
            ownerId: shot.id,
            slot: 'referenceImage',
          },
        });

        const finalized = await ensureRemoteUrlForImageAsset({
          projectId,
          asset: stored,
          policy: 'best-effort',
          filenameHint: file.name,
        });

        const newRefs: StoredMediaAsset[] = [...referenceImages, finalized];
        onReferenceImagesChange?.(shot.id, newRefs, newRefs.length - 1);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }
    e.target.value = '';
  };
  const handleRefImageDelete = (idx: number) => {
    const newRefs = referenceImages.filter((_, i) => i !== idx);
    const newIdx = Math.min(shot.media?.selectedReferenceIndex || 0, newRefs.length - 1);
    onReferenceImagesChange?.(shot.id, newRefs, Math.max(0, newIdx));
  };

  // 视频操作
  const handleVideoSelect = (idx: number) => onVideosChange(shot.id, videos, idx);
  const handleVideoDelete = (idx: number) => {
    const newVideos = videos.filter((_, i) => i !== idx);
    const newIdx = Math.min(shot.media?.currentVideoIndex || 0, newVideos.length - 1);
    onVideosChange(shot.id, newVideos, Math.max(0, newIdx));
  };

  // 统一按钮样式
  const actionBtnClass = "w-6 h-6 p-0 text-[11px]";

  const getDisplaySrc = useCallback((asset?: StoredMediaAsset | null): string => {
    const source = asset ? getMediaAssetDisplaySource(asset) : undefined;
    if (!source) return '';
    if (source.startsWith('http') || source.startsWith('data:')) {
      return source;
    }
    if (electronService.isElectron()) {
      return electronService.fs.toLocalUrl(source);
    }
    return source;
  }, []);

  const gridSplitSrc = gridSplitAsset ? getDisplaySrc(gridSplitAsset) : '';

  return (
    <div
      className={`shot-card ${isSelected ? 'selected' : ''} ${shot.confirmed ? 'confirmed' : ''} ${isActive ? 'active' : ''}`}
      onClick={handleCardClick}
    >
      {/* 分镜行固定高度：360px 给资产分类至少 3 行可见空间；所有列内部滚动 */}
      <div className="flex items-stretch h-[360px] bg-bg-app">
        {/* 左侧操作列 - 全部显示 */}
        <div className={`${COL_ACTION_WIDTH} shrink-0 border-r border-border-subtle flex flex-col items-center py-1.5 gap-0.5 bg-bg-surface/30`}>
          <Checkbox
            checked={isSelected}
            onChange={(e) => onSelectChange(shot.id, e.target.checked)}
          />
          <span className="text-[11px] font-semibold text-text-secondary">#{index + 1}</span>
          {onDurationChange ? (
            <Tooltip title="分镜时长（秒）" placement="right">
              <div className="flex items-center gap-0.5">
                {durationSpec?.kind === 'enum' ? (
                  <Select
                    size="small"
                    value={shot.duration}
                    onChange={(value) => {
                      const next = clampDurationToSpec(value, durationSpec);
                      if (next !== shot.duration) onDurationChange(shot.id, next);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    options={durationSpec.values.map((v) => ({ value: v, label: `${v}` }))}
                    className="shot-duration-input shot-duration-select"
                  />
                ) : durationSpec?.kind === 'range' ? (
                  <InputNumber
                    size="small"
                    min={durationSpec.min}
                    max={durationSpec.max}
                    step={durationSpec.step}
                    controls={false}
                    value={shot.duration}
                    onChange={(value) => {
                      const next = clampDurationToSpec(value, durationSpec);
                      if (next !== shot.duration) onDurationChange(shot.id, next);
                    }}
                    className="shot-duration-input"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  // 兜底：未传 spec 时沿用历史枚举（向后兼容）
                  <InputNumber
                    size="small"
                    min={ALLOWED_VIDEO_DURATIONS[0]}
                    max={ALLOWED_VIDEO_DURATIONS[ALLOWED_VIDEO_DURATIONS.length - 1]}
                    step={1}
                    controls={false}
                    value={shot.duration}
                    onChange={(value) => {
                      const next = normalizeVideoDurationSeconds(value, shot.duration);
                      if (next !== shot.duration) onDurationChange(shot.id, next);
                    }}
                    className="shot-duration-input"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <span className="text-[9px] text-text-secondary leading-none">s</span>
              </div>
            </Tooltip>
          ) : (
            <Tag className="m-0 text-[9px] px-1" color="blue">{shot.duration}s</Tag>
          )}

          {/* 操作按钮 - 直接显示 */}
          <div className="flex flex-col gap-0.5 mt-1">
            <Tooltip title={shot.confirmed ? '取消确认' : '确认'} placement="right">
              <Button
                size="small"
                type={shot.confirmed ? 'primary' : 'text'}
                className={actionBtnClass}
                icon={shot.confirmed ? <CheckCircleFilled /> : <CheckCircleOutlined />}
                onClick={() => onToggleConfirm(shot)}
              />
            </Tooltip>
            <Tooltip title="上移" placement="right">
              <Button size="small" type="text" className={actionBtnClass} icon={<ArrowUpOutlined />} disabled={isFirst} onClick={() => onMoveUp(shot.id)} />
            </Tooltip>
            <Tooltip title="下移" placement="right">
              <Button size="small" type="text" className={actionBtnClass} icon={<ArrowDownOutlined />} disabled={isLast} onClick={() => onMoveDown(shot.id)} />
            </Tooltip>
            <Tooltip title="上方插入" placement="right">
              <Button size="small" type="text" className={actionBtnClass} icon={<InsertRowAboveOutlined />} onClick={() => onInsertAbove(shot.id)} />
            </Tooltip>
            <Tooltip title="下方插入" placement="right">
              <Button size="small" type="text" className={actionBtnClass} icon={<InsertRowBelowOutlined />} onClick={() => onInsertBelow(shot.id)} />
            </Tooltip>
            <Tooltip title="向上合并" placement="right">
              <Button size="small" type="text" className={actionBtnClass} icon={<MergeCellsOutlined />} disabled={isFirst} onClick={() => onMergeUp(shot.id)} />
            </Tooltip>
            <Popconfirm title="确定删除？" onConfirm={() => onDelete(shot.id)} placement="right">
              <Button size="small" type="text" danger className={actionBtnClass} icon={<DeleteOutlined />} />
            </Popconfirm>
          </div>
        </div>

        {/* 列1: 剧本（min-h-0 让 ShotScriptLines 内部滚动条生效，行多了不撑高分镜） */}
        <div className={`${SHOT_LAYOUT.colScript} border-r border-border-subtle flex flex-col min-h-0`}>
          <div className="flex-1 min-h-0 p-1">
            <ShotScriptLines
              shotId={shot.id}
              lines={shot.scriptLines || []}
              onLinesChange={onScriptLinesChange}
            />
          </div>
        </div>

        {/* 列2: 资产（角色 / 场景 / 道具 三段等高）
            - 父容器 flex-col + min-h-0：把分镜行的 360px 等分给三段，每段 ~110px 容纳标题 + 至少 3 行条目
            - 每段 flex-1 min-h-0：AssetSelector 内部自己处理"标题固定 + 条目滚动" */}
        <div className={`${SHOT_LAYOUT.colAssets} border-r border-border-subtle flex flex-col bg-bg-surface/10 p-1 gap-1 min-h-0`}>
          <div className="flex-1 min-h-0">
            <AssetSelector
              type="character"
              selectedIds={shot.characters || []}
              allAssets={characters}
              onChange={(ids) => onCharactersChange(shot.id, ids)}
            />
          </div>
          <div className="flex-1 min-h-0">
            <AssetSelector
              type="scene"
              selectedIds={shot.scenes || []}
              allAssets={scenes}
              onChange={(ids) => onScenesChange?.(shot.id, ids)}
            />
          </div>
          <div className="flex-1 min-h-0">
            <AssetSelector
              type="prop"
              selectedIds={shot.props || []}
              allAssets={props}
              onChange={(ids) => onPropsChange?.(shot.id, ids)}
            />
          </div>
        </div>

        {/* 列3: 图像设计 */}
        <div className={`${SHOT_LAYOUT.colImageDesign} border-r border-border-subtle flex flex-col`}>
          <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-2 py-1">
            <span className="text-[10px] text-text-secondary">图片模式</span>
            <Segmented
              size="small"
              // 老数据 'grid' 视作 'grid-9'，UI 上展示为九宫格
              value={shot.imageMode === 'grid' ? 'grid-9' : (shot.imageMode || 'normal')}
              onChange={(value) => onImageModeChange(shot.id, value as 'normal' | 'grid-9' | 'grid-4')}
              options={[
                { value: 'normal', label: '普通' },
                { value: 'grid-4', icon: <AppstoreOutlined />, label: '四宫格' },
                { value: 'grid-9', icon: <AppstoreOutlined />, label: '九宫格' },
              ]}
              className="text-[10px]"
            />
          </div>
          {/* 提示词编辑器 + 浮动按钮 */}
          <div className="flex-1 p-1 min-h-0 relative">
            <ScriptEditor
              value={shot.imagePrompt || ''}
              onChange={(value) => onImagePromptChange(shot.id, value)}
              placeholder="画面描述提示词..."
              mentionItems={mentionItems}
              enableCameraCommands={true}
              showLineNumbers={false}
              darkTheme={isDarkTheme}
              className="shot-prompt-editor shot-prompt-editor-fill"
            />
            {/* 右下角浮动区域：AI生成 + 参考图 */}
            <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
              {/* AI生成按钮 - 蓝色文字无边框 */}
              <button
                className="text-status-info hover:text-status-info text-[11px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleImagePromptClick}
                disabled={isGeneratingImagePrompt}
              >
                {isGeneratingImagePrompt ? '生成中...' : (hasImagePrompt ? '优化' : 'AI生成')}
              </button>
              {/* 参考图 */}
              {referenceImages.map((img, idx) => (
                <div
                  key={idx}
                  className={`relative h-7 w-7 rounded overflow-hidden cursor-pointer border ${
                    idx === (shot.media?.selectedReferenceIndex || 0) ? 'border-status-info' : 'border-border'
                  } shadow-lg`}
                  onClick={() => handleRefImageSelect(idx)}
                >
                  <img
                    src={getDisplaySrc(img)}
                    className="w-full h-full object-cover"
                    alt=""
                  />
                  <button
                    className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-status-error text-on-status text-[7px] rounded-full flex items-center justify-center hover:bg-status-error"
                    onClick={(e) => { e.stopPropagation(); handleRefImageDelete(idx); }}
                  >
                    <CloseOutlined />
                  </button>
                </div>
              ))}
              {/* 添加参考图按钮 */}
              <Tooltip title="添加参考图" placement="top">
                <label className="h-7 w-7 bg-bg-elevated/90 border border-dashed border-border rounded flex items-center justify-center cursor-pointer hover:border-border hover:bg-bg-hover/90 text-text-secondary shadow-lg">
                  <PlusOutlined className="text-[11px]" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleRefImageAdd} />
                </label>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* 列4: 图像结果 */}
        <div className={`${SHOT_LAYOUT.colImageResult} border-r border-border-subtle flex flex-col bg-bg-surface/20`}>
          <div className="flex-1 p-1 min-h-0 overflow-y-auto custom-scrollbar flex items-center justify-center relative">
            {imageSources.length === 0 && !isGeneratingImage ? (
              <Button
                type="primary"
                size="small"
                className="h-7 px-3 text-[11px]"
                onClick={() => onGenerateImage(shot.id)}
                disabled={!hasImagePrompt}
                icon={<PictureOutlined />}
              >
                生成图像
              </Button>
            ) : isGeneratingImage && imageSources.length === 0 ? (
              <Spin size="small" />
            ) : (
              <div className="w-full h-full">
                <ImageCardGrid
                  images={imageSources}
                  selectedIndex={shot.media?.currentImageIndex || 0}
                  onSelect={handleImageSelect}
                  onAdd={handleImageAdd}
                  onDelete={handleImageDelete}
                  onSplitGrid={isGridImageMode(shot.imageMode) && electronService.isElectron()
                    ? handleOpenGridSplitPreview
                    : undefined}
                  onGenerate={() => onGenerateImage(shot.id)}
                  isGenerating={isGeneratingImage}
                  disabled={!hasImagePrompt}
                  characters={characters}
                  scenes={scenes}
                  props={props}
                  compact
                />
              </div>
            )}
          </div>
        </div>

        {/* 列5: 视频设计 */}
        <div className={`${SHOT_LAYOUT.colVideoDesign} border-r border-border-subtle flex flex-col`}>
          {/* 视频模式切换：multi-ref 多参（带 @映射） / first-frame 首帧延展（以单图为锚）
              九宫格图片模式与"首帧延展"语义冲突（grid 是 9 帧时序，first-frame 是单图微动），
              此时锁定 multi-ref 并通过 tooltip 解释。 */}
          <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-2 py-1">
            <span className="text-[10px] text-text-secondary">视频模式</span>
            <Tooltip
              title={isGridImageMode(shot.imageMode)
                ? '网格图片模式下视频自动走"多参"——把网格当作 N 帧时序锚点（4 / 9 帧）；切回普通模式才能选"首帧"。'
                : ''}
              placement="top"
            >
              <Segmented
                size="small"
                value={shot.videoMode || 'multi-ref'}
                onChange={(value) => onVideoModeChange?.(shot.id, value as 'multi-ref' | 'first-frame')}
                options={[
                  { value: 'multi-ref', label: '多参' },
                  { value: 'first-frame', label: '首帧', disabled: isGridImageMode(shot.imageMode) },
                ]}
                className="text-[10px]"
                disabled={!onVideoModeChange}
              />
            </Tooltip>
          </div>
          {/* 提示词编辑器 + 浮动按钮 */}
          <div className="flex-1 p-1 min-h-0 relative">
            <ScriptEditor
              value={shot.videoPrompt || ''}
              onChange={(value) => onVideoPromptChange(shot.id, value)}
              placeholder="运动/转场描述..."
              mentionItems={mentionItems}
              enableCameraCommands={true}
              showLineNumbers={false}
              darkTheme={isDarkTheme}
              className="shot-prompt-editor shot-prompt-editor-fill"
            />
            {/* 右下角浮动：AI生成按钮 */}
            <div className="absolute right-2 bottom-2">
              <button
                className="text-status-info hover:text-status-info text-[11px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleVideoPromptClick}
                disabled={isGeneratingVideoPrompt}
              >
                {isGeneratingVideoPrompt ? '生成中...' : (hasVideoPrompt ? '优化' : 'AI生成')}
              </button>
            </div>
          </div>
        </div>

        {/* 列6: 视频结果 */}
        <div className={`${SHOT_LAYOUT.colVideoResult} flex flex-col bg-bg-surface/20`}>
          <div className="flex-1 p-1 min-h-0 overflow-y-auto custom-scrollbar flex items-center justify-center">
            {videos.length === 0 && !isGeneratingVideo ? (
              <div className="flex flex-col items-center gap-2">
                <Tooltip title={videoGenerateDisabledReason || (videoCapabilityLabel ? `当前将生成${videoCapabilityLabel}` : '生成视频')}>
                  <span>
                    <Button
                      type="primary"
                      size="small"
                      className="h-7 px-3 text-[11px]"
                      onClick={() => onGenerateVideo(shot.id)}
                      disabled={Boolean(videoGenerateDisabledReason)}
                      icon={<VideoCameraOutlined />}
                    >
                      生成视频
                    </Button>
                  </span>
                </Tooltip>
                {videoCapabilityLabel && (
                  <div className={`text-[10px] ${videoGenerateDisabledReason ? 'text-status-warning' : 'text-text-tertiary'}`}>
                    {videoCapabilityLabel}
                  </div>
                )}
                {currentVideo && (
                  <Button type="text" size="small" className="h-5 w-5 p-0" icon={<PlayCircleFilled />} onClick={() => setVideoModalOpen(true)} />
                )}
              </div>
            ) : (
              <div className="w-full h-full relative">
                <VideoCardGrid
                  videos={videos.map(a => ({
                    path: getMediaAssetDisplaySource(a) || '',
                    url: a.remoteUrl,
                    thumbnailPath: typeof a.metadata?.thumbnailPath === 'string'
                      ? a.metadata.thumbnailPath
                      : undefined,
                    prompt: typeof a.metadata?.prompt === 'string'
                      ? a.metadata.prompt
                      : undefined,
                    seed: typeof a.metadata?.seed === 'number'
                      ? a.metadata.seed
                      : undefined,
                    model: typeof a.metadata?.model === 'string'
                      ? a.metadata.model
                      : undefined,
                    createdAt: a.createdAt,
                  }))}
                  selectedIndex={shot.media?.currentVideoIndex || 0}
                  onSelect={handleVideoSelect}
                  onDelete={handleVideoDelete}
                  isGenerating={isGeneratingVideo}
                  disabled={Boolean(videoGenerateDisabledReason)}
                  compact
                />
                {currentVideo && (
                  <Button
                    type="text"
                    size="small"
                    className="absolute top-0 right-0 h-5 w-5 p-0"
                    icon={<PlayCircleFilled />}
                    onClick={() => setVideoModalOpen(true)}
                  />
                )}
                {/* 进度覆盖层：仅在生成中显示，避免遮挡已存视频 */}
                {isGeneratingVideo && videoProgress && (
                  <div className="shot-video-progress-overlay">
                    <Progress
                      percent={Math.max(0, Math.min(100, videoProgress.progress))}
                      size="small"
                      showInfo={false}
                      strokeColor="var(--token-accent-base)"
                      trailColor="var(--token-border-base)"
                    />
                    <div className="shot-video-progress-meta">
                      <span className="truncate flex-1" title={videoProgress.step}>
                        {videoProgress.step || '处理中...'}
                      </span>
                      <span className="tabular-nums shrink-0">
                        {Math.round(videoProgress.progress)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 网格拆分预览 Modal — gridSize=2 走 2×2 / 4 张，gridSize=3 走 3×3 / 9 张 */}
      <Modal
        title={`分镜 #${index + 1} - ${gridSize === 2 ? '四宫格' : '九宫格'}拆分预览`}
        open={gridSplitModalOpen}
        onCancel={handleCloseGridSplitPreview}
        onOk={handleConfirmGridSplit}
        okText={isSplittingGridImage ? '拆分中...' : '确定拆分'}
        cancelText="取消"
        okButtonProps={{
          disabled: !electronService.isElectron() || isSplittingGridImage || !gridSplitAsset,
        }}
        cancelButtonProps={{
          disabled: isSplittingGridImage,
        }}
        width={920}
        centered
        destroyOnClose
        maskClosable={!isSplittingGridImage}
        closable={!isSplittingGridImage}
      >
        {!gridSplitAsset ? (
          <div className="text-sm text-text-secondary">未找到要拆分的图片</div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="text-[12px] text-text-secondary">
              <div>将把所选图片平均切成 {gridCellCount} 张（{gridSize}×{gridSize}）。确认后才会真正落盘拆分。</div>
              {gridSplitPreviewMeta && (
                <div className="mt-1">
                  预计输出单格分辨率约 {gridSplitPreviewMeta.cellW}×{gridSplitPreviewMeta.cellH}，
                  右/下补像素 {gridSplitPreviewMeta.padRight}/{gridSplitPreviewMeta.padBottom}px，
                  放大倍率 {gridSplitPreviewMeta.scaleFactor.toFixed(2)}×
                </div>
              )}
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              {/* 分割线预览 */}
              <div className="flex-1">
                <div className="text-[12px] text-text-tertiary mb-1">分割线预览</div>
                <div
                  className="grid-split-frame relative w-full rounded overflow-hidden bg-black border border-border-subtle"
                  style={cssVars({ '--grid-split-aspect-ratio': gridSplitAspectStyle })}
                >
                  {gridSplitSrc && (
                    <img
                      src={gridSplitSrc}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      onLoad={(e) => {
                        const w = e.currentTarget.naturalWidth || 0;
                        const h = e.currentTarget.naturalHeight || 0;
                        if (w && h) setGridSplitImageSize({ w, h });
                      }}
                    />
                  )}

                  {/* gridSize×gridSize 分割线（gridSize-1 条线，按等分位置） */}
                  <div className="absolute inset-0 pointer-events-none">
                    {Array.from({ length: gridSize - 1 }).map((_, i) => {
                      const pct = `${((i + 1) / gridSize) * 100}%`;
                      return (
                        <div
                          key={`v-${i}`}
                          className="grid-split-line-v absolute top-0 bottom-0 w-px"
                          style={cssVars({ '--grid-line-left': pct })}
                        />
                      );
                    })}
                    {Array.from({ length: gridSize - 1 }).map((_, i) => {
                      const pct = `${((i + 1) / gridSize) * 100}%`;
                      return (
                        <div
                          key={`h-${i}`}
                          className="grid-split-line-h absolute left-0 right-0 h-px"
                          style={cssVars({ '--grid-line-top': pct })}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 结果预览 — 用 inline gridTemplateColumns 避免 Tailwind purge 干掉动态类名 */}
              <div className="flex-1">
                <div className="text-[12px] text-text-tertiary mb-1">生成结果预览</div>
                <div
                  className="grid-split-result-grid grid gap-2"
                  style={cssVars({ '--grid-size': gridSize })}
                >
                  {Array.from({ length: gridCellCount }).map((_, i) => {
                    const row = Math.floor(i / gridSize);
                    const col = i % gridSize;
                    // gridSize=2 时 backgroundSize 200% 200%，每格步进 100%；
                    // gridSize=3 时 300% 300%，每格步进 50%。通用公式：步进 = 100/(gridSize-1)
                    const stepPct = 100 / (gridSize - 1);
                    const bgPosX = `${col * stepPct}%`;
                    const bgPosY = `${row * stepPct}%`;
                    const bgSizePct = `${gridSize * 100}%`;
                    return (
                      <div
                        key={i}
                        className="grid-split-cell relative rounded overflow-hidden border border-border-subtle bg-black"
                        style={cssVars({
                          '--grid-split-aspect-ratio': gridSplitAspectStyle,
                          '--grid-cell-bg-image': toCssUrl(gridSplitSrc),
                          '--grid-cell-bg-size': `${bgSizePct} ${bgSizePct}`,
                          '--grid-cell-bg-position': `${bgPosX} ${bgPosY}`,
                        })}
                      >
                        <div className="grid-split-cell-index absolute left-1 top-1 text-[10px] px-1 rounded">
                          {String(i + 1).padStart(2, '0')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 视频播放 Modal */}
      <Modal
        title={`分镜 #${index + 1} - 视频预览`}
        open={videoModalOpen}
        onCancel={() => setVideoModalOpen(false)}
        footer={null}
        width={800}
        centered
        destroyOnClose
      >
        <div className="aspect-video bg-black rounded overflow-hidden">
          <StagePlayer
            videoPath={getMediaAssetEditingSource(currentVideo || undefined)}
            videoUrl={currentVideo?.remoteUrl}
            poster={currentImage ? getDisplaySrc(currentImage) : undefined}
          />
        </div>
      </Modal>
    </div>
  );
};
