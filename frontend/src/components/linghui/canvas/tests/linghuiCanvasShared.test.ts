import { describe, expect, it } from 'vitest';
import type { LinghuiCanvasDocumentSnapshot } from '../state/linghuiCanvasShared';
import {
  buildCanvasDocumentSnapshotFromRF,
  buildRFEdgesFromSnapshot,
  buildRFNodesFromSnapshot,
  detectCanvasMutationKind,
  serializeCanvasDocumentSnapshot,
} from '../state/linghuiCanvasShared';

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

  it('normalizes legacy multi-slot edge handles when persisting and hydrating', () => {
    const snapshot = buildCanvasDocumentSnapshotFromRF([
      {
        id: 'image-1',
        type: 'linghui-image',
        position: { x: 0, y: 0 },
        data: {
          linghuiType: 'linghui/image',
          label: '图片',
          accent: '#22c55e',
          background: '#0f172a',
          properties: {},
          inputs: [],
          outputs: [],
          active: false,
        },
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
        id: 'edge-old-slot',
        source: 'image-1',
        target: 'video-1',
        sourceHandle: 'output-2',
        targetHandle: 'input-3',
      },
    ], {
      x: 0,
      y: 0,
      zoom: 1,
    });

    expect(snapshot.graphData.edges[0]).toEqual(expect.objectContaining({
      sourceHandle: 'output-0',
      targetHandle: 'input-0',
    }));

    const hydratedEdges = buildRFEdgesFromSnapshot({
      viewport: { x: 0, y: 0, zoom: 1 },
      graphData: {
        version: 2,
        nodes: [],
        edges: [
          {
            id: 'edge-restored-old-slot',
            source: 'image-1',
            target: 'video-1',
            sourceHandle: 'output-1',
            targetHandle: 'input-2',
          },
        ],
        groups: [],
      },
    });

    expect(hydratedEdges[0]).toEqual(expect.objectContaining({
      sourceHandle: 'output-0',
      targetHandle: 'input-0',
    }));
  });

  it('persists director3d nodes with the current RF type mapping', () => {
    const snapshot = buildCanvasDocumentSnapshotFromRF([
      {
        id: 'director-1',
        type: 'linghui-director3d',
        position: { x: 80, y: 40 },
        data: {
          linghuiType: 'linghui/director3d',
          label: '3D 导演',
          accent: '#38bdf8',
          background: '#0f172a',
          properties: {},
          inputs: [],
          outputs: [],
          active: false,
        },
      },
    ], [], {
      x: 0,
      y: 0,
      zoom: 1,
    });

    expect(snapshot.graphData.nodes[0]).toEqual(expect.objectContaining({
      id: 'director-1',
      type: 'linghui-director3d',
      data: expect.objectContaining({
        linghuiType: 'linghui/director3d',
      }),
    }));
  });

  it('hydrates sparse restored panorama and director3d nodes with current defaults', () => {
    const nodes = buildRFNodesFromSnapshot({
      viewport: { x: 0, y: 0, zoom: 1 },
      graphData: {
        version: 2,
        nodes: [
          {
            id: 'panorama-1',
            type: 'linghui-image',
            position: { x: 0, y: 0 },
            data: {
              linghuiType: 'linghui/panorama',
              label: '旧全景',
              accent: 'var(--token-status-success)',
              background: 'var(--token-bg-card)',
              properties: {},
              inputs: [],
              outputs: [],
              active: true,
            },
          },
          {
            id: 'director-1',
            type: 'linghui-director3d',
            position: { x: 320, y: 0 },
            data: {
              linghuiType: 'linghui/director3d',
              label: '旧导演台',
              accent: 'var(--token-status-info)',
              background: 'var(--token-bg-card)',
              properties: {},
              inputs: [],
              outputs: [],
              active: true,
            },
          },
        ],
        edges: [],
        groups: [],
      },
    });

    const panoramaData = nodes[0].data as any;
    const directorData = nodes[1].data as any;

    expect(nodes[0].type).toBe('linghui-panorama');
    expect(panoramaData.inputs).toHaveLength(2);
    expect(panoramaData.outputs).toHaveLength(1);
    expect(panoramaData.properties).toEqual(expect.objectContaining({
      aspectRatio: '21:9',
      panoramaTemplate: 'auto',
      projectionMode: 'ar720-band',
    }));
    expect(panoramaData.active).toBe(false);

    expect(nodes[1].type).toBe('linghui-director3d');
    expect(directorData.inputs).toHaveLength(2);
    expect(directorData.outputs).toHaveLength(2);
    expect(directorData.properties.scene).toEqual(expect.objectContaining({
      version: 1,
    }));
    expect(directorData.active).toBe(false);
  });
});
