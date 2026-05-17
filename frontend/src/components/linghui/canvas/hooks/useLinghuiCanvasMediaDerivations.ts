import { useLinghuiCanvasAudioFromVideoDerivation } from './useLinghuiCanvasAudioFromVideoDerivation';
import { useLinghuiCanvasImageResultDerivation } from './useLinghuiCanvasImageResultDerivation';
import { useLinghuiCanvasImageToolDerivation } from './useLinghuiCanvasImageToolDerivation';
import { useLinghuiCanvasMultiAngleImageDerivation } from './useLinghuiCanvasMultiAngleImageDerivation';
import { useLinghuiCanvasPanoramaDerivation } from './useLinghuiCanvasPanoramaDerivation';
import { useLinghuiCanvasVideoResultDerivation } from './useLinghuiCanvasVideoResultDerivation';
import type { UseLinghuiCanvasMediaDerivationParams } from './linghuiCanvasMediaDerivationShared';

export function useLinghuiCanvasMediaDerivations(params: UseLinghuiCanvasMediaDerivationParams) {
  return {
    createDerivedImageNodesFromNode: useLinghuiCanvasImageResultDerivation(params),
    createDerivedPanoramaNodeFromNode: useLinghuiCanvasPanoramaDerivation(params),
    createDerivedVideoNodesFromNode: useLinghuiCanvasVideoResultDerivation(params),
    createDerivedAudioNodeFromVideo: useLinghuiCanvasAudioFromVideoDerivation(params),
    createDerivedMultiAngleImageNodeFromNode: useLinghuiCanvasMultiAngleImageDerivation(params),
    createDerivedImageToolNodeFromNode: useLinghuiCanvasImageToolDerivation(params),
  };
}
