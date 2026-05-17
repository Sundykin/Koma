import type { MutableRefObject } from 'react';
import { Modal } from 'antd';
import type { Node } from '@xyflow/react';
import type {
  LinghuiImageAssetItem,
  LinghuiMediaItem,
  LinghuiNodeCatalogItem,
  LinghuiNodeData,
  LinghuiNodeRunState,
} from '../../../../types/linghui';
import { LINGHUI_CANVAS_CREATE_MENU_CATALOG } from '../state/linghuiCanvasQuickCreateCatalog';
import type { LinghuiCanvasOverlaysProps } from '../components/LinghuiCanvasOverlays';
import type { LinghuiCanvasMenuState } from '../state/linghuiCanvasShared';
import type { LinghuiCanvasResultCopyKind } from '../state/linghuiCanvasResultActions';
import { isLocalVideoSourceForAudioSplit } from './linghuiCanvasOverlayMediaHelpers';

interface UseLinghuiCanvasContextMenuOverlayPropsParams {
  contextMenu: LinghuiCanvasMenuState | null;
  contextMenuNode: Node | null;
  contextMenuResultCopyState: LinghuiCanvasOverlaysProps['contextMenuResultCopyState'];
  contextMenuMediaActionState: {
    imageItems: LinghuiImageAssetItem[];
    primaryImage: LinghuiImageAssetItem | null;
    videoItems: LinghuiMediaItem[];
    generatorNodeId?: string | null;
  };
  contextMenuSelectionIds: string[];
  nodeRuns: Record<string, LinghuiNodeRunState>;
  hasClipboardData: boolean;
  canUndo: boolean;
  canRedo: boolean;
  closeContextMenu: () => void;
  openQuickCreateAt: (
    clientX: number,
    clientY: number,
    options?: { sourceConnection?: unknown },
  ) => void;
  onRunSingleNodeRef: MutableRefObject<((nodeId: string) => void) | undefined>;
  onRunSelection?: (selectionIds?: string[]) => void;
  onRunAll?: () => void;
  onExportSelection?: (selectionIds?: string[]) => void;
  onFormatLayout: () => void;
  onOpenShortcutPanel: () => void;
  onAddNodeFromMenu: (item: LinghuiNodeCatalogItem) => void;
  copySelectionToClipboard: (requestedIds?: string[]) => boolean;
  duplicateSelection: (
    requestedIds?: string[],
    options?: { screenX?: number; screenY?: number },
  ) => boolean;
  pasteClipboardSnapshot: (options?: { screenX?: number; screenY?: number }) => boolean;
  deleteNodesByIds: (nodeIds: string[]) => void;
  deleteEdgesByIds: (edgeIds: string[]) => void;
  ungroupGroupsByIds: (groupIds: string[]) => void;
  openDownstreamQuickCreate: (nodeId: string, clientX: number, clientY: number) => void;
  handleCreateAssetFromNode: (nodeId: string) => void | Promise<void>;
  handleOpenPanoramaPreviewFromNode: (nodeId: string) => void;
  handleCreateSubjectFromNode: (nodeId: string) => void | Promise<void>;
  handleCopyPrimaryImageFromNode: () => void | Promise<void>;
  handleSeparateVideoAudioFromNode: (nodeId: string) => void | Promise<void>;
  handleReturnToGenerator: () => void;
  handleCopyResultFromNode: (nodeId: string, kind: LinghuiCanvasResultCopyKind) => void | Promise<void>;
  handleExpandImagesFromNode: (nodeId: string) => void;
  handleKeepOnlyCurrentImage: (nodeId: string) => void;
  handleExpandVideosFromNode: (nodeId: string) => void;
  handleKeepOnlyCurrentVideo: (nodeId: string) => void;
  handleCreateWorkflowTemplate: (requestedIds?: string[]) => void | Promise<void>;
  handleUploadImagesToCanvas: (screenX?: number, screenY?: number) => Promise<void>;
  handleUploadVideosToCanvas: (screenX?: number, screenY?: number) => Promise<void>;
  handleUploadAudiosToCanvas: (screenX?: number, screenY?: number) => Promise<void>;
  undoHistory: () => void;
  redoHistory: () => void;
}

export function useLinghuiCanvasContextMenuOverlayProps({
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
  onAddNodeFromMenu,
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
}: UseLinghuiCanvasContextMenuOverlayPropsParams): Pick<
  LinghuiCanvasOverlaysProps,
  | 'contextMenu'
  | 'contextMenuNodeIsGroup'
  | 'contextMenuResultCopyState'
  | 'contextMenuMediaActionState'
  | 'contextMenuSelectionIds'
  | 'nodeCatalog'
  | 'hasClipboardData'
  | 'canUndo'
  | 'canRedo'
  | 'onAddNodeFromMenu'
  | 'onOpenAddNodePanel'
  | 'onCopyNodeSelection'
  | 'onDuplicateNodeSelection'
  | 'onOpenDownstreamQuickCreate'
  | 'onCreateAssetFromNode'
  | 'onOpenPanoramaPreviewFromNode'
  | 'onCreateSubjectFromNode'
  | 'onCopyPrimaryImageFromNode'
  | 'onSeparateVideoAudioFromNode'
  | 'onReturnToGenerator'
  | 'onCopyCurrentNodeResult'
  | 'onExpandCurrentNodeImages'
  | 'onDeleteOtherCurrentNodeImages'
  | 'onExpandCurrentNodeVideos'
  | 'onDeleteOtherCurrentNodeVideos'
  | 'onRunCurrentNode'
  | 'onRunCurrentGroup'
  | 'onExportCurrentSelection'
  | 'onSaveCurrentGroupAsWorkflow'
  | 'onUngroupCurrentGroup'
  | 'onDeleteCurrentGroup'
  | 'onPasteNearNode'
  | 'onDeleteCurrentNode'
  | 'onDeleteCurrentEdge'
  | 'onUploadImages'
  | 'onUploadVideos'
  | 'onUploadAudios'
  | 'onFormatLayout'
  | 'onOpenShortcutPanel'
  | 'onPaste'
  | 'onUndo'
  | 'onRedo'
  | 'onRunAll'
  | 'onRunSelection'
  | 'onExportSelection'
  | 'onSaveSelectionAsWorkflow'
  | 'onCopySelection'
  | 'onDuplicateSelection'
  | 'onDeleteSelection'
> {
  return {
    contextMenu,
    contextMenuNodeIsGroup: contextMenuNode?.type === 'group',
    contextMenuResultCopyState,
    contextMenuMediaActionState: {
      imageCount: contextMenuMediaActionState.imageItems.length,
      videoCount: contextMenuMediaActionState.videoItems.length,
      canOpenPanoramaPreview: Boolean(contextMenuMediaActionState.primaryImage),
      canCreateSubject: contextMenuMediaActionState.imageItems.length > 0,
      canCopyPrimaryImage: Boolean(contextMenuMediaActionState.primaryImage?.source),
      canSeparateVideoAudio: (
        contextMenuMediaActionState.videoItems.some(item => isLocalVideoSourceForAudioSplit(item.source)) &&
        contextMenuNode?.type !== 'group' &&
        (contextMenuNode?.data as unknown as LinghuiNodeData | undefined)?.linghuiType === 'linghui/video'
      ),
      canExpandImages: contextMenuMediaActionState.imageItems.length > 1,
      canDeleteOtherImages: (
        contextMenuMediaActionState.imageItems.length > 1 &&
        Boolean(contextMenuMediaActionState.primaryImage) &&
        contextMenuNode?.type !== 'group' &&
        (
          ((contextMenuNode?.data as unknown as LinghuiNodeData | undefined)?.linghuiType === 'linghui/image') ||
          ((contextMenuNode?.data as unknown as LinghuiNodeData | undefined)?.linghuiType === 'linghui/panorama')
        )
      ),
      canExpandVideos: contextMenuMediaActionState.videoItems.length > 1,
      canDeleteOtherVideos: (
        contextMenuMediaActionState.videoItems.length > 1 &&
        contextMenuNode?.type !== 'group' &&
        (contextMenuNode?.data as unknown as LinghuiNodeData | undefined)?.linghuiType === 'linghui/video'
      ),
      canReturnToGenerator: Boolean(contextMenuMediaActionState.generatorNodeId),
    },
    contextMenuSelectionIds,
    nodeCatalog: LINGHUI_CANVAS_CREATE_MENU_CATALOG,
    hasClipboardData,
    canUndo,
    canRedo,
    onAddNodeFromMenu,
    onOpenAddNodePanel() {
      if (!contextMenu) {
        return;
      }
      // LibTV 行为：关闭当前右键菜单，在同一画布位置弹出 quickCreate 节点目录。
      const { screenX, screenY } = contextMenu;
      closeContextMenu();
      openQuickCreateAt(screenX, screenY);
    },
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
    onOpenPanoramaPreviewFromNode() {
      if (!contextMenu?.nodeId) {
        return;
      }
      handleOpenPanoramaPreviewFromNode(contextMenu.nodeId);
      closeContextMenu();
    },
    onCreateSubjectFromNode() {
      if (!contextMenu?.nodeId) {
        return;
      }
      void handleCreateSubjectFromNode(contextMenu.nodeId);
      closeContextMenu();
    },
    onCopyPrimaryImageFromNode() {
      void handleCopyPrimaryImageFromNode();
      closeContextMenu();
    },
    onSeparateVideoAudioFromNode() {
      if (!contextMenu?.nodeId) {
        return;
      }
      void handleSeparateVideoAudioFromNode(contextMenu.nodeId);
      closeContextMenu();
    },
    onReturnToGenerator() {
      handleReturnToGenerator();
      closeContextMenu();
    },
    onCopyCurrentNodeResult(kind) {
      if (!contextMenu?.nodeId) {
        return;
      }
      void handleCopyResultFromNode(contextMenu.nodeId, kind);
      closeContextMenu();
    },
    onExpandCurrentNodeImages() {
      if (!contextMenu?.nodeId) {
        return;
      }
      handleExpandImagesFromNode(contextMenu.nodeId);
      closeContextMenu();
    },
    onDeleteOtherCurrentNodeImages() {
      if (!contextMenu?.nodeId) {
        return;
      }
      handleKeepOnlyCurrentImage(contextMenu.nodeId);
      closeContextMenu();
    },
    onExpandCurrentNodeVideos() {
      if (!contextMenu?.nodeId) {
        return;
      }
      handleExpandVideosFromNode(contextMenu.nodeId);
      closeContextMenu();
    },
    onDeleteOtherCurrentNodeVideos() {
      if (!contextMenu?.nodeId) {
        return;
      }
      handleKeepOnlyCurrentVideo(contextMenu.nodeId);
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
      // LibTV 1:1：删除节点二次确认（"该节点包含已生成的内容，删除后可通过 ⌘Z 撤销。确定删除？"）
      const nodeRun = nodeRuns[contextMenu.nodeId];
      const hasContent = nodeRun?.status === 'succeeded' || nodeRun?.status === 'failed' || nodeRun?.status === 'stale';
      const onConfirm = () => {
        deleteNodesByIds([contextMenu.nodeId]);
        closeContextMenu();
      };
      if (hasContent) {
        Modal.confirm({
          title: '删除节点',
          content: '该节点包含已生成的内容，删除后可通过 ⌘Z 撤销。确定删除？',
          okText: '确定删除',
          cancelText: '取消',
          okButtonProps: { danger: true },
          onOk: onConfirm,
        });
      } else {
        onConfirm();
      }
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
    onFormatLayout() {
      onFormatLayout();
      closeContextMenu();
    },
    onOpenShortcutPanel() {
      onOpenShortcutPanel();
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
  };
}
