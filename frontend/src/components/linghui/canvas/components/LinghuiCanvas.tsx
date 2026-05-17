import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { App as AntApp, Modal } from 'antd';
import {
  type Edge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useViewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { LinghuiCanvasSelection, LinghuiImageToolKey, LinghuiVideoToolKey } from '../../../../types/linghui';
import { EMPTY_LINGHUI_NODE_RUNS } from '../../../../types/linghui';
import { LinghuiCanvasProviders } from './LinghuiCanvasProviders';
import { LinghuiCanvasSurface } from './LinghuiCanvasSurface';
import { useLinghuiCanvasOverlayState } from '../hooks/useLinghuiCanvasOverlayState';
import { useLinghuiCanvasDocumentOps } from '../hooks/useLinghuiCanvasDocumentOps';
import { useLinghuiCanvasMediaImport } from '../hooks/useLinghuiCanvasMediaImport';
import { useLinghuiCanvasHotkeys } from '../hooks/useLinghuiCanvasHotkeys';
import { useLinghuiCanvasSelectionInteractions } from '../hooks/useLinghuiCanvasSelectionInteractions';
import { useLinghuiCanvasNodeInteractions } from '../hooks/useLinghuiCanvasNodeInteractions';
import { useLinghuiCanvasImperativeHandle } from '../hooks/useLinghuiCanvasImperativeHandle';
import { useLinghuiCanvasRunSummaries } from '../hooks/useLinghuiCanvasRunSummaries';
import { useLinghuiCanvasHistory } from '../hooks/useLinghuiCanvasHistory';
import { useLinghuiCanvasCallbackRefs } from '../hooks/useLinghuiCanvasCallbackRefs';
import { useLinghuiCanvasFlowBridge } from '../hooks/useLinghuiCanvasFlowBridge';
import { useLinghuiCanvasOverlayProps } from '../hooks/useLinghuiCanvasOverlayProps';
import { useLinghuiCanvasUiState } from '../hooks/useLinghuiCanvasUiState';
import { useLinghuiCanvasStore } from '../state/linghuiCanvasStore';
import { useLinghuiCanvasViewportControls } from '../hooks/useLinghuiCanvasViewportControls';
import { useLinghuiCanvasDoubleTapFitView } from '../hooks/useLinghuiCanvasDoubleTapFitView';
import { type PendingConnectionCreateState } from '../state/linghuiCanvasShared';
import {
  computeLinghuiCanvasElkLayout,
  type LinghuiCanvasOutlierNode,
} from '../state/linghuiCanvasLayout';
import type { LinghuiCanvasHandle, LinghuiCanvasProps } from '../state/linghuiCanvasTypes';

interface LayoutReviewState {
  previousPositions: Record<string, { x: number; y: number }>;
}

interface OutlierNoticeState {
  nodes: LinghuiCanvasOutlierNode[];
  currentIndex: number;
}
const LinghuiCanvasInner = forwardRef<LinghuiCanvasHandle, LinghuiCanvasProps>(function LinghuiCanvasInner(
  {
    workspace,
    projectEntry,
    nodeRuns,
    onGraphChange,
    onSelectionChange,
    onNodeMutate,
    onClearNodeRunState,
    onRestoreNodeRuns,
    onConnectionError,
    onAssetLibraryMutate,
    onWorkflowTemplateMutate,
    onRunSingleNode,
    onRunAll,
    onRunSelection,
    onExportSelection,
    onFocusFailedNode,
    onRetryFailed,
    onRerunAffected,
    onCancelRun,
    executionQueue,
    onOpenDrawer,
  },
  ref,
) {
  const { message } = AntApp.useApp();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [canvasInteractionVersion, setCanvasInteractionVersion] = useState(0);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [shortcutPanelOpen, setShortcutPanelOpen] = useState(false);
  const [layoutReview, setLayoutReview] = useState<LayoutReviewState | null>(null);
  const [isLayouting, setIsLayouting] = useState(false);
  const [outlierNotice, setOutlierNotice] = useState<OutlierNoticeState | null>(null);
  const reactFlow = useReactFlow();

  const viewport = useViewport();

  const pendingConnectionCreateRef = useRef<PendingConnectionCreateState | null>(null);
  const {
    setSelection,
    editorSelection,
    setEditorSelection,
    activeNodeTool,
    setActiveNodeTool,
    hostRef,
    canvasRect,
    setCanvasRect,
    canvasMode,
    setCanvasMode,
    pendingGroupFrame,
    setPendingGroupFrame,
    gridSplitType,
    setGridSplitType,
    gridSplitSelectedCells,
    setGridSplitSelectedCells,
    gridSplitUpscaleFactor,
    setGridSplitUpscaleFactor,
    toggleGridSplitCell,
    revertGridSplitTool,
    resetLocalCanvasUiState,
  } = useLinghuiCanvasUiState();
  const {
    onSelectionChangeRef,
    onNodeMutateRef,
    onConnectionErrorRef,
    onRunSingleNodeRef,
  } = useLinghuiCanvasCallbackRefs({
    onSelectionChange,
    onNodeMutate,
    onConnectionError,
    onRunSingleNode,
    onOpenDrawer,
  });

  const selectedNodeIds = useMemo(
    () => nodes.filter(node => node.selected).map(node => node.id),
    [nodes],
  );
  const selectedEdgeIds = useMemo(
    () => edges.filter(edge => edge.selected).map(edge => edge.id),
    [edges],
  );

  const {
    contextMenu,
    quickCreate,
    setContextMenu,
    setQuickCreate,
    contextMenuSelectionIds,
    quickCreateCatalog,
    pendingGroupFrameStyle,
    pendingGroupCreatableIds,
    pendingGroupActionsStyle,
    closeContextMenu,
    closeQuickCreate,
    closeQuickCreateFromPane,
    openContextMenuAt,
    openQuickCreateAt,
  } = useLinghuiCanvasOverlayState({
    hostRef,
    reactFlow,
    nodes,
    selectedNodeIds,
    pendingGroupFrame,
    canvasRect,
    viewport,
  });

  const resetCanvasUiState = useCallback(() => {
    resetLocalCanvasUiState();
  }, [resetLocalCanvasUiState]);

  const {
    canUndo,
    canRedo,
    scheduleSnapshot,
    emitSnapshot,
    emitSnapshotRef,
    reactFlowRef,
    setNodesRef,
    undoHistory,
    redoHistory,
  } = useLinghuiCanvasHistory({
    reactFlow,
    workspace,
    nodeRuns,
    setNodes,
    setEdges,
    onGraphChange,
    onRestoreNodeRuns,
    resetUiState: resetCanvasUiState,
  });

  const {
    hasClipboardData,
    buildClipboardSnapshot,
    copySelectionToClipboard,
    insertSubgraphSnapshotAtScreenPosition,
    pasteClipboardSnapshot,
    duplicateSelection,
    createNodeFromWorkspaceAsset,
    deleteNodesByIds,
    deleteEdgesByIds,
    ungroupGroupsByIds,
    insertNodeAtScreenPosition,
    deriveStoryboardShotsFromScript,
    deriveStoryboardImagesFromScript,
    deriveStoryboardVideosFromScript,
    createGroupFromSelection,
    createDerivedImageNodesFromNode,
    createDerivedVideoNodesFromNode,
    createDerivedPanoramaNodeFromNode,
    createDerivedAudioNodeFromVideo,
    createDerivedMultiAngleImageNodeFromNode,
    createDerivedImageToolNodeFromNode,
    applyTextEmptyAction,
    applyVideoEmptyAction,
    applyAudioEmptyAction,
    clearPendingGroupFrame,
  } = useLinghuiCanvasDocumentOps({
    reactFlow,
    hostRef,
    setNodes,
    setEdges,
    setEditorSelection,
    setContextMenu,
    setQuickCreate,
    setPendingGroupFrame,
    pendingGroupFrame,
    scheduleSnapshot,
    onClearNodeRunState,
  });

  const {
    handleUploadImagesToCanvas,
    handleUploadVideosToCanvas,
    handleUploadAudiosToCanvas,
    handleDragOver,
    handleDrop,
  } = useLinghuiCanvasMediaImport({
    workspaceId: workspace?.id,
    hostRef,
    reactFlow,
    setNodes,
    setEditorSelection,
    scheduleSnapshot,
    clearPendingGroupFrame,
    closeContextMenu,
    closeQuickCreate,
    insertNodeAtScreenPosition,
    message,
  });

  useEffect(() => {
    if (contextMenu && hostRef.current) {
      setCanvasRect(hostRef.current.getBoundingClientRect());
    }
  }, [contextMenu]);

  const { canvasRunSummary, groupRunSummaries } = useLinghuiCanvasRunSummaries({
    nodes,
    edges,
    nodeRuns,
  });

  const { zoomIn, zoomOut, focusContent, zoomToPreset } = useLinghuiCanvasViewportControls(reactFlow);
  useLinghuiCanvasDoubleTapFitView({
    hostRef,
    onFitView: focusContent,
  });

  const openQuickCreateAtCenter = useCallback(() => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return;
    openQuickCreateAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [hostRef, openQuickCreateAt]);

  const handleRunHotkey = useCallback(() => {
    if (selectedNodeIds.length > 0 && onRunSelection) {
      onRunSelection();
      return;
    }
    onRunAll?.();
  }, [onRunAll, onRunSelection, selectedNodeIds.length]);

  const handleFormatLayout = useCallback(async () => {
    if (isLayouting) return;
    const currentNodes = reactFlow.getNodes();
    if (currentNodes.length <= 1) {
      focusContent();
      return;
    }

    setIsLayouting(true);
    try {
      const result = await computeLinghuiCanvasElkLayout(currentNodes, reactFlow.getEdges());
      const updateMap = new Map(result.updates.map(update => [update.id, update.position]));
      setOutlierNotice(result.outlierNodes.length > 0
        ? { nodes: result.outlierNodes, currentIndex: 0 }
        : null);

      if (updateMap.size === 0) {
        message.info('画布布局已整齐');
        focusContent();
        return;
      }

      const previousPositions: LayoutReviewState['previousPositions'] = {};
      for (const node of currentNodes) {
        if (updateMap.has(node.id)) {
          previousPositions[node.id] = { x: node.position.x, y: node.position.y };
        }
      }

      setNodes(existingNodes => existingNodes.map(node => {
        const nextPosition = updateMap.get(node.id);
        return nextPosition ? { ...node, position: nextPosition } : node;
      }));
      setLayoutReview({ previousPositions });
      setCanvasInteractionVersion(version => version + 1);
      requestAnimationFrame(() => {
        focusContent();
      });
    } catch (error) {
      console.error('[LinghuiCanvas] format layout failed', error);
      message.error('整理画布失败，请稍后重试');
    } finally {
      setIsLayouting(false);
    }
  }, [focusContent, isLayouting, message, reactFlow, setNodes]);

  const handleRestoreLayout = useCallback(() => {
    if (!layoutReview) return;
    const previousPositions = layoutReview.previousPositions;
    setNodes(existingNodes => existingNodes.map(node => {
      const previousPosition = previousPositions[node.id];
      return previousPosition ? { ...node, position: previousPosition } : node;
    }));
    setLayoutReview(null);
    setCanvasInteractionVersion(version => version + 1);
    requestAnimationFrame(() => {
      scheduleSnapshot({ force: true });
      focusContent();
    });
  }, [focusContent, layoutReview, scheduleSnapshot, setNodes]);

  const handleKeepLayout = useCallback(() => {
    setLayoutReview(null);
    requestAnimationFrame(() => {
      scheduleSnapshot({ force: true });
    });
  }, [scheduleSnapshot]);

  const handleNavigateToOutlier = useCallback(() => {
    setOutlierNotice(current => {
      if (!current || current.nodes.length === 0) return current;
      const target = current.nodes[current.currentIndex] ?? current.nodes[0];
      reactFlow.setCenter(target.cx, target.cy, {
        duration: 280,
        zoom: Math.max(reactFlow.getViewport().zoom, 0.75),
      });
      return {
        ...current,
        currentIndex: current.nodes.length > 1
          ? (current.currentIndex + 1) % current.nodes.length
          : current.currentIndex,
      };
    });
  }, [reactFlow]);

  const handleDismissOutliers = useCallback(() => {
    setOutlierNotice(null);
  }, []);

  // LibTV canvas:cancel-connect：Esc 取消正在拖拽的连线，避免松手时仍弹 quickCreate。
  // 清空 pendingConnectionCreateRef 后让 handleConnectEnd 的 resolveQuickCreateFromConnectEnd
  // 因 pendingConnection 为 null 自动返回 {open:false}；再发 pointerup 终结 React Flow 内部 drag。
  const cancelPendingConnection = useCallback(() => {
    if (!pendingConnectionCreateRef.current) return false;
    pendingConnectionCreateRef.current = null;
    if (typeof window !== 'undefined') {
      const evt = new PointerEvent('pointerup', { bubbles: true, cancelable: true });
      window.dispatchEvent(evt);
    }
    return true;
  }, []);

  // LibTV nO（onBeforeDelete）：键盘删除节点前，如果节点已有生成结果就弹二次确认；空节点直接删。
  const confirmDeleteNodes = useCallback((nodeIds: string[]) => {
    if (!nodeIds.length) return;
    const hasContent = nodeIds.some(id => {
      const run = nodeRuns[id];
      return run?.status === 'succeeded' || run?.status === 'failed' || run?.status === 'stale';
    });
    if (!hasContent) {
      deleteNodesByIds(nodeIds);
      return;
    }
    Modal.confirm({
      title: nodeIds.length > 1 ? `删除 ${nodeIds.length} 个节点` : '删除节点',
      content: '所选节点包含已生成的内容，删除后可通过 ⌘Z 撤销。确定删除？',
      okText: '确定删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => deleteNodesByIds(nodeIds),
    });
  }, [deleteNodesByIds, nodeRuns]);

  useLinghuiCanvasHotkeys({
    canUndo,
    canRedo,
    selectedNodeIds,
    pendingGroupFrame,
    copySelectionToClipboard,
    pasteClipboardSnapshot,
    duplicateSelection,
    deleteNodesByIds,
    deleteEdgesByIds,
    undoHistory,
    redoHistory,
    closeContextMenu,
    closeQuickCreate,
    clearPendingGroupFrame,
    onRunRequested: handleRunHotkey,
    onOpenQuickCreate: openQuickCreateAtCenter,
    onFormatLayout: handleFormatLayout,
    onFocusContent: focusContent,
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
    onToggleShortcutPanel: () => setShortcutPanelOpen(open => !open),
    onCancelPendingConnection: cancelPendingConnection,
    confirmDeleteNodes,
    selectedEdgeIds,
  });
  const {
    handleNodesChange,
    handleEdgesChange,
    handleConnect,
    handleIsValidConnection,
    handleSelectionChange,
    handleMoveEnd,
    handleConnectStart,
    handleConnectEnd,
    updateLinghuiNodeData,
  } = useLinghuiCanvasFlowBridge({
    reactFlow,
    hostRef,
    onNodesChange,
    onEdgesChange,
    setNodes,
    setEdges,
    setSelection,
    setEditorSelection,
    setCanvasRect,
    scheduleSnapshot,
    emitSnapshot,
    openQuickCreateAt,
    pendingConnectionCreateRef,
    onSelectionChangeRef,
    onNodeMutateRef,
    onConnectionErrorRef,
  });

  const {
    handlePaneContextMenu,
    handleCanvasDoubleClick,
    handleSelectionStart,
    handleSelectionDragStart: handleSelectionDragStartBase,
    handleSelectionDragStop: handleSelectionDragStopBase,
    handleSelectionContextMenu,
    handleSelectionEnd,
  } = useLinghuiCanvasSelectionInteractions({
    canvasMode,
    selectedNodeIds,
    pendingGroupFrame,
    reactFlow,
    setNodes,
    setPendingGroupFrame,
    setEditorSelection,
    openContextMenuAt,
    openQuickCreateAt: (clientX, clientY) => {
      openQuickCreateAt(clientX, clientY);
    },
    closeContextMenu,
  });

  // LibTV interacting：节点/框选拖拽过程中通过 .canvas-interacting 暂停 glow/breathe/shimmer 动画。
  const setInteracting = useLinghuiCanvasStore(state => state.setInteracting);
  const interacting = useLinghuiCanvasStore(state => state.interacting);

  const handleSelectionDragStart = useCallback<NonNullable<typeof handleSelectionDragStartBase>>(
    (...args) => {
      setInteracting(true);
      return handleSelectionDragStartBase(...args);
    },
    [handleSelectionDragStartBase, setInteracting],
  );

  const handleSelectionDragStop = useCallback<NonNullable<typeof handleSelectionDragStopBase>>(
    (...args) => {
      setInteracting(false);
      return handleSelectionDragStopBase(...args);
    },
    [handleSelectionDragStopBase, setInteracting],
  );

  const handleNodeDragStart = useCallback(() => {
    closeContextMenu();
    closeQuickCreate();
    setActiveNodeTool(null);
    setInteracting(true);
    setCanvasInteractionVersion(version => version + 1);
  }, [closeContextMenu, closeQuickCreate, setActiveNodeTool, setInteracting]);

  const handleNodeDragStop = useCallback(() => {
    setInteracting(false);
    setCanvasInteractionVersion(version => version + 1);
  }, [setInteracting]);

  const {
    bindNodeSurface,
    openNodeContextMenu,
    openNodeEditor,
    openNodeToolPanel,
    handleNodeContextMenu,
    handleNodeClick,
    handlePaneClick,
  } = useLinghuiCanvasNodeInteractions({
    reactFlow,
    setNodes,
    setEditorSelection,
    setActiveNodeTool,
    setPendingGroupFrame,
    closeContextMenu,
    closeQuickCreate,
    closeQuickCreateFromPane,
    openContextMenuAt,
    emitSnapshot,
    onNodeDragStart: handleNodeDragStart,
    onNodeDragStop: handleNodeDragStop,
  });

  const nodeInteractionApi = useMemo(() => ({
    bindNodeSurface,
    openNodeContextMenu,
    openNodeEditor,
    openImageToolPanel(nodeId: string, tool: LinghuiImageToolKey) {
      openNodeToolPanel({ kind: 'image', nodeId, tool });
    },
    openVideoToolPanel(nodeId: string, tool: LinghuiVideoToolKey) {
      openNodeToolPanel({ kind: 'video', nodeId, tool });
    },
  }), [bindNodeSurface, openNodeContextMenu, openNodeEditor, openNodeToolPanel]);

  const clearNodeRunState = useCallback((nodeId: string) => {
    onClearNodeRunState?.(nodeId);
  }, [onClearNodeRunState]);

  const nodeMutationApi = useMemo(() => ({
    updateNodeData: updateLinghuiNodeData,
    clearNodeRunState,
  }), [clearNodeRunState, updateLinghuiNodeData]);

  const selectSingleEdge = useCallback((edgeId: string) => {
    setEdges(currentEdges => currentEdges.map(edge => ({
      ...edge,
      selected: edge.id === edgeId,
    })));
    setNodes(currentNodes => currentNodes.map(node => (
      node.selected ? { ...node, selected: false } : node
    )));
    setEditorSelection(null);
    setActiveNodeTool(null);
    setPendingGroupFrame(null);
  }, [setActiveNodeTool, setEditorSelection, setEdges, setNodes, setPendingGroupFrame]);

  const handleEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    event.stopPropagation();
    closeContextMenu();
    closeQuickCreate();
    selectSingleEdge(edge.id);
  }, [closeContextMenu, closeQuickCreate, selectSingleEdge]);

  const handleEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    event.stopPropagation();
    closeQuickCreate();
    selectSingleEdge(edge.id);
    openContextMenuAt(event.clientX, event.clientY, 'edge', { edgeId: edge.id, selectionIds: [] });
  }, [closeQuickCreate, openContextMenuAt, selectSingleEdge]);

  const overlayProps = useLinghuiCanvasOverlayProps({
    editorSelection,
    activeNodeTool,
    setActiveNodeTool,
    onCloseEditor: () => {
      setEditorSelection(null);
      setActiveNodeTool(null);
    },
    nodeRuns,
    executionQueue,
    workspaceId: workspace?.id ?? null,
    updateNodeData: updateLinghuiNodeData,
    onClearNodeRunState,
    canvasRect,
    gridSplitType,
    setGridSplitType,
    gridSplitSelectedCells,
    setGridSplitSelectedCells,
    gridSplitUpscaleFactor,
    setGridSplitUpscaleFactor,
    revertGridSplitTool,
    pendingGroupFrameStyle,
    pendingGroupActionsStyle,
    pendingGroupCreatableIds,
    createGroupFromSelection,
    clearPendingGroupFrame,
    quickCreate,
    quickCreateCatalog,
    contextMenu,
    contextMenuSelectionIds,
    hasClipboardData,
    canUndo,
    canRedo,
    reactFlow,
    message,
    onAssetLibraryMutate,
    onWorkflowTemplateMutate,
    onRunSelection,
    onRunAll,
    onExportSelection,
    onFormatLayout: handleFormatLayout,
    onOpenShortcutPanel: () => setShortcutPanelOpen(open => !open),
    onRunSingleNodeRef,
    openQuickCreateAt,
    closeContextMenu,
    insertNodeAtScreenPosition,
    deriveStoryboardShotsFromScript,
    deriveStoryboardImagesFromScript,
    deriveStoryboardVideosFromScript,
    createDerivedImageNodesFromNode,
    createDerivedVideoNodesFromNode,
    createDerivedPanoramaNodeFromNode,
    createDerivedAudioNodeFromVideo,
    createDerivedMultiAngleImageNodeFromNode,
    createDerivedImageToolNodeFromNode,
    applyTextEmptyAction,
    applyVideoEmptyAction,
    applyAudioEmptyAction,
    copySelectionToClipboard,
    duplicateSelection,
    pasteClipboardSnapshot,
    deleteNodesByIds,
    deleteEdgesByIds,
    ungroupGroupsByIds,
    handleUploadImagesToCanvas,
    handleUploadVideosToCanvas,
    handleUploadAudiosToCanvas,
    buildClipboardSnapshot,
    undoHistory,
    redoHistory,
  });

  useLinghuiCanvasImperativeHandle({
    ref,
    reactFlowRef,
    setNodesRef,
    hostRef,
    emitSnapshotRef,
    createNodeFromWorkspaceAsset,
    insertSubgraphSnapshotAtScreenPosition,
    handleUploadImagesToCanvas,
    handleUploadVideosToCanvas,
    handleUploadAudiosToCanvas,
    createGroupFromSelection,
  });

  return (
    <LinghuiCanvasSurface
      hostRef={hostRef}
      canvasMode={canvasMode}
      interacting={interacting}
      canvasZoom={viewport.zoom}
      nodeInteraction={nodeInteractionApi}
      nodeMutation={nodeMutationApi}
      executionTrace={{
        edgeStatuses: canvasRunSummary.edgeStatuses,
        failedNodeIds: canvasRunSummary.failedNodeIds,
        staleNodeIds: canvasRunSummary.staleNodeIds,
      }}
      canvasInteractionVersion={canvasInteractionVersion}
      gridSplitOverlay={{
        nodeId: activeNodeTool?.kind === 'image' && activeNodeTool.tool === 'grid-split' ? activeNodeTool.nodeId : null,
        gridSize: (() => {
          const sizes: Record<string, number> = { '2x2': 2, '3x3': 3, '4x4': 4, '5x5': 5 };
          return sizes[gridSplitType] ?? 2;
        })(),
        selectedCells: gridSplitSelectedCells,
        toggleCell: toggleGridSplitCell,
      }}
      groupRunSummaries={groupRunSummaries}
      rootHandlers={{
        onDragOver: handleDragOver,
        onDrop: handleDrop,
        onDoubleClick: handleCanvasDoubleClick,
      }}
      hudProps={{
        projectEntry,
        canvasMode,
        zoom: viewport.zoom,
        runSummary: {
          ...canvasRunSummary,
          queued: executionQueue?.queuedNodeIds.length ?? 0,
          queueStatus: executionQueue?.status ?? 'idle',
        },
        showEmpty: !workspace,
        onFocusFailedNode,
        onRetryFailed,
        onRerunAffected,
        onCancelRun,
        onRunAll,
        onRunSelection,
        onSetCanvasMode: setCanvasMode,
        showMiniMap,
        snapToGrid,
        shortcutPanelOpen,
        layoutReviewPending: Boolean(layoutReview),
        isLayouting,
        outlierNotice: outlierNotice
          ? { count: outlierNotice.nodes.length, currentIndex: outlierNotice.currentIndex }
          : null,
        onToggleMiniMap: () => setShowMiniMap(open => !open),
        onToggleSnapToGrid: () => setSnapToGrid(enabled => !enabled),
        onFormatLayout: handleFormatLayout,
        onRestoreLayout: handleRestoreLayout,
        onKeepLayout: handleKeepLayout,
        onNavigateToOutlier: handleNavigateToOutlier,
        onDismissOutliers: handleDismissOutliers,
        onToggleShortcutPanel: () => setShortcutPanelOpen(open => !open),
        onZoomOut: zoomOut,
        onFocusContent: focusContent,
        onZoomIn: zoomIn,
        onZoomToPreset: zoomToPreset,
      }}
      stageProps={{
        nodes,
        edges,
        canvasMode,
        showMiniMap,
        snapToGrid,
        onNodesChange: handleNodesChange,
        onEdgesChange: handleEdgesChange,
        onConnect: handleConnect,
        onConnectStart: handleConnectStart,
        onConnectEnd: handleConnectEnd,
        isValidConnection: handleIsValidConnection,
        onSelectionChange: handleSelectionChange,
        onSelectionDragStart: handleSelectionDragStart,
        onSelectionDragStop: handleSelectionDragStop,
        onSelectionContextMenu: handleSelectionContextMenu,
        onSelectionStart: handleSelectionStart,
        onSelectionEnd: handleSelectionEnd,
        onNodeClick: handleNodeClick,
        onNodeContextMenu: handleNodeContextMenu,
        onNodeDragStart: handleNodeDragStart,
        onNodeDragStop: handleNodeDragStop,
        onEdgeClick: handleEdgeClick,
        onEdgeContextMenu: handleEdgeContextMenu,
        onPaneClick: handlePaneClick,
        onPaneContextMenu: handlePaneContextMenu,
        onMoveEnd: handleMoveEnd,
      }}
      overlayProps={overlayProps}
    />
  );
});

const LinghuiCanvasComponent = forwardRef<LinghuiCanvasHandle, LinghuiCanvasProps>(function LinghuiCanvas(
  props,
  ref,
) {
  if (!props) {
    return null;
  }

  const nodeRuns = props.nodeRuns ?? EMPTY_LINGHUI_NODE_RUNS;

  return (
    <LinghuiCanvasProviders
      nodeRuns={nodeRuns}
      onConnectionError={props.onConnectionError}
    >
      <LinghuiCanvasInner {...props} nodeRuns={nodeRuns} ref={ref} />
    </LinghuiCanvasProviders>
  );
});

function areLinghuiCanvasPropsEqual(prev: LinghuiCanvasProps, next: LinghuiCanvasProps): boolean {
  return (
    prev.workspace === next.workspace &&
    prev.projectEntry === next.projectEntry &&
    prev.nodeRuns === next.nodeRuns &&
    prev.onGraphChange === next.onGraphChange &&
    prev.onSelectionChange === next.onSelectionChange &&
    prev.onNodeMutate === next.onNodeMutate &&
    prev.onClearNodeRunState === next.onClearNodeRunState &&
    prev.onConnectionError === next.onConnectionError &&
    prev.onAssetLibraryMutate === next.onAssetLibraryMutate &&
    prev.onWorkflowTemplateMutate === next.onWorkflowTemplateMutate &&
    prev.onRunSingleNode === next.onRunSingleNode &&
    prev.onRunAll === next.onRunAll &&
    prev.onRunSelection === next.onRunSelection &&
    prev.onExportSelection === next.onExportSelection &&
    prev.onFocusFailedNode === next.onFocusFailedNode &&
    prev.onRetryFailed === next.onRetryFailed &&
    prev.onRerunAffected === next.onRerunAffected &&
    prev.onCancelRun === next.onCancelRun &&
    prev.executionQueue === next.executionQueue &&
    prev.onOpenDrawer === next.onOpenDrawer
  );
}

export const LinghuiCanvas = memo(LinghuiCanvasComponent, areLinghuiCanvasPropsEqual);
LinghuiCanvas.displayName = 'LinghuiCanvas';

export type { LinghuiCanvasHandle, LinghuiCanvasProps } from '../state/linghuiCanvasTypes';
export default LinghuiCanvas;
