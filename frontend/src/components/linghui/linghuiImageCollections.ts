import type {
  LinghuiImageAssetItem,
  LinghuiImageMediaItem,
  LinghuiImageNodeProperties,
  LinghuiMediaItem,
  LinghuiNodeData,
  LinghuiNodeResult,
} from '../../types/linghui';
import {
  getLinghuiResultItems,
  getLinghuiResultPrimaryMedia,
  isLinghuiImageMediaItem,
  isLinghuiImageCollectionResult,
  isLinghuiImageResult,
} from '../../types/linghui';

export const MAX_LINGHUI_IMAGE_ITEMS = 4;

export interface LinghuiResolvedImageCollection {
  items: LinghuiImageMediaItem[];
  primary: LinghuiImageMediaItem | null;
  mode: 'import' | 'result' | 'empty';
}

function buildFallbackAssetId(source: string): string {
  return source ? `asset:${source}` : 'asset:empty';
}

export function resolveImageAspectRatioLabel(width?: number, height?: number): string | undefined {
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }

  const gcd = (a: number, b: number): number => {
    let left = Math.round(a);
    let right = Math.round(b);
    while (right !== 0) {
      const next = left % right;
      left = right;
      right = next;
    }
    return Math.max(1, left);
  };

  const divisor = gcd(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

export function normalizeLinghuiImageAssetItem(item: Partial<LinghuiImageAssetItem>): LinghuiImageAssetItem | null {
  const source = String(item.source ?? '').trim();
  if (!source) {
    return null;
  }

  return {
    id: String(item.id ?? '').trim() || buildFallbackAssetId(source),
    source,
    label: String(item.label ?? '').trim() || undefined,
    width: typeof item.width === 'number' && Number.isFinite(item.width) ? item.width : undefined,
    height: typeof item.height === 'number' && Number.isFinite(item.height) ? item.height : undefined,
    mimeType: String(item.mimeType ?? '').trim() || undefined,
    aspectRatio: String(item.aspectRatio ?? '').trim() || resolveImageAspectRatioLabel(item.width, item.height),
  };
}

export function getLinghuiImageImportItems(properties: LinghuiImageNodeProperties): LinghuiImageAssetItem[] {
  const normalizedItems = (properties.items ?? [])
    .map(item => normalizeLinghuiImageAssetItem(item))
    .filter(Boolean) as LinghuiImageAssetItem[];

  if (normalizedItems.length > 0) {
    return normalizedItems.slice(0, MAX_LINGHUI_IMAGE_ITEMS);
  }

  const legacySource = String(properties.source ?? '').trim();
  if (!legacySource) {
    return [];
  }

  return [{
    id: properties.primaryAssetId || buildFallbackAssetId(legacySource),
    source: legacySource,
    label: undefined,
    aspectRatio: undefined,
  }];
}

export function resolveLinghuiImagePrimaryImportItem(
  properties: LinghuiImageNodeProperties,
): LinghuiImageAssetItem | null {
  const items = getLinghuiImageImportItems(properties);
  if (!items.length) {
    return null;
  }

  const primary = items.find(item => item.id === properties.primaryAssetId);
  return primary ?? items[0];
}

function resolveResultItems(result?: LinghuiNodeResult): LinghuiImageMediaItem[] {
  if (!result) {
    return [];
  }

  const primaryMedia = getLinghuiResultPrimaryMedia(result);
  const primary: LinghuiImageMediaItem[] = isLinghuiImageMediaItem(primaryMedia) ? [primaryMedia] : [];
  const items = getLinghuiResultItems(result).filter(
    (item): item is LinghuiImageMediaItem => item.kind === 'image',
  );

  if (!primary.length) {
    return items;
  }

  const dedupe = new Set<string>();
  const merged: LinghuiImageMediaItem[] = [];
  for (const item of [...primary, ...items]) {
    const key = `${item.source ?? ''}|${item.label ?? ''}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    merged.push(item);
  }
  return merged;
}

export function resolveLinghuiImagePrimaryResultItem(
  properties: LinghuiImageNodeProperties,
  result?: LinghuiNodeResult,
): LinghuiImageMediaItem | null {
  const items = resolveResultItems(result);
  if (!items.length) {
    const primary = getLinghuiResultPrimaryMedia(result);
    return isLinghuiImageMediaItem(primary) ? primary : null;
  }

  const selected = items.find(item => item.source && item.source === properties.primaryResultSource);
  return selected ?? items[0] ?? null;
}

export function resolveLinghuiImageCollection(
  properties: LinghuiImageNodeProperties,
  result?: LinghuiNodeResult,
): LinghuiResolvedImageCollection {
  const importItems = getLinghuiImageImportItems(properties);
  if (importItems.length > 0 && properties.mode === 'import') {
    const items = importItems.map(item => ({
      kind: 'image' as const,
      source: item.source,
      label: item.label,
      width: item.width,
      height: item.height,
      mimeType: item.mimeType,
      metadata: item.aspectRatio ? { aspectRatio: item.aspectRatio } : undefined,
    }));
    const primaryImport = resolveLinghuiImagePrimaryImportItem(properties);
    const primary = primaryImport
      ? items.find(item => item.source === primaryImport.source) ?? items[0] ?? null
      : items[0] ?? null;
    return {
      items,
      primary,
      mode: items.length > 0 ? 'import' : 'empty',
    };
  }

  const resultItems = resolveResultItems(result);
  const primary = resolveLinghuiImagePrimaryResultItem(properties, result);
  if (resultItems.length > 0 || primary) {
    return {
      items: resultItems.length > 0 ? resultItems : (primary ? [primary] : []),
      primary,
      mode: 'result',
    };
  }

  return {
    items: [],
    primary: null,
    mode: 'empty',
  };
}

export function resolveLinghuiImagePrimaryForNode(
  nodeData: LinghuiNodeData,
  result?: LinghuiNodeResult,
): LinghuiMediaItem | null {
  if (nodeData.linghuiType !== 'linghui/image') {
    return getLinghuiResultPrimaryMedia(result) ?? null;
  }

  return resolveLinghuiImageCollection(
    nodeData.properties as unknown as LinghuiImageNodeProperties,
    result,
  ).primary;
}

export function resolveLinghuiImageResultWithSelectedPrimary(
  properties: LinghuiImageNodeProperties,
  result?: LinghuiNodeResult,
): LinghuiNodeResult | undefined {
  if (!result) {
    return result;
  }

  const collection = resolveLinghuiImageCollection(properties, result);
  if (!collection.primary) {
    return result;
  }

  if (isLinghuiImageCollectionResult(result)) {
    return {
      ...result,
      primary: collection.primary,
      items: collection.items.length > 0 ? collection.items : result.items,
    };
  }

  if (isLinghuiImageResult(result)) {
    return {
      ...result,
      primary: collection.primary,
    };
  }

  return result;
}

export function createLinghuiImageImportProperties(
  previous: LinghuiImageNodeProperties,
  items: LinghuiImageAssetItem[],
  nextPrimaryAssetId?: string,
): LinghuiImageNodeProperties {
  const normalizedItems = items
    .map(item => normalizeLinghuiImageAssetItem(item))
    .filter(Boolean) as LinghuiImageAssetItem[];
  const limitedItems = normalizedItems.slice(0, MAX_LINGHUI_IMAGE_ITEMS);
  const primary = limitedItems.find(item => item.id === nextPrimaryAssetId)
    ?? limitedItems.find(item => item.id === previous.primaryAssetId)
    ?? limitedItems[0];

  return {
    ...previous,
    mode: 'import',
    items: limitedItems,
    primaryAssetId: primary?.id ?? '',
    source: primary?.source ?? '',
  };
}

export function isLinghuiImageAspectRatioCompatible(
  base: { width?: number; height?: number; aspectRatio?: string } | null | undefined,
  next: { width?: number; height?: number; aspectRatio?: string } | null | undefined,
): boolean {
  if (!base || !next) {
    return true;
  }

  const baseRatio = base.aspectRatio || resolveImageAspectRatioLabel(base.width, base.height);
  const nextRatio = next.aspectRatio || resolveImageAspectRatioLabel(next.width, next.height);
  if (baseRatio && nextRatio) {
    return baseRatio === nextRatio;
  }

  if (!base.width || !base.height || !next.width || !next.height) {
    return true;
  }

  const baseValue = base.width / base.height;
  const nextValue = next.width / next.height;
  return Math.abs(baseValue - nextValue) < 0.01;
}
