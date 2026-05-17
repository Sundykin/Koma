import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLinghuiCanvasHotkeys } from '../hooks/useLinghuiCanvasHotkeys';

function Harness(props: Partial<Parameters<typeof useLinghuiCanvasHotkeys>[0]>) {
  useLinghuiCanvasHotkeys({
    canUndo: false,
    canRedo: false,
    selectedNodeIds: [],
    selectedEdgeIds: [],
    pendingGroupFrame: null,
    copySelectionToClipboard: vi.fn(),
    pasteClipboardSnapshot: vi.fn(),
    duplicateSelection: vi.fn(),
    deleteNodesByIds: vi.fn(),
    deleteEdgesByIds: vi.fn(),
    undoHistory: vi.fn(),
    redoHistory: vi.fn(),
    closeContextMenu: vi.fn(),
    closeQuickCreate: vi.fn(),
    clearPendingGroupFrame: vi.fn(),
    ...props,
  });

  return null;
}

describe('useLinghuiCanvasHotkeys', () => {
  it('handles LibTV-style canvas command hotkeys', () => {
    const onRunRequested = vi.fn();
    const onOpenQuickCreate = vi.fn();
    const onFormatLayout = vi.fn();
    const onFocusContent = vi.fn();
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const onToggleShortcutPanel = vi.fn();

    render(
      <Harness
        onRunRequested={onRunRequested}
        onOpenQuickCreate={onOpenQuickCreate}
        onFormatLayout={onFormatLayout}
        onFocusContent={onFocusContent}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onToggleShortcutPanel={onToggleShortcutPanel}
      />,
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '=', metaKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', metaKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', shiftKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', altKey: true, shiftKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', shiftKey: true }));

    expect(onRunRequested).toHaveBeenCalledTimes(1);
    expect(onZoomIn).toHaveBeenCalledTimes(1);
    expect(onZoomOut).toHaveBeenCalledTimes(1);
    expect(onFocusContent).toHaveBeenCalledTimes(1);
    expect(onFormatLayout).toHaveBeenCalledTimes(1);
    expect(onOpenQuickCreate).toHaveBeenCalledTimes(1);
    expect(onToggleShortcutPanel).toHaveBeenCalledTimes(1);
  });

  it('keeps Shift+Tab available for focus traversal', () => {
    const onOpenQuickCreate = vi.fn();

    render(<Harness onOpenQuickCreate={onOpenQuickCreate} />);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }));

    expect(onOpenQuickCreate).not.toHaveBeenCalled();
  });

  it('Esc 优先取消正在拖拽的连线（返回 true 即吞掉 Esc，不再走 closeContextMenu）', () => {
    const onCancelPendingConnection = vi.fn().mockReturnValue(true);
    const closeContextMenu = vi.fn();
    const closeQuickCreate = vi.fn();
    const clearPendingGroupFrame = vi.fn();

    render(
      <Harness
        onCancelPendingConnection={onCancelPendingConnection}
        closeContextMenu={closeContextMenu}
        closeQuickCreate={closeQuickCreate}
        clearPendingGroupFrame={clearPendingGroupFrame}
      />,
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onCancelPendingConnection).toHaveBeenCalledTimes(1);
    expect(closeContextMenu).not.toHaveBeenCalled();
    expect(closeQuickCreate).not.toHaveBeenCalled();
    expect(clearPendingGroupFrame).not.toHaveBeenCalled();
  });

  it('Esc 在无连线拖拽时仍走 closeContextMenu / closeQuickCreate 链路', () => {
    const onCancelPendingConnection = vi.fn().mockReturnValue(false);
    const closeContextMenu = vi.fn();
    const closeQuickCreate = vi.fn();
    const clearPendingGroupFrame = vi.fn();

    render(
      <Harness
        onCancelPendingConnection={onCancelPendingConnection}
        closeContextMenu={closeContextMenu}
        closeQuickCreate={closeQuickCreate}
        clearPendingGroupFrame={clearPendingGroupFrame}
      />,
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(closeContextMenu).toHaveBeenCalledTimes(1);
    expect(closeQuickCreate).toHaveBeenCalledTimes(1);
    expect(clearPendingGroupFrame).toHaveBeenCalledTimes(1);
  });

  it('Delete 键删除节点时走 confirmDeleteNodes（如有提供），不直接 deleteNodesByIds', () => {
    const confirmDeleteNodes = vi.fn();
    const deleteNodesByIds = vi.fn();

    render(
      <Harness
        selectedNodeIds={['n1', 'n2']}
        confirmDeleteNodes={confirmDeleteNodes}
        deleteNodesByIds={deleteNodesByIds}
      />,
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));

    expect(confirmDeleteNodes).toHaveBeenCalledWith(['n1', 'n2']);
    expect(deleteNodesByIds).not.toHaveBeenCalled();
  });
});
