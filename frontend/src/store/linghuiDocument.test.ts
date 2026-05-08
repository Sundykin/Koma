import { describe, expect, it } from 'vitest';
import { normalizeLinghuiWorkspaceDocument } from '../../../electron/service/linghui/document';

describe('linghui document normalization', () => {
  it('accepts current workspace documents and fills current defaults', () => {
    const doc = normalizeLinghuiWorkspaceDocument({
      id: 'workspace-1',
      name: '当前工作区',
      graphData: {
        version: 2,
        nodes: [],
        edges: [],
        groups: [],
      },
    });

    expect(doc).toEqual(expect.objectContaining({
      id: 'workspace-1',
      name: '当前工作区',
      description: '',
      graphData: {
        version: 2,
        nodes: [],
        edges: [],
        groups: [],
      },
      nodeCount: 0,
      linkCount: 0,
      groupCount: 0,
    }));
  });

  it('rejects old graph versions instead of migrating them', () => {
    expect(() => normalizeLinghuiWorkspaceDocument({
      id: 'workspace-legacy',
      name: '旧工作区',
      graphData: {
        version: 1,
        nodes: [],
        edges: [],
        groups: [],
      },
    } as any)).toThrow(/graph 版本不受支持/);
  });

  it('rejects legacy Linghui node types instead of remapping them', () => {
    expect(() => normalizeLinghuiWorkspaceDocument({
      id: 'workspace-legacy-node',
      name: '旧节点工作区',
      graphData: {
        version: 2,
        nodes: [{
          id: 'node-1',
          type: 'linghui-image-to-video',
          position: { x: 0, y: 0 },
          data: {
            linghuiType: 'linghui/video',
            label: '旧视频节点',
            accent: '#22c55e',
            background: '#0f1720',
            properties: {},
            inputs: [],
            outputs: [],
            active: false,
          },
        }],
        edges: [],
        groups: [],
      },
    } as any)).toThrow(/不受支持的节点类型/);
  });

  it('drops empty shell nodes and their edges while keeping valid nodes', () => {
    const doc = normalizeLinghuiWorkspaceDocument({
      id: 'workspace-empty-shell',
      name: '含空壳节点',
      graphData: {
        version: 2,
        nodes: [
          {
            id: 'empty-node',
            type: '',
            position: { x: 0, y: 0 },
            data: {},
          },
          {
            id: 'video-node',
            type: 'linghui-video',
            position: { x: 120, y: 40 },
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
        ],
        edges: [
          {
            id: 'edge-empty',
            source: 'empty-node',
            target: 'video-node',
            sourceHandle: 'output-0',
            targetHandle: 'input-0',
          },
        ],
        groups: [],
      },
    } as any);

    expect(doc.graphData.nodes.map(node => node.id)).toEqual(['video-node']);
    expect(doc.graphData.edges).toEqual([]);
    expect(doc.nodeCount).toBe(1);
    expect(doc.linkCount).toBe(0);
  });

  it('accepts director3d nodes as current workspace nodes', () => {
    const doc = normalizeLinghuiWorkspaceDocument({
      id: 'workspace-director3d',
      name: '3D 导演工作区',
      graphData: {
        version: 2,
        nodes: [{
          id: 'director-1',
          type: 'linghui-director3d',
          position: { x: 120, y: 40 },
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
        }],
        edges: [],
        groups: [],
      },
    } as any);

    expect(doc.graphData.nodes[0]).toEqual(expect.objectContaining({
      id: 'director-1',
      type: 'linghui-director3d',
      data: expect.objectContaining({
        linghuiType: 'linghui/director3d',
      }),
    }));
    expect(doc.nodeCount).toBe(1);
  });

  it('repairs known RF type mismatches from half-saved panorama nodes', () => {
    const doc = normalizeLinghuiWorkspaceDocument({
      id: 'workspace-panorama-mismatch',
      name: '旧全景工作区',
      graphData: {
        version: 2,
        nodes: [{
          id: 'panorama-1',
          type: 'linghui-image',
          position: { x: 120, y: 40 },
          data: {
            linghuiType: 'linghui/panorama',
            label: '全景',
            accent: '#22c55e',
            background: '#0f172a',
            properties: {},
            inputs: [],
            outputs: [],
            active: false,
          },
        }],
        edges: [],
        groups: [],
      },
    } as any);

    expect(doc.graphData.nodes[0]).toEqual(expect.objectContaining({
      id: 'panorama-1',
      type: 'linghui-panorama',
      data: expect.objectContaining({
        linghuiType: 'linghui/panorama',
      }),
    }));
  });
});
