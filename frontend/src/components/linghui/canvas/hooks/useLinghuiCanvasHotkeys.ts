import { useEffect, useRef } from 'react';
import { isEditableEventTarget, type LinghuiPendingGroupFrame } from '../state/linghuiCanvasShared';

interface UseLinghuiCanvasHotkeysParams {
  canUndo: boolean;
  canRedo: boolean;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  pendingGroupFrame: LinghuiPendingGroupFrame | null;
  copySelectionToClipboard: (requestedIds?: string[]) => boolean;
  pasteClipboardSnapshot: (options?: { screenX?: number; screenY?: number }) => boolean;
  duplicateSelection: (requestedIds?: string[], options?: { screenX?: number; screenY?: number }) => boolean;
  deleteNodesByIds: (nodeIds: string[]) => void;
  deleteEdgesByIds: (edgeIds: string[]) => void;
  undoHistory: () => void;
  redoHistory: () => void;
  closeContextMenu: () => void;
  closeQuickCreate: () => void;
  clearPendingGroupFrame: () => void;
  onRunRequested?: () => void;
  onOpenQuickCreate?: () => void;
  onFormatLayout?: () => void;
  onFocusContent?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onToggleShortcutPanel?: () => void;
  /**
   * LibTV canvas:cancel-connect scope。Esc 时若处于连线拖拽中先终止连线，
   * 返回 true 表示已消费 Esc，本次不再走 closeContextMenu/closeQuickCreate 链路。
   */
  onCancelPendingConnection?: () => boolean;
  /**
   * LibTV nO（onBeforeDelete）：键盘 Delete/Backspace 删除节点前可弹二次确认。
   * 不传时直接走 deleteNodesByIds。
   */
  confirmDeleteNodes?: (nodeIds: string[]) => void;
}

export function useLinghuiCanvasHotkeys(params: UseLinghuiCanvasHotkeysParams) {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableEventTarget(event.target)) return;

      const {
        canUndo,
        canRedo,
        selectedNodeIds,
        selectedEdgeIds,
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
        onRunRequested,
        onOpenQuickCreate,
        onFormatLayout,
        onFocusContent,
        onZoomIn,
        onZoomOut,
        onToggleShortcutPanel,
        onCancelPendingConnection,
        confirmDeleteNodes,
      } = paramsRef.current;

      const modifierPressed = event.metaKey || event.ctrlKey;
      const normalizedKey = event.key.toLowerCase();

      if (modifierPressed && event.key === 'Enter' && onRunRequested) {
        event.preventDefault();
        onRunRequested();
        return;
      }

      if (modifierPressed && normalizedKey === 'c') {
        const copied = copySelectionToClipboard(pendingGroupFrame?.selectionIds ?? selectedNodeIds);
        if (copied) {
          event.preventDefault();
        }
        return;
      }

      if (modifierPressed && normalizedKey === 'v') {
        const pasted = pasteClipboardSnapshot();
        if (pasted) {
          event.preventDefault();
        }
        return;
      }

      if (modifierPressed && normalizedKey === 'd') {
        const duplicated = duplicateSelection(pendingGroupFrame?.selectionIds ?? selectedNodeIds);
        if (duplicated) {
          event.preventDefault();
        }
        return;
      }

      if (modifierPressed && normalizedKey === 'z' && !event.shiftKey) {
        if (canUndo) {
          event.preventDefault();
          undoHistory();
        }
        return;
      }

      if (
        (modifierPressed && normalizedKey === 'z' && event.shiftKey) ||
        (modifierPressed && normalizedKey === 'y')
      ) {
        if (canRedo) {
          event.preventDefault();
          redoHistory();
        }
        return;
      }

      if (modifierPressed && (normalizedKey === '+' || normalizedKey === '=')) {
        event.preventDefault();
        onZoomIn?.();
        return;
      }

      if (modifierPressed && (normalizedKey === '-' || normalizedKey === '_')) {
        event.preventDefault();
        onZoomOut?.();
        return;
      }

      if (event.shiftKey && normalizedKey === '1' && onFocusContent) {
        event.preventDefault();
        onFocusContent();
        return;
      }

      if (event.altKey && event.shiftKey && normalizedKey === 'f' && onFormatLayout) {
        event.preventDefault();
        onFormatLayout();
        return;
      }

      if (!modifierPressed && !event.altKey && !event.ctrlKey && !event.shiftKey && normalizedKey === 'tab' && onOpenQuickCreate) {
        event.preventDefault();
        onOpenQuickCreate();
        return;
      }

      if (!modifierPressed && !event.altKey && (normalizedKey === '?' || (event.shiftKey && normalizedKey === '/'))) {
        event.preventDefault();
        onToggleShortcutPanel?.();
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        if (selectedNodeIds.length || pendingGroupFrame) {
          event.preventDefault();
          const targetIds = pendingGroupFrame?.selectionIds ?? selectedNodeIds;
          if (confirmDeleteNodes) {
            confirmDeleteNodes(targetIds);
          } else {
            deleteNodesByIds(targetIds);
          }
          return;
        }

        if (selectedEdgeIds.length) {
          event.preventDefault();
          deleteEdgesByIds(selectedEdgeIds);
          return;
        }
      }

      if (event.key === 'Escape') {
        // LibTV canvas:cancel-connect：先尝试取消正在拖拽的连线，吞掉本次 Esc。
        if (onCancelPendingConnection?.()) {
          event.preventDefault();
          return;
        }
        closeContextMenu();
        closeQuickCreate();
        clearPendingGroupFrame();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
