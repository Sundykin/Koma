import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import { type NodeProps, useStore, useUpdateNodeInternals } from '@xyflow/react';
import { Image as ImageIcon } from 'lucide-react';
import type {
  LinghuiImageNodeProperties,
  LinghuiNodeData,
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
import { snapshotPanoramaPerspective } from '../../panorama/panoramaPerspectiveSnapshot';
import { LinghuiNodeEditor } from '../../editors/components/LinghuiNodeEditor';
import { PanoramaViewer, PanoramaViewport } from '../../panorama/PanoramaViewer';
import { resolvePanoramaProjectionMode } from '../../panorama/panoramaProjection';
import { electronService } from '../../../../services/electronService';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';
import { resolveLinghuiNodeViewMode } from '../../editors/state/linghuiNodeViewMode';
import {
  createLinghuiImageImportProperties,
  getLinghuiImageImportItems,
  resolveLinghuiImageCollection,
} from '../../editors/state/linghuiImageCollections';
import { cssVars } from '../../../../theme/runtime';
import { LinghuiNodeRunError } from './LinghuiNodeRunError';
import { LinghuiNodePorts } from './LinghuiNodeHandle';
import { LinghuiImageNodeEmptyState } from './LinghuiImageNodeEmptyState';
import { LinghuiImageNodeUploadFloat } from './LinghuiImageNodeUploadFloat';
import { ImageNodeThumbDeck } from './ImageNodeThumbDeck';
import { ImageNodeGridSplitOverlay } from './ImageNodeGridSplitOverlay';
import {
  getFileExtensionFromSource,
  sanitizeFileSegment,
  writeImageSourceToPath,
} from '../state/imageNodeMediaDownload';
import {
  getImageNodePreviewSource,
  IMAGE_NODE_STATUS_COLORS,
  resolveImageNodeMode,
} from '../state/imageNodeViewUtils';
import {
  resolveImageNodeDisplayItems,
  type DisplayImageItem,
} from '../state/imageNodeDisplayItems';
import { useImageNodeLayout } from '../hooks/useImageNodeLayout';

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
  const statusColor = IMAGE_NODE_STATUS_COLORS[status] ?? IMAGE_NODE_STATUS_COLORS.idle;
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

  const displayItems = useMemo<DisplayImageItem[]>(() => {
    return resolveImageNodeDisplayItems({
      properties: props,
      collection,
      nodeLabel: nodeData.label,
    });
  }, [collection, nodeData.label, props]);
  const primaryDisplayItem = useMemo(() => (
    displayItems.find(item => item.isPrimary) ?? displayItems[0] ?? null
  ), [displayItems]);

  // 全景节点"应用此视角"：把当前预览的 yaw/pitch/fovDeg 抽成 perspective 图，
  // 派生为下游 linghui/image (mode='import') 节点。仅在全景节点上生效。
  //
  // 走 snapshotPanoramaPerspective —— 它复用 PanoramaViewer 同一份相机 lookAt 公式
  // 和 sphere/cylinder/flat 几何工厂（panoramaSceneBuilder），离屏渲一帧，所见即所抽。
  const panoramaApplyPerspectiveHandler = useCallback(async (view: { yaw: number; pitch: number; fovDeg: number }) => {
    if (!isPanoramaNode || !primaryDisplayItem?.preview) return;
    try {
      const result = await snapshotPanoramaPerspective({
        sourceUrl: primaryDisplayItem.preview,
        yaw: view.yaw,
        pitch: view.pitch,
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
  const {
    expandedWidth,
    expandedHeight,
    nodeStyle,
    expandedDeckStyle,
    gridSplitPreviewLayout,
  } = useImageNodeLayout({
    collection,
    properties: props,
    displayItemCount: displayItems.length,
    isExpanded,
    status,
    statusColor,
    selected,
    accent: nodeData.accent,
    progress: runState?.progress,
    gridSplitOverlay,
  });

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
        anchor.href = item.preview || getImageNodePreviewSource(item.source);
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
          <ImageNodeThumbDeck
            displayItems={displayItems}
            isExpanded={isExpanded}
            expandedDeckStyle={expandedDeckStyle}
            onStopSurfaceEvent={stopSurfaceEvent}
            onUpdatePrimaryImage={updatePrimaryImage}
            onDownloadImage={(item) => void handleDownloadImage(item)}
          />
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
          <ImageNodeGridSplitOverlay
            gridSplitOverlay={gridSplitOverlay}
            gridSplitPreviewLayout={gridSplitPreviewLayout}
            onStopSurfaceEvent={stopSurfaceEvent}
          />
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
