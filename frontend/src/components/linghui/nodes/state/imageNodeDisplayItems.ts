import type { LinghuiImageNodeProperties } from '../../../../types/linghui';
import {
  getLinghuiImageImportItems,
  type LinghuiResolvedImageCollection,
} from '../../editors/state/linghuiImageCollections';
import { getImageNodePreviewSource, resolveImageNodeMode } from './imageNodeViewUtils';

export interface DisplayImageItem {
  key: string;
  source: string;
  preview: string;
  label?: string;
  mimeType?: string;
  assetId?: string;
  isPrimary: boolean;
}

export function resolveImageNodeDisplayItems(params: {
  properties: LinghuiImageNodeProperties;
  collection: LinghuiResolvedImageCollection;
  nodeLabel?: string;
}): DisplayImageItem[] {
  const { properties, collection, nodeLabel } = params;
  const mode = resolveImageNodeMode(properties);
  const importItems = getLinghuiImageImportItems(properties);
  const importSource = mode === 'import' ? String(properties.source ?? '').trim() : '';
  const stackedItems = collection.primary
    ? [collection.primary, ...collection.items.filter(item => item.source !== collection.primary?.source)].slice(0, 4)
    : collection.items.slice(0, 4);
  const fallbackItem = collection.primary?.source || importSource
    ? [{
        source: collection.primary?.source || importSource,
        label: collection.primary?.label || nodeLabel,
      }]
    : [];
  const baseDisplayItems = stackedItems.length > 0 ? stackedItems : fallbackItem;
  const importItemBySource = new Map(importItems.map(item => [item.source, item]));

  return baseDisplayItems.map((item, index) => {
    const source = String(item.source ?? '').trim();
    const importedItem = importItemBySource.get(source);
    const isPrimary = source
      ? source === collection.primary?.source
      : index === 0;
    return {
      key: `${source || 'image'}-${importedItem?.id || index}`,
      source,
      preview: getImageNodePreviewSource(source),
      label: item.label || importedItem?.label || undefined,
      mimeType: item.mimeType || importedItem?.mimeType,
      assetId: importedItem?.id,
      isPrimary,
    };
  });
}
