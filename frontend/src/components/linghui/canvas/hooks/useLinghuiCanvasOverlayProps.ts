import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { ReactFlowInstance } from '@xyflow/react';
import type {
  LinghuiCanvasSelection,
  LinghuiExecutionQueueState,
  LinghuiExecuteMultiAngleOptions,
  LinghuiImageAssetItem,
  LinghuiGridType,
  LinghuiImageNodeProperties,
  LinghuiMediaItem,
  LinghuiNodeCatalogItem,
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiNodeToolState,
  LinghuiNodeType,
  LinghuiStoryboardFrame,
} from '../../../../types/linghui';
import type { CssVarStyle } from '../../../../theme/runtime';
import type { LinghuiCanvasMenuState, LinghuiClipboardSnapshot, QuickCreateState } from '../state/linghuiCanvasShared';
import type { LinghuiCanvasOverlaysProps } from '../components/LinghuiCanvasOverlays';
import { useLinghuiCanvasContextMenuActions } from './useLinghuiCanvasContextMenuActions';
import { useLinghuiCanvasContextMenuMediaState } from './useLinghuiCanvasContextMenuMediaState';
import { useLinghuiCanvasContextMenuOverlayProps } from './useLinghuiCanvasContextMenuOverlayProps';
import { useLinghuiCanvasImageToolExecutions } from './useLinghuiCanvasImageToolExecutions';

interface UseLinghuiCanvasOverlayPropsParams {
  editorSelection: LinghuiCanvasSelection;
  activeNodeTool: LinghuiNodeToolState;
  setActiveNodeTool: (tool: LinghuiNodeToolState) => void;
  revertGridSplitTool: () => void;
  onCloseEditor: () => void;
  nodeRuns: Record<string, LinghuiNodeRunState>;
  executionQueue?: LinghuiExecutionQueueState | null;
  workspaceId: string | null;
  updateNodeData: (
    nodeId: string,
    updater: (prev: LinghuiNodeData) => LinghuiNodeData,
    options?: { markStale?: boolean },
  ) => void;
  onClearNodeRunState?: (nodeId: string) => void;
  canvasRect: DOMRect | null;
  gridSplitType: LinghuiGridType;
  setGridSplitType: (type: LinghuiGridType) => void;
  gridSplitSelectedCells: number[];
  setGridSplitSelectedCells: (cells: number[]) => void;
  gridSplitUpscaleFactor: 2 | 4;
  setGridSplitUpscaleFactor: (factor: 2 | 4) => void;
  pendingGroupFrameStyle: CssVarStyle | null;
  pendingGroupActionsStyle: CssVarStyle | null;
  pendingGroupCreatableIds: string[];
  createGroupFromSelection: (selectionIds?: string[]) => void;
  clearPendingGroupFrame: () => void;
  quickCreate: QuickCreateState | null;
  quickCreateCatalog: LinghuiCanvasOverlaysProps['quickCreateCatalog'];
  contextMenu: LinghuiCanvasMenuState | null;
  contextMenuSelectionIds: string[];
  hasClipboardData: boolean;
  canUndo: boolean;
  canRedo: boolean;
  reactFlow: ReactFlowInstance;
  message: MessageInstance;
  onAssetLibraryMutate?: () => void;
  onWorkflowTemplateMutate?: () => void;
  onRunSelection?: (selectionIds?: string[]) => void;
  onRunAll?: () => void;
  onExportSelection?: (selectionIds?: string[]) => void;
  onFormatLayout: () => void;
  onOpenShortcutPanel: () => void;
  onRunSingleNodeRef: MutableRefObject<((nodeId: string) => void) | undefined>;
  openQuickCreateAt: (
    clientX: number,
    clientY: number,
    options?: { sourceConnection?: QuickCreateState['sourceConnection'] },
  ) => void;
  closeContextMenu: () => void;
  insertNodeAtScreenPosition: (
    type: LinghuiNodeType,
    screenX: number,
    screenY: number,
    options?: {
      openEditor?: boolean;
      sourceConnection?: QuickCreateState['sourceConnection'];
      label?: string;
      initialProperties?: Record<string, unknown>;
    },
  ) => void;
  deriveStoryboardShotsFromScript: (nodeId: string, shots: LinghuiStoryboardFrame[]) => boolean;
  deriveStoryboardImagesFromScript: (nodeId: string, shots: LinghuiStoryboardFrame[]) => string[];
  deriveStoryboardVideosFromScript: (nodeId: string, shots: LinghuiStoryboardFrame[]) => string[];
  createDerivedImageNodesFromNode: (sourceNodeId: string, items: LinghuiImageAssetItem[]) => string[];
  createDerivedVideoNodesFromNode: (sourceNodeId: string, items: LinghuiMediaItem[]) => string[];
  createDerivedPanoramaNodeFromNode: (sourceNodeId: string, item: LinghuiImageAssetItem) => string | null;
  createDerivedAudioNodeFromVideo: (
    sourceNodeId: string,
    options: { source: string; label?: string; prompt?: string },
  ) => string | null;
  createDerivedMultiAngleImageNodeFromNode: (sourceNodeId: string, options?: LinghuiExecuteMultiAngleOptions) => string | null;
  createDerivedImageToolNodeFromNode: (sourceNodeId: string, options: {
    label?: string;
    prompt: string;
    properties?: Partial<LinghuiImageNodeProperties>;
  }) => string | null;
  /**
   * LibTV TextNode EmptyState 4 actions —— 派生 video / image / audio 子图。
   * 详见 docs/libtv-text-node-deep-dive.md §3 + useLinghuiCanvasDocumentOps.applyTextEmptyAction。
   */
  applyTextEmptyAction: (
    sourceNodeId: string,
    action: 'edit' | 'video' | 'image-prompt' | 'music',
  ) => string | null;
  /**
   * LibTV VideoNode EmptyState 2 actions —— 派生 1/2 个上游 ImageNode + 自动连线。
   * 详见 docs/libtv-video-node-deep-dive.md §3 + useLinghuiCanvasDocumentOps.applyVideoEmptyAction。
   */
  applyVideoEmptyAction: (
    sourceNodeId: string,
    action: 'first-frame' | 'first-last-frame',
  ) => string | null;
  /** LibTV AudioNode EmptyState "音频生视频"：派生 video + image + 2 条连线。 */
  applyAudioEmptyAction: (
    sourceNodeId: string,
    action: 'audio-to-video',
  ) => string | null;
  copySelectionToClipboard: (requestedIds?: string[]) => boolean;
  duplicateSelection: (
    requestedIds?: string[],
    options?: { screenX?: number; screenY?: number },
  ) => boolean;
  pasteClipboardSnapshot: (options?: { screenX?: number; screenY?: number }) => boolean;
  deleteNodesByIds: (nodeIds: string[]) => void;
  deleteEdgesByIds: (edgeIds: string[]) => void;
  ungroupGroupsByIds: (groupIds: string[]) => void;
  handleUploadImagesToCanvas: (screenX?: number, screenY?: number) => Promise<void>;
  handleUploadVideosToCanvas: (screenX?: number, screenY?: number) => Promise<void>;
  handleUploadAudiosToCanvas: (screenX?: number, screenY?: number) => Promise<void>;
  buildClipboardSnapshot: (requestedIds?: string[]) => LinghuiClipboardSnapshot | null;
  undoHistory: () => void;
  redoHistory: () => void;
}

export function useLinghuiCanvasOverlayProps({
  editorSelection,
  activeNodeTool,
  setActiveNodeTool,
  revertGridSplitTool,
  onCloseEditor,
  nodeRuns,
  executionQueue,
  workspaceId,
  updateNodeData,
  onClearNodeRunState,
  canvasRect,
  gridSplitType,
  setGridSplitType,
  gridSplitSelectedCells,
  setGridSplitSelectedCells,
  gridSplitUpscaleFactor,
  setGridSplitUpscaleFactor,
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
  onFormatLayout,
  onOpenShortcutPanel,
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
}: UseLinghuiCanvasOverlayPropsParams): LinghuiCanvasOverlaysProps {
  const {
    contextMenuNode,
    contextMenuNodeRun,
    contextMenuResultCopyState,
    contextMenuMediaActionState,
  } = useLinghuiCanvasContextMenuMediaState({
    contextMenu,
    nodeRuns,
    reactFlow,
  });

  const addNodeFromMenu = useCallback((item: LinghuiNodeCatalogItem) => {
    if (!contextMenu) {
      return;
    }

    insertNodeAtScreenPosition(item.type, contextMenu.screenX, contextMenu.screenY, {
      label: item.nodeLabel,
      initialProperties: item.initialProperties,
    });
  }, [contextMenu, insertNodeAtScreenPosition]);

  const addNodeFromQuickCreate = useCallback((item: LinghuiNodeCatalogItem) => {
    if (!quickCreate) {
      return;
    }

    insertNodeAtScreenPosition(item.type, quickCreate.screenX, quickCreate.screenY, {
      openEditor: true,
      sourceConnection: quickCreate.sourceConnection,
      label: item.nodeLabel,
      initialProperties: item.initialProperties,
    });
  }, [insertNodeAtScreenPosition, quickCreate]);

  const openDownstreamQuickCreate = useCallback((nodeId: string, clientX: number, clientY: number) => {
    const sourceNode = reactFlow.getNode(nodeId);
    const sourceNodeData = sourceNode?.data as unknown as LinghuiNodeData | undefined;
    const sourceSlot = sourceNodeData?.outputs?.[0];

    if (!sourceNode || !sourceNodeData || !sourceSlot) {
      message.info('当前节点没有可继续发送到下游的输出');
      return;
    }

    openQuickCreateAt(clientX, clientY, {
      sourceConnection: {
        sourceNodeId: nodeId,
        sourceHandleId: 'output-0',
        sourceDataType: sourceSlot.dataType,
      },
    });
  }, [message, openQuickCreateAt, reactFlow]);

  const {
    handleCreateAssetFromNode,
    handleOpenPanoramaPreviewFromNode,
    handleCreateSubjectFromNode,
    handleCopyResultFromNode,
    handleCopyPrimaryImageFromNode,
    handleExpandImagesFromNode,
    handleKeepOnlyCurrentImage,
    handleExpandVideosFromNode,
    handleKeepOnlyCurrentVideo,
    handleSeparateVideoAudioForNode,
    handleReturnToGenerator,
    handleSeparateVideoAudioFromNode,
    handleCreateWorkflowTemplate,
  } = useLinghuiCanvasContextMenuActions({
    workspaceId,
    nodeRuns,
    contextMenuNode,
    contextMenuMediaActionState,
    contextMenuSelectionIds,
    reactFlow,
    message,
    onAssetLibraryMutate,
    onWorkflowTemplateMutate,
    updateNodeData,
    onClearNodeRunState,
    buildClipboardSnapshot,
    createDerivedImageNodesFromNode,
    createDerivedVideoNodesFromNode,
    createDerivedPanoramaNodeFromNode,
    createDerivedAudioNodeFromVideo,
  });

  const runDerivedTargets = useCallback((targetIds: string[], successMessage: string) => {
    if (!targetIds.length) {
      return;
    }

    requestAnimationFrame(() => {
      onRunSelection?.(targetIds);
      message.info(successMessage);
    });
  }, [message, onRunSelection]);

  const {
    applyImageToolPreset,
    executeGridSplit,
    executeImageUpscale,
    executeImageCrop,
    executeMultiAngle,
  } = useLinghuiCanvasImageToolExecutions({
    editorSelection,
    activeNodeTool,
    setActiveNodeTool,
    nodeRuns,
    workspaceId,
    gridSplitType,
    gridSplitSelectedCells,
    setGridSplitSelectedCells,
    gridSplitUpscaleFactor,
    reactFlow,
    message,
    onRunSelection,
    onRunSingleNodeRef,
    createDerivedImageNodesFromNode,
    createDerivedMultiAngleImageNodeFromNode,
    createDerivedImageToolNodeFromNode,
  });

  const contextMenuOverlayProps = useLinghuiCanvasContextMenuOverlayProps({
    contextMenu,
    contextMenuNode,
    contextMenuResultCopyState,
    contextMenuMediaActionState,
    contextMenuSelectionIds,
    nodeRuns,
    hasClipboardData,
    canUndo,
    canRedo,
    closeContextMenu,
    openQuickCreateAt,
    onRunSingleNodeRef,
    onRunSelection,
    onRunAll,
    onExportSelection,
    onFormatLayout,
    onOpenShortcutPanel,
    onAddNodeFromMenu: addNodeFromMenu,
    copySelectionToClipboard,
    duplicateSelection,
    pasteClipboardSnapshot,
    deleteNodesByIds,
    deleteEdgesByIds,
    ungroupGroupsByIds,
    openDownstreamQuickCreate,
    handleCreateAssetFromNode,
    handleOpenPanoramaPreviewFromNode,
    handleCreateSubjectFromNode,
    handleCopyPrimaryImageFromNode,
    handleSeparateVideoAudioFromNode,
    handleReturnToGenerator,
    handleCopyResultFromNode,
    handleExpandImagesFromNode,
    handleKeepOnlyCurrentImage,
    handleExpandVideosFromNode,
    handleKeepOnlyCurrentVideo,
    handleCreateWorkflowTemplate,
    handleUploadImagesToCanvas,
    handleUploadVideosToCanvas,
    handleUploadAudiosToCanvas,
    undoHistory,
    redoHistory,
  });

  return {
    editorSelection,
    activeNodeTool,
    setActiveNodeTool,
    onCloseEditor,
    nodeRuns,
    executionQueue,
    workspaceId,
    onAssetLibraryMutate,
    canvasRect,
    onRunNode(nodeId) {
      onRunSingleNodeRef.current?.(nodeId);
    },
    onDeriveScriptShots(nodeId, shots) {
      if (!shots.length) {
        message.info('当前脚本还没有可派生的镜头');
        return;
      }
      if (deriveStoryboardShotsFromScript(nodeId, shots)) {
        message.success('已派生镜头文本节点');
      }
    },
    onGenerateScriptImages(nodeId, shots) {
      if (!shots.length) {
        message.info('当前脚本还没有可生成的镜头');
        return;
      }
      const targetIds = deriveStoryboardImagesFromScript(nodeId, shots);
      runDerivedTargets(targetIds, '已开始生成选中分镜图');
    },
    onGenerateScriptVideos(nodeId, shots) {
      if (!shots.length) {
        message.info('当前脚本还没有可生成的视频镜头');
        return;
      }
      const targetIds = deriveStoryboardVideosFromScript(nodeId, shots);
      runDerivedTargets(targetIds, '已开始生成选中视频流程');
    },
    onCreateDerivedImportImages(nodeId, items) {
      createDerivedImageNodesFromNode(nodeId, items);
    },
    onCreateDerivedMultiAngleImage(nodeId, options) {
      return createDerivedMultiAngleImageNodeFromNode(nodeId, options);
    },
    onExecuteImageUpscale(nodeId, options) {
      void executeImageUpscale(nodeId, options);
    },
    onExecuteImageCrop(nodeId, options) {
      void executeImageCrop(nodeId, options);
    },
    onCreatePanoramaPreview: handleOpenPanoramaPreviewFromNode,
    onExecuteMultiAngle(options) {
      executeMultiAngle(options);
    },
    onApplyImageToolPreset: applyImageToolPreset,
    onApplyTextEmptyAction: applyTextEmptyAction,
    onApplyVideoEmptyAction: applyVideoEmptyAction,
    onApplyAudioEmptyAction: applyAudioEmptyAction,
    onSetGridSplitType(type) {
      setGridSplitType(type);
      setGridSplitSelectedCells([]);
    },
    onClearGridSplitCells() {
      setGridSplitSelectedCells([]);
    },
    onExecuteGridSplit() {
      void executeGridSplit();
    },
    gridSplitUpscaleFactor,
    onSetGridSplitUpscaleFactor: setGridSplitUpscaleFactor,
    onRevertGridSplit: revertGridSplitTool,
    onSeparateVideoAudio: handleSeparateVideoAudioForNode,
    pendingGroupFrameStyle,
    pendingGroupActionsStyle,
    pendingGroupCreatableIds,
    onCreateGroup: createGroupFromSelection,
    onDismissPendingGroup: clearPendingGroupFrame,
    quickCreate,
    quickCreateCatalog,
    onAddNodeFromQuickCreate: addNodeFromQuickCreate,
    ...contextMenuOverlayProps,
  };
}
