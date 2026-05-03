import type {
  LinghuiCanvasSelection,
  LinghuiExecutionQueueState,
  LinghuiExecuteMultiAngleOptions,
  LinghuiGridType,
  LinghuiImageAssetItem,
  LinghuiMultiAngleConfig,
  LinghuiImageNodeProperties,
  LinghuiNodeCatalogItem,
  LinghuiNodeRunState,
  LinghuiNodeToolState,
  LinghuiNodeType,
  LinghuiStoryboardFrame,
} from '../../../../types/linghui';
import type { LinghuiCanvasMenuState, QuickCreateState } from '../state/linghuiCanvasShared';
import type { CssVarStyle } from '../../../../theme/runtime';
import { LinghuiCanvasPendingGroupOverlay } from './LinghuiCanvasPendingGroupOverlay';
import { LinghuiCanvasQuickCreate } from './LinghuiCanvasQuickCreate';
import { LinghuiCanvasContextMenu } from './LinghuiCanvasContextMenu';

export interface LinghuiCanvasOverlaysProps {
  editorSelection: LinghuiCanvasSelection;
  activeNodeTool: LinghuiNodeToolState;
  setActiveNodeTool: (tool: LinghuiNodeToolState) => void;
  onCloseEditor: () => void;
  nodeRuns: Record<string, LinghuiNodeRunState>;
  executionQueue?: LinghuiExecutionQueueState | null;
  workspaceId: string | null;
  onAssetLibraryMutate?: () => void;
  canvasRect: DOMRect | null;
  onRunNode: (nodeId: string) => void;
  onDeriveScriptShots: (nodeId: string, shots: LinghuiStoryboardFrame[]) => void;
  onGenerateScriptImages: (nodeId: string, shots: LinghuiStoryboardFrame[]) => void;
  onGenerateScriptVideos: (nodeId: string, shots: LinghuiStoryboardFrame[]) => void;
  onCreateDerivedImportImages: (nodeId: string, items: LinghuiImageAssetItem[]) => void;
  onCreateDerivedMultiAngleImage?: (nodeId: string, options?: {
    prompt?: string;
    ttiSelection?: string;
    multiAngle?: Partial<LinghuiMultiAngleConfig>;
    label?: string;
  }) => string | null;
  onExecuteMultiAngle?: (options?: LinghuiExecuteMultiAngleOptions) => void;
  onApplyImageToolPreset: (preset: {
    promptSnippet: string;
    properties?: Partial<LinghuiImageNodeProperties>;
  }) => void;
  onSetGridSplitType: (type: LinghuiGridType) => void;
  onClearGridSplitCells: () => void;
  onExecuteGridSplit: () => void;
  gridSplitUpscaleFactor: 2 | 4;
  onSetGridSplitUpscaleFactor: (factor: 2 | 4) => void;
  onRevertGridSplit: () => void;
  pendingGroupFrameStyle: CssVarStyle | null;
  pendingGroupActionsStyle: CssVarStyle | null;
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
  onDeleteCurrentEdge: () => void;
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
}

export function LinghuiCanvasOverlays({
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
  onDeleteCurrentEdge,
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
}: LinghuiCanvasOverlaysProps) {
  return (
    <>
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
        onDeleteCurrentEdge={onDeleteCurrentEdge}
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
      />
    </>
  );
}
