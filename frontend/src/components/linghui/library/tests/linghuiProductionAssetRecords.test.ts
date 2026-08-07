import { describe, expect, it } from 'vitest';
import type { LinghuiWorkspaceAssetRecord } from '../../../../store/linghuiStorage';
import {
  filterLinghuiWorkspaceAssets,
  resolveLinghuiProductionAssetMetadata,
} from '../state/linghuiProductionAssetRecords';

function makeAsset(
  id: string,
  kind: LinghuiWorkspaceAssetRecord['kind'],
  metadata?: Record<string, unknown>,
): LinghuiWorkspaceAssetRecord {
  return {
    id,
    workspaceId: 'workspace-1',
    nodeId: 'node-1',
    nodeType: 'linghui/script',
    kind,
    name: id,
    createdAt: 1,
    snapshotPath: `asset://${id}`,
    metadata,
  };
}

function productionMetadata(kind: 'character' | 'scene' | 'prop') {
  return {
    recordType: 'production-asset',
    sourceNodeId: 'node-1',
    productionAssetId: `${kind}-1`,
    productionAssetKind: kind,
    productionAssetName: `${kind}-name`,
    sourceShotIds: ['shot-1'],
    confirmed: true,
  };
}

describe('linghuiProductionAssetRecords', () => {
  const assets = [
    makeAsset('ordinary-image', 'image'),
    makeAsset('character-image', 'image', productionMetadata('character')),
    makeAsset('scene-text', 'text', productionMetadata('scene')),
    makeAsset('prop-image', 'image', productionMetadata('prop')),
  ];

  it('组合媒体类型与生产语义筛选', () => {
    expect(filterLinghuiWorkspaceAssets({
      assets,
      mediaFilter: 'image',
      productionFilter: 'character',
    }).map(asset => asset.id)).toEqual(['character-image']);

    expect(filterLinghuiWorkspaceAssets({
      assets,
      mediaFilter: 'all',
      productionFilter: 'scene',
    }).map(asset => asset.id)).toEqual(['scene-text']);
  });

  it('把旧记录和无生产 metadata 的记录视为普通资产', () => {
    expect(filterLinghuiWorkspaceAssets({
      assets,
      mediaFilter: 'all',
      productionFilter: 'ordinary',
    }).map(asset => asset.id)).toEqual(['ordinary-image']);
    expect(resolveLinghuiProductionAssetMetadata(makeAsset('legacy', 'image', {
      productionAssetKind: 'character',
    }))).toBeNull();
  });
});
