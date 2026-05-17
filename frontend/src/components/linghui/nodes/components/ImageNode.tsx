import React, { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { App } from 'antd';
import { type NodeProps, useStore, useUpdateNodeInternals } from '@xyflow/react';
import { Download, Image as ImageIcon } from 'lucide-react';
import type {
  LinghuiImageNodeMode,
  LinghuiImageNodeProperties,
  LinghuiNodeData,
  LinghuiRunStatus,
} from '../../../../types/linghui';
import {
  normalizeLinghuiImageFocusRegion,
  normalizeLinghuiImageMarkPoints,
  resolveLinghuiImageNodeViewState,
} from '../../../../types/linghui';
import {
  useNodeRunState,
  useLinghuiNodeMutation,
  useLinghuiNodeInteraction,
  useLinghuiGridSplitOverlay,
  useLinghuiNodeEditorApi,
  useLinghuiNodeEditorVisibility,
} from '../state/LinghuiNodeRunsContext';
import { useLinghuiConnectTarget } from '../state/useLinghuiConnectTarget';
import { extractPerspectiveView } from '../../panorama/panoramaPerspectiveExtractor';
import { LinghuiNodeEditor } from '../../editors/components/LinghuiNodeEditor';
import { PanoramaViewer, PanoramaViewport } from '../../panorama/PanoramaViewer';
import { resolvePanoramaProjectionMode } from '../../panorama/panoramaProjection';
import { electronService } from '../../../../services/electronService';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import { stripDataHeader } from '../../../../utils/encoding';
import { fromKomaLocalUrl } from '../../../../utils/urlUtils';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';
import { resolveLinghuiNodeViewMode } from '../../editors/state/linghuiNodeViewMode';
import {
  createLinghuiImageImportProperties,
  getLinghuiImageImportItems,
  resolveLinghuiImageCollection,
} from '../../editors/state/linghuiImageCollections';
import { resolveMediaCardSize } from '../state/linghuiNodeCardSizing';
import { cssVars } from '../../../../theme/runtime';
import { LinghuiNodeRunError } from './LinghuiNodeRunError';
import { LinghuiNodePorts } from './LinghuiNodeHandle';
import { LinghuiImageNodeEmptyState } from './LinghuiImageNodeEmptyState';
import { LinghuiImageNodeUploadFloat } from './LinghuiImageNodeUploadFloat';

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: 'var(--token-text-muted)',
  running: 'var(--token-status-info)',
  succeeded: 'var(--token-status-success)',
  failed: 'var(--token-status-error)',
  stale: 'var(--token-status-warning)',
};

function getPreviewSource(source?: string): string {
  return toFileSystemDisplayUrl(source) || '';
}

function resolveImageNodeMode(props: LinghuiImageNodeProperties): LinghuiImageNodeMode {
  if (props.mode === 'import' || props.mode === 'generate') {
    return props.mode;
  }
  return String(props.source ?? '').trim() ? 'import' : 'generate';
}

function sanitizeFileSegment(value: string, fallback: string): string {
  const normalized = value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ');
  return normalized || fallback;
}

const decodeLinghuiSource = fromKomaLocalUrl;

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

function getFileExtensionFromSource(source: string, mimeType?: string): string {
  const normalized = decodeLinghuiSource(source);
  const matched = normalized.match(/\.([a-zA-Z0-9]+)(?:$|[?#])/);
  if (matched?.[1]) {
    return matched[1].toLowerCase();
  }
  return getFileExtensionFromMimeType(mimeType, 'png');
}

async function writeImageSourceToPath(source: string, targetPath: string): Promise<void> {
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

interface DisplayImageItem {
  key: string;
  source: string;
  preview: string;
  label?: string;
  mimeType?: string;
  assetId?: string;
  isPrimary: boolean;
}

interface GridSplitCellLayout {
  index: number;
  style: Record<`--${string}`, string>;
}

interface GridSplitPreviewLayout {
  frameStyle: Record<`--${string}`, string>;
  cells: GridSplitCellLayout[];
  verticalLines: Array<Record<`--${string}`, string>>;
  horizontalLines: Array<Record<`--${string}`, string>>;
}

function parseAspectRatioValue(value?: string): number | null {
  if (!value) {
    return null;
  }

  const [widthText, heightText] = value.split(':');
  const width = Number(widthText);
  const height = Number(heightText);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return width / height;
}

function resolveImageRatio(params: {
  width?: number;
  height?: number;
  aspectRatio?: string;
}): number | null {
  if (
    typeof params.width === 'number'
    && typeof params.height === 'number'
    && Number.isFinite(params.width)
    && Number.isFinite(params.height)
    && params.width > 0
    && params.height > 0
  ) {
    return params.width / params.height;
  }

  return parseAspectRatioValue(params.aspectRatio);
}

function buildGridSplitBounds(total: number, gridSize: number): number[] {
  if (!Number.isFinite(total) || total <= 0 || gridSize <= 1) {
    return [0, Math.max(0, total)];
  }

  const bounds = [0];
  for (let index = 1; index < gridSize; index += 1) {
    const next = Math.round((total * index) / gridSize);
    bounds.push(Math.max(bounds[bounds.length - 1], next));
  }
  bounds.push(total);
  return bounds;
}

function buildGridSplitPreviewLayout(params: {
  containerWidth: number;
  containerHeight: number;
  imageWidth?: number;
  imageHeight?: number;
  aspectRatio?: string;
  gridSize: number;
}): {
  frameStyle: GridSplitPreviewLayout['frameStyle'];
  cells: GridSplitCellLayout[];
  verticalLines: GridSplitPreviewLayout['verticalLines'];
  horizontalLines: GridSplitPreviewLayout['horizontalLines'];
} | null {
  const {
    containerWidth,
    containerHeight,
    imageWidth,
    imageHeight,
    aspectRatio,
    gridSize,
  } = params;

  if (containerWidth <= 0 || containerHeight <= 0 || gridSize <= 0) {
    return null;
  }

  const ratio = resolveImageRatio({ width: imageWidth, height: imageHeight, aspectRatio }) ?? (containerWidth / containerHeight);
  const containerRatio = containerWidth / containerHeight;

  let frameWidth = containerWidth;
  let frameHeight = containerHeight;

  if (ratio > 0) {
    if (ratio >= containerRatio) {
      frameWidth = containerWidth;
      frameHeight = containerWidth / ratio;
    } else {
      frameHeight = containerHeight;
      frameWidth = containerHeight * ratio;
    }
  }

  const frameLeft = (containerWidth - frameWidth) / 2;
  const frameTop = (containerHeight - frameHeight) / 2;

  const sourceWidth = typeof imageWidth === 'number' && imageWidth > 0
    ? Math.round(imageWidth)
    : Math.max(gridSize, Math.round((ratio > 0 ? ratio : 1) * 1000));
  const sourceHeight = typeof imageHeight === 'number' && imageHeight > 0
    ? Math.round(imageHeight)
    : Math.max(gridSize, Math.round(sourceWidth / (ratio > 0 ? ratio : 1)));

  const xBounds = buildGridSplitBounds(sourceWidth, gridSize);
  const yBounds = buildGridSplitBounds(sourceHeight, gridSize);

  const cells: GridSplitCellLayout[] = [];
  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      const left = (xBounds[col] / sourceWidth) * 100;
      const top = (yBounds[row] / sourceHeight) * 100;
      const width = ((xBounds[col + 1] - xBounds[col]) / sourceWidth) * 100;
      const height = ((yBounds[row + 1] - yBounds[row]) / sourceHeight) * 100;
      cells.push({
        index: row * gridSize + col,
        style: {
          '--linghui-grid-cell-left': `${left}%`,
          '--linghui-grid-cell-top': `${top}%`,
          '--linghui-grid-cell-width': `${width}%`,
          '--linghui-grid-cell-height': `${height}%`,
        },
      });
    }
  }

  const verticalLines = xBounds
    .slice(1, -1)
    .map(boundary => ({
      '--linghui-grid-line-left': `${(boundary / sourceWidth) * 100}%`,
    }));
  const horizontalLines = yBounds
    .slice(1, -1)
    .map(boundary => ({
      '--linghui-grid-line-top': `${(boundary / sourceHeight) * 100}%`,
    }));

  return {
    frameStyle: {
      '--linghui-grid-frame-left': `${frameLeft}px`,
      '--linghui-grid-frame-top': `${frameTop}px`,
      '--linghui-grid-frame-width': `${frameWidth}px`,
      '--linghui-grid-frame-height': `${frameHeight}px`,
    },
    cells,
    verticalLines,
    horizontalLines,
  };
}

function ImageNodeInner({ id, data, selected }: NodeProps) {
  const { message } = App.useApp();
  const updateNodeInternals = useUpdateNodeInternals();
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as unknown as LinghuiImageNodeProperties;
  const mode = resolveImageNodeMode(props);
  const runState = useNodeRunState(id);
  const { updateNodeData } = useLinghuiNodeMutation();
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const gridSplitOverlay = useLinghuiGridSplitOverlay(id);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const status = runState?.status ?? 'idle';
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  const viewMode = resolveLinghuiNodeViewMode(nodeData.viewMode);
  const [isExpanded, setIsExpanded] = useState(false);
  const isPanoramaNode = nodeData.linghuiType === 'linghui/panorama';
  const editorNodeType = isPanoramaNode ? 'linghui/panorama' : 'linghui/image';
  const isEditorVisible = useLinghuiNodeEditorVisibility(id, editorNodeType);
  const [isPanoramaFullscreen, setIsPanoramaFullscreen] = useState(false);
  const panoramaProjectionMode = isPanoramaNode
    ? resolvePanoramaProjectionMode((props as { projectionMode?: unknown }).projectionMode)
    : undefined;
  const panoramaRatioString = isPanoramaNode ? String(props.aspectRatio ?? '') : undefined;

  const collection = resolveLinghuiImageCollection(props, runState?.result);

  // LibTV selectHasIncomingEdge(id)：派生 ImageNode pending 视图态用。
  const hasIncomingEdge = useStore(state => state.edges.some(edge => edge.target === id));
  // LibTV 连线 hover 抖动：用户从其它节点拖线到本节点时触发。
  const isConnectTarget = useLinghuiConnectTarget(id);
  const editorApi = useLinghuiNodeEditorApi();
  // 注意：全景"应用此视角" handler 依赖 primaryDisplayItem，必须放在 primaryDisplayItem 声明之后；
  // 见本文件后面的 panoramaApplyPerspectiveHandler 声明。
  // LibTV ImageNode 5 状态机视图态（与 Text/Video 节点统一）。
  // 详见 docs/libtv-imagenode-state-machine.md §2-3。
  const imageViewState = useMemo(() => resolveLinghuiImageNodeViewState({
    properties: props,
    result: runState?.result,
    runStatus: status,
    hasIncomingEdge,
    hasCollectionItems: collection.items.length > 0,
  }), [props, runState?.result, status, hasIncomingEdge, collection.items.length]);

  const importItems = useMemo(() => getLinghuiImageImportItems(props), [props]);
  const importSource = mode === 'import' ? String(props.source ?? '').trim() : '';
  const stackedItems = collection.primary
    ? [collection.primary, ...collection.items.filter(item => item.source !== collection.primary?.source)].slice(0, 4)
    : collection.items.slice(0, 4);
  const fallbackItem = collection.primary?.source || importSource
    ? [{
        source: collection.primary?.source || importSource,
        label: collection.primary?.label || nodeData.label,
      }]
    : [];
  const baseDisplayItems = stackedItems.length > 0 ? stackedItems : fallbackItem;
  const displayItems = useMemo<DisplayImageItem[]>(() => {
    const importItemBySource = new Map(importItems.map(item => [item.source, item]));
    return baseDisplayItems.map((item, index) => {
      const source = String(item.source ?? '').trim();
      const importedItem = importItemBySource.get(source);
      const isPrimary = source
        ? source === collection.primary?.source
        : index === 0;
      return {
        key: `${source || 'image'}-${importedItem?.id || index}`,
        source,
        preview: getPreviewSource(source),
        label: item.label || importedItem?.label || undefined,
        mimeType: item.mimeType || importedItem?.mimeType,
        assetId: importedItem?.id,
        isPrimary,
      };
    });
  }, [baseDisplayItems, collection.primary?.source, importItems]);
  const primaryDisplayItem = useMemo(() => (
    displayItems.find(item => item.isPrimary) ?? displayItems[0] ?? null
  ), [displayItems]);

  // 全景节点"应用此视角"：把当前预览的 yaw/pitch/fovDeg 抽成 perspective 图，
  // 派生为下游 linghui/image (mode='import') 节点。仅在全景节点上生效。
  //
  // ⚠ 坐标系适配（关键 — 两边约定不一致）：
  //  - PanoramaViewer 相机 lookAt(sin*cos, sin, +cos*cos)：panorama 中心朝 +Z，pitch>0=朝上
  //  - extractor 约定 dz=-cos*cos：panorama 中心朝 -Z（OpenGL 视图前向），
  //    且 v=(pitchSph+π/2)/π 让 pitch>0 映射到 panorama 底部
  //  → viewer 的 yaw 需 +π 翻面、pitch 需取反，extractor 才会抽到 viewer 实际看到的画面（不上下颠倒、不指反向）。
  const panoramaApplyPerspectiveHandler = useCallback(async (view: { yaw: number; pitch: number; fovDeg: number }) => {
    if (!isPanoramaNode || !primaryDisplayItem?.preview) return;
    try {
      const result = await extractPerspectiveView(primaryDisplayItem.preview, {
        yaw: view.yaw + Math.PI,    // panorama 中心方向差 180°
        pitch: -view.pitch,          // y 轴方向反置（extractor v 公式让 pitch>0 落到底部）
        fovDeg: view.fovDeg,
        width: 1024,
        height: 768,
        projectionMode: panoramaProjectionMode ?? 'ar720-band',
      });
      editorApi.onCreateDerivedImportImages?.(id, [{
        id: `pano-perspective-${Date.now()}`,
        source: result.dataUrl,
        label: `${nodeData.label || '全景'} · 视角`,
        // 显式宽高让派生 image 节点按 4:3 横屏卡片渲染（否则用 properties 默认 3:4 竖屏导致比例不对）
        width: result.width,
        height: result.height,
        aspectRatio: `${result.width}:${result.height}`,
      }]);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[Panorama] 抽取视角失败', err);
    }
  }, [editorApi, id, isPanoramaNode, nodeData.label, panoramaProjectionMode, primaryDisplayItem?.preview]);

  const activeFocusRegion = useMemo(() => {
    const region = normalizeLinghuiImageFocusRegion(props.focusRegion);
    return region?.enabled ? region : null;
  }, [props.focusRegion]);
  const activeMarkPoints = useMemo(() => (
    normalizeLinghuiImageMarkPoints(props.markPoints).filter(point => point.enabled)
  ), [props.markPoints]);
  const focusRegionStyle = activeFocusRegion
    ? cssVars({
        '--linghui-focus-x': `${activeFocusRegion.x * 100}%`,
        '--linghui-focus-y': `${activeFocusRegion.y * 100}%`,
        '--linghui-focus-w': `${activeFocusRegion.width * 100}%`,
        '--linghui-focus-h': `${activeFocusRegion.height * 100}%`,
      })
    : undefined;
  const imageCount = Math.max(collection.items.length, displayItems.length);
  const mediaCardLayout = useMemo(() => {
    const metadataAspectRatio = typeof collection.primary?.metadata?.aspectRatio === 'string'
      ? collection.primary.metadata.aspectRatio
      : undefined;

    return resolveMediaCardSize({
      width: collection.primary?.width,
      height: collection.primary?.height,
      aspectRatio: metadataAspectRatio || props.aspectRatio,
    });
  }, [collection.primary, props.aspectRatio]);
  const expandedColumns = Math.min(2, Math.max(1, displayItems.length));
  const expandedRows = Math.max(1, Math.ceil(displayItems.length / 2));
  const expandedGap = 12;
  const expandedWidth = isExpanded
    ? (mediaCardLayout.width * expandedColumns) + (expandedGap * Math.max(0, expandedColumns - 1))
    : mediaCardLayout.width;
  const expandedHeight = isExpanded
    ? (mediaCardLayout.height * expandedRows) + (expandedGap * Math.max(0, expandedRows - 1))
    : mediaCardLayout.height;
  const nodeStyle = useMemo(() => cssVars({
    ...mediaCardLayout.style,
    '--linghui-node-width': `${expandedWidth}px`,
    '--linghui-thumb-height': `${expandedHeight}px`,
    '--linghui-node-min-height': `${expandedHeight}px`,
    '--linghui-base-node-width': `${mediaCardLayout.width}px`,
    '--linghui-base-thumb-height': `${mediaCardLayout.height}px`,
    '--linghui-node-shadow': status !== 'idle'
      ? `0 0 0 1px color-mix(in srgb, ${statusColor} 66%, transparent), 0 12px 28px color-mix(in srgb, var(--token-bg-app) 32%, transparent)`
      : selected
        ? '0 0 0 1px color-mix(in srgb, var(--token-text-primary) 8%, transparent), 0 12px 24px color-mix(in srgb, var(--token-bg-app) 26%, transparent)'
        : 'none',
    '--linghui-accent': nodeData.accent,
    '--linghui-progress': `${runState?.progress ?? 0}%`,
  }), [
    expandedHeight,
    expandedWidth,
    mediaCardLayout.height,
    mediaCardLayout.style,
    mediaCardLayout.width,
    nodeData.accent,
    runState?.progress,
    selected,
    status,
    statusColor,
  ]);
  const expandedDeckStyle = useMemo(() => (
    isExpanded
      ? cssVars({
          '--linghui-expanded-grid-columns': `repeat(${expandedColumns}, ${mediaCardLayout.width}px)`,
          '--linghui-expanded-grid-auto-rows': `${mediaCardLayout.height}px`,
        })
      : undefined
  ), [expandedColumns, isExpanded, mediaCardLayout.height, mediaCardLayout.width]);
  const primaryAspectRatio = useMemo(() => {
    const metadataAspectRatio = typeof collection.primary?.metadata?.aspectRatio === 'string'
      ? collection.primary.metadata.aspectRatio
      : undefined;
    return metadataAspectRatio || props.aspectRatio;
  }, [collection.primary?.metadata, props.aspectRatio]);
  const gridSplitPreviewLayout = useMemo(() => {
    if (!gridSplitOverlay) {
      return null;
    }

    return buildGridSplitPreviewLayout({
      containerWidth: expandedWidth,
      containerHeight: expandedHeight,
      imageWidth: collection.primary?.width,
      imageHeight: collection.primary?.height,
      aspectRatio: primaryAspectRatio,
      gridSize: gridSplitOverlay.gridSize,
    });
  }, [
    collection.primary?.height,
    collection.primary?.width,
    expandedHeight,
    expandedWidth,
    gridSplitOverlay,
    primaryAspectRatio,
  ]);

  useEffect(() => {
    if (displayItems.length <= 1 && isExpanded) {
      setIsExpanded(false);
    }
  }, [displayItems.length, isExpanded]);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      updateNodeInternals(id);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [displayItems.length, expandedHeight, expandedWidth, id, isExpanded, updateNodeInternals]);

  useEffect(() => {
    if (!isExpanded) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (rootRef.current && target instanceof Node && rootRef.current.contains(target)) {
        return;
      }
      setIsExpanded(false);
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => window.removeEventListener('pointerdown', handlePointerDown, true);
  }, [isExpanded]);

  const updatePrimaryImage = useCallback((item: DisplayImageItem) => {
    if (!item.source) {
      return;
    }

    updateNodeData(id, prev => {
      const prevProps = prev.properties as unknown as LinghuiImageNodeProperties;
      if (collection.mode === 'import') {
        const importEntries = getLinghuiImageImportItems(prevProps);
        const nextPrimaryId = item.assetId
          || importEntries.find(entry => entry.source === item.source)?.id
          || '';
        if (!nextPrimaryId) {
          return prev;
        }

        const nextProps = createLinghuiImageImportProperties(prevProps, importEntries, nextPrimaryId);
        if (nextProps.primaryAssetId === prevProps.primaryAssetId && nextProps.source === prevProps.source) {
          return prev;
        }

        return {
          ...prev,
          properties: nextProps as unknown as Record<string, unknown>,
        };
      }

      if (prevProps.primaryResultSource === item.source) {
        return prev;
      }

      return {
        ...prev,
        properties: {
          ...prevProps,
          primaryResultSource: item.source,
        } as unknown as Record<string, unknown>,
      };
    }, { markStale: false });
  }, [collection.mode, id, updateNodeData]);

  const handleDownloadImage = useCallback(async (item: DisplayImageItem) => {
    if (!item.source) {
      message.info('当前图片还没有可下载的源文件');
      return;
    }

    const extension = getFileExtensionFromSource(item.source, item.mimeType);
    const filename = `${sanitizeFileSegment(item.label || nodeData.label || 'image', 'image')}.${extension}`;

    try {
      if (!electronService.isElectron()) {
        const anchor = document.createElement('a');
        anchor.href = item.preview || getPreviewSource(item.source);
        anchor.download = filename;
        anchor.click();
        message.success('图片已开始下载');
        return;
      }

      const result = await electronService.dialog.saveFile({
        title: '保存图片',
        defaultPath: filename,
        filters: [{ name: '图片', extensions: [extension] }],
      });

      if (!result.filePath) {
        return;
      }

      await writeImageSourceToPath(item.source, result.filePath);
      message.success('图片已保存');
    } catch (error: any) {
      message.error(error?.message || '下载图片失败');
    }
  }, [message, nodeData.label]);

  const stopSurfaceEvent = useCallback((event: React.SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  // LibTV `hideTargetHandle = isResourceAction(action)`：import 模式的纯素材节点不需上游输入。
  // 全景节点暂保留 handle（其编辑器支持上游 prompt 上下文）。
  const portInputs = mode === 'import' && !isPanoramaNode ? [] : nodeData.inputs;

  return (
    <div
      ref={rootRef}
      className={`linghuiCompactNode nopan is-${status} ${selected ? 'isSelected' : ''} ${viewMode === 'collapsed' ? 'isCollapsed' : ''} ${displayItems.length > 1 ? 'isMultiImage' : ''} ${isExpanded ? 'isImageExpanded' : ''} ${isEditorVisible ? 'hasInlineEditor' : ''} ${isConnectTarget ? 'isConnectTarget' : ''}`}
      data-upload-pending={(props as unknown as { _uploadPending?: boolean })._uploadPending ? 'true' : undefined}
      data-upload-error={(props as unknown as { _uploadError?: string })._uploadError || undefined}
      data-view-mode={viewMode}
      data-image-view={imageViewState}
      data-expanded={isExpanded ? 'true' : undefined}
      style={nodeStyle}
      {...interactionHandlers}
    >
      {/* 上传进度蒙层：内嵌 JSX 渲染确保 setNodes 后立即反映状态变化 */}
      {(props as unknown as { _uploadPending?: boolean })._uploadPending ? (
        <div className="linghuiCompactUploadOverlay" aria-label="上传中">
          <div className="linghuiCompactUploadSpinner" aria-hidden="true" />
          <span>上传中…</span>
        </div>
      ) : null}
      {(props as unknown as { _uploadError?: string })._uploadError ? (
        <div className="linghuiCompactUploadOverlay isError">
          <span>上传失败：{(props as unknown as { _uploadError?: string })._uploadError}</span>
        </div>
      ) : null}
      {/* LibTV 1:1：节点上方 hover 浮空工具条已废弃，所有工具操作改由点击节点打开的编辑器顶部工具条承载，
          避免两套工具条项目不一致 + hover 闪退体验问题。仅保留"上传"独立浮按钮——空态时引导上传。 */}
      {imageViewState === 'empty_generate' && !isPanoramaNode ? (
        <LinghuiImageNodeUploadFloat nodeId={id} />
      ) : null}
      <LinghuiNodePorts accent={nodeData.accent} inputs={portInputs} outputs={nodeData.outputs} />

      {/* 缩略图 */}
      <div className="linghuiCompactThumb">
        {isPanoramaNode && primaryDisplayItem?.preview ? (
          <div
            className="linghuiCompactPanoramaSurface nodrag nopan"
            onPointerDown={stopSurfaceEvent}
            onWheel={stopSurfaceEvent}
          >
            <PanoramaViewport
              imageUrl={primaryDisplayItem.preview}
              mountReady
              showFovHint={false}
              onRequestFullscreen={() => setIsPanoramaFullscreen(true)}
              projectionMode={panoramaProjectionMode}
              ratioString={panoramaRatioString}
            />
          </div>
        ) : gridSplitOverlay && primaryDisplayItem && gridSplitPreviewLayout ? (
          <div className="linghuiCompactGridPreviewSurface">
            <div
              className="linghuiCompactGridPreviewMedia"
              style={cssVars(gridSplitPreviewLayout.frameStyle)}
            >
              {primaryDisplayItem.preview
                ? <img src={primaryDisplayItem.preview} alt={primaryDisplayItem.label || '主图'} draggable={false} />
                : <ImageIcon size={18} />}
            </div>
          </div>
        ) : displayItems.length > 0 ? (
          <div
            className={`linghuiCompactThumbDeck ${displayItems.length > 1 ? 'isStacked' : 'isSingle'} ${isExpanded ? 'isExpanded' : ''}`}
            data-count={displayItems.length}
            style={expandedDeckStyle}
          >
            {displayItems.map((item, index) => {
              return (
                <div
                  key={item.key}
                  className={`linghuiCompactThumbLayer ${item.isPrimary ? 'isPrimary' : ''}`}
                  style={{ '--layer-index': index } as CSSProperties}
                >
                  {item.preview ? <img src={item.preview} alt={item.label || `图片 ${index + 1}`} draggable={false} /> : <ImageIcon size={18} />}
                  {isExpanded && (
                    <div className="linghuiCompactThumbLayerOverlay">
                      <div className="linghuiCompactThumbLayerTop">
                        {item.isPrimary ? <span className="linghuiCompactThumbPrimaryBadge">主图</span> : <span />}
                      </div>
                      <div className="linghuiCompactThumbLayerActions">
                        <button
                          type="button"
                          className="linghuiCompactThumbActionButton nodrag nopan"
                          onMouseDown={stopSurfaceEvent}
                          onPointerDown={stopSurfaceEvent}
                          onClick={(event) => {
                            stopSurfaceEvent(event);
                            updatePrimaryImage(item);
                          }}
                          disabled={item.isPrimary}
                          title={item.isPrimary ? '当前主图' : '设为主图'}
                        >
                          设为主图
                        </button>
                        <button
                          type="button"
                          className="linghuiCompactThumbActionButton nodrag nopan"
                          onMouseDown={stopSurfaceEvent}
                          onPointerDown={stopSurfaceEvent}
                          onClick={(event) => {
                            stopSurfaceEvent(event);
                            void handleDownloadImage(item);
                          }}
                          title="下载图片"
                        >
                          <Download size={12} />
                          <span>下载</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : imageViewState === 'empty_generate' && !isPanoramaNode ? (
          // LibTV "empty_generate" 态：mode='generate' 且无图 + 无上游时显示中心 placeholder + "尝试：图生图 / 图片高清"
          <LinghuiImageNodeEmptyState nodeId={id} />
        ) : imageViewState === 'pending' ? (
          // LibTV "pending" 态：generate + 无图 + 已有上游连入 → 居中 placeholder，无文字（与 Text/Video 节点一致）
          <div className="linghuiTextNodePendingState" aria-label="等待上游产出">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="3" stroke={nodeData.accent} strokeWidth="1.5" strokeOpacity="0.5" />
              <circle cx="8.5" cy="8.5" r="2" stroke={nodeData.accent} strokeWidth="1.5" strokeOpacity="0.5" />
              <path d="M3 16l5-5 4 4 3-3 6 6" stroke={nodeData.accent} strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        ) : (
          <div className="linghuiCompactThumbEmpty">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="3" stroke={nodeData.accent} strokeWidth="1.5" strokeOpacity="0.6" />
              <circle cx="8.5" cy="8.5" r="2" stroke={nodeData.accent} strokeWidth="1.5" strokeOpacity="0.6" />
              <path d="M3 16l5-5 4 4 3-3 6 6" stroke={nodeData.accent} strokeWidth="1.5" strokeOpacity="0.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
        {activeFocusRegion && displayItems.length > 0 && !gridSplitOverlay && !isPanoramaNode && (
          <div className="linghuiCompactFocusOverlay" style={focusRegionStyle}>
            <div className="linghuiCompactFocusBox" />
            <span className="linghuiCompactFocusBadge">聚焦</span>
          </div>
        )}
        {activeMarkPoints.length > 0 && displayItems.length > 0 && !gridSplitOverlay && !isPanoramaNode && (
          <div className="linghuiCompactMarkOverlay">
            {activeMarkPoints.map((point, index) => (
              <span
                key={point.id}
                className="linghuiCompactMarkPoint"
                style={cssVars({
                  '--linghui-mark-x': `${point.x * 100}%`,
                  '--linghui-mark-y': `${point.y * 100}%`,
                })}
              >
                {index + 1}
              </span>
            ))}
          </div>
        )}
        <div className="linghuiCompactThumbMeta">
          {!isPanoramaNode && (
            mode === 'import' ? (
              <span className="linghuiCompactNodeKindBadge isImport">素材</span>
            ) : props.generatedFromNodeId ? (
              <span className="linghuiCompactNodeKindBadge isDerived">
                派生{typeof props.generatedSequence === 'number' ? ` #${props.generatedSequence}` : ''}
              </span>
            ) : (
              <span className="linghuiCompactNodeKindBadge isGenerate">生成</span>
            )
          )}
          <EditableCompactNodeLabel
            nodeId={id}
            label={nodeData.label}
            fallbackLabel="图片"
          />
          {/* LibTV 节点头部尾部：tabular-nums 等宽灰色尺寸显示（如 "2848 × 1600"），仅在有图时显示。 */}
          {collection.primary?.width && collection.primary?.height ? (
            <span className="linghuiCompactThumbDimensions">
              {collection.primary.width} × {collection.primary.height}
            </span>
          ) : null}
          {imageCount > 1 && (
            <span className="linghuiCompactThumbCount">
              {imageCount}
            </span>
          )}
        </div>
        {displayItems.length > 1 && (
          <button
            type="button"
            className={`linghuiCompactThumbExpand nodrag nopan ${gridSplitOverlay ? 'isHidden' : ''}`}
            onMouseDown={stopSurfaceEvent}
            onPointerDown={stopSurfaceEvent}
            onClick={(event) => {
              stopSurfaceEvent(event);
              setIsExpanded(current => !current);
            }}
          >
            {isExpanded ? '收起' : '展开'}
          </button>
        )}
        {gridSplitOverlay && (
          <div
            className="linghuiCompactGridOverlay nopan nodrag"
            style={gridSplitPreviewLayout ? cssVars(gridSplitPreviewLayout.frameStyle) : undefined}
            onMouseDown={stopSurfaceEvent}
            onPointerDown={stopSurfaceEvent}
          >
            {gridSplitPreviewLayout?.verticalLines.map((style, index) => (
              <div
                key={`v-${index}`}
                className="linghuiCompactGridLine isVertical"
                style={cssVars(style)}
              />
            ))}
            {gridSplitPreviewLayout?.horizontalLines.map((style, index) => (
              <div
                key={`h-${index}`}
                className="linghuiCompactGridLine isHorizontal"
                style={cssVars(style)}
              />
            ))}
            {gridSplitPreviewLayout?.cells.map(cell => {
              const isSelected = gridSplitOverlay.selectedCells.includes(cell.index);
              return (
                <button
                  key={cell.index}
                  type="button"
                  className={`linghuiCompactGridCell ${isSelected ? 'isSelected' : ''}`}
                  style={cssVars(cell.style)}
                  onClick={(event) => {
                    stopSurfaceEvent(event);
                    gridSplitOverlay.toggleCell(cell.index);
                  }}
                >
                  <span>{cell.index + 1}</span>
                </button>
              );
            })}
          </div>
        )}
        {status === 'running' && (
          <div className="linghuiCompactThumbProgress">
            <div className="linghuiCompactProgressBar" />
          </div>
        )}
        <LinghuiNodeRunError runState={runState} surface="thumb" />
      </div>

      {isEditorVisible ? <LinghuiNodeEditor nodeId={id} nodeType={editorNodeType} /> : null}

      {isPanoramaNode && primaryDisplayItem?.preview && (
        <PanoramaViewer
          open={isPanoramaFullscreen}
          imageUrl={primaryDisplayItem.preview}
          title={`${nodeData.label || '全景'} · 全景预览`}
          onClose={() => setIsPanoramaFullscreen(false)}
          projectionMode={panoramaProjectionMode}
          ratioString={panoramaRatioString}
          onApplyPerspective={panoramaApplyPerspectiveHandler}
        />
      )}
    </div>
  );
}

export const ImageNode = memo(ImageNodeInner);
