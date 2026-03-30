import { useEffect } from 'react';
import { isEditableEventTarget, type LinghuiPendingGroupFrame } from './linghuiCanvasShared';

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
}

export function useLinghuiCanvasHotkeys({
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
}: UseLinghuiCanvasHotkeysParams) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableEventTarget(event.target)) return;

      const modifierPressed = event.metaKey || event.ctrlKey;
      const normalizedKey = event.key.toLowerCase();

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

      if (event.key === 'Backspace' || event.key === 'Delete') {
        if (selectedNodeIds.length || pendingGroupFrame) {
          event.preventDefault();
          deleteNodesByIds(pendingGroupFrame?.selectionIds ?? selectedNodeIds);
          return;
        }

        if (selectedEdgeIds.length) {
          event.preventDefault();
          deleteEdgesByIds(selectedEdgeIds);
          return;
        }
      }

      if (event.key === 'Escape') {
        closeContextMenu();
        closeQuickCreate();
        clearPendingGroupFrame();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    canRedo,
    canUndo,
    copySelectionToClipboard,
    deleteEdgesByIds,
    deleteNodesByIds,
    duplicateSelection,
    pasteClipboardSnapshot,
    pendingGroupFrame,
    redoHistory,
    selectedEdgeIds,
    selectedNodeIds,
    clearPendingGroupFrame,
    closeContextMenu,
    closeQuickCreate,
    undoHistory,
  ]);
}
