import { describe, expect, it } from 'vitest';
import type { LinghuiWorkspaceAssetRecord } from './linghuiStorage';
import {
  buildLinghuiProductionAssetRecordId,
  listStaleLinghuiProductionAssetRecordIds,
  normalizeLinghuiProductionAssetSyncItems,
} from '../../../electron/service/linghui/productionAssets';

function makeRecord(
  id: string,
  sourceNodeId: string,
  productionAssetId?: string,
): LinghuiWorkspaceAssetRecord {
  return {
    id,
    workspaceId: 'workspace-1',
    nodeId: sourceNodeId,
    nodeType: 'linghui/script',
    kind: 'text',
    name: id,
    createdAt: 1,
    snapshotPath: `asset://${id}`,
    metadata: productionAssetId ? {
      recordType: 'production-asset',
      sourceNodeId,
      productionAssetId,
      productionAssetKind: 'character',
      productionAssetName: id,
      sourceShotIds: [],
      confirmed: true,
    } : {},
  };
}

describe('Linghui production asset sync plan', () => {
  it('为工作区、节点和生产资产生成稳定且隔离的记录 ID', () => {
    const first = buildLinghuiProductionAssetRecordId('workspace-1', 'node-1', 'character-1');
    expect(buildLinghuiProductionAssetRecordId('workspace-1', 'node-1', 'character-1')).toBe(first);
    expect(buildLinghuiProductionAssetRecordId('workspace-1', 'node-2', 'character-1')).not.toBe(first);
    expect(buildLinghuiProductionAssetRecordId('workspace-2', 'node-1', 'character-1')).not.toBe(first);
  });

  it('只同步已确认资产并规范化来源镜头', () => {
    const normalized = normalizeLinghuiProductionAssetSyncItems([
      {
        id: 'character-1',
        kind: 'character',
        name: '  林夏  ',
        description: '  青年侦探  ',
        sourceShotIds: ['shot-1', 'shot-1', ' shot-2 '],
        confirmed: true,
      },
      {
        id: 'scene-1',
        kind: 'scene',
        name: '车站',
        description: '',
        sourceShotIds: [],
        confirmed: false,
      },
    ]);

    expect(normalized).toEqual([expect.objectContaining({
      id: 'character-1',
      name: '林夏',
      description: '青年侦探',
      sourceShotIds: ['shot-1', 'shot-2'],
      status: 'approved',
    })]);
  });

  it('同步锁定资产并过滤显式草稿状态', () => {
    const normalized = normalizeLinghuiProductionAssetSyncItems([
      {
        id: 'locked-character',
        kind: 'character',
        name: '林夏',
        description: '',
        sourceShotIds: [],
        confirmed: true,
        status: 'locked',
      },
      {
        id: 'draft-scene',
        kind: 'scene',
        name: '车站',
        description: '',
        sourceShotIds: [],
        confirmed: false,
        status: 'draft',
      },
    ]);

    expect(normalized).toEqual([
      expect.objectContaining({ id: 'locked-character', status: 'locked' }),
    ]);
  });

  it('只删除当前节点不再需要的生产资产记录', () => {
    expect(listStaleLinghuiProductionAssetRecordIds({
      existingRecords: [
        makeRecord('keep', 'node-1', 'character-1'),
        makeRecord('stale', 'node-1', 'character-2'),
        makeRecord('other-node', 'node-2', 'character-3'),
        makeRecord('ordinary', 'node-1'),
      ],
      nodeId: 'node-1',
      desiredRecordIds: new Set(['keep']),
    })).toEqual(['stale']);
  });
});
