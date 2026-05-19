import type {
  LinghuiCanvasSelection,
  LinghuiExecutionQueueState,
  LinghuiExecuteMultiAngleOptions,
  LinghuiGridType,
  LinghuiImageAssetItem,
  LinghuiMediaItem,
  LinghuiMultiAngleConfig,
  LinghuiImageNodeProperties,
  LinghuiNodeCatalogItem,
  LinghuiNodeRunState,
  LinghuiNodeToolState,
  LinghuiStoryboardFrame,
} from '../../../../types/linghui';
import type { LinghuiCanvasMenuState, QuickCreateState } from '../state/linghuiCanvasShared';
import type {
  LinghuiCanvasResultCopyKind,
  LinghuiCanvasResultCopyState,
} from '../state/linghuiCanvasResultActions';
import type { CssVarStyle } from '../../../../theme/runtime';
import { LinghuiCanvasPendingGroupOverlay } from './LinghuiCanvasPendingGroupOverlay';
import { LinghuiCanvasQuickCreate } from './LinghuiCanvasQuickCreate';
import { LinghuiCanvasQuickCreateGhostEdge } from './LinghuiCanvasQuickCreateGhostEdge';
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
  onExecuteImageUpscale?: (nodeId: string, options?: { factor?: 2 | 4 }) => void;
  onExecuteImageCrop?: (nodeId: string, options: { aspectRatio: string; label?: string; anchorX?: number; anchorY?: number }) => void;
  onCreatePanoramaPreview?: (nodeId: string) => void;
  onGenerateImageFromController?: (controllerNodeId: string) => string | null;
  onExecuteMultiAngle?: (options?: LinghuiExecuteMultiAngleOptions) => void;
  onApplyImageToolPreset: (preset: {
    label?: string;
    promptSnippet: string;
    properties?: Partial<LinghuiImageNodeProperties>;
  }) => void;
  /** LibTV TextNode EmptyState actions：手写 / 派生上下游子图。 */
  onApplyTextEmptyAction?: (
    nodeId: string,
    action: 'edit' | 'video' | 'image-prompt' | 'music',
  ) => string | null;
  /** LibTV VideoNode EmptyState 2 actions：派生上游 ImageNode + 自动连线。 */
  onApplyVideoEmptyAction?: (
    nodeId: string,
    action: 'first-frame' | 'first-last-frame',
  ) => string | null;
  /** LibTV AudioNode EmptyState "音频生视频"：派生 video + image + 2 条连线。 */
  onApplyAudioEmptyAction?: (
    nodeId: string,
    action: 'audio-to-video',
  ) => string | null;
  onSetGridSplitType: (type: LinghuiGridType) => void;
  onClearGridSplitCells: () => void;
  onExecuteGridSplit: () => void;
  gridSplitUpscaleFactor: 2 | 4;
  onSetGridSplitUpscaleFactor: (factor: 2 | 4) => void;
  onRevertGridSplit: () => void;
  /** 视频工具栏"音频分离 → 音视频分离"，按 nodeId 工作，非右键菜单专用。 */
  onSeparateVideoAudio?: (nodeId: string) => void;
  /** 视频工具栏"截图"，按 nodeId 派生图片节点。 */
  onCreateDerivedVideoFrames?: (nodeId: string, items: LinghuiImageAssetItem[]) => void;
  /** 视频工具栏"剪辑"，按 nodeId 派生视频片段节点。 */
  onCreateDerivedVideoClips?: (nodeId: string, items: LinghuiMediaItem[]) => void;
  /** 视频工具栏"解析"，按 nodeId 派生可编辑文本解析节点。 */
  onCreateDerivedVideoAnalysis?: (
    nodeId: string,
    draft: { label?: string; content: string; source?: string; durationSec?: number },
  ) => string | null;
  pendingGroupFrameStyle: CssVarStyle | null;
  pendingGroupActionsStyle: CssVarStyle | null;
  pendingGroupCreatableIds: string[];
  onCreateGroup: (selectionIds?: string[]) => void;
  onDismissPendingGroup: () => void;
  quickCreate: QuickCreateState | null;
  quickCreateCatalog: LinghuiNodeCatalogItem[];
  onAddNodeFromQuickCreate: (item: LinghuiNodeCatalogItem) => void;
  contextMenu: LinghuiCanvasMenuState | null;
  contextMenuNodeIsGroup: boolean;
  contextMenuResultCopyState: LinghuiCanvasResultCopyState;
  contextMenuMediaActionState: {
    imageCount: number;
    videoCount: number;
    canOpenPanoramaPreview: boolean;
    canCreateSubject: boolean;
    canCopyPrimaryImage: boolean;
    canSeparateVideoAudio: boolean;
    canReturnToGenerator: boolean;
    canExpandImages: boolean;
    canDeleteOtherImages: boolean;
    canExpandVideos: boolean;
    canDeleteOtherVideos: boolean;
  };
  contextMenuSelectionIds: string[];
  nodeCatalog: LinghuiNodeCatalogItem[];
  hasClipboardData: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onAddNodeFromMenu: (item: LinghuiNodeCatalogItem) => void;
  /** LibTV 空白右键菜单"添加节点"：打开 quickCreate 面板（与双击画布同效果）。 */
  onOpenAddNodePanel: () => void;
  onCopyNodeSelection: () => void;
  onDuplicateNodeSelection: () => void;
  onOpenDownstreamQuickCreate: () => void;
  onCreateAssetFromNode: () => void;
  onOpenPanoramaPreviewFromNode: () => void;
  onCreateSubjectFromNode: () => void;
  onCopyPrimaryImageFromNode: () => void;
  onSeparateVideoAudioFromNode: () => void;
  onReturnToGenerator: () => void;
  onCopyCurrentNodeResult: (kind: LinghuiCanvasResultCopyKind) => void;
  onExpandCurrentNodeImages: () => void;
  onDeleteOtherCurrentNodeImages: () => void;
  onExpandCurrentNodeVideos: () => void;
  onDeleteOtherCurrentNodeVideos: () => void;
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
  onFormatLayout: () => void;
  onOpenShortcutPanel: () => void;
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
  contextMenuResultCopyState,
  contextMenuMediaActionState,
  contextMenuSelectionIds,
  nodeCatalog,
  hasClipboardData,
  canUndo,
  canRedo,
  onAddNodeFromMenu,
  onOpenAddNodePanel,
  onCopyNodeSelection,
  onDuplicateNodeSelection,
  onOpenDownstreamQuickCreate,
  onCreateAssetFromNode,
  onOpenPanoramaPreviewFromNode,
  onCreateSubjectFromNode,
  onCopyPrimaryImageFromNode,
  onSeparateVideoAudioFromNode,
  onReturnToGenerator,
  onCopyCurrentNodeResult,
  onExpandCurrentNodeImages,
  onDeleteOtherCurrentNodeImages,
  onExpandCurrentNodeVideos,
  onDeleteOtherCurrentNodeVideos,
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
  onFormatLayout,
  onOpenShortcutPanel,
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

      <LinghuiCanvasQuickCreateGhostEdge quickCreate={quickCreate} />

      <LinghuiCanvasQuickCreate
        quickCreate={quickCreate}
        catalog={quickCreateCatalog}
        onAddNode={onAddNodeFromQuickCreate}
      />

      <LinghuiCanvasContextMenu
        contextMenu={contextMenu}
        contextMenuNodeIsGroup={contextMenuNodeIsGroup}
        contextMenuResultCopyState={contextMenuResultCopyState}
        contextMenuMediaActionState={contextMenuMediaActionState}
        contextMenuSelectionIds={contextMenuSelectionIds}
        nodeCatalog={nodeCatalog}
        hasClipboardData={hasClipboardData}
        canUndo={canUndo}
        canRedo={canRedo}
        onAddNode={onAddNodeFromMenu}
        onOpenAddNodePanel={onOpenAddNodePanel}
        onCopyNodeSelection={onCopyNodeSelection}
        onDuplicateNodeSelection={onDuplicateNodeSelection}
        onOpenDownstreamQuickCreate={onOpenDownstreamQuickCreate}
        onCreateAssetFromNode={onCreateAssetFromNode}
        onOpenPanoramaPreviewFromNode={onOpenPanoramaPreviewFromNode}
        onCreateSubjectFromNode={onCreateSubjectFromNode}
        onCopyPrimaryImageFromNode={onCopyPrimaryImageFromNode}
        onSeparateVideoAudioFromNode={onSeparateVideoAudioFromNode}
        onReturnToGenerator={onReturnToGenerator}
        onCopyCurrentNodeResult={onCopyCurrentNodeResult}
        onExpandCurrentNodeImages={onExpandCurrentNodeImages}
        onDeleteOtherCurrentNodeImages={onDeleteOtherCurrentNodeImages}
        onExpandCurrentNodeVideos={onExpandCurrentNodeVideos}
        onDeleteOtherCurrentNodeVideos={onDeleteOtherCurrentNodeVideos}
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
        onFormatLayout={onFormatLayout}
        onOpenShortcutPanel={onOpenShortcutPanel}
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
