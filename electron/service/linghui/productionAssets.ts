import { createHash } from 'crypto';
import type {
  LinghuiProductionAsset,
  LinghuiProductionAssetKind,
  LinghuiProductionAssetStatus,
} from '../../../frontend/src/types/linghui';
import type {
  LinghuiProductionAssetRecordMetadata,
  LinghuiWorkspaceAssetRecord,
} from '../../../frontend/src/store/linghuiStorage';

export interface NormalizedLinghuiProductionAsset {
  id: string;
  kind: LinghuiProductionAssetKind;
  name: string;
  description: string;
  sourceShotIds: string[];
  referenceImage?: string;
  aliases: string[];
  mergedAssetIds: string[];
  status: LinghuiProductionAssetStatus;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)));
}

export function buildLinghuiProductionAssetRecordId(
  workspaceId: string,
  nodeId: string,
  productionAssetId: string,
): string {
  const digest = createHash('sha256')
    .update(`${workspaceId}\u0000${nodeId}\u0000${productionAssetId}`)
    .digest('hex');
  return `linghui-production-${digest.slice(0, 32)}`;
}

export function buildLinghuiProductionReferenceFingerprint(source?: string): string | undefined {
  const normalized = normalizeText(source);
  if (!normalized) return undefined;
  return createHash('sha256').update(normalized).digest('hex');
}

export function normalizeLinghuiProductionAssetSyncItems(
  assets: LinghuiProductionAsset[],
): NormalizedLinghuiProductionAsset[] {
  const normalized = new Map<string, NormalizedLinghuiProductionAsset>();

  for (const asset of assets) {
    const id = normalizeText(asset?.id);
    const status: LinghuiProductionAssetStatus = asset.status === 'locked'
      ? 'locked'
      : asset.status === 'approved' || asset.confirmed
        ? 'approved'
        : 'draft';
    if (status === 'draft' || !id) continue;
    if (asset.kind !== 'character' && asset.kind !== 'scene' && asset.kind !== 'prop') continue;

    const kindLabel = asset.kind === 'character' ? '角色' : asset.kind === 'scene' ? '场景' : '道具';
    const name = normalizeText(asset.name) || `未命名${kindLabel}`;
    normalized.set(id, {
      id,
      kind: asset.kind,
      name,
      description: normalizeText(asset.description),
      sourceShotIds: Array.from(new Set(
        (asset.sourceShotIds ?? []).map(normalizeText).filter(Boolean),
      )),
      referenceImage: normalizeText(asset.referenceImage) || undefined,
      aliases: normalizeStringList(asset.aliases),
      mergedAssetIds: normalizeStringList(asset.mergedAssetIds).filter(assetId => assetId !== id),
      status,
    });
  }

  return [...normalized.values()];
}

export function resolveLinghuiProductionAssetRecordMetadata(
  record: Pick<LinghuiWorkspaceAssetRecord, 'metadata'>,
): LinghuiProductionAssetRecordMetadata | null {
  const metadata = record.metadata;
  if (!metadata || metadata.recordType !== 'production-asset') return null;
  const kind = metadata.productionAssetKind;
  if (kind !== 'character' && kind !== 'scene' && kind !== 'prop') return null;
  if (typeof metadata.sourceNodeId !== 'string' || typeof metadata.productionAssetId !== 'string') return null;
  return metadata as LinghuiProductionAssetRecordMetadata;
}

export function listStaleLinghuiProductionAssetRecordIds(params: {
  existingRecords: LinghuiWorkspaceAssetRecord[];
  nodeId: string;
  desiredRecordIds: Set<string>;
}): string[] {
  return params.existingRecords
    .filter(record => {
      const metadata = resolveLinghuiProductionAssetRecordMetadata(record);
      return metadata?.sourceNodeId === params.nodeId && !params.desiredRecordIds.has(record.id);
    })
    .map(record => record.id);
}
