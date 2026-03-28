import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { App as AntApp } from 'antd';
import {
  useNodesState,
  useEdgesState,
  useReactFlow,
  useViewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { LinghuiCanvasSelection } from '../../types/linghui';
import { LinghuiCanvasProviders } from './LinghuiCanvasProviders';
import { LinghuiCanvasSurface } from './LinghuiCanvasSurface';
import { useLinghuiCanvasOverlayState } from './useLinghuiCanvasOverlayState';
import { useLinghuiCanvasDocumentOps } from './useLinghuiCanvasDocumentOps';
import { useLinghuiCanvasMediaImport } from './useLinghuiCanvasMediaImport';
import { useLinghuiCanvasHotkeys } from './useLinghuiCanvasHotkeys';
import { useLinghuiCanvasSelectionInteractions } from './useLinghuiCanvasSelectionInteractions';
import { useLinghuiCanvasNodeInteractions } from './useLinghuiCanvasNodeInteractions';
import { useLinghuiCanvasImperativeHandle } from './useLinghuiCanvasImperativeHandle';
import { useLinghuiCanvasRunSummaries } from './useLinghuiCanvasRunSummaries';
import { useLinghuiCanvasHistory } from './useLinghuiCanvasHistory';
import { useLinghuiCanvasCallbackRefs } from './useLinghuiCanvasCallbackRefs';
import { useLinghuiCanvasFlowBridge } from './useLinghuiCanvasFlowBridge';
import { useLinghuiCanvasOverlayProps } from './useLinghuiCanvasOverlayProps';
import { useLinghuiCanvasUiState } from './useLinghuiCanvasUiState';
import { useLinghuiCanvasViewportControls } from './useLinghuiCanvasViewportControls';
import { type PendingConnectionCreateState } from './linghuiCanvasShared';
import type { LinghuiCanvasHandle, LinghuiCanvasProps } from './linghuiCanvasTypes';
import './LinghuiPage.css';

const LinghuiCanvasInner = forwardRef<LinghuiCanvasHandle, LinghuiCanvasProps>(function LinghuiCanvasInner(
  {
    workspace,
    projectEntry,
    nodeRuns,
    executionLogs,
    onGraphChange,
    onSelectionChange,
    onNodeMutate,
    onClearNodeRunState,
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
    resetLocalCanvasUiState,
  } = useLinghuiCanvasUiState();
  const {
    onSelectionChangeRef,
    onNodeMutateRef,
    onConnectionErrorRef,
    onRunSingleNodeRef,
    onOpenDrawerRef,
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
    setContextMenu(null);
    setQuickCreate(null);
  }, [resetLocalCanvasUiState, setContextMenu, setQuickCreate]);

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
    setNodes,
    setEdges,
    onGraphChange,
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
    ungroupGroupsByIds,
    insertNodeAtScreenPosition,
    deriveStoryboardShotsFromScript,
    deriveStoryboardImagesFromScript,
    deriveStoryboardVideosFromScript,
    createGroupFromSelection,
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
    undoHistory,
    redoHistory,
    closeContextMenu,
    closeQuickCreate,
    clearPendingGroupFrame,
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
  });

  const { zoomIn, zoomOut, focusContent } = useLinghuiCanvasViewportControls(reactFlow);

  const overlayProps = useLinghuiCanvasOverlayProps({
    editorSelection,
    activeNodeTool,
    setActiveNodeTool,
    onCloseEditor: () => {
      setEditorSelection(null);
      setActiveNodeTool(null);
    },
    nodeRuns,
    workspaceId: workspace?.id ?? null,
    canvasRect,
    pendingGroupFrameStyle,
    pendingGroupActionsStyle,
    pendingGroupCreatableIds,
    createGroupFromSelection,
    clearPendingGroupFrame,
    quickCreate,
    quickCreateCatalog,
    contextMenu,
    contextMenuSelectionIds,
    executionLogs,
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
    onOpenDrawerRef,
    openQuickCreateAt,
    closeContextMenu,
    insertNodeAtScreenPosition,
    deriveStoryboardShotsFromScript,
    deriveStoryboardImagesFromScript,
    deriveStoryboardVideosFromScript,
    copySelectionToClipboard,
    duplicateSelection,
    pasteClipboardSnapshot,
    deleteNodesByIds,
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
      nodeInteraction={{
        canvasMode,
        bindNodeSurface,
        openNodeContextMenu,
        openImageToolPanel(nodeId, tool) {
          openNodeToolPanel({ kind: 'image', nodeId, tool });
        },
        openVideoToolPanel(nodeId, tool) {
          openNodeToolPanel({ kind: 'video', nodeId, tool });
        },
      }}
      nodeMutation={{
        updateNodeData: updateLinghuiNodeData,
        clearNodeRunState(nodeId: string) {
          onClearNodeRunState?.(nodeId);
        },
      }}
      executionTrace={{
        edgeStatuses: canvasRunSummary.edgeStatuses,
        failedNodeIds: canvasRunSummary.failedNodeIds,
        staleNodeIds: canvasRunSummary.staleNodeIds,
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
        onOpenHistory: () => onOpenDrawerRef.current?.('history'),
        onFocusFailedNode,
        onRetryFailed,
        onRerunAffected,
        onCancelRun,
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
  return (
    <LinghuiCanvasProviders
      nodeRuns={props.nodeRuns}
      onConnectionError={props.onConnectionError}
    >
      <LinghuiCanvasInner {...props} ref={ref} />
    </LinghuiCanvasProviders>
  );
});

function areLinghuiCanvasPropsEqual(prev: LinghuiCanvasProps, next: LinghuiCanvasProps): boolean {
  return (
    prev.workspace === next.workspace &&
    prev.projectEntry === next.projectEntry &&
    prev.nodeRuns === next.nodeRuns &&
    prev.executionLogs === next.executionLogs &&
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

export type { LinghuiCanvasHandle, LinghuiCanvasProps } from './linghuiCanvasTypes';
export default LinghuiCanvas;
