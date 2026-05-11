import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { App as AntApp } from 'antd';
import {
  type Edge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useViewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { LinghuiCanvasSelection } from '../../../../types/linghui';
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
import { useLinghuiCanvasViewportControls } from '../hooks/useLinghuiCanvasViewportControls';
import { type PendingConnectionCreateState } from '../state/linghuiCanvasShared';
import type { LinghuiCanvasHandle, LinghuiCanvasProps } from '../state/linghuiCanvasTypes';
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
    createDerivedMultiAngleImageNodeFromNode,
    spawnImageFromGenerator,
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
    handleSelectionDragStart,
    handleSelectionDragStop,
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

  const handleNodeDragStart = useCallback(() => {
    closeContextMenu();
    closeQuickCreate();
    setActiveNodeTool(null);
    setCanvasInteractionVersion(version => version + 1);
  }, [closeContextMenu, closeQuickCreate, setActiveNodeTool]);

  const handleNodeDragStop = useCallback(() => {
    setCanvasInteractionVersion(version => version + 1);
  }, []);

  const {
    bindNodeSurface,
    openNodeContextMenu,
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
    openContextMenuAt,
    emitSnapshot,
    onNodeDragStart: handleNodeDragStart,
    onNodeDragStop: handleNodeDragStop,
  });

  const nodeInteractionApi = useMemo(() => ({
    bindNodeSurface,
    openNodeContextMenu,
    openImageToolPanel(nodeId: string, tool: 'multi-angle' | 'outpaint' | 'relight' | 'repaint' | 'grid-split') {
      openNodeToolPanel({ kind: 'image', nodeId, tool });
    },
    openVideoToolPanel(nodeId: string, tool: 'upscale' | 'analyze' | 'compose') {
      openNodeToolPanel({ kind: 'video', nodeId, tool });
    },
  }), [bindNodeSurface, openNodeContextMenu, openNodeToolPanel]);

  const clearNodeRunState = useCallback((nodeId: string) => {
    onClearNodeRunState?.(nodeId);
  }, [onClearNodeRunState]);

  const nodeMutationApi = useMemo(() => ({
    updateNodeData: updateLinghuiNodeData,
    clearNodeRunState,
  }), [clearNodeRunState, updateLinghuiNodeData]);

  const { zoomIn, zoomOut, focusContent } = useLinghuiCanvasViewportControls(reactFlow);

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
    onRunSingleNodeRef,
    openQuickCreateAt,
    closeContextMenu,
    insertNodeAtScreenPosition,
    deriveStoryboardShotsFromScript,
    deriveStoryboardImagesFromScript,
    deriveStoryboardVideosFromScript,
    createDerivedImageNodesFromNode,
    createDerivedMultiAngleImageNodeFromNode,
    spawnImageFromGenerator,
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
        onZoomOut: zoomOut,
        onFocusContent: focusContent,
        onZoomIn: zoomIn,
      }}
      stageProps={{
        nodes,
        edges,
        canvasMode,
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
