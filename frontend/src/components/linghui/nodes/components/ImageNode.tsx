import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import { Handle, Position, type NodeProps, useUpdateNodeInternals } from '@xyflow/react';
import { Download, Image as ImageIcon } from 'lucide-react';
import type {
  LinghuiImageNodeMode,
  LinghuiImageNodeProperties,
  LinghuiNodeData,
  LinghuiRunStatus,
} from '../../../../types/linghui';
import {
  useNodeRunState,
  useLinghuiNodeMutation,
  useLinghuiNodeInteraction,
  useLinghuiGridSplitOverlay,
  useLinghuiNodeEditorVisibility,
} from '../state/LinghuiNodeRunsContext';
import { LinghuiNodeEditor } from '../../editors/components/LinghuiNodeEditor';
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

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: '#64748b',
  running: '#3b82f6',
  succeeded: '#22c55e',
  failed: '#ef4444',
  stale: '#f97316',
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

function resolveHandleTop(index: number, total: number): string {
  if (total <= 1) return '50%';
  const step = 100 / (total + 1);
  return `${step * (index + 1)}%`;
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
  style: React.CSSProperties;
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
  frameStyle: React.CSSProperties;
  cells: GridSplitCellLayout[];
  verticalLines: React.CSSProperties[];
  horizontalLines: React.CSSProperties[];
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
          left: `${left}%`,
          top: `${top}%`,
          width: `${width}%`,
          height: `${height}%`,
        },
      });
    }
  }

  const verticalLines = xBounds
    .slice(1, -1)
    .map(boundary => ({
      left: `${(boundary / sourceWidth) * 100}%`,
    }));
  const horizontalLines = yBounds
    .slice(1, -1)
    .map(boundary => ({
      top: `${(boundary / sourceHeight) * 100}%`,
    }));

  return {
    frameStyle: {
      left: `${frameLeft}px`,
      top: `${frameTop}px`,
      width: `${frameWidth}px`,
      height: `${frameHeight}px`,
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
  const isEditorVisible = useLinghuiNodeEditorVisibility(id, 'linghui/image');

  const collection = resolveLinghuiImageCollection(props, runState?.result);
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
  const nodeStyle = useMemo(() => ({
    ...mediaCardLayout.style,
    '--linghui-node-width': `${expandedWidth}px`,
    '--linghui-thumb-height': `${expandedHeight}px`,
    '--linghui-node-min-height': `${expandedHeight}px`,
    '--linghui-base-node-width': `${mediaCardLayout.width}px`,
    '--linghui-base-thumb-height': `${mediaCardLayout.height}px`,
  }), [expandedHeight, expandedWidth, mediaCardLayout]);
  const expandedDeckStyle = useMemo(() => (
    isExpanded
      ? {
          gridTemplateColumns: `repeat(${expandedColumns}, ${mediaCardLayout.width}px)`,
          gridAutoRows: `${mediaCardLayout.height}px`,
        }
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

  return (
    <div
      ref={rootRef}
      className={`linghuiCompactNode nopan ${selected ? 'isSelected' : ''} ${viewMode === 'collapsed' ? 'isCollapsed' : ''} ${displayItems.length > 1 ? 'isMultiImage' : ''} ${isExpanded ? 'isImageExpanded' : ''} ${isEditorVisible ? 'hasInlineEditor' : ''}`}
      data-view-mode={viewMode}
      data-expanded={isExpanded ? 'true' : undefined}
      style={{
        ...nodeStyle,
        boxShadow: status !== 'idle'
          ? `0 0 0 1px ${statusColor}66, 0 12px 28px rgba(2, 6, 23, 0.32)`
          : selected
            ? '0 0 0 1px rgba(255, 255, 255, 0.08), 0 12px 24px rgba(2, 6, 23, 0.26)'
            : undefined,
      }}
      {...interactionHandlers}
    >
      {nodeData.inputs.map((slot, index) => (
        <Handle
          key={`input-${index}`}
          type="target"
          position={Position.Left}
          id={`input-${index}`}
          className="linghuiCompactHandle"
          style={{ background: slot.dataType === 'text' ? '#f59e0b' : nodeData.accent, top: resolveHandleTop(index, nodeData.inputs.length) }}
          isConnectable
        />
      ))}

      <Handle
        type="source"
        position={Position.Right}
        id="output-0"
        className="linghuiCompactHandle"
        style={{ background: nodeData.accent }}
      />

      {/* 缩略图 */}
      <div className="linghuiCompactThumb">
        {gridSplitOverlay && primaryDisplayItem && gridSplitPreviewLayout ? (
          <div className="linghuiCompactGridPreviewSurface">
            <div
              className="linghuiCompactGridPreviewMedia"
              style={gridSplitPreviewLayout.frameStyle}
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
                  style={{ ['--layer-index' as string]: index }}
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
        ) : (
          <div className="linghuiCompactThumbEmpty" style={{ background: `${nodeData.accent}18` }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="3" stroke={nodeData.accent} strokeWidth="1.5" strokeOpacity="0.6" />
              <circle cx="8.5" cy="8.5" r="2" stroke={nodeData.accent} strokeWidth="1.5" strokeOpacity="0.6" />
              <path d="M3 16l5-5 4 4 3-3 6 6" stroke={nodeData.accent} strokeWidth="1.5" strokeOpacity="0.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
        <div className="linghuiCompactThumbMeta">
          <EditableCompactNodeLabel
            nodeId={id}
            label={nodeData.label}
            fallbackLabel="图片"
          />
          {imageCount > 1 && (
            <span className="linghuiCompactThumbCount">
              {imageCount}
            </span>
          )}
        </div>
        {displayItems.length > 1 && (
          <button
            type="button"
            className="linghuiCompactThumbExpand nodrag nopan"
            style={gridSplitOverlay ? { display: 'none' } : undefined}
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
            style={gridSplitPreviewLayout?.frameStyle}
            onMouseDown={stopSurfaceEvent}
            onPointerDown={stopSurfaceEvent}
          >
            {gridSplitPreviewLayout?.verticalLines.map((style, index) => (
              <div
                key={`v-${index}`}
                className="linghuiCompactGridLine isVertical"
                style={style}
              />
            ))}
            {gridSplitPreviewLayout?.horizontalLines.map((style, index) => (
              <div
                key={`h-${index}`}
                className="linghuiCompactGridLine isHorizontal"
                style={style}
              />
            ))}
            {gridSplitPreviewLayout?.cells.map(cell => {
              const isSelected = gridSplitOverlay.selectedCells.includes(cell.index);
              return (
                <button
                  key={cell.index}
                  type="button"
                  className={`linghuiCompactGridCell ${isSelected ? 'isSelected' : ''}`}
                  style={cell.style}
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
            <div className="linghuiCompactProgressBar" style={{ width: `${runState?.progress ?? 0}%` }} />
          </div>
        )}
      </div>

      {isEditorVisible ? <LinghuiNodeEditor nodeId={id} nodeType="linghui/image" /> : null}
    </div>
  );
}

export const ImageNode = memo(ImageNodeInner);
