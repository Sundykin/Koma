import { FACE_AVERAGE_HASH_MAX_DISTANCE, FACE_AVERAGE_HASH_STRICT_MAX_DISTANCE, FACE_COLOR_MAX_DISTANCE, FACE_COLOR_STRICT_MAX_DISTANCE, FACE_CONTRAST_MAX_DELTA, FACE_HASH_MAX_DISTANCE, FACE_HASH_STRICT_MAX_DISTANCE, FACE_LUMA_MAX_DELTA, FRAME_AVERAGE_HASH_MAX_DISTANCE, FRAME_HASH_MAX_DISTANCE, FRAME_HASH_STRICT_MAX_DISTANCE, DUPLICATE_SCORE_THRESHOLD, UPPER_FRAME_AVERAGE_HASH_MAX_DISTANCE, UPPER_FRAME_COLOR_MAX_DISTANCE, UPPER_FRAME_CONTRAST_MAX_DELTA, UPPER_FRAME_HASH_MAX_DISTANCE, UPPER_FRAME_HASH_STRICT_MAX_DISTANCE, UPPER_FRAME_LUMA_MAX_DELTA } from './linghuiImageSimilarityTypes';
import type { LinghuiImageCandidateQualityResult, LinghuiImageQualityMetrics, LinghuiImageSignature, LinghuiImageSimilarityMetrics } from './linghuiImageSimilarityTypes';

function computeHammingDistance(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) {
      distance += 1;
    }
  }
  return distance;
}


function computeColorDistance(
  left: [number, number, number],
  right: [number, number, number],
): number {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  );
}


export function buildDuplicateMetrics(
  originalIndex: number,
  duplicateIndex: number,
  original: LinghuiImageSignature,
  candidate: LinghuiImageSignature,
): LinghuiImageSimilarityMetrics {
  return {
    originalIndex,
    duplicateIndex,
    faceHashDistance: computeHammingDistance(original.face.hash, candidate.face.hash),
    faceAverageHashDistance: computeHammingDistance(original.face.averageHash, candidate.face.averageHash),
    frameHashDistance: computeHammingDistance(original.frame.hash, candidate.frame.hash),
    frameAverageHashDistance: computeHammingDistance(original.frame.averageHash, candidate.frame.averageHash),
    upperFrameHashDistance: computeHammingDistance(original.upperFrame.hash, candidate.upperFrame.hash),
    upperFrameAverageHashDistance: computeHammingDistance(
      original.upperFrame.averageHash,
      candidate.upperFrame.averageHash,
    ),
    faceColorDistance: computeColorDistance(original.face.meanColor, candidate.face.meanColor),
    faceLumaDelta: Math.abs(original.face.meanLuma - candidate.face.meanLuma),
    faceContrastDelta: Math.abs(original.face.contrast - candidate.face.contrast),
    upperFrameColorDistance: computeColorDistance(
      original.upperFrame.meanColor,
      candidate.upperFrame.meanColor,
    ),
    upperFrameLumaDelta: Math.abs(original.upperFrame.meanLuma - candidate.upperFrame.meanLuma),
    upperFrameContrastDelta: Math.abs(original.upperFrame.contrast - candidate.upperFrame.contrast),
  };
}


export function buildQualityMetrics(signature: LinghuiImageSignature): LinghuiImageQualityMetrics {
  return {
    frameContrast: signature.frame.contrast,
    frameLumaRange: signature.frame.lumaRange,
    frameEdgeDensity: signature.frame.edgeDensity,
    frameEdgeEnergy: signature.frame.edgeEnergy,
    frameDominantColorRatio: signature.frame.dominantColorRatio,
    frameColorSpread: signature.frame.colorSpread,
    frameNoiseRatio: signature.frame.noiseRatio,
    upperFrameContrast: signature.upperFrame.contrast,
    upperFrameLumaRange: signature.upperFrame.lumaRange,
    upperFrameEdgeDensity: signature.upperFrame.edgeDensity,
    upperFrameEdgeEnergy: signature.upperFrame.edgeEnergy,
    upperFrameDominantColorRatio: signature.upperFrame.dominantColorRatio,
    upperFrameColorSpread: signature.upperFrame.colorSpread,
    faceContrast: signature.face.contrast,
    faceLumaRange: signature.face.lumaRange,
    faceEdgeDensity: signature.face.edgeDensity,
    faceEdgeEnergy: signature.face.edgeEnergy,
  };
}


export function resolveImageQualityDecision(metrics: LinghuiImageQualityMetrics): {
  isValid: boolean;
  classification: LinghuiImageCandidateQualityResult['classification'];
  reason?: string;
} {
  const lowStructure = metrics.frameEdgeDensity <= 0.11
    && metrics.upperFrameEdgeDensity <= 0.12
    && metrics.faceEdgeDensity <= 0.12
    && metrics.frameEdgeEnergy <= 14
    && metrics.upperFrameEdgeEnergy <= 14;

  if (
    (metrics.frameDominantColorRatio >= 0.82 && metrics.frameColorSpread <= 18)
    || (metrics.frameDominantColorRatio >= 0.72 && metrics.frameLumaRange <= 22 && metrics.frameEdgeDensity <= 0.1)
  ) {
    return {
      isValid: false,
      classification: 'invalid',
      reason: 'solid-color-block',
    };
  }

  if (metrics.frameContrast <= 8 && metrics.frameLumaRange <= 20) {
    return {
      isValid: false,
      classification: 'invalid',
      reason: 'low-contrast',
    };
  }

  if (lowStructure) {
    return {
      isValid: false,
      classification: 'abstract',
      reason: 'low-structure',
    };
  }

  if (
    metrics.frameEdgeDensity >= 0.6
    && metrics.frameNoiseRatio >= 0.34
    && metrics.frameColorSpread >= 55
  ) {
    return {
      isValid: false,
      classification: 'noisy',
      reason: 'noisy-texture',
    };
  }

  if (
    metrics.frameContrast >= 92
    && metrics.frameNoiseRatio >= 0.26
    && metrics.upperFrameEdgeDensity <= 0.1
  ) {
    return {
      isValid: false,
      classification: 'abstract',
      reason: 'abstract-high-contrast',
    };
  }

  if (
    metrics.upperFrameEdgeDensity <= 0.08
    && metrics.faceEdgeDensity <= 0.08
    && metrics.frameEdgeDensity <= 0.16
  ) {
    return {
      isValid: false,
      classification: 'no-subject',
      reason: 'no-subject',
    };
  }

  if (
    metrics.frameDominantColorRatio >= 0.6
    && metrics.frameColorSpread <= 26
    && metrics.upperFrameEdgeDensity <= 0.1
  ) {
    return {
      isValid: false,
      classification: 'abstract',
      reason: 'abstract-pattern',
    };
  }

  return {
    isValid: true,
    classification: 'valid',
  };
}


function resolveSignalScore(
  value: number,
  strictMax: number,
  relaxedMax: number,
  strictScore: number,
  relaxedScore: number,
): number {
  if (value <= strictMax) {
    return strictScore;
  }
  if (value <= relaxedMax) {
    return relaxedScore;
  }
  return 0;
}


function resolveDuplicateSignalScore(metrics: LinghuiImageSimilarityMetrics): number {
  return (
    resolveSignalScore(metrics.faceHashDistance, FACE_HASH_STRICT_MAX_DISTANCE, FACE_HASH_MAX_DISTANCE, 4, 3)
    + resolveSignalScore(
      metrics.faceAverageHashDistance,
      FACE_AVERAGE_HASH_STRICT_MAX_DISTANCE,
      FACE_AVERAGE_HASH_MAX_DISTANCE,
      4,
      3,
    )
    + resolveSignalScore(metrics.upperFrameHashDistance, UPPER_FRAME_HASH_STRICT_MAX_DISTANCE, UPPER_FRAME_HASH_MAX_DISTANCE, 3, 2)
    + resolveSignalScore(metrics.upperFrameAverageHashDistance, 6, UPPER_FRAME_AVERAGE_HASH_MAX_DISTANCE, 3, 2)
    + resolveSignalScore(metrics.frameHashDistance, FRAME_HASH_STRICT_MAX_DISTANCE, FRAME_HASH_MAX_DISTANCE, 2, 1)
    + resolveSignalScore(metrics.frameAverageHashDistance, 8, FRAME_AVERAGE_HASH_MAX_DISTANCE, 2, 1)
    + resolveSignalScore(metrics.faceColorDistance, FACE_COLOR_STRICT_MAX_DISTANCE, FACE_COLOR_MAX_DISTANCE, 2, 1)
    + resolveSignalScore(metrics.upperFrameColorDistance, 40, UPPER_FRAME_COLOR_MAX_DISTANCE, 1, 1)
    + resolveSignalScore(metrics.faceLumaDelta, 12, FACE_LUMA_MAX_DELTA, 1, 1)
    + resolveSignalScore(metrics.upperFrameLumaDelta, 14, UPPER_FRAME_LUMA_MAX_DELTA, 1, 1)
    + resolveSignalScore(metrics.faceContrastDelta, 12, FACE_CONTRAST_MAX_DELTA, 1, 1)
    + resolveSignalScore(metrics.upperFrameContrastDelta, 14, UPPER_FRAME_CONTRAST_MAX_DELTA, 1, 1)
  );
}


export function resolveDuplicateDecision(metrics: LinghuiImageSimilarityMetrics): { isDuplicate: boolean; score: number } {
  const faceStructuralMatch = metrics.faceHashDistance <= FACE_HASH_MAX_DISTANCE
    && metrics.faceAverageHashDistance <= FACE_AVERAGE_HASH_MAX_DISTANCE;
  const upperStructuralMatch = metrics.upperFrameHashDistance <= UPPER_FRAME_HASH_MAX_DISTANCE
    || metrics.upperFrameAverageHashDistance <= UPPER_FRAME_AVERAGE_HASH_MAX_DISTANCE;
  const frameStructuralMatch = metrics.frameHashDistance <= FRAME_HASH_MAX_DISTANCE
    || metrics.frameAverageHashDistance <= FRAME_AVERAGE_HASH_MAX_DISTANCE;
  const faceAppearanceMatch = metrics.faceColorDistance <= FACE_COLOR_MAX_DISTANCE
    && metrics.faceLumaDelta <= FACE_LUMA_MAX_DELTA
    && metrics.faceContrastDelta <= FACE_CONTRAST_MAX_DELTA;
  const upperAppearanceMatch = metrics.upperFrameColorDistance <= UPPER_FRAME_COLOR_MAX_DISTANCE
    && metrics.upperFrameLumaDelta <= UPPER_FRAME_LUMA_MAX_DELTA
    && metrics.upperFrameContrastDelta <= UPPER_FRAME_CONTRAST_MAX_DELTA;

  const aggressiveFaceMatch = metrics.faceHashDistance <= FACE_HASH_STRICT_MAX_DISTANCE
    && metrics.faceAverageHashDistance <= FACE_AVERAGE_HASH_STRICT_MAX_DISTANCE
    && upperStructuralMatch;

  const portraitMatch = faceStructuralMatch
    && (upperStructuralMatch || frameStructuralMatch)
    && (faceAppearanceMatch || upperAppearanceMatch);

  const compositionMatch = metrics.frameHashDistance <= FRAME_HASH_MAX_DISTANCE
    && metrics.upperFrameHashDistance <= UPPER_FRAME_HASH_MAX_DISTANCE
    && metrics.faceAverageHashDistance <= FACE_AVERAGE_HASH_MAX_DISTANCE;

  const score = resolveDuplicateSignalScore(metrics);

  return {
    isDuplicate: aggressiveFaceMatch
      || portraitMatch
      || compositionMatch
      || (score >= DUPLICATE_SCORE_THRESHOLD && faceStructuralMatch && (upperStructuralMatch || frameStructuralMatch)),
    score,
  };
}
