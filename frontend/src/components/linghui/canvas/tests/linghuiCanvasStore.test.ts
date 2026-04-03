import { beforeEach, describe, expect, it } from 'vitest';
import { resetLinghuiCanvasStore, useLinghuiCanvasStore } from '../state/linghuiCanvasStore';

describe('linghuiCanvasStore', () => {
  beforeEach(() => {
    resetLinghuiCanvasStore();
  });

  it('clears mismatched active tool when editor selection switches to another node', () => {
    useLinghuiCanvasStore.getState().setActiveNodeTool({
      kind: 'image',
      nodeId: 'node-a',
      tool: 'multi-angle',
    });

    useLinghuiCanvasStore.getState().setEditorSelection({
      kind: 'node',
      nodeId: 'node-b',
      nodeType: 'linghui/image',
      label: '节点 B',
    });

    expect(useLinghuiCanvasStore.getState().activeNodeTool).toBeNull();
  });

  it('remembers previous tool when entering grid split and can revert back', () => {
    useLinghuiCanvasStore.getState().setActiveNodeTool({
      kind: 'image',
      nodeId: 'node-a',
      tool: 'multi-angle',
    });
    useLinghuiCanvasStore.getState().setActiveNodeTool({
      kind: 'image',
      nodeId: 'node-a',
      tool: 'grid-split',
    });
    useLinghuiCanvasStore.getState().toggleGridSplitCell(3);
    useLinghuiCanvasStore.getState().toggleGridSplitCell(1);

    expect(useLinghuiCanvasStore.getState().gridSplitSelectedCells).toEqual([1, 3]);

    useLinghuiCanvasStore.getState().revertGridSplitTool();

    expect(useLinghuiCanvasStore.getState().activeNodeTool).toEqual({
      kind: 'image',
      nodeId: 'node-a',
      tool: 'multi-angle',
    });
    expect(useLinghuiCanvasStore.getState().gridSplitSelectedCells).toEqual([]);
  });

  it('resetCanvasUiState clears transient editor and group state but preserves mode settings', () => {
    useLinghuiCanvasStore.getState().setSelection({
      kind: 'node',
      nodeId: 'node-a',
      nodeType: 'linghui/image',
      label: '节点 A',
    });
    useLinghuiCanvasStore.getState().setEditorSelection({
      kind: 'node',
      nodeId: 'node-a',
      nodeType: 'linghui/image',
      label: '节点 A',
    });
    useLinghuiCanvasStore.getState().setActiveNodeTool({
      kind: 'image',
      nodeId: 'node-a',
      tool: 'grid-split',
    });
    useLinghuiCanvasStore.getState().setPendingGroupFrame({
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 100,
      selectionIds: ['node-a'],
    });
    useLinghuiCanvasStore.getState().setCanvasMode('hand');
    useLinghuiCanvasStore.getState().setGridSplitType('4x4');
    useLinghuiCanvasStore.getState().setGridSplitUpscaleFactor(4);
    useLinghuiCanvasStore.getState().toggleGridSplitCell(2);
    useLinghuiCanvasStore.getState().openContextMenuAt({
      clientX: 320,
      clientY: 240,
      hostRect: {
        left: 100,
        top: 80,
        width: 800,
        height: 600,
      } as DOMRect,
      kind: 'node',
      extras: {
        nodeId: 'node-a',
      },
    });
    useLinghuiCanvasStore.getState().setActiveDrawer('asset');

    useLinghuiCanvasStore.getState().resetCanvasUiState();

    const state = useLinghuiCanvasStore.getState();
    expect(state.selection).toBeNull();
    expect(state.editorSelection).toBeNull();
    expect(state.activeNodeTool).toBeNull();
    expect(state.pendingGroupFrame).toBeNull();
    expect(state.contextMenu).toBeNull();
    expect(state.quickCreate).toBeNull();
    expect(state.gridSplitSelectedCells).toEqual([]);
    expect(state.gridSplitUpscaleFactor).toBe(2);
    expect(state.canvasMode).toBe('hand');
    expect(state.gridSplitType).toBe('4x4');
    expect(state.activeDrawer).toBe('asset');
  });

  it('keeps context menu and quick create mutually exclusive', () => {
    useLinghuiCanvasStore.getState().openQuickCreateAt({
      clientX: 240,
      clientY: 180,
      hostRect: {
        left: 0,
        top: 0,
        width: 640,
        height: 480,
      } as DOMRect,
    });

    expect(useLinghuiCanvasStore.getState().quickCreate).not.toBeNull();
    expect(useLinghuiCanvasStore.getState().contextMenu).toBeNull();

    useLinghuiCanvasStore.getState().openContextMenuAt({
      clientX: 280,
      clientY: 210,
      hostRect: {
        left: 0,
        top: 0,
        width: 640,
        height: 480,
      } as DOMRect,
      kind: 'pane',
    });

    expect(useLinghuiCanvasStore.getState().contextMenu).not.toBeNull();
    expect(useLinghuiCanvasStore.getState().quickCreate).toBeNull();
  });

  it('toggles drawer state and preserves it across surface reset only', () => {
    useLinghuiCanvasStore.getState().toggleActiveDrawer('workflow');

    expect(useLinghuiCanvasStore.getState().activeDrawer).toBe('workflow');

    useLinghuiCanvasStore.getState().resetCanvasSurfaceState();

    expect(useLinghuiCanvasStore.getState().activeDrawer).toBe('workflow');
    expect(useLinghuiCanvasStore.getState().contextMenu).toBeNull();
    expect(useLinghuiCanvasStore.getState().quickCreate).toBeNull();

    useLinghuiCanvasStore.getState().toggleActiveDrawer('workflow');

    expect(useLinghuiCanvasStore.getState().activeDrawer).toBeNull();

    useLinghuiCanvasStore.getState().setActiveDrawer('history');
    useLinghuiCanvasStore.getState().resetCanvasStore();

    expect(useLinghuiCanvasStore.getState().activeDrawer).toBeNull();
  });
});
