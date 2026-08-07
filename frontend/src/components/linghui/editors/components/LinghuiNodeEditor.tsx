import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  useEdges,
  useNodes,
  useNodesData,
} from '@xyflow/react';
import { App } from 'antd';
import type { MenuProps } from 'antd';
import { X } from 'lucide-react';
import type {
  LinghuiImageNodeProperties,
  LinghuiImageToolKey,
  LinghuiNodeData,
  LinghuiNodeType,
  LinghuiVideoNodeProperties,
} from '../../../../types/linghui';
import { getLinghuiResultPrimaryMedia } from '../../../../types/linghui';
import { LinghuiImageNodeFloatingToolbar } from '../../nodes/components/LinghuiImageNodeFloatingToolbar';
import { Director3DNodeEditor } from './Director3DNodeEditor';
import { EditableCompactNodeLabel } from '../../nodes/components/EditableCompactNodeLabel';
import {
  useLinghuiCanvasZoom,
  useLinghuiGridSplitOverlay,
  useLinghuiNodeEditorApi,
} from '../../nodes/state/LinghuiNodeRunsContext';
import {
  buildLinghuiPromptReferenceItems,
  collectOrderedUpstreamReferenceNodeIds,
} from '../state/linghuiPromptReferences';
import { resolveLinghuiImagePrimaryForNode } from '../state/linghuiImageCollections';
import { buildLinghuiReferenceMediaBuckets } from '../state/linghuiReferenceMedia';
import { cssVars } from '../../../../theme/runtime';
import {
  GRID_SPLIT_OPTIONS,
  LinghuiNodeEditorGridSplitToolbar,
} from './LinghuiNodeEditorGridSplitToolbar';
import {
  LinghuiNodeEditorVideoToolbar,
  VIDEO_TOOLBAR_ITEMS,
} from './LinghuiNodeEditorVideoToolbar';
import { LinghuiNodeEditorSurface } from './LinghuiNodeEditorSurface';
import {
  getNodeTypeLabel,
  getPanelMaxHeight,
  getPanelWidth,
  getViewportBoundHeight,
  getViewportBoundWidth,
  PANEL_GAP,
  TOOLBAR_STANDOFF,
} from './linghuiNodeEditorLayout';

interface LinghuiNodeEditorProps {
  nodeId: string;
  nodeType: LinghuiNodeType;
  forceVisible?: boolean;
}

/**
 * 导入素材节点（mode='import'）下需要隐藏的工具：
 * - focus / mark 是 in-place 二次生成工具，依赖 prompt + executor 生成流程；
 *   素材节点 executor 直接返回上传图片，这两个工具点击后只会保存状态但不会真的执行任何修复/重绘，属于假按钮。
 *   其余工具都是"派生下游新节点"行为，对素材节点同样有意义，因此保留。
 */
const IMPORT_HIDDEN_IMAGE_TOOLS = new Set<LinghuiImageToolKey>(['focus', 'mark']);

export const LinghuiNodeEditor: React.FC<LinghuiNodeEditorProps> = ({
  nodeId,
  nodeType,
  forceVisible = false,
}) => {
  const {
    selection,
    activeTool,
    setActiveTool,
    closeEditor,
    nodeRuns,
    workspaceId,
    onAssetLibraryMutate,
    onRunNode,
    onDeriveScriptShots,
    onGenerateScriptImages,
    onGenerateScriptVideos,
    onCreateDerivedVideoAnalysis,
    onExecuteMultiAngle,
    onApplyImageToolPreset,
    onCreateDerivedVideoFrames,
    onCreateDerivedVideoClips,
    onSetGridSplitType,
    onClearGridSplitCells,
    onExecuteGridSplit,
    gridSplitUpscaleFactor,
    onSetGridSplitUpscaleFactor,
    onRevertGridSplit,
    onSeparateVideoAudio,
    canvasInteractionVersion,
  } = useLinghuiNodeEditorApi();
  const { message } = App.useApp();
  const canvasZoom = useLinghuiCanvasZoom();
  const edges = useEdges();
  const nodes = useNodes();
  const nodeEntry = useNodesData(nodeId);

  const isVisible = forceVisible || (selection?.kind === 'node' && selection.nodeId === nodeId && selection.nodeType === nodeType);
  const nodeData = useMemo(() => (
    (nodeEntry?.data as unknown as LinghuiNodeData | undefined) ?? null
  ), [nodeEntry]);

  const nodeDataMap = useMemo(() => (
    new Map(nodes.map(node => [node.id, node.data as unknown as LinghuiNodeData]))
  ), [nodes]);
  const referenceEdges = useMemo(() => (
    edges.map(edge => ({
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    }))
  ), [edges]);
  const upstreamNodeIds = useMemo(() => (
    collectOrderedUpstreamReferenceNodeIds(nodeId, referenceEdges)
  ), [nodeId, referenceEdges]);

  const referenceMedia = useMemo(() => (
    buildLinghuiReferenceMediaBuckets({
      upstreamNodeIds,
      nodeDataMap,
      getNodeResult(upstreamNodeId) {
        return nodeRuns[upstreamNodeId]?.result;
      },
    })
  ), [nodeDataMap, nodeRuns, upstreamNodeIds]);
  const referenceImages = referenceMedia.images;
  const referenceVideos = referenceMedia.videos;
  const referenceAudios = referenceMedia.audios;

  const promptReferences = useMemo(() => (
    buildLinghuiPromptReferenceItems({
      nodeId,
      nodes: nodes.map(node => ({
        id: node.id,
        data: node.data as unknown as LinghuiNodeData,
      })),
      edges: referenceEdges,
      getNodeResult(upstreamNodeId) {
        return nodeRuns[upstreamNodeId]?.result;
      },
    })
  ), [nodeId, nodeRuns, nodes, referenceEdges]);
  const productionAssetSourceNodeData = useMemo(() => {
    if (nodeType !== 'linghui/image' || !nodeData) return null;
    const imageProperties = nodeData.properties as unknown as Partial<LinghuiImageNodeProperties>;
    const sourceNodeId = String(imageProperties.scriptSourceNodeId ?? '').trim();
    return sourceNodeId ? nodeDataMap.get(sourceNodeId) ?? null : null;
  }, [nodeData, nodeDataMap, nodeType]);
  const currentPrimaryImage = useMemo(() => (
    nodeData ? resolveLinghuiImagePrimaryForNode(nodeData, nodeRuns[nodeId]?.result) : null
  ), [nodeData, nodeId, nodeRuns]);
  const hasCurrentImage = Boolean(String(currentPrimaryImage?.source ?? '').trim());
  const currentPrimaryVideo = useMemo(() => (
    nodeType === 'linghui/video' ? getLinghuiResultPrimaryMedia(nodeRuns[nodeId]?.result) : null
  ), [nodeId, nodeRuns, nodeType]);
  const isVideoPassThroughNode = nodeType === 'linghui/video'
    && Boolean(String((nodeData?.properties as unknown as LinghuiVideoNodeProperties | undefined)?.source ?? '').trim());
  const hasCurrentVideo = nodeType === 'linghui/video'
    && Boolean(String(
      currentPrimaryVideo?.source
      ?? (nodeData?.properties as unknown as LinghuiVideoNodeProperties | undefined)?.source
      ?? '',
    ).trim());
  const activeImageTool = activeTool?.kind === 'image' && activeTool.nodeId === nodeId
    ? activeTool.tool
    : null;
  const activeVideoTool = activeTool?.kind === 'video' && activeTool.nodeId === nodeId
    ? activeTool.tool
    : null;
  const isVideoToolPanelOpen = nodeType === 'linghui/video' && hasCurrentVideo && Boolean(activeVideoTool);
  const isGridSplitMode = nodeType === 'linghui/image' && activeImageTool === 'grid-split';
  const isLibTVImageToolPanelOpen = nodeType === 'linghui/image'
    && hasCurrentImage
    && ['multi-angle', 'relight', 'outpaint', 'repaint'].includes(activeImageTool ?? '');
  const isTextGeneratorPanel = nodeType === 'linghui/text';
  const isVideoGeneratorPanel = nodeType === 'linghui/video' && !isVideoPassThroughNode;
  const isAudioGeneratorPanel = nodeType === 'linghui/audio';
  const isScriptGeneratorPanel = nodeType === 'linghui/script'
    && String((nodeData?.properties as { mode?: unknown } | undefined)?.mode ?? '') === 'generate';
  const isAgentGeneratorPanel = nodeType === 'linghui/agent';
  const isStoryboardGeneratorPanel = nodeType === 'linghui/storyboard';
  const isProductionWorkbenchPanel = nodeType === 'linghui/script' || nodeType === 'linghui/storyboard';
  const isImageToolbarOnlyTopBar = nodeType === 'linghui/image' && hasCurrentImage && !isGridSplitMode;
  const useMinimalTopBar = nodeType === 'linghui/image' && !hasCurrentImage && !isGridSplitMode;
  // 区分"导入素材节点"和"生成节点"。前者执行器只是回放上传图，不消费 prompt，
  // 因此 in-place 二次生成工具（focus/mark）对它无意义，必须在工具条与编辑器面板里都拦截掉。
  const isImportImageNode = useMemo(() => {
    if (nodeType !== 'linghui/image') return false;
    const rawProps = nodeData?.properties as unknown as Partial<LinghuiImageNodeProperties> | undefined;
    if (!rawProps) return false;
    if (rawProps.mode === 'import' || rawProps.mode === 'generate') {
      return rawProps.mode === 'import';
    }
    return Boolean(String(rawProps.source ?? '').trim());
  }, [nodeData, nodeType]);
  const safeZoom = Number.isFinite(canvasZoom) && canvasZoom > 0 ? canvasZoom : 1;
  const inverseZoom = 1 / safeZoom;
  const [openDropdownKey, setOpenDropdownKey] = useState<string | null>(null);
  const [panelPlacement, setPanelPlacement] = useState<'below' | 'above'>('below');
  const [panelViewportMaxHeight, setPanelViewportMaxHeight] = useState<number | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const gridSplitState = useLinghuiGridSplitOverlay(nodeId);
  const splitGridSize = gridSplitState?.gridSize ?? 2;
  const selectedSplitCells = gridSplitState?.selectedCells ?? [];
  const splitGridType = GRID_SPLIT_OPTIONS.find(option => option.size === splitGridSize)?.value ?? '2x2';

  const toolbarWidth = isGridSplitMode
    ? 640
    : nodeType === 'linghui/video'
      ? (!hasCurrentVideo ? 248 : Math.max(248, VIDEO_TOOLBAR_ITEMS.length * 88 + 108))
      : nodeType === 'linghui/image'
        ? (useMinimalTopBar ? 240 : 500)
        : 248;
  const panelGap = nodeType === 'linghui/image' ? 0 : PANEL_GAP;
  const panelWidth = isLibTVImageToolPanelOpen
    ? activeImageTool === 'relight'
      ? 640
      : activeImageTool === 'multi-angle'
        ? 560
        : 640
    : isVideoToolPanelOpen
      ? 416
      : isTextGeneratorPanel
      ? 392
      : isVideoGeneratorPanel
        ? 416
        : isAudioGeneratorPanel
          ? 392
          : isScriptGeneratorPanel
            ? 440
            : isAgentGeneratorPanel
              ? 440
              : isStoryboardGeneratorPanel
                ? 440
    : getPanelWidth(nodeType);
  const panelMaxHeight = isLibTVImageToolPanelOpen
    ? 620
    : isVideoToolPanelOpen
      ? 360
      : isTextGeneratorPanel
      ? 420
      : isVideoGeneratorPanel
        ? 430
        : isAudioGeneratorPanel
          ? 420
          : isScriptGeneratorPanel
            ? 520
            : isAgentGeneratorPanel
              ? 420
              : isStoryboardGeneratorPanel
                ? 520
          : getPanelMaxHeight(nodeType);

  useLayoutEffect(() => {
    if (!isVisible || !isProductionWorkbenchPanel || typeof window === 'undefined') {
      setPanelPlacement('below');
      setPanelViewportMaxHeight(null);
      return undefined;
    }

    const updatePanelPlacement = () => {
      const rect = editorContainerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const viewportMargin = 16;
      const gap = panelGap / safeZoom;
      const availableBelow = Math.max(0, window.innerHeight - rect.bottom - viewportMargin - gap);
      const availableAbove = Math.max(0, rect.top - viewportMargin - gap);
      const shouldPlaceAbove = availableBelow < Math.min(panelMaxHeight, 320) && availableAbove > availableBelow;
      const available = shouldPlaceAbove ? availableAbove : availableBelow;
      const nextMaxHeight = available > 0
        ? Math.min(panelMaxHeight, Math.max(180, Math.floor(available * safeZoom)))
        : panelMaxHeight;

      setPanelPlacement(shouldPlaceAbove ? 'above' : 'below');
      setPanelViewportMaxHeight(previous => (
        previous !== null && Math.abs(previous - nextMaxHeight) < 2 ? previous : nextMaxHeight
      ));
    };

    updatePanelPlacement();
    window.addEventListener('resize', updatePanelPlacement);
    window.addEventListener('scroll', updatePanelPlacement, true);
    return () => {
      window.removeEventListener('resize', updatePanelPlacement);
      window.removeEventListener('scroll', updatePanelPlacement, true);
    };
  }, [canvasInteractionVersion, isProductionWorkbenchPanel, isVisible, panelGap, panelMaxHeight, safeZoom]);

  const toolbarStyle = useMemo(() => cssVars({
    '--linghui-node-editor-bottom': `calc(100% + ${(TOOLBAR_STANDOFF / safeZoom).toFixed(3)}px)`,
    '--linghui-node-editor-width': getViewportBoundWidth(toolbarWidth),
    '--linghui-node-editor-scale': inverseZoom.toFixed(4),
  }), [inverseZoom, safeZoom, toolbarWidth]);

  const panelStyle = useMemo(() => cssVars({
    '--linghui-node-editor-top': `calc(100% + ${(panelGap / safeZoom).toFixed(3)}px)`,
    '--linghui-node-editor-panel-bottom': `calc(100% + ${(panelGap / safeZoom).toFixed(3)}px)`,
    '--linghui-node-editor-width': getViewportBoundWidth(panelWidth),
    '--linghui-node-editor-max-height': getViewportBoundHeight(panelViewportMaxHeight ?? panelMaxHeight),
    '--linghui-node-editor-scale': inverseZoom.toFixed(4),
  }), [inverseZoom, panelGap, panelMaxHeight, panelViewportMaxHeight, panelWidth, safeZoom]);

  const handleClose = useCallback(() => {
    setOpenDropdownKey(null);
    setActiveTool(null);
    closeEditor();
  }, [closeEditor, setActiveTool]);

  const handleStopPropagation = useCallback((event: React.SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  const handleDropdownOpenChange = useCallback((key: string, nextOpen: boolean) => {
    setOpenDropdownKey(current => {
      if (nextOpen) {
        return key;
      }
      return current === key ? null : current;
    });
  }, []);

  const handleDropdownTriggerClick = useCallback((event: React.MouseEvent<HTMLElement>, key: string) => {
    event.stopPropagation();
    setOpenDropdownKey(current => current === key ? null : key);
  }, []);

  const resolveDropdownContainer = useCallback((triggerNode: HTMLElement) => (
    (triggerNode.closest('.linghuiNodeEditorTopBar') as HTMLElement | null)
    ?? triggerNode.parentElement
    ?? triggerNode.ownerDocument.body
  ), []);

  useEffect(() => {
    setOpenDropdownKey(null);
  }, [isVisible, isGridSplitMode, nodeId, nodeType]);

  useEffect(() => {
    if (!hasCurrentVideo && activeTool?.kind === 'video' && activeTool.nodeId === nodeId) {
      setActiveTool(null);
    }
  }, [activeTool, hasCurrentVideo, nodeId, setActiveTool]);

  useEffect(() => {
    if (
      !hasCurrentImage
      && activeTool?.kind === 'image'
      && activeTool.nodeId === nodeId
      && (activeTool.tool === 'focus' || activeTool.tool === 'mark' || activeTool.tool === 'multi-angle')
    ) {
      setActiveTool(null);
    }
  }, [activeTool, hasCurrentImage, nodeId, setActiveTool]);

  // 导入素材节点禁止 focus/mark：若历史状态残留，立即关闭，避免编辑器渲染无效面板。
  useEffect(() => {
    if (
      isImportImageNode
      && activeTool?.kind === 'image'
      && activeTool.nodeId === nodeId
      && IMPORT_HIDDEN_IMAGE_TOOLS.has(activeTool.tool)
    ) {
      setActiveTool(null);
    }
  }, [activeTool, isImportImageNode, nodeId, setActiveTool]);

  const gridSplitMenuItems = useMemo<MenuProps['items']>(() => (
    GRID_SPLIT_OPTIONS.map(option => ({
      key: option.value,
      label: option.label,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        setOpenDropdownKey(null);
        onSetGridSplitType?.(option.value);
        onClearGridSplitCells?.();
        setActiveTool({ kind: 'image', nodeId, tool: 'grid-split' });
      },
    }))
  ), [nodeId, onClearGridSplitCells, onSetGridSplitType, setActiveTool]);

  const gridSplitUpscaleMenuItems = useMemo<MenuProps['items']>(() => (
    [2, 4].map(value => ({
      key: String(value),
      label: `${value}x`,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        setOpenDropdownKey(null);
        onSetGridSplitUpscaleFactor?.(value as 2 | 4);
      },
    }))
  ), [onSetGridSplitUpscaleFactor]);

  if (!isVisible || !nodeData) {
    return null;
  }

  if (nodeType === 'linghui/director3d') {
    // 3D 导演工作台脱离 Modal：用 portal 自建全屏容器，避免 modal 的内边距 / 默认动画
    // 干扰 viewport / timeline 的 flex 布局
    return ReactDOM.createPortal(
      <div className="linghuiDirector3DFullscreen">
        <button
          type="button"
          className="linghuiDirector3DFullscreenClose"
          onClick={handleClose}
          title="关闭 (Esc)"
        >
          <X size={16} />
        </button>
        <Director3DNodeEditor
          nodeId={nodeId}
          nodeData={nodeData}
          nodeRun={nodeRuns[nodeId]}
          onRun={() => onRunNode(nodeId)}
        />
      </div>,
      document.body,
    );
  }

  const renderToolbar = () => {
    if (nodeType === 'linghui/image') {
      if (!hasCurrentImage) {
        return null;
      }

      // 宫格切分模式：保留特殊工具条（用户在切分流程中需要"宫格档位/已选宫格数/创建生图节点/回退"专属操作）。
      if (isGridSplitMode) {
        return (
          <LinghuiNodeEditorGridSplitToolbar
            openDropdownKey={openDropdownKey}
            splitGridType={splitGridType}
            selectedSplitCellCount={selectedSplitCells.length}
            gridSplitUpscaleFactor={gridSplitUpscaleFactor}
            gridSplitMenuItems={gridSplitMenuItems}
            gridSplitUpscaleMenuItems={gridSplitUpscaleMenuItems}
            onDropdownOpenChange={handleDropdownOpenChange}
            onDropdownTriggerClick={handleDropdownTriggerClick}
            onExecuteGridSplit={onExecuteGridSplit}
            onRevertGridSplit={onRevertGridSplit}
            resolveDropdownContainer={resolveDropdownContainer}
          />
        );
      }

      // LibTV 1:1：图片节点常规态点击展开后，把同款工具条挂到编辑器顶部（点击菜单）。
      // 节点上方 hover 浮空工具条已删除，避免两套工具条不一致 + hover 闪退；统一只有这一处。
      return (
        <LinghuiImageNodeFloatingToolbar
          nodeId={nodeId}
          isPanorama={false /* 进入此分支说明 nodeType === 'linghui/image'，panorama 走另一支编辑器 */}
          primarySource={String(currentPrimaryImage?.source ?? '').trim() || undefined}
          variant="static"
          hiddenTools={isImportImageNode ? Array.from(IMPORT_HIDDEN_IMAGE_TOOLS) : undefined}
        />
      );
    }

    if (nodeType === 'linghui/video') {
      if (!hasCurrentVideo) {
        return null;
      }

      return (
        <LinghuiNodeEditorVideoToolbar
          nodeId={nodeId}
          activeVideoTool={activeVideoTool}
          message={message}
          onToolChange={tool => setActiveTool(tool ? { kind: 'video', nodeId, tool } : null)}
          onSeparateVideoAudio={onSeparateVideoAudio}
          resolveDropdownContainer={resolveDropdownContainer}
        />
      );
    }

    return null;
  };

  const toolbarContent = renderToolbar();

  return (
    <div ref={editorContainerRef} className="linghuiNodeEditorContainer nodrag nopan nowheel">
      {!isTextGeneratorPanel && !isVideoGeneratorPanel && !isAudioGeneratorPanel && !isScriptGeneratorPanel && !isAgentGeneratorPanel && !isStoryboardGeneratorPanel && (
        <div
          className={`linghuiNodeEditorTopBar ${useMinimalTopBar ? 'isMinimal' : ''} ${isImageToolbarOnlyTopBar ? 'isImageToolbarOnly' : ''}`}
          style={toolbarStyle}
          onClick={handleStopPropagation}
          onMouseDown={handleStopPropagation}
          onPointerDown={handleStopPropagation}
        >
          {!isImageToolbarOnlyTopBar && (
            <div className="linghuiNodeEditorTopBarMeta">
              <EditableCompactNodeLabel
                nodeId={nodeId}
                label={nodeData.label}
                fallbackLabel={getNodeTypeLabel(nodeType)}
                variant="editor"
                title="双击重命名节点"
              />
              {!useMinimalTopBar && (
                <div className="linghuiNodeEditorTopBarType">{getNodeTypeLabel(nodeType)}</div>
              )}
            </div>
          )}
          <div className="linghuiNodeEditorTopBarActions">
            {toolbarContent}
            {!isImageToolbarOnlyTopBar && (
              <button
                type="button"
                className="linghuiNodeEditorCloseButton"
                onClick={handleClose}
                aria-label="关闭节点编辑"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {!isGridSplitMode && (
        <div
          className={`linghuiNodeEditorMainSurface ${isTextGeneratorPanel || isVideoGeneratorPanel || isAudioGeneratorPanel || isScriptGeneratorPanel || isAgentGeneratorPanel || isStoryboardGeneratorPanel ? 'isTextGenerator' : ''} ${isProductionWorkbenchPanel ? `isProductionWorkbench is${panelPlacement === 'above' ? 'Above' : 'Below'}` : ''}`}
          style={panelStyle}
          onClick={handleStopPropagation}
          onMouseDown={handleStopPropagation}
          onPointerDown={handleStopPropagation}
        >
          <LinghuiNodeEditorSurface
            nodeId={nodeId}
            nodeType={nodeType}
            nodeData={nodeData}
            nodeRuns={nodeRuns}
            workspaceId={workspaceId}
            referenceImages={referenceImages}
            referenceVideos={referenceVideos}
            referenceAudios={referenceAudios}
            promptReferences={promptReferences}
            productionAssetSourceNodeData={productionAssetSourceNodeData}
            activeImageTool={activeImageTool}
            activeVideoTool={activeVideoTool}
            onImageToolChange={tool => setActiveTool(tool ? { kind: 'image', nodeId, tool } : null)}
            onVideoToolChange={tool => setActiveTool(tool ? { kind: 'video', nodeId, tool } : null)}
            onCreateDerivedVideoFrames={onCreateDerivedVideoFrames}
            onCreateDerivedVideoClips={onCreateDerivedVideoClips}
            onCreateDerivedVideoAnalysis={onCreateDerivedVideoAnalysis}
            onExecuteMultiAngle={onExecuteMultiAngle}
            onApplyImageToolPreset={onApplyImageToolPreset}
            onAssetLibraryMutate={onAssetLibraryMutate}
            onRunNode={onRunNode}
            onDeriveScriptShots={onDeriveScriptShots}
            onGenerateScriptImages={onGenerateScriptImages}
            onGenerateScriptVideos={onGenerateScriptVideos}
          />
        </div>
      )}
    </div>
  );
};
