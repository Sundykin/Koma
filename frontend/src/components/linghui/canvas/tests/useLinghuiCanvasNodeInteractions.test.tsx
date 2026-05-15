import React, { useEffect, useRef, useState } from 'react';
import { act, createEvent, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Node, ReactFlowInstance } from '@xyflow/react';
import type { LinghuiCanvasSelection } from '../../../../types/linghui';
import { useLinghuiCanvasNodeInteractions } from '../hooks/useLinghuiCanvasNodeInteractions';
import { createNewNodeData } from '../../library/state/linghuiNodeDefs';
import { NODE_LONG_PRESS_MS } from '../state/linghuiCanvasShared';

function HookProbe({
  node,
  onSelection,
  openOnMount = true,
  renderSurface = false,
  onNodeUpdate,
  onDragStart,
  onDragStop,
}: {
  node: Node;
  onSelection: (selection: LinghuiCanvasSelection) => void;
  openOnMount?: boolean;
  renderSurface?: boolean;
  onNodeUpdate?: (node: Node) => void;
  onDragStart?: () => void;
  onDragStop?: () => void;
}) {
  const [selection, setSelection] = useState<LinghuiCanvasSelection>(null);
  const nodeRef = useRef<Node>(node);
  const setActiveNodeTool = vi.fn();
  const setPendingGroupFrame = vi.fn();
  const setNodes = vi.fn();

  const interactions = useLinghuiCanvasNodeInteractions({
    reactFlow: {
      getNode: (nodeId: string) => (nodeId === node.id ? nodeRef.current : undefined),
      screenToFlowPosition: position => position,
      updateNode: (nodeId: string, updater: Partial<Node> | ((node: Node) => Partial<Node>)) => {
        if (nodeId !== node.id) return;
        const patch = typeof updater === 'function' ? updater(nodeRef.current) : updater;
        nodeRef.current = {
          ...nodeRef.current,
          ...patch,
        };
        onNodeUpdate?.(nodeRef.current);
      },
    } as unknown as ReactFlowInstance,
    setNodes,
    setEditorSelection: setSelection,
    setActiveNodeTool,
    setPendingGroupFrame,
    closeContextMenu: vi.fn(),
    closeQuickCreate: vi.fn(),
    openContextMenuAt: vi.fn(),
    emitSnapshot: vi.fn(),
    onNodeDragStart: onDragStart,
    onNodeDragStop: onDragStop,
  });

  useEffect(() => {
    if (!openOnMount) return;
    interactions.openNodeEditor(node.id);
  }, [node.id, openOnMount]);

  useEffect(() => {
    onSelection(selection);
  }, [onSelection, selection]);

  if (!renderSurface) return null;

  return (
    <div
      data-testid="node-surface"
      {...interactions.bindNodeSurface(node.id)}
      onClick={event => interactions.handleNodeClick(event, node)}
    >
      <div data-testid="preview" data-node-preview-area="true">preview</div>
      <div data-testid="body">body</div>
      <button type="button" data-testid="button">button</button>
    </div>
  );
}

describe('useLinghuiCanvasNodeInteractions', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens the editor for director3d nodes', async () => {
    const selections: LinghuiCanvasSelection[] = [];
    const node: Node = {
      id: 'director-1',
      type: 'linghui-director3d',
      position: { x: 0, y: 0 },
      data: createNewNodeData('linghui/director3d') as unknown as Record<string, unknown>,
    };

    render(<HookProbe node={node} onSelection={selection => selections.push(selection)} />);

    await waitFor(() => {
      expect(selections).toContainEqual({
        kind: 'node',
        nodeId: 'director-1',
        nodeType: 'linghui/director3d',
        label: '3D 导演',
      });
    });
  });

  it('does not open the editor when clicking preview-only areas', async () => {
    const selections: LinghuiCanvasSelection[] = [];
    const node: Node = {
      id: 'director-1',
      type: 'linghui-director3d',
      position: { x: 0, y: 0 },
      data: createNewNodeData('linghui/director3d') as unknown as Record<string, unknown>,
    };

    const { getByTestId } = render(
      <HookProbe
        node={node}
        onSelection={selection => selections.push(selection)}
        openOnMount={false}
        renderSurface
      />,
    );

    fireEvent.click(getByTestId('preview'));

    expect(selections).not.toContainEqual({
      kind: 'node',
      nodeId: 'director-1',
      nodeType: 'linghui/director3d',
      label: '3D 导演',
    });

    fireEvent.click(getByTestId('body'));

    await waitFor(() => {
      expect(selections).toContainEqual({
        kind: 'node',
        nodeId: 'director-1',
        nodeType: 'linghui/director3d',
        label: '3D 导演',
      });
    });
  });

  it('allows preview-only areas to start node dragging', () => {
    vi.useFakeTimers();

    const updates: Node[] = [];
    const onDragStart = vi.fn();
    const onDragStop = vi.fn();
    const node: Node = {
      id: 'director-1',
      type: 'linghui-director3d',
      position: { x: 4, y: 8 },
      data: createNewNodeData('linghui/director3d') as unknown as Record<string, unknown>,
    };

    const { getByTestId } = render(
      <HookProbe
        node={node}
        onSelection={vi.fn()}
        openOnMount={false}
        renderSurface
        onNodeUpdate={updatedNode => updates.push(updatedNode)}
        onDragStart={onDragStart}
        onDragStop={onDragStop}
      />,
    );
    const surface = getByTestId('node-surface');
    const preview = getByTestId('preview');
    surface.setPointerCapture = vi.fn();
    surface.releasePointerCapture = vi.fn();

    const pointerDownEvent = createEvent.pointerDown(preview, {
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 20,
    });
    Object.defineProperty(pointerDownEvent, 'button', { value: 0 });
    Object.defineProperty(pointerDownEvent, 'pointerId', { value: 1 });
    Object.defineProperty(pointerDownEvent, 'clientX', { value: 10 });
    Object.defineProperty(pointerDownEvent, 'clientY', { value: 20 });
    fireEvent(preview, pointerDownEvent);
    expect(surface.setPointerCapture).toHaveBeenCalledWith(1);
    act(() => {
      vi.advanceTimersByTime(NODE_LONG_PRESS_MS + 1);
    });
    const pointerMoveEvent = createEvent.pointerMove(preview, {
      pointerId: 1,
      clientX: 22,
      clientY: 35,
    });
    Object.defineProperty(pointerMoveEvent, 'pointerId', { value: 1 });
    Object.defineProperty(pointerMoveEvent, 'clientX', { value: 22 });
    Object.defineProperty(pointerMoveEvent, 'clientY', { value: 35 });
    fireEvent(preview, pointerMoveEvent);
    const pointerUpEvent = createEvent.pointerUp(surface, {
      pointerId: 1,
      clientX: 22,
      clientY: 35,
    });
    Object.defineProperty(pointerUpEvent, 'pointerId', { value: 1 });
    Object.defineProperty(pointerUpEvent, 'clientX', { value: 22 });
    Object.defineProperty(pointerUpEvent, 'clientY', { value: 35 });
    fireEvent(surface, pointerUpEvent);

    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDragStop).toHaveBeenCalledTimes(1);
    expect(updates.at(-1)?.position).toEqual({ x: 16, y: 23 });
  });
});
