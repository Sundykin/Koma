import { describe, expect, it } from 'vitest';
import {
  buildLinghuiLibrarySnapshotKey,
  buildLinghuiTemplateSnapshotKey,
  libraryRowToAssetRecord,
  nodeRowToSnapshot,
  resolveLinghuiLibraryRecordKind,
  type LinghuiGraphNodeRow,
  type LinghuiLibraryRecordRow,
} from '../../../electron/service/linghui/persistenceHelpers';

describe('linghui persistence helpers', () => {
  it('maps stored node rows back to Linghui snapshots with safe type fallback', () => {
    const snapshot = nodeRowToSnapshot({
      id: 'node-1',
      type: 'unknown-node',
      position_x: 120,
      position_y: 48,
      width: 320,
      height: 180,
      parent_group_id: 'group-1',
      label: '未识别节点',
      accent: '#22c55e',
      background: '#0f1720',
      view_mode: 'compact',
      active: 1,
      properties_json: '{"prompt":"楼道压迫感"}',
      inputs_json: '[{"id":"input-1"}]',
      outputs_json: '[{"id":"output-1"}]',
      sort_order: 0,
    } satisfies LinghuiGraphNodeRow);

    expect(snapshot).toEqual(expect.objectContaining({
      id: 'node-1',
      type: 'unknown-node',
      parentId: 'group-1',
      data: expect.objectContaining({
        linghuiType: 'linghui/text',
        label: '未识别节点',
        viewMode: 'compact',
        active: true,
        properties: expect.objectContaining({
          prompt: '楼道压迫感',
        }),
      }),
    }));
  });

  it('preserves panorama and director3d semantics when loading stored node rows', () => {
    const panorama = nodeRowToSnapshot({
      id: 'panorama-1',
      type: 'linghui-panorama',
      position_x: 120,
      position_y: 48,
      label: '全景',
      accent: '#22c55e',
      background: '#0f1720',
      active: 0,
      properties_json: '{"projectionMode":"ar720-band"}',
      inputs_json: '[]',
      outputs_json: '[]',
      sort_order: 0,
    } satisfies LinghuiGraphNodeRow);
    const director = nodeRowToSnapshot({
      id: 'director-1',
      type: 'linghui-director3d',
      position_x: 360,
      position_y: 48,
      label: '3D 导演',
      accent: '#38bdf8',
      background: '#0f1720',
      active: 0,
      properties_json: '{"scene":{"version":1}}',
      inputs_json: '[]',
      outputs_json: '[]',
      sort_order: 1,
    } satisfies LinghuiGraphNodeRow);

    expect(panorama).toEqual(expect.objectContaining({
      type: 'linghui-panorama',
      data: expect.objectContaining({
        linghuiType: 'linghui/panorama',
      }),
    }));
    expect(director).toEqual(expect.objectContaining({
      type: 'linghui-director3d',
      data: expect.objectContaining({
        linghuiType: 'linghui/director3d',
      }),
    }));
  });

  it('recovers panorama and director3d semantics from stored properties after an accidental text downgrade', () => {
    const panorama = nodeRowToSnapshot({
      id: 'panorama-text-1',
      type: 'linghui-text',
      position_x: 120,
      position_y: 48,
      label: '全景',
      accent: '#22c55e',
      background: '#0f1720',
      active: 0,
      properties_json: '{"projectionMode":"ar720-band","panoramaTemplate":"auto"}',
      inputs_json: '[]',
      outputs_json: '[]',
      sort_order: 0,
    } satisfies LinghuiGraphNodeRow);
    const director = nodeRowToSnapshot({
      id: 'director-text-1',
      type: 'linghui-text',
      position_x: 360,
      position_y: 48,
      label: '3D 导演',
      accent: '#38bdf8',
      background: '#0f1720',
      active: 0,
      properties_json: '{"scene":{"version":1,"actors":[]}}',
      inputs_json: '[]',
      outputs_json: '[]',
      sort_order: 1,
    } satisfies LinghuiGraphNodeRow);

    expect(panorama.type).toBe('linghui-panorama');
    expect(panorama.data.linghuiType).toBe('linghui/panorama');
    expect(director.type).toBe('linghui-director3d');
    expect(director.data.linghuiType).toBe('linghui/director3d');
  });

  it('uses sqlite snapshot keys for library records instead of filesystem json paths', () => {
    const assetRecord = libraryRowToAssetRecord({
      id: 'asset-1',
      workspace_id: 'workspace-1',
      node_id: 'node-1',
      node_type: 'linghui/image',
      kind: 'image',
      name: '参考图',
      created_at: 1700000000000,
      source: '/tmp/reference.png',
      metadata_json: '{"prompt":"主图"}',
    } satisfies LinghuiLibraryRecordRow);

    expect(assetRecord.snapshotPath).toBe(buildLinghuiLibrarySnapshotKey('workspace-1', 'assets', 'asset-1'));
    expect(assetRecord.metadata).toEqual({
      prompt: '主图',
    });
    expect(buildLinghuiTemplateSnapshotKey('workspace-1', 'tpl-1')).toBe(
      'sqlite://linghui/workspaces/workspace-1/workflow-templates/tpl-1',
    );
  });

  it('derives library record kinds from node semantics instead of frontend state', () => {
    expect(resolveLinghuiLibraryRecordKind({
      linghuiType: 'linghui/text',
      label: '脚本',
      accent: '#fff',
      background: '#000',
      properties: { content: '主角靠墙喘息' },
      inputs: [],
      outputs: [],
      active: false,
    })).toBe('text');

    expect(resolveLinghuiLibraryRecordKind({
      linghuiType: 'linghui/video',
      label: '视频',
      accent: '#fff',
      background: '#000',
      properties: {},
      inputs: [],
      outputs: [],
      active: false,
    }, {
      status: 'succeeded',
      updatedAt: 1700000001000,
      result: {
        kind: 'video',
        primary: {
          kind: 'video',
          source: '/tmp/video.mp4',
        },
      },
    })).toBe('video');
  });
});
