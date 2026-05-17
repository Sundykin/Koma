import React, { useLayoutEffect, useRef, useState } from 'react';
import type { LinghuiNodeCatalogItem } from '../../../../types/linghui';
import type { LinghuiCanvasMenuState } from '../state/linghuiCanvasShared';
import type {
  LinghuiCanvasResultCopyKind,
  LinghuiCanvasResultCopyState,
} from '../state/linghuiCanvasResultActions';
import { LinghuiCanvasNodeContextMenu } from './LinghuiCanvasNodeContextMenu';
import { LinghuiCanvasPaneContextMenu } from './LinghuiCanvasPaneContextMenu';

const CONTEXT_MENU_VIEWPORT_GUTTER = 12;

interface ContextMenuOffsets {
  x: number;
  y: number;
}

function clampContextMenuPosition(
  rect: DOMRect,
  parentRect: DOMRect,
  preferred: ContextMenuOffsets,
): ContextMenuOffsets {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const absoluteLeft = parentRect.left + preferred.x;
  const absoluteTop = parentRect.top + preferred.y;
  const minLeft = CONTEXT_MENU_VIEWPORT_GUTTER;
  const maxLeft = viewportWidth - rect.width - CONTEXT_MENU_VIEWPORT_GUTTER;
  const minTop = CONTEXT_MENU_VIEWPORT_GUTTER;
  const maxTop = viewportHeight - rect.height - CONTEXT_MENU_VIEWPORT_GUTTER;
  const clampedAbsLeft = maxLeft >= minLeft
    ? Math.min(Math.max(absoluteLeft, minLeft), maxLeft)
    : minLeft;
  const clampedAbsTop = maxTop >= minTop
    ? Math.min(Math.max(absoluteTop, minTop), maxTop)
    : minTop;
  return {
    x: clampedAbsLeft - parentRect.left,
    y: clampedAbsTop - parentRect.top,
  };
}

interface LinghuiCanvasContextMenuProps {
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
  onAddNode: (item: LinghuiNodeCatalogItem) => void;
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

export const LinghuiCanvasContextMenu: React.FC<LinghuiCanvasContextMenuProps> = ({
  contextMenu,
  contextMenuNodeIsGroup,
  contextMenuResultCopyState,
  contextMenuMediaActionState,
  contextMenuSelectionIds,
  nodeCatalog,
  hasClipboardData,
  canUndo,
  canRedo,
  onAddNode,
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
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [adjusted, setAdjusted] = useState<ContextMenuOffsets | null>(null);
  const menuKey = contextMenu ? `${contextMenu.kind}:${contextMenu.x}:${contextMenu.y}` : '';

  useLayoutEffect(() => {
    if (!contextMenu) {
      setAdjusted(null);
      return;
    }
    const element = menuRef.current;
    if (!element) return;
    const parent = element.offsetParent as HTMLElement | null;
    if (!parent) return;
    const rect = element.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const next = clampContextMenuPosition(rect, parentRect, {
      x: contextMenu.x,
      y: contextMenu.y,
    });
    const preferredMatch = Math.abs(next.x - contextMenu.x) < 1 && Math.abs(next.y - contextMenu.y) < 1;
    if (preferredMatch) {
      setAdjusted(prev => (prev ? null : prev));
      return;
    }
    setAdjusted(prev => {
      if (prev && Math.abs(prev.x - next.x) < 1 && Math.abs(prev.y - next.y) < 1) {
        return prev;
      }
      return next;
    });
  }, [contextMenu, menuKey]);

  if (!contextMenu) return null;

  const overlayLeft = adjusted ? adjusted.x : contextMenu.x;
  const overlayTop = adjusted ? adjusted.y : contextMenu.y;

  return (
    <div
      ref={menuRef}
      className="linghuiContextMenu nopan nowheel"
      style={{
        '--linghui-overlay-left': `${overlayLeft}px`,
        '--linghui-overlay-top': `${overlayTop}px`,
      } as React.CSSProperties}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {contextMenu.kind === 'node' && (
        <LinghuiCanvasNodeContextMenu
          isGroup={contextMenuNodeIsGroup}
          mediaState={contextMenuMediaActionState}
          resultCopyState={contextMenuResultCopyState}
          hasClipboardData={hasClipboardData}
          onCreateAssetFromNode={onCreateAssetFromNode}
          onOpenPanoramaPreviewFromNode={onOpenPanoramaPreviewFromNode}
          onCreateSubjectFromNode={onCreateSubjectFromNode}
          onFormatLayout={onFormatLayout}
          onExpandCurrentNodeImages={onExpandCurrentNodeImages}
          onDeleteOtherCurrentNodeImages={onDeleteOtherCurrentNodeImages}
          onExpandCurrentNodeVideos={onExpandCurrentNodeVideos}
          onDeleteOtherCurrentNodeVideos={onDeleteOtherCurrentNodeVideos}
          onCopyNodeSelection={onCopyNodeSelection}
          onCopyPrimaryImageFromNode={onCopyPrimaryImageFromNode}
          onDuplicateNodeSelection={onDuplicateNodeSelection}
          onPasteNearNode={onPasteNearNode}
          onDeleteCurrentNode={onDeleteCurrentNode}
          onCopyCurrentNodeResult={onCopyCurrentNodeResult}
          onRunCurrentGroup={onRunCurrentGroup}
          onExportCurrentSelection={onExportCurrentSelection}
          onSaveCurrentGroupAsWorkflow={onSaveCurrentGroupAsWorkflow}
          onUngroupCurrentGroup={onUngroupCurrentGroup}
          onDeleteCurrentGroup={onDeleteCurrentGroup}
        />
      )}

      {contextMenu.kind === 'edge' && (
        <>
          <div className="linghuiContextMenuHeader">连线操作</div>
          <div className="linghuiContextMenuHint">右键选中的连线可直接删除，方便清理错误连接。</div>
          <button type="button" className="linghuiContextMenuItem isDanger" onClick={onDeleteCurrentEdge}>删除连线</button>
        </>
      )}

      {contextMenu.kind !== 'node' && contextMenu.kind !== 'edge' && (
        <LinghuiCanvasPaneContextMenu
          hasClipboardData={hasClipboardData}
          canUndo={canUndo}
          canRedo={canRedo}
          onUploadImages={onUploadImages}
          onUploadVideos={onUploadVideos}
          onUploadAudios={onUploadAudios}
          onOpenAddNodePanel={onOpenAddNodePanel}
          onUndo={onUndo}
          onRedo={onRedo}
          onPaste={onPaste}
        />
      )}
    </div>
  );
};
