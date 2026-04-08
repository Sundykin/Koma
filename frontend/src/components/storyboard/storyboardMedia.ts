import type { StoredMediaAsset } from '../../types';
import { getMediaAssetDisplaySource } from '../../types';

export function resolveStoryboardMediaUrl(asset?: StoredMediaAsset | null): string | undefined {
  if (!asset) {
    return undefined;
  }
  return getMediaAssetDisplaySource(asset) || asset.remoteUrl || asset.localPath;
}
