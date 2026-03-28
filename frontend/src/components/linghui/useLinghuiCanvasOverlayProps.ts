import { useCallback, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import type { ReactFlowInstance } from '@xyflow/react';
import type {
  LinghuiCanvasSelection,
  LinghuiExecutionLogEntry,
  LinghuiImageAssetItem,
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiNodeToolState,
  LinghuiNodeType,
  LinghuiStoryboardFrame,
} from '../../types/linghui';
import {
  createLinghuiWorkflowTemplate,
  createLinghuiWorkspaceAsset,
} from '../../store/linghuiStorage';
import { LINGHUI_NODE_CATALOG } from './linghuiNodeDefs';
import type { LinghuiCanvasMenuState, LinghuiClipboardSnapshot, QuickCreateState } from './linghuiCanvasShared';
import type { LinghuiCanvasOverlaysProps } from './LinghuiCanvasOverlays';

type LinghuiCanvasDrawer = 'add' | 'workflow' | 'asset' | 'history' | 'tutorial';

interface UseLinghuiCanvasOverlayPropsParams {
  editorSelection: LinghuiCanvasSelection;
  activeNodeTool: LinghuiNodeToolState;
  setActiveNodeTool: (tool: LinghuiNodeToolState) => void;
  onCloseEditor: () => void;
  nodeRuns: Record<string, LinghuiNodeRunState>;
  workspaceId: string | null;
  canvasRect: DOMRect | null;
  pendingGroupFrameStyle: { left: number; top: number; width: number; height: number } | null;
  pendingGroupActionsStyle: { left: number; top: number } | null;
  pendingGroupCreatableIds: string[];
  createGroupFromSelection: (selectionIds?: string[]) => void;
  clearPendingGroupFrame: () => void;
  quickCreate: QuickCreateState | null;
  quickCreateCatalog: LinghuiCanvasOverlaysProps['quickCreateCatalog'];
  contextMenu: LinghuiCanvasMenuState | null;
  contextMenuSelectionIds: string[];
  executionLogs?: LinghuiExecutionLogEntry[];
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
  onRunSingleNodeRef: MutableRefObject<((nodeId: string) => void) | undefined>;
  onOpenDrawerRef: MutableRefObject<((drawer: LinghuiCanvasDrawer) => void) | undefined>;
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
    },
  ) => void;
  deriveStoryboardShotsFromScript: (nodeId: string, shots: LinghuiStoryboardFrame[]) => boolean;
  deriveStoryboardImagesFromScript: (nodeId: string, shots: LinghuiStoryboardFrame[]) => string[];
  deriveStoryboardVideosFromScript: (nodeId: string, shots: LinghuiStoryboardFrame[]) => string[];
  createDerivedImageNodesFromNode: (sourceNodeId: string, items: LinghuiImageAssetItem[]) => string[];
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
  onCloseEditor,
  nodeRuns,
  workspaceId,
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
  createDerivedImageNodesFromNode,
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
  const recentLogs = useMemo(() => (
    (executionLogs ?? []).slice(-8).reverse()
  ), [executionLogs]);

  const contextMenuNode = useMemo(() => {
    if (!contextMenu?.nodeId) {
      return null;
    }
    return reactFlow.getNode(contextMenu.nodeId) ?? null;
  }, [contextMenu, reactFlow]);

  const addNodeFromMenu = useCallback((type: LinghuiNodeType) => {
    if (!contextMenu) {
      return;
    }

    insertNodeAtScreenPosition(type, contextMenu.screenX, contextMenu.screenY);
  }, [contextMenu, insertNodeAtScreenPosition]);

  const addNodeFromQuickCreate = useCallback((type: LinghuiNodeType) => {
    if (!quickCreate) {
      return;
    }

    insertNodeAtScreenPosition(type, quickCreate.screenX, quickCreate.screenY, {
      openEditor: true,
      sourceConnection: quickCreate.sourceConnection,
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

  const handleCreateAssetFromNode = useCallback(async (nodeId: string) => {
    if (!workspaceId) {
      message.warning('请先打开一个灵绘工作区，再创建资产');
      return;
    }

    const targetNode = reactFlow.getNode(nodeId);
    if (!targetNode || targetNode.type === 'group') {
      message.info('当前工作流块不支持直接创建资产');
      return;
    }

    try {
      const nodeData = targetNode.data as unknown as LinghuiNodeData;
      const asset = await createLinghuiWorkspaceAsset({
        workspaceId,
        nodeId,
        nodeData,
        nodeRun: nodeRuns[nodeId],
      });
      onAssetLibraryMutate?.();
      message.success(`已创建资产：${asset.name}`);
    } catch (error: any) {
      message.error(error?.message || '创建资产失败');
    }
  }, [message, nodeRuns, onAssetLibraryMutate, reactFlow, workspaceId]);

  const resolveWorkflowTemplateName = useCallback((requestedIds?: string[]) => {
    const selectionIds = requestedIds?.length ? requestedIds : contextMenuSelectionIds;
    const rfNodes = reactFlow.getNodes();
    const selectedGroups = rfNodes.filter(node => selectionIds.includes(node.id) && node.type === 'group');
    const selectedLeafNodes = rfNodes.filter(node => selectionIds.includes(node.id) && node.type !== 'group');

    if (selectedGroups.length === 1) {
      return String((selectedGroups[0].data as { label?: string } | undefined)?.label || '未命名工作流').trim();
    }
    if (selectedLeafNodes.length === 1) {
      const label = String((selectedLeafNodes[0].data as unknown as LinghuiNodeData | undefined)?.label || '节点工作流').trim();
      return label.includes('工作流') ? label : `${label} 工作流`;
    }
    if (selectedLeafNodes.length > 1) {
      return `工作流 ${selectedLeafNodes.length} 节点`;
    }
    return '未命名工作流';
  }, [contextMenuSelectionIds, reactFlow]);

  const handleCreateWorkflowTemplate = useCallback(async (requestedIds?: string[]) => {
    if (!workspaceId) {
      message.warning('请先打开一个灵绘工作区，再保存工作流');
      return;
    }

    const selectionIds = requestedIds?.length ? requestedIds : contextMenuSelectionIds;
    const snapshot = buildClipboardSnapshot(selectionIds);
    if (!snapshot) {
      message.info('请先选中一个工作流块或一组节点，再保存为工作流');
      return;
    }

    const sourceGroupId = selectionIds.find(selectionId => {
      const targetNode = reactFlow.getNode(selectionId);
      return targetNode?.type === 'group';
    });

    try {
      const template = await createLinghuiWorkflowTemplate({
        workspaceId,
        name: resolveWorkflowTemplateName(selectionIds),
        snapshot,
        sourceGroupId,
      });
      onWorkflowTemplateMutate?.();
      message.success(`已保存工作流：${template.name}`);
    } catch (error: any) {
      message.error(error?.message || '保存工作流失败');
    }
  }, [
    buildClipboardSnapshot,
    contextMenuSelectionIds,
    message,
    onWorkflowTemplateMutate,
    reactFlow,
    resolveWorkflowTemplateName,
    workspaceId,
  ]);

  const runDerivedTargets = useCallback((targetIds: string[], successMessage: string) => {
    if (!targetIds.length) {
      return;
    }

    requestAnimationFrame(() => {
      onRunSelection?.(targetIds);
      message.info(successMessage);
    });
  }, [message, onRunSelection]);

  return {
    editorSelection,
    activeNodeTool,
    setActiveNodeTool,
    onCloseEditor,
    nodeRuns,
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
    pendingGroupFrameStyle,
    pendingGroupActionsStyle,
    pendingGroupCreatableIds,
    onCreateGroup: createGroupFromSelection,
    onDismissPendingGroup: clearPendingGroupFrame,
    quickCreate,
    quickCreateCatalog,
    onAddNodeFromQuickCreate: addNodeFromQuickCreate,
    contextMenu,
    contextMenuNodeIsGroup: contextMenuNode?.type === 'group',
    contextMenuSelectionIds,
    nodeCatalog: LINGHUI_NODE_CATALOG,
    recentLogs,
    hasClipboardData,
    canUndo,
    canRedo,
    onAddNodeFromMenu: addNodeFromMenu,
    onCopyNodeSelection() {
      if (contextMenuSelectionIds.length) {
        copySelectionToClipboard(contextMenuSelectionIds);
      }
      closeContextMenu();
    },
    onDuplicateNodeSelection() {
      if (!contextMenu) {
        return;
      }
      duplicateSelection(contextMenuSelectionIds, {
        screenX: contextMenu.screenX + 24,
        screenY: contextMenu.screenY + 18,
      });
      closeContextMenu();
    },
    onOpenDownstreamQuickCreate() {
      if (!contextMenu?.nodeId) {
        return;
      }
      void openDownstreamQuickCreate(contextMenu.nodeId, contextMenu.screenX + 18, contextMenu.screenY + 12);
    },
    onCreateAssetFromNode() {
      if (!contextMenu?.nodeId) {
        return;
      }
      void handleCreateAssetFromNode(contextMenu.nodeId);
      closeContextMenu();
    },
    onRunCurrentNode() {
      if (!contextMenu?.nodeId) {
        return;
      }
      onRunSingleNodeRef.current?.(contextMenu.nodeId);
      closeContextMenu();
    },
    onRunCurrentGroup() {
      if (!contextMenu?.nodeId) {
        return;
      }
      onRunSelection?.([contextMenu.nodeId]);
      closeContextMenu();
    },
    onExportCurrentSelection() {
      if (!contextMenu?.nodeId) {
        return;
      }
      onExportSelection?.([contextMenu.nodeId]);
      closeContextMenu();
    },
    onSaveCurrentGroupAsWorkflow() {
      if (!contextMenu?.nodeId) {
        return;
      }
      void handleCreateWorkflowTemplate([contextMenu.nodeId]);
      closeContextMenu();
    },
    onUngroupCurrentGroup() {
      if (!contextMenu?.nodeId) {
        return;
      }
      ungroupGroupsByIds([contextMenu.nodeId]);
      closeContextMenu();
    },
    onDeleteCurrentGroup() {
      if (!contextMenu?.nodeId) {
        return;
      }
      deleteNodesByIds([contextMenu.nodeId]);
      closeContextMenu();
    },
    onPasteNearNode() {
      if (!contextMenu || !hasClipboardData) {
        return;
      }
      pasteClipboardSnapshot({
        screenX: contextMenu.screenX + 32,
        screenY: contextMenu.screenY + 24,
      });
      closeContextMenu();
    },
    onDeleteCurrentNode() {
      if (!contextMenu?.nodeId) {
        return;
      }
      deleteNodesByIds([contextMenu.nodeId]);
      closeContextMenu();
    },
    onDeleteCurrentEdge() {
      if (!contextMenu?.edgeId) {
        return;
      }
      deleteEdgesByIds([contextMenu.edgeId]);
      closeContextMenu();
    },
    onUploadImages() {
      if (!contextMenu) {
        return;
      }
      void handleUploadImagesToCanvas(contextMenu.screenX, contextMenu.screenY);
      closeContextMenu();
    },
    onUploadVideos() {
      if (!contextMenu) {
        return;
      }
      void handleUploadVideosToCanvas(contextMenu.screenX, contextMenu.screenY);
      closeContextMenu();
    },
    onUploadAudios() {
      if (!contextMenu) {
        return;
      }
      void handleUploadAudiosToCanvas(contextMenu.screenX, contextMenu.screenY);
      closeContextMenu();
    },
    onPaste() {
      if (!contextMenu || !hasClipboardData) {
        return;
      }
      pasteClipboardSnapshot({
        screenX: contextMenu.screenX + 16,
        screenY: contextMenu.screenY + 16,
      });
      closeContextMenu();
    },
    onUndo() {
      if (!canUndo) {
        return;
      }
      undoHistory();
      closeContextMenu();
    },
    onRedo() {
      if (!canRedo) {
        return;
      }
      redoHistory();
      closeContextMenu();
    },
    onRunAll() {
      onRunAll?.();
      closeContextMenu();
    },
    onRunSelection() {
      if (!contextMenuSelectionIds.length) {
        return;
      }
      onRunSelection?.(contextMenuSelectionIds);
      closeContextMenu();
    },
    onExportSelection() {
      if (!contextMenuSelectionIds.length) {
        return;
      }
      onExportSelection?.(contextMenuSelectionIds);
      closeContextMenu();
    },
    onSaveSelectionAsWorkflow() {
      void handleCreateWorkflowTemplate(contextMenuSelectionIds);
      closeContextMenu();
    },
    onCopySelection() {
      copySelectionToClipboard(contextMenuSelectionIds);
      closeContextMenu();
    },
    onDuplicateSelection() {
      if (!contextMenu) {
        return;
      }
      duplicateSelection(contextMenuSelectionIds, {
        screenX: contextMenu.screenX + 24,
        screenY: contextMenu.screenY + 18,
      });
      closeContextMenu();
    },
    onDeleteSelection() {
      deleteNodesByIds(contextMenuSelectionIds);
      closeContextMenu();
    },
    onOpenDrawer(drawer) {
      onOpenDrawerRef.current?.(drawer);
      closeContextMenu();
    },
  };
}
