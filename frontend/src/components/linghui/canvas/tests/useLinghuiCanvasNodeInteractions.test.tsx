import React, { useEffect, useState } from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Node, ReactFlowInstance } from '@xyflow/react';
import type { LinghuiCanvasSelection } from '../../../../types/linghui';
import { useLinghuiCanvasNodeInteractions } from '../hooks/useLinghuiCanvasNodeInteractions';
import { createNewNodeData } from '../../library/state/linghuiNodeDefs';

function HookProbe({
  node,
  onSelection,
}: {
  node: Node;
  onSelection: (selection: LinghuiCanvasSelection) => void;
}) {
  const [selection, setSelection] = useState<LinghuiCanvasSelection>(null);
  const setActiveNodeTool = vi.fn();
  const setPendingGroupFrame = vi.fn();
  const setNodes = vi.fn();

  const interactions = useLinghuiCanvasNodeInteractions({
    reactFlow: {
      getNode: (nodeId: string) => (nodeId === node.id ? node : undefined),
    } as unknown as ReactFlowInstance,
    setNodes,
    setEditorSelection: setSelection,
    setActiveNodeTool,
    setPendingGroupFrame,
    closeContextMenu: vi.fn(),
    closeQuickCreate: vi.fn(),
    openContextMenuAt: vi.fn(),
    emitSnapshot: vi.fn(),
  });

  useEffect(() => {
    interactions.openNodeEditor(node.id);
  }, [node.id]);

  useEffect(() => {
    onSelection(selection);
  }, [onSelection, selection]);

  return null;
}

describe('useLinghuiCanvasNodeInteractions', () => {
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
});
