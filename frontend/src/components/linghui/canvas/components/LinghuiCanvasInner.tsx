import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { App as AntApp } from 'antd';
import {
  useNodesState,
  useEdgesState,
  useReactFlow,
  useViewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
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
import { useLinghuiCanvasStore } from '../state/linghuiCanvasStore';
import { useLinghuiCanvasUiState } from '../hooks/useLinghuiCanvasUiState';
import { useLinghuiCanvasViewportControls } from '../hooks/useLinghuiCanvasViewportControls';
import { useLinghuiCanvasDoubleTapFitView } from '../hooks/useLinghuiCanvasDoubleTapFitView';
import { useLinghuiCanvasLayout } from '../hooks/useLinghuiCanvasLayout';
import { useLinghuiCanvasInteractionHelpers } from '../hooks/useLinghuiCanvasInteractionHelpers';
import { useLinghuiCanvasNodeApi } from '../hooks/useLinghuiCanvasNodeApi';
import type { LinghuiCanvasHandle, LinghuiCanvasProps } from '../state/linghuiCanvasTypes';

export const LinghuiCanvasInner = forwardRef<LinghuiCanvasHandle, LinghuiCanvasProps>(function LinghuiCanvasInner(
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
  const reactFlow = useReactFlow();
  const viewport = useViewport();
  const pendingConnectionCreateRef = useRef<import('../state/linghuiCanvasShared').PendingConnectionCreateState | null>(null);

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
  } = useLinghuiCanvasCallbackRefs({ onSelectionChange, onNodeMutate, onConnectionError, onRunSingleNode, onOpenDrawer });

  const selectedNodeIds = useMemo(() => nodes.filter(n => n.selected).map(n => n.id), [nodes]);
  const selectedEdgeIds = useMemo(() => edges.filter(e => e.selected).map(e => e.id), [edges]);

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
    hostRef, reactFlow, nodes, selectedNodeIds, pendingGroupFrame, canvasRect, viewport,
  });

  const resetCanvasUiState = useCallback(() => resetLocalCanvasUiState(), [resetLocalCanvasUiState]);

  const {
    canUndo, canRedo, scheduleSnapshot, emitSnapshot, emitSnapshotRef,
    reactFlowRef, setNodesRef, undoHistory, redoHistory,
  } = useLinghuiCanvasHistory({
    reactFlow, workspace, nodeRuns, setNodes, setEdges,
    onGraphChange, onRestoreNodeRuns, resetUiState: resetCanvasUiState,
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
    reactFlow, hostRef, setNodes, setEdges, setEditorSelection,
    setContextMenu, setQuickCreate, setPendingGroupFrame, pendingGroupFrame,
    scheduleSnapshot, onClearNodeRunState,
  });

  const {
    handleUploadImagesToCanvas,
    handleUploadVideosToCanvas,
    handleUploadAudiosToCanvas,
    handleDragOver,
    handleDrop,
  } = useLinghuiCanvasMediaImport({
    workspaceId: workspace?.id, hostRef, reactFlow, setNodes,
    setEditorSelection, scheduleSnapshot, clearPendingGroupFrame,
    closeContextMenu, closeQuickCreate, insertNodeAtScreenPosition, message,
  });

  useEffect(() => {
    if (contextMenu && hostRef.current) {
      setCanvasRect(hostRef.current.getBoundingClientRect());
    }
  }, [contextMenu, hostRef, setCanvasRect]);

  const { canvasRunSummary, groupRunSummaries } = useLinghuiCanvasRunSummaries({ nodes, edges, nodeRuns });
  const { zoomIn, zoomOut, focusContent, zoomToPreset } = useLinghuiCanvasViewportControls(reactFlow);

  const {
    layoutReview, isLayouting, outlierNotice,
    handleFormatLayout, handleRestoreLayout, handleKeepLayout,
    handleNavigateToOutlier, handleDismissOutliers,
  } = useLinghuiCanvasLayout({
    reactFlow, setNodes, message, focusContent, scheduleSnapshot,
  });
  useLinghuiCanvasDoubleTapFitView({ hostRef, onFitView: focusContent });

  const openQuickCreateAtCenter = useCallback(() => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return;
    openQuickCreateAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [hostRef, openQuickCreateAt]);

  const handleRunHotkey = useCallback(() => {
    if (selectedNodeIds.length > 0 && onRunSelection) return void onRunSelection();
    onRunAll?.();
  }, [onRunAll, onRunSelection, selectedNodeIds.length]);

  // LibTV canvas:cancel-connect
  const { cancelPendingConnection, confirmDeleteNodes, selectSingleEdge, handleEdgeClick, handleEdgeContextMenu } = useLinghuiCanvasInteractionHelpers({
    setNodes, setEdges, setEditorSelection, setActiveNodeTool, setPendingGroupFrame,
    closeContextMenu, closeQuickCreate, openContextMenuAt,
    deleteNodesByIds, deleteEdgesByIds, nodeRuns, pendingConnectionCreateRef,
  });

  useLinghuiCanvasHotkeys({
    canUndo, canRedo, selectedNodeIds, pendingGroupFrame,
    copySelectionToClipboard, pasteClipboardSnapshot, duplicateSelection,
    deleteNodesByIds, deleteEdgesByIds, undoHistory, redoHistory,
    closeContextMenu, closeQuickCreate, clearPendingGroupFrame,
    onRunRequested: handleRunHotkey, onOpenQuickCreate: openQuickCreateAtCenter,
    onFormatLayout: handleFormatLayout, onFocusContent: focusContent,
    onZoomIn: zoomIn, onZoomOut: zoomOut,
    onToggleShortcutPanel: () => setShortcutPanelOpen(o => !o),
    onCancelPendingConnection: cancelPendingConnection, confirmDeleteNodes, selectedEdgeIds,
  });

  const {
    handleNodesChange, handleEdgesChange, handleConnect, handleIsValidConnection,
    handleSelectionChange, handleMoveEnd, handleConnectStart, handleConnectEnd,
    updateLinghuiNodeData,
  } = useLinghuiCanvasFlowBridge({
    reactFlow, hostRef, onNodesChange, onEdgesChange, setNodes, setEdges,
    setSelection, setEditorSelection, setCanvasRect, scheduleSnapshot, emitSnapshot,
    openQuickCreateAt, pendingConnectionCreateRef, onSelectionChangeRef, onNodeMutateRef, onConnectionErrorRef,
  });

  const {
    handlePaneContextMenu, handleCanvasDoubleClick,
    handleSelectionStart,
    handleSelectionDragStart: handleSelectionDragStartBase,
    handleSelectionDragStop: handleSelectionDragStopBase,
    handleSelectionContextMenu, handleSelectionEnd,
  } = useLinghuiCanvasSelectionInteractions({
    canvasMode, selectedNodeIds, pendingGroupFrame, reactFlow, setNodes,
    setPendingGroupFrame, setEditorSelection, openContextMenuAt, closeContextMenu,
    openQuickCreateAt: (x, y) => openQuickCreateAt(x, y),
  });

  const interacting = useLinghuiCanvasStore((s: any) => s.interacting);
  const setInteracting = useLinghuiCanvasStore((s: any) => s.setInteracting);
  const handleSelectionDragStart = useCallback((...a: any[]) => { setInteracting(true); (handleSelectionDragStartBase as any)?.(...a); }, [handleSelectionDragStartBase, setInteracting]);
  const handleSelectionDragStop = useCallback((...a: any[]) => { setInteracting(false); (handleSelectionDragStopBase as any)?.(...a); }, [handleSelectionDragStopBase, setInteracting]);
  // @@Linghui 行内：handleNodeDragStart/handleNodeDragStop 仅有 8+4 行
  const handleNodeDragStart = useCallback(() => {
    closeContextMenu(); closeQuickCreate(); setActiveNodeTool(null);
    setInteracting(true); setCanvasInteractionVersion(v => v + 1);
  }, [closeContextMenu, closeQuickCreate, setActiveNodeTool, setInteracting, setCanvasInteractionVersion]);
  const handleNodeDragStop = useCallback(() => {
    setInteracting(false); setCanvasInteractionVersion(v => v + 1);
  }, [setInteracting, setCanvasInteractionVersion]);

  const {
    bindNodeSurface, openNodeContextMenu, openNodeEditor, openNodeToolPanel,
    handleNodeContextMenu, handleNodeClick, handlePaneClick,
  } = useLinghuiCanvasNodeInteractions({
    reactFlow, setNodes, setEditorSelection, setActiveNodeTool, setPendingGroupFrame,
    closeContextMenu, closeQuickCreate, closeQuickCreateFromPane, openContextMenuAt,
    emitSnapshot, onNodeDragStart: handleNodeDragStart, onNodeDragStop: handleNodeDragStop,
  });

  const { nodeInteractionApi, nodeMutationApi } = useLinghuiCanvasNodeApi({
    bindNodeSurface, openNodeContextMenu, openNodeEditor, openNodeToolPanel,
    updateLinghuiNodeData, onClearNodeRunState,
  });

  const overlayProps = useLinghuiCanvasOverlayProps({
    editorSelection, activeNodeTool, setActiveNodeTool, revertGridSplitTool, onCloseEditor: () => { setEditorSelection(null); setActiveNodeTool(null); },
    nodeRuns, executionQueue, workspaceId: workspace?.id ?? null,
    updateNodeData: updateLinghuiNodeData, onClearNodeRunState, canvasRect,
    gridSplitType, setGridSplitType, gridSplitSelectedCells, setGridSplitSelectedCells,
    gridSplitUpscaleFactor, setGridSplitUpscaleFactor,
    pendingGroupFrameStyle, pendingGroupActionsStyle, pendingGroupCreatableIds,
    createGroupFromSelection, clearPendingGroupFrame,
    quickCreate, quickCreateCatalog, contextMenu, contextMenuSelectionIds,
    hasClipboardData, canUndo, canRedo, reactFlow, message,
    onAssetLibraryMutate, onWorkflowTemplateMutate,
    onRunSelection, onRunAll, onExportSelection, onFormatLayout: handleFormatLayout,
    onOpenShortcutPanel: () => setShortcutPanelOpen(o => !o),
    onRunSingleNodeRef, openQuickCreateAt, closeContextMenu,
    insertNodeAtScreenPosition,
    deriveStoryboardShotsFromScript, deriveStoryboardImagesFromScript, deriveStoryboardVideosFromScript,
    createDerivedImageNodesFromNode, createDerivedVideoNodesFromNode, createDerivedPanoramaNodeFromNode,
    createDerivedAudioNodeFromVideo, createDerivedMultiAngleImageNodeFromNode, createDerivedImageToolNodeFromNode,
    applyTextEmptyAction, applyVideoEmptyAction, applyAudioEmptyAction,
    copySelectionToClipboard, duplicateSelection, pasteClipboardSnapshot,
    deleteNodesByIds, deleteEdgesByIds, ungroupGroupsByIds,
    handleUploadImagesToCanvas, handleUploadVideosToCanvas, handleUploadAudiosToCanvas,
    buildClipboardSnapshot, undoHistory, redoHistory,
  });

  useLinghuiCanvasImperativeHandle({
    ref, reactFlowRef, setNodesRef, hostRef, emitSnapshotRef,
    createNodeFromWorkspaceAsset, insertSubgraphSnapshotAtScreenPosition,
    handleUploadImagesToCanvas, handleUploadVideosToCanvas, handleUploadAudiosToCanvas,
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
        gridSize: ({ '2x2': 2, '3x3': 3, '4x4': 4, '5x5': 5 } as Record<string, number>)[gridSplitType === 'none' ? '2x2' : gridSplitType] ?? 2,
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
        projectEntry, canvasMode, zoom: viewport.zoom,
        runSummary: {
          ...canvasRunSummary,
          queued: executionQueue?.queuedNodeIds.length ?? 0,
          queueStatus: executionQueue?.status ?? 'idle',
        },
        showEmpty: !workspace,
        onFocusFailedNode, onRetryFailed, onRerunAffected, onCancelRun,
        onRunAll, onRunSelection, onSetCanvasMode: setCanvasMode,
        showMiniMap, snapToGrid, shortcutPanelOpen,
        layoutReviewPending: Boolean(layoutReview), isLayouting,
        outlierNotice: outlierNotice
          ? { count: outlierNotice.nodes.length, currentIndex: outlierNotice.currentIndex }
          : null,
        onToggleMiniMap: () => setShowMiniMap(o => !o),
        onToggleSnapToGrid: () => setSnapToGrid(e => !e),
        onFormatLayout: handleFormatLayout, onRestoreLayout: handleRestoreLayout,
        onKeepLayout: handleKeepLayout,
        onNavigateToOutlier: handleNavigateToOutlier, onDismissOutliers: handleDismissOutliers,
        onToggleShortcutPanel: () => setShortcutPanelOpen(o => !o),
        onZoomOut: zoomOut, onFocusContent: focusContent,
        onZoomIn: zoomIn, onZoomToPreset: zoomToPreset,
      }}
      stageProps={{
        nodes, edges, canvasMode, showMiniMap, snapToGrid,
        onNodesChange: handleNodesChange, onEdgesChange: handleEdgesChange,
        onConnect: handleConnect, onConnectStart: handleConnectStart,
        onConnectEnd: handleConnectEnd, isValidConnection: handleIsValidConnection,
        onSelectionChange: handleSelectionChange,
        onSelectionDragStart: handleSelectionDragStart,
        onSelectionDragStop: handleSelectionDragStop,
        onSelectionContextMenu: handleSelectionContextMenu,
        onSelectionStart: handleSelectionStart, onSelectionEnd: handleSelectionEnd,
        onNodeClick: handleNodeClick, onNodeContextMenu: handleNodeContextMenu,
        onNodeDragStart: handleNodeDragStart, onNodeDragStop: handleNodeDragStop,
        onEdgeClick: handleEdgeClick, onEdgeContextMenu: handleEdgeContextMenu,
        onPaneClick: handlePaneClick, onPaneContextMenu: handlePaneContextMenu,
        onMoveEnd: handleMoveEnd,
      }}
      overlayProps={overlayProps}
    />
  );
});
