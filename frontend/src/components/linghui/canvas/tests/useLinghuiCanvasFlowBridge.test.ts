import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  hasPersistableEdgeChanges,
  hasPersistableNodeChanges,
  resolveQuickCreateFromConnectEnd,
  useLinghuiCanvasFlowBridge,
} from '../hooks/useLinghuiCanvasFlowBridge';
import type { PendingConnectionCreateState } from '../state/linghuiCanvasShared';

const pending: PendingConnectionCreateState = {
  sourceNodeId: 'src-1',
  sourceHandleId: 'output-0',
  sourceDataType: 'image',
};

describe('useLinghuiCanvasFlowBridge snapshot policy', () => {
  it('ignores selection-only node changes', () => {
    expect(hasPersistableNodeChanges([
      { id: 'n1', type: 'select', selected: true },
    ])).toBe(false);
  });

  it('defers node position snapshots while dragging, but persists the final position', () => {
    expect(hasPersistableNodeChanges([
      { id: 'n1', type: 'position', position: { x: 10, y: 20 }, dragging: true },
    ])).toBe(false);

    expect(hasPersistableNodeChanges([
      { id: 'n1', type: 'position', position: { x: 10, y: 20 }, dragging: false },
    ])).toBe(true);
  });

  it('defers node dimension snapshots while resizing, but persists the settled dimensions', () => {
    expect(hasPersistableNodeChanges([
      { id: 'n1', type: 'dimensions', dimensions: { width: 240, height: 180 }, resizing: true },
    ])).toBe(false);

    expect(hasPersistableNodeChanges([
      { id: 'n1', type: 'dimensions', dimensions: { width: 240, height: 180 }, resizing: false },
    ])).toBe(true);
  });

  it('persists structural node and edge changes', () => {
    expect(hasPersistableNodeChanges([
      { type: 'add', item: { id: 'n2', position: { x: 0, y: 0 }, data: {}, type: 'demo' } },
    ])).toBe(true);

    expect(hasPersistableEdgeChanges([
      { id: 'e1', type: 'select', selected: true },
    ])).toBe(false);

    expect(hasPersistableEdgeChanges([
      { id: 'e1', type: 'remove' },
    ])).toBe(true);
  });

  it('waits for an asynchronous node updater before deciding whether to save a data change', () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      });
    const scheduleSnapshot = vi.fn();
    const emitSnapshot = vi.fn();
    let deferredUpdater: ((nodes: any[]) => any[]) | undefined;
    const setNodes = vi.fn((updater: (nodes: any[]) => any[]) => {
      deferredUpdater = updater;
    });
    const node = {
      id: 'script-1',
      type: 'linghui-script',
      position: { x: 0, y: 0 },
      data: {
        linghuiType: 'linghui/script',
        label: '脚本',
        accent: '#64748b',
        background: '#0f172a',
        properties: { productionStage: 'storyboard' },
        inputs: [],
        outputs: [],
        active: false,
      },
    };

    try {
      const { result } = renderHook(() => useLinghuiCanvasFlowBridge({
        reactFlow: { getNodes: () => [node], getNode: () => node } as never,
        hostRef: { current: null },
        onNodesChange: vi.fn(),
        onEdgesChange: vi.fn(),
        setNodes: setNodes as never,
        setEdges: vi.fn() as never,
        setSelection: vi.fn() as never,
        setEditorSelection: vi.fn() as never,
        setCanvasRect: vi.fn() as never,
        scheduleSnapshot,
        emitSnapshot,
        openQuickCreateAt: vi.fn(),
        pendingConnectionCreateRef: { current: null },
        onSelectionChangeRef: { current: undefined },
        onNodeMutateRef: { current: vi.fn() },
        onConnectionErrorRef: { current: undefined },
        onConnectionInteractionChange: vi.fn(),
      }));

      act(() => {
        result.current.updateLinghuiNodeData('script-1', previous => ({
          ...previous,
          properties: {
            ...previous.properties,
            acknowledgedProductionConsistencyIssueIds: ['issue-1'],
          },
        }), { markStale: false });
      });

      expect(scheduleSnapshot).not.toHaveBeenCalled();
      expect(deferredUpdater).toBeTypeOf('function');

      act(() => {
        deferredUpdater?.([node]);
      });
      expect(scheduleSnapshot).not.toHaveBeenCalled();

      act(() => {
        frameCallbacks[0]?.(0);
      });
      expect(emitSnapshot).not.toHaveBeenCalled();
      act(() => {
        frameCallbacks[1]?.(0);
      });
      expect(emitSnapshot).toHaveBeenCalledTimes(1);
    } finally {
      requestAnimationFrameSpy.mockRestore();
    }
  });
});

describe('resolveQuickCreateFromConnectEnd (libtv 引用该节点生成 trigger)', () => {
  it('skips when there is no pending connection', () => {
    const decision = resolveQuickCreateFromConnectEnd(
      { clientX: 100, clientY: 100 },
      { isValid: false, toNode: null, pointer: { x: 100, y: 100 } },
      null,
    );
    expect(decision).toEqual({ open: false });
  });

  it('skips when ReactFlow reports a valid connection', () => {
    const decision = resolveQuickCreateFromConnectEnd(
      { clientX: 100, clientY: 100 },
      { isValid: true, toNode: null, pointer: { x: 100, y: 100 } },
      pending,
    );
    expect(decision).toEqual({ open: false });
  });

  it('skips when released on a downstream node (handled by onConnect)', () => {
    const decision = resolveQuickCreateFromConnectEnd(
      { clientX: 100, clientY: 100 },
      { isValid: false, toNode: { id: 'dst-1' } as never, pointer: { x: 100, y: 100 } },
      pending,
    );
    expect(decision).toEqual({ open: false });
  });

  it('opens quickCreate using ReactFlow pointer when present', () => {
    const decision = resolveQuickCreateFromConnectEnd(
      { clientX: 999, clientY: 999 },
      { isValid: false, toNode: null, pointer: { x: 420, y: 320 } },
      pending,
    );
    expect(decision).toEqual({ open: true, x: 420, y: 320, sourceConnection: pending });
  });

  it('falls back to event clientX/Y when pointer is missing', () => {
    // 旧 bug 场景：connectionState.pointer 为 null/undefined（touch / 复杂 wrapper），
    // 之前直接 return 导致 quickCreate 永远不开。fallback 用原生事件坐标。
    const decision = resolveQuickCreateFromConnectEnd(
      { clientX: 240, clientY: 160 },
      { isValid: false, toNode: null, pointer: null as never },
      pending,
    );
    expect(decision).toEqual({ open: true, x: 240, y: 160, sourceConnection: pending });
  });

  it('does not require event target to be on .react-flow__pane', () => {
    // 旧 bug 场景：旧 handleConnectEnd 要求 event.target.closest('.react-flow__pane')，但
    // 鼠标松开时 target 经常是 .react-flow__edges / __nodes-overlay 等子层。
    // 新行为：纯函数不再依赖 event.target，松开在画布任意子层都打开 quickCreate。
    const decision = resolveQuickCreateFromConnectEnd(
      { clientX: 240, clientY: 160 },
      { isValid: false, toNode: null, pointer: { x: 240, y: 160 } },
      pending,
    );
    expect(decision.open).toBe(true);
  });

  it('skips only when both pointer and event coords collapse to (0,0)', () => {
    const decision = resolveQuickCreateFromConnectEnd(
      { clientX: 0, clientY: 0 },
      { isValid: false, toNode: null, pointer: { x: 0, y: 0 } },
      pending,
    );
    expect(decision).toEqual({ open: false });
  });
});
