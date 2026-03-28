import type {
  LinghuiCanvasSelection,
  LinghuiExecutionLogEntry,
  LinghuiNodeCatalogItem,
  LinghuiNodeRunState,
  LinghuiNodeToolState,
  LinghuiNodeType,
  LinghuiStoryboardFrame,
} from '../../types/linghui';
import type { LinghuiCanvasMenuState, QuickCreateState } from './linghuiCanvasShared';
import { LinghuiNodeEditor } from './LinghuiNodeEditor';
import { LinghuiCanvasPendingGroupOverlay } from './LinghuiCanvasPendingGroupOverlay';
import { LinghuiCanvasQuickCreate } from './LinghuiCanvasQuickCreate';
import { LinghuiCanvasContextMenu } from './LinghuiCanvasContextMenu';

export interface LinghuiCanvasOverlaysProps {
  editorSelection: LinghuiCanvasSelection;
  activeNodeTool: LinghuiNodeToolState;
  setActiveNodeTool: (tool: LinghuiNodeToolState) => void;
  onCloseEditor: () => void;
  nodeRuns: Record<string, LinghuiNodeRunState>;
  workspaceId: string | null;
  onAssetLibraryMutate?: () => void;
  canvasRect: DOMRect | null;
  onRunNode: (nodeId: string) => void;
  onDeriveScriptShots: (nodeId: string, shots: LinghuiStoryboardFrame[]) => void;
  onGenerateScriptImages: (nodeId: string, shots: LinghuiStoryboardFrame[]) => void;
  onGenerateScriptVideos: (nodeId: string, shots: LinghuiStoryboardFrame[]) => void;
  pendingGroupFrameStyle: { left: number; top: number; width: number; height: number } | null;
  pendingGroupActionsStyle: { left: number; top: number } | null;
  pendingGroupCreatableIds: string[];
  onCreateGroup: (selectionIds?: string[]) => void;
  onDismissPendingGroup: () => void;
  quickCreate: QuickCreateState | null;
  quickCreateCatalog: LinghuiNodeCatalogItem[];
  onAddNodeFromQuickCreate: (type: LinghuiNodeType) => void;
  contextMenu: LinghuiCanvasMenuState | null;
  contextMenuNodeIsGroup: boolean;
  contextMenuSelectionIds: string[];
  nodeCatalog: LinghuiNodeCatalogItem[];
  recentLogs: LinghuiExecutionLogEntry[];
  hasClipboardData: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onAddNodeFromMenu: (type: LinghuiNodeType) => void;
  onCopyNodeSelection: () => void;
  onDuplicateNodeSelection: () => void;
  onOpenDownstreamQuickCreate: () => void;
  onCreateAssetFromNode: () => void;
  onRunCurrentNode: () => void;
  onRunCurrentGroup: () => void;
  onExportCurrentSelection: () => void;
  onSaveCurrentGroupAsWorkflow: () => void;
  onUngroupCurrentGroup: () => void;
  onDeleteCurrentGroup: () => void;
  onPasteNearNode: () => void;
  onDeleteCurrentNode: () => void;
  onUploadImages: () => void;
  onUploadVideos: () => void;
  onUploadAudios: () => void;
  onPaste: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRunAll: () => void;
  onRunSelection: () => void;
  onExportSelection: () => void;
  onSaveSelectionAsWorkflow: () => void;
  onCopySelection: () => void;
  onDuplicateSelection: () => void;
  onDeleteSelection: () => void;
  onOpenDrawer: (drawer: 'add' | 'workflow' | 'asset' | 'history' | 'tutorial') => void;
}

export function LinghuiCanvasOverlays({
  editorSelection,
  activeNodeTool,
  setActiveNodeTool,
  onCloseEditor,
  nodeRuns,
  workspaceId,
  onAssetLibraryMutate,
  canvasRect,
  onRunNode,
  onDeriveScriptShots,
  onGenerateScriptImages,
  onGenerateScriptVideos,
  pendingGroupFrameStyle,
  pendingGroupActionsStyle,
  pendingGroupCreatableIds,
  onCreateGroup,
  onDismissPendingGroup,
  quickCreate,
  quickCreateCatalog,
  onAddNodeFromQuickCreate,
  contextMenu,
  contextMenuNodeIsGroup,
  contextMenuSelectionIds,
  nodeCatalog,
  recentLogs,
  hasClipboardData,
  canUndo,
  canRedo,
  onAddNodeFromMenu,
  onCopyNodeSelection,
  onDuplicateNodeSelection,
  onOpenDownstreamQuickCreate,
  onCreateAssetFromNode,
  onRunCurrentNode,
  onRunCurrentGroup,
  onExportCurrentSelection,
  onSaveCurrentGroupAsWorkflow,
  onUngroupCurrentGroup,
  onDeleteCurrentGroup,
  onPasteNearNode,
  onDeleteCurrentNode,
  onUploadImages,
  onUploadVideos,
  onUploadAudios,
  onPaste,
  onUndo,
  onRedo,
  onRunAll,
  onRunSelection,
  onExportSelection,
  onSaveSelectionAsWorkflow,
  onCopySelection,
  onDuplicateSelection,
  onDeleteSelection,
  onOpenDrawer,
}: LinghuiCanvasOverlaysProps) {
  return (
    <>
      <LinghuiNodeEditor
        selection={editorSelection}
        activeTool={activeNodeTool}
        onToolChange={setActiveNodeTool}
        onCloseEditor={onCloseEditor}
        nodeRuns={nodeRuns}
        onRunNode={onRunNode}
        onDeriveScriptShots={onDeriveScriptShots}
        onGenerateScriptImages={onGenerateScriptImages}
        onGenerateScriptVideos={onGenerateScriptVideos}
        canvasRect={canvasRect}
        workspaceId={workspaceId}
        onAssetLibraryMutate={onAssetLibraryMutate}
      />

      <LinghuiCanvasPendingGroupOverlay
        frameStyle={pendingGroupFrameStyle}
        actionsStyle={pendingGroupActionsStyle}
        creatableIds={pendingGroupCreatableIds}
        onCreateGroup={onCreateGroup}
        onDismiss={onDismissPendingGroup}
      />

      <LinghuiCanvasQuickCreate
        quickCreate={quickCreate}
        catalog={quickCreateCatalog}
        onAddNode={onAddNodeFromQuickCreate}
      />

      <LinghuiCanvasContextMenu
        contextMenu={contextMenu}
        contextMenuNodeIsGroup={contextMenuNodeIsGroup}
        contextMenuSelectionIds={contextMenuSelectionIds}
        nodeCatalog={nodeCatalog}
        recentLogs={recentLogs}
        hasClipboardData={hasClipboardData}
        canUndo={canUndo}
        canRedo={canRedo}
        onAddNode={onAddNodeFromMenu}
        onCopyNodeSelection={onCopyNodeSelection}
        onDuplicateNodeSelection={onDuplicateNodeSelection}
        onOpenDownstreamQuickCreate={onOpenDownstreamQuickCreate}
        onCreateAssetFromNode={onCreateAssetFromNode}
        onRunCurrentNode={onRunCurrentNode}
        onRunCurrentGroup={onRunCurrentGroup}
        onExportCurrentSelection={onExportCurrentSelection}
        onSaveCurrentGroupAsWorkflow={onSaveCurrentGroupAsWorkflow}
        onUngroupCurrentGroup={onUngroupCurrentGroup}
        onDeleteCurrentGroup={onDeleteCurrentGroup}
        onPasteNearNode={onPasteNearNode}
        onDeleteCurrentNode={onDeleteCurrentNode}
        onUploadImages={onUploadImages}
        onUploadVideos={onUploadVideos}
        onUploadAudios={onUploadAudios}
        onPaste={onPaste}
        onUndo={onUndo}
        onRedo={onRedo}
        onRunAll={onRunAll}
        onRunSelection={onRunSelection}
        onExportSelection={onExportSelection}
        onSaveSelectionAsWorkflow={onSaveSelectionAsWorkflow}
        onCopySelection={onCopySelection}
        onDuplicateSelection={onDuplicateSelection}
        onDeleteSelection={onDeleteSelection}
        onOpenDrawer={onOpenDrawer}
      />
    </>
  );
}
