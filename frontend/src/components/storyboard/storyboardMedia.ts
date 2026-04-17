import type { StoredMediaAsset } from '../../types';
import { getMediaAssetDisplaySource } from '../../types';
import { electronService } from '../../services/electronService';

export function resolveStoryboardMediaSource(source?: string | null): string | undefined {
  if (!source) {
    return undefined;
  }

  if (
    source.startsWith('http://')
    || source.startsWith('https://')
    || source.startsWith('data:')
    || source.startsWith('blob:')
    || source.startsWith('koma-local://')
  ) {
    return source;
  }

  return electronService.isElectron()
    ? electronService.fs.toLocalUrl(source)
    : source;
}

export function resolveStoryboardMediaUrl(asset?: StoredMediaAsset | null): string | undefined {
  if (!asset) {
    return undefined;
  }
  return resolveStoryboardMediaSource(
    getMediaAssetDisplaySource(asset) || asset.remoteUrl || asset.localPath,
  );
}
