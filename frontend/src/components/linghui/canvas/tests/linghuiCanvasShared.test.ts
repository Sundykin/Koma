import { describe, expect, it } from 'vitest';
import type { LinghuiCanvasDocumentSnapshot } from '../state/linghuiCanvasShared';
import { buildCanvasDocumentSnapshotFromRF, detectCanvasMutationKind, serializeCanvasDocumentSnapshot } from '../state/linghuiCanvasShared';

function createSnapshot(): LinghuiCanvasDocumentSnapshot {
  return {
    graphData: {
      version: 2,
      nodes: [
        {
          id: 'node-1',
          type: 'linghui-video',
          position: { x: 10, y: 20 },
          parentId: undefined,
          width: 240,
          height: 160,
          data: {
            linghuiType: 'linghui/video',
            label: '视频节点',
            accent: '#38bdf8',
            background: '#0f172a',
            properties: {
              prompt: '一只小猫奔跑',
            },
            inputs: [],
            outputs: [],
            active: false,
          },
        },
      ],
      edges: [],
      groups: [],
    },
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
  };
}

describe('detectCanvasMutationKind', () => {
  it('treats a missing baseline as content', () => {
    expect(detectCanvasMutationKind(null, createSnapshot())).toBe('content');
  });

  it('classifies viewport-only changes separately', () => {
    const previous = createSnapshot();
    const next = {
      ...createSnapshot(),
      viewport: {
        x: 120,
        y: 80,
        zoom: 1.25,
      },
    };

    expect(detectCanvasMutationKind(previous, next)).toBe('viewport');
  });

  it('classifies node position changes as layout', () => {
    const previous = createSnapshot();
    const next = createSnapshot();
    next.graphData.nodes[0].position = { x: 220, y: 40 };

    expect(detectCanvasMutationKind(previous, next)).toBe('layout');
  });

  it('classifies data changes as content', () => {
    const previous = createSnapshot();
    const next = createSnapshot();
    next.graphData.nodes[0].data.properties = {
      prompt: '一只小狗跳跃',
    };

    expect(detectCanvasMutationKind(previous, next)).toBe('content');
  });

  it('ignores measured node size noise when comparing snapshots', () => {
    const previous = createSnapshot();
    const next = createSnapshot();
    next.graphData.nodes[0].width = 320;
    next.graphData.nodes[0].height = 200;

    expect(detectCanvasMutationKind(previous, next)).toBe('none');
    expect(serializeCanvasDocumentSnapshot(previous)).toBe(serializeCanvasDocumentSnapshot(next));
  });

  it('filters empty React Flow shell nodes out of persisted snapshots', () => {
    const snapshot = buildCanvasDocumentSnapshotFromRF([
      {
        id: 'empty-1',
        type: undefined,
        position: { x: 0, y: 0 },
        data: {},
      },
      {
        id: 'video-1',
        type: 'linghui-video',
        position: { x: 80, y: 40 },
        data: {
          linghuiType: 'linghui/video',
          label: '视频',
          accent: '#38bdf8',
          background: '#0f172a',
          properties: {},
          inputs: [],
          outputs: [],
          active: false,
        },
      },
    ], [
      {
        id: 'edge-empty',
        source: 'empty-1',
        target: 'video-1',
      },
    ], {
      x: 0,
      y: 0,
      zoom: 1,
    });

    expect(snapshot.graphData.nodes.map(node => node.id)).toEqual(['video-1']);
    expect(snapshot.graphData.edges).toEqual([]);
  });
});
