import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import {
  computeLinghuiCanvasElkLayout,
  detectLinghuiCanvasOutliers,
  LINGHUI_CANVAS_SNAP_GRID_SIZE,
} from '../state/linghuiCanvasLayout';

function makeNode(id: string, x: number, y: number, label = id): Node {
  return {
    id,
    type: 'linghui-text',
    position: { x, y },
    data: { label },
    measured: { width: 160, height: 96 },
  };
}

describe('linghui canvas ELK layout', () => {
  it('lays connected nodes left-to-right and snaps positions to the canvas grid', async () => {
    const nodes = [
      makeNode('source', 480, 0, '源节点'),
      makeNode('target', 0, 220, '目标节点'),
    ];
    const edges: Edge[] = [
      { id: 'source-target', source: 'source', target: 'target' },
    ];

    const result = await computeLinghuiCanvasElkLayout(nodes, edges);
    const updates = new Map(result.updates.map(update => [update.id, update.position]));
    const sourcePosition = updates.get('source') ?? nodes[0].position;
    const targetPosition = updates.get('target') ?? nodes[1].position;

    expect(sourcePosition.x).toBeLessThan(targetPosition.x);
    expect(sourcePosition.x % LINGHUI_CANVAS_SNAP_GRID_SIZE).toBe(0);
    expect(sourcePosition.y % LINGHUI_CANVAS_SNAP_GRID_SIZE).toBe(0);
    expect(targetPosition.x % LINGHUI_CANVAS_SNAP_GRID_SIZE).toBe(0);
    expect(targetPosition.y % LINGHUI_CANVAS_SNAP_GRID_SIZE).toBe(0);
    expect(result.outlierNodes).toEqual([]);
  });

  it('detects disconnected top-level nodes as outliers outside the main component', () => {
    const nodes = [
      makeNode('a', 0, 0, '主节点 A'),
      makeNode('b', 260, 0, '主节点 B'),
      makeNode('lonely', 1200, 900, '离群素材'),
    ];
    const edges: Edge[] = [
      { id: 'a-b', source: 'a', target: 'b' },
    ];

    expect(detectLinghuiCanvasOutliers(nodes, edges)).toEqual([
      expect.objectContaining({
        id: 'lonely',
        name: '离群素材',
      }),
    ]);
  });
});
