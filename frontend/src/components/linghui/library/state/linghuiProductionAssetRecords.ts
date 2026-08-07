import type {
  LinghuiProductionAssetRecordMetadata,
  LinghuiWorkspaceAssetRecord,
} from '../../../../store/linghuiStorage';

export type LinghuiProductionAssetFilter = 'all' | 'character' | 'scene' | 'prop' | 'ordinary';
export type LinghuiMediaAssetFilter = 'all' | 'image' | 'video' | 'audio' | 'text';

export function resolveLinghuiProductionAssetMetadata(
  asset: Pick<LinghuiWorkspaceAssetRecord, 'metadata'>,
): LinghuiProductionAssetRecordMetadata | null {
  const metadata = asset.metadata;
  if (!metadata || metadata.recordType !== 'production-asset') return null;
  const kind = metadata.productionAssetKind;
  if (kind !== 'character' && kind !== 'scene' && kind !== 'prop') return null;
  if (
    typeof metadata.sourceNodeId !== 'string'
    || typeof metadata.productionAssetId !== 'string'
    || typeof metadata.productionAssetName !== 'string'
  ) {
    return null;
  }
  return metadata as LinghuiProductionAssetRecordMetadata;
}

export function filterLinghuiWorkspaceAssets(params: {
  assets: LinghuiWorkspaceAssetRecord[];
  mediaFilter: LinghuiMediaAssetFilter;
  productionFilter: LinghuiProductionAssetFilter;
}): LinghuiWorkspaceAssetRecord[] {
  return params.assets.filter(asset => {
    if (params.mediaFilter !== 'all' && asset.kind !== params.mediaFilter) return false;
    const metadata = resolveLinghuiProductionAssetMetadata(asset);
    if (params.productionFilter === 'all') return true;
    if (params.productionFilter === 'ordinary') return metadata === null;
    return metadata?.productionAssetKind === params.productionFilter;
  });
}

export function getLinghuiProductionAssetKindLabel(
  kind: LinghuiProductionAssetRecordMetadata['productionAssetKind'],
): string {
  if (kind === 'character') return '角色';
  if (kind === 'scene') return '场景';
  return '道具';
}
