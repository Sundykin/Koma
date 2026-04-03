import { beforeEach, describe, expect, it } from 'vitest';
import { resetLinghuiCanvasStore, useLinghuiCanvasStore } from './linghuiCanvasStore';

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

    useLinghuiCanvasStore.getState().resetCanvasUiState();

    const state = useLinghuiCanvasStore.getState();
    expect(state.selection).toBeNull();
    expect(state.editorSelection).toBeNull();
    expect(state.activeNodeTool).toBeNull();
    expect(state.pendingGroupFrame).toBeNull();
    expect(state.gridSplitSelectedCells).toEqual([]);
    expect(state.gridSplitUpscaleFactor).toBe(2);
    expect(state.canvasMode).toBe('hand');
    expect(state.gridSplitType).toBe('4x4');
  });
});
