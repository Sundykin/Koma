import { describe, expect, it } from 'vitest';
import {
  hasPersistableEdgeChanges,
  hasPersistableNodeChanges,
} from '../hooks/useLinghuiCanvasFlowBridge';

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
});
