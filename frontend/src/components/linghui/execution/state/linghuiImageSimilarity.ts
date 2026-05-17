import type { LinghuiImageMediaItem } from '../../../../types/linghui';
import type { LinghuiImageSimilarityDuplicate, LinghuiImageBatchSimilarityResult, LinghuiImageCandidateQualityResult, LinghuiImageSimilarityMetrics, LinghuiImageSignature, LinghuiImageQualityMetrics } from './linghuiImageSimilarityTypes';
import { createImageSignature, isSignatureFailure } from './linghuiImageSimilaritySignature';
import { buildDuplicateMetrics, buildQualityMetrics, resolveDuplicateDecision, resolveImageQualityDecision } from './linghuiImageSimilarityMetrics';
export type { LinghuiImageSimilarityDuplicate, LinghuiImageBatchSimilarityResult, LinghuiImageCandidateQualityResult, LinghuiImageQualityMetrics } from './linghuiImageSimilarityTypes';

export function __testOnlyResolveLinghuiImageDuplicateDecision(
  metrics: LinghuiImageSimilarityDuplicate & {
    faceAverageHashDistance?: number;
    frameAverageHashDistance?: number;
    upperFrameHashDistance?: number;
    upperFrameAverageHashDistance?: number;
    upperFrameColorDistance?: number;
    upperFrameLumaDelta?: number;
    upperFrameContrastDelta?: number;
  },
): { isDuplicate: boolean; score: number } {
  return resolveDuplicateDecision({
    ...metrics,
    faceAverageHashDistance: metrics.faceAverageHashDistance ?? Number.POSITIVE_INFINITY,
    frameAverageHashDistance: metrics.frameAverageHashDistance ?? Number.POSITIVE_INFINITY,
    upperFrameHashDistance: metrics.upperFrameHashDistance ?? Number.POSITIVE_INFINITY,
    upperFrameAverageHashDistance: metrics.upperFrameAverageHashDistance ?? Number.POSITIVE_INFINITY,
    upperFrameColorDistance: metrics.upperFrameColorDistance ?? Number.POSITIVE_INFINITY,
    upperFrameLumaDelta: metrics.upperFrameLumaDelta ?? Number.POSITIVE_INFINITY,
    upperFrameContrastDelta: metrics.upperFrameContrastDelta ?? Number.POSITIVE_INFINITY,
  });
}

export function __testOnlyResolveLinghuiImageQualityDecision(
  metrics: LinghuiImageQualityMetrics,
): {
  isValid: boolean;
  classification: LinghuiImageCandidateQualityResult['classification'];
  reason?: string;
} {
  return resolveImageQualityDecision(metrics);
}

export async function analyzeLinghuiImageCandidateQuality(
  item: LinghuiImageMediaItem,
): Promise<LinghuiImageCandidateQualityResult> {
  const signatureResult = await createImageSignature(item);
  if (isSignatureFailure(signatureResult)) {
    return {
      status: 'unknown',
      verdict: 'unknown',
      classification: 'unknown',
      reason: signatureResult.reason,
    };
  }

  const metrics = buildQualityMetrics(signatureResult.signature);
  const decision = resolveImageQualityDecision(metrics);
  return {
    status: 'ok',
    verdict: decision.isValid ? 'accept' : 'reject',
    classification: decision.classification,
    reason: decision.reason,
    metrics,
  };
}

function isLikelyDuplicate(metrics: LinghuiImageSimilarityMetrics): boolean {
  return resolveDuplicateDecision(metrics).isDuplicate;
}

export async function analyzeLinghuiImageBatchSimilarity(
  items: LinghuiImageMediaItem[],
): Promise<LinghuiImageBatchSimilarityResult> {
  if (items.length < 2) {
    return {
      status: 'ok',
      duplicates: [],
      comparedCount: items.length,
    };
  }

  const signatures = await Promise.all(items.map(item => createImageSignature(item)));
  const failedSignature = signatures.find(isSignatureFailure);
  if (failedSignature) {
    return {
      status: 'unknown',
      duplicates: [],
      comparedCount: 0,
      reason: failedSignature.reason,
    };
  }

  const resolvedSignatures = signatures.map(item => item.signature) as LinghuiImageSignature[];
  const keptIndices: number[] = [];
  const duplicates: LinghuiImageSimilarityDuplicate[] = [];

  resolvedSignatures.forEach((signature, index) => {
    const duplicateOf = keptIndices.find((keptIndex) => {
      const keptSignature = resolvedSignatures[keptIndex];
      return isLikelyDuplicate(buildDuplicateMetrics(keptIndex, index, keptSignature, signature));
    });

    if (typeof duplicateOf === 'number') {
      duplicates.push(buildDuplicateMetrics(duplicateOf, index, resolvedSignatures[duplicateOf], signature));
      return;
    }

    keptIndices.push(index);
  });

  return {
    status: 'ok',
    duplicates,
    comparedCount: items.length,
  };
}
