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
});
