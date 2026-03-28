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
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useViewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {
  LinghuiCanvasSelection,
  LinghuiCanvasMode,
  LinghuiExecutionContext,
  LinghuiExecutionLogEntry,
  LinghuiNodeRunState,
  LinghuiNodeToolState,
  LinghuiNodeType,
  LinghuiWorkspaceDocument,
} from '../../types/linghui';
import {
  type LinghuiWorkflowTemplateRecord,
  type LinghuiWorkspaceAssetRecord,
  type LinghuiWorkspaceHistoryRecord,
} from '../../store/linghuiStorage';
import {
  LinghuiGroupRunsContext,
  LinghuiNodeRunsContext,
  LinghuiConnectionErrorContext,
  LinghuiNodeInteractionContext,
  LinghuiNodeMutationContext,
} from './nodes';
import { LinghuiCanvasHud } from './LinghuiCanvasHud';
import { LinghuiCanvasOverlays } from './LinghuiCanvasOverlays';
import { LinghuiCanvasStage } from './LinghuiCanvasStage';
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
import { type LinghuiPendingGroupFrame, type PendingConnectionCreateState } from './linghuiCanvasShared';
import './LinghuiPage.css';

export interface LinghuiCanvasHandle {
  addNode: (type: LinghuiNodeType, clientPosition?: [number, number]) => void;
  addWorkspaceAsset: (
    asset: LinghuiWorkspaceAssetRecord | LinghuiWorkspaceHistoryRecord,
    clientPosition?: [number, number],
  ) => void;
  addWorkflowTemplate: (template: LinghuiWorkflowTemplateRecord, clientPosition?: [number, number]) => void;
  importMediaToCanvas: (
    kind: 'image' | 'video' | 'audio',
    clientPosition?: [number, number],
  ) => Promise<void>;
  createGroupFromSelection: () => void;
  focusContent: () => void;
  notifyMutation: () => void;
  snapshotNow: () => void;
  getSelectionIds: () => string[];
  resolveExecutionTargetIds: (selectionIds?: string[]) => string[];
  getExecutionContext: () => LinghuiExecutionContext | null;
}

interface LinghuiCanvasProps {
  workspace: LinghuiWorkspaceDocument | null;
  nodeRuns: Record<string, LinghuiNodeRunState>;
  executionLogs?: LinghuiExecutionLogEntry[];
  onGraphChange: (
    graphData: import('../../types/linghui').LinghuiGraphSnapshot,
    viewport: import('../../types/linghui').LinghuiViewportState,
    stats: import('../../types/linghui').LinghuiGraphStats,
  ) => void;
  onSelectionChange?: (selection: LinghuiCanvasSelection) => void;
  onNodeMutate?: (nodeId: string) => void;
  onClearNodeRunState?: (nodeId: string) => void;
  onConnectionError?: (message: string) => void;
  onAssetLibraryMutate?: () => void;
  onWorkflowTemplateMutate?: () => void;
  onRunSingleNode?: (nodeId: string) => void;
  onRunAll?: () => void;
  onRunSelection?: (selectionIds?: string[]) => void;
  onOpenDrawer?: (drawer: 'add' | 'workflow' | 'asset' | 'history' | 'tutorial') => void;
}

const LinghuiCanvasInner = forwardRef<LinghuiCanvasHandle, LinghuiCanvasProps>(function LinghuiCanvasInner(
  {
    workspace,
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
    onOpenDrawer,
  },
  ref,
) {
  const { message } = AntApp.useApp();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlow = useReactFlow();

  const [, setSelection] = useState<LinghuiCanvasSelection>(null);
  const [editorSelection, setEditorSelection] = useState<LinghuiCanvasSelection>(null);
  const [activeNodeTool, setActiveNodeTool] = useState<LinghuiNodeToolState>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const [canvasMode, setCanvasMode] = useState<LinghuiCanvasMode>('mouse');
  const [pendingGroupFrame, setPendingGroupFrame] = useState<LinghuiPendingGroupFrame | null>(null);
  const viewport = useViewport();

  const pendingConnectionCreateRef = useRef<PendingConnectionCreateState | null>(null);
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

  // Track canvas rect for editor positioning
  useEffect(() => {
    if (!hostRef.current) return;
    const observer = new ResizeObserver(() => {
      if (hostRef.current) setCanvasRect(hostRef.current.getBoundingClientRect());
    });
    observer.observe(hostRef.current);
    setCanvasRect(hostRef.current.getBoundingClientRect());
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!activeNodeTool) return;
    if (editorSelection?.kind !== 'node' || editorSelection.nodeId !== activeNodeTool.nodeId) {
      setActiveNodeTool(null);
    }
  }, [activeNodeTool, editorSelection]);

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
    setSelection(null);
    setEditorSelection(null);
    setActiveNodeTool(null);
    setContextMenu(null);
    setQuickCreate(null);
    setPendingGroupFrame(null);
  }, [setContextMenu, setQuickCreate]);

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

  const zoomIn = useCallback(() => {
    reactFlow.zoomIn({ duration: 180 });
  }, [reactFlow]);

  const zoomOut = useCallback(() => {
    reactFlow.zoomOut({ duration: 180 });
  }, [reactFlow]);

  const focusContent = useCallback(() => {
    reactFlow.fitView({ padding: 0.12, duration: 240 });
  }, [reactFlow]);

  const overlayProps = useLinghuiCanvasOverlayProps({
    editorSelection,
    activeNodeTool,
    setActiveNodeTool,
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
    onRunSingleNodeRef,
    onOpenDrawerRef,
    openQuickCreateAt,
    closeContextMenu,
    insertNodeAtScreenPosition,
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
    <LinghuiGroupRunsContext.Provider value={groupRunSummaries}>
      <LinghuiNodeInteractionContext.Provider value={{
        canvasMode,
        bindNodeSurface,
        openNodeContextMenu,
        openImageToolPanel(nodeId, tool) {
          openNodeToolPanel({ kind: 'image', nodeId, tool });
        },
        openVideoToolPanel(nodeId, tool) {
          openNodeToolPanel({ kind: 'video', nodeId, tool });
        },
      }}>
        <LinghuiNodeMutationContext.Provider value={{
        updateNodeData: updateLinghuiNodeData,
        clearNodeRunState(nodeId: string) {
          onClearNodeRunState?.(nodeId);
        },
      }}>
      <div
        ref={hostRef}
        className={`linghuiCanvasRoot ${canvasMode === 'hand' ? 'isHandMode' : 'isMouseMode'}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDoubleClick={handleCanvasDoubleClick}
      >
        <LinghuiCanvasHud
          canvasMode={canvasMode}
          zoom={viewport.zoom}
          runSummary={canvasRunSummary}
          showEmpty={!workspace}
          onOpenHistory={() => onOpenDrawerRef.current?.('history')}
          onSetCanvasMode={setCanvasMode}
          onZoomOut={zoomOut}
          onFocusContent={focusContent}
          onZoomIn={zoomIn}
        />

        <LinghuiCanvasStage
          nodes={nodes}
          edges={edges}
          canvasMode={canvasMode}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onConnectStart={handleConnectStart}
          onConnectEnd={handleConnectEnd}
          isValidConnection={handleIsValidConnection}
          onSelectionChange={handleSelectionChange}
          onSelectionDragStart={handleSelectionDragStart}
          onSelectionDragStop={handleSelectionDragStop}
          onSelectionContextMenu={handleSelectionContextMenu}
          onSelectionStart={handleSelectionStart}
          onSelectionEnd={handleSelectionEnd}
          onNodeClick={handleNodeClick}
          onNodeContextMenu={handleNodeContextMenu}
          onPaneClick={handlePaneClick}
          onPaneContextMenu={handlePaneContextMenu}
          onMoveEnd={handleMoveEnd}
        />

        <LinghuiCanvasOverlays {...overlayProps} />
      </div>
        </LinghuiNodeMutationContext.Provider>
      </LinghuiNodeInteractionContext.Provider>
    </LinghuiGroupRunsContext.Provider>
  );
});

const LinghuiCanvasComponent = forwardRef<LinghuiCanvasHandle, LinghuiCanvasProps>(function LinghuiCanvas(
  props,
  ref,
) {
  return (
    <LinghuiNodeRunsContext.Provider value={props.nodeRuns}>
      <LinghuiConnectionErrorContext.Provider value={props.onConnectionError ?? (() => {})}>
        <ReactFlowProvider>
          <LinghuiCanvasInner {...props} ref={ref} />
        </ReactFlowProvider>
      </LinghuiConnectionErrorContext.Provider>
    </LinghuiNodeRunsContext.Provider>
  );
});

function areLinghuiCanvasPropsEqual(prev: LinghuiCanvasProps, next: LinghuiCanvasProps): boolean {
  return (
    prev.workspace === next.workspace &&
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
    prev.onOpenDrawer === next.onOpenDrawer
  );
}

export const LinghuiCanvas = memo(LinghuiCanvasComponent, areLinghuiCanvasPropsEqual);
LinghuiCanvas.displayName = 'LinghuiCanvas';

export default LinghuiCanvas;
