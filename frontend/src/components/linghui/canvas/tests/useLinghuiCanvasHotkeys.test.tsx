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
});
