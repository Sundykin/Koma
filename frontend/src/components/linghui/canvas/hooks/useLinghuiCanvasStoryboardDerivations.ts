import { useLinghuiCanvasStoryboardImageDerivation } from './useLinghuiCanvasStoryboardImageDerivation';
import { useLinghuiCanvasStoryboardTextDerivation } from './useLinghuiCanvasStoryboardTextDerivation';
import { useLinghuiCanvasStoryboardVideoDerivation } from './useLinghuiCanvasStoryboardVideoDerivation';
import type { UseLinghuiCanvasStoryboardDerivationParams } from './linghuiCanvasStoryboardDerivationShared';

export function useLinghuiCanvasStoryboardDerivations(params: UseLinghuiCanvasStoryboardDerivationParams) {
  return {
    deriveStoryboardShotsFromScript: useLinghuiCanvasStoryboardTextDerivation(params),
    deriveStoryboardImagesFromScript: useLinghuiCanvasStoryboardImageDerivation(params),
    deriveStoryboardVideosFromScript: useLinghuiCanvasStoryboardVideoDerivation(params),
  };
}
