import { describe, expect, it } from 'vitest';
import {
  __testOnlyResolveLinghuiImageDuplicateDecision,
  __testOnlyResolveLinghuiImageQualityDecision,
} from '../state/linghuiImageSimilarity';

describe('linghuiImageSimilarity', () => {
  it('同脸同构图在颜色略有变化时仍会判定为重复', () => {
    const decision = __testOnlyResolveLinghuiImageDuplicateDecision({
      originalIndex: 0,
      duplicateIndex: 1,
      faceHashDistance: 7,
      frameHashDistance: 10,
      faceColorDistance: 47,
      faceLumaDelta: 15,
      faceContrastDelta: 14,
      faceAverageHashDistance: 8,
      frameAverageHashDistance: 11,
      upperFrameHashDistance: 8,
      upperFrameAverageHashDistance: 9,
      upperFrameColorDistance: 40,
      upperFrameLumaDelta: 14,
      upperFrameContrastDelta: 12,
    });

    expect(decision.isDuplicate).toBe(true);
    expect(decision.score).toBeGreaterThanOrEqual(11);
  });

  it('仅色调接近但结构差异明显时不会误判为重复', () => {
    const decision = __testOnlyResolveLinghuiImageDuplicateDecision({
      originalIndex: 0,
      duplicateIndex: 1,
      faceHashDistance: 8,
      frameHashDistance: 18,
      faceColorDistance: 20,
      faceLumaDelta: 10,
      faceContrastDelta: 9,
      faceAverageHashDistance: 9,
      frameAverageHashDistance: 16,
      upperFrameHashDistance: 15,
      upperFrameAverageHashDistance: 14,
      upperFrameColorDistance: 22,
      upperFrameLumaDelta: 8,
      upperFrameContrastDelta: 7,
    });

    expect(decision.isDuplicate).toBe(false);
  });

  it('脸部结构极近时即使光照差异偏大也会触发重抽', () => {
    const decision = __testOnlyResolveLinghuiImageDuplicateDecision({
      originalIndex: 0,
      duplicateIndex: 1,
      faceHashDistance: 4,
      frameHashDistance: 12,
      faceColorDistance: 60,
      faceLumaDelta: 30,
      faceContrastDelta: 24,
      faceAverageHashDistance: 5,
      frameAverageHashDistance: 13,
      upperFrameHashDistance: 11,
      upperFrameAverageHashDistance: 10,
      upperFrameColorDistance: 68,
      upperFrameLumaDelta: 28,
      upperFrameContrastDelta: 22,
    });

    expect(decision.isDuplicate).toBe(true);
  });

  it('纯色/色块图会被质量门禁拦下', () => {
    const decision = __testOnlyResolveLinghuiImageQualityDecision({
      frameContrast: 4,
      frameLumaRange: 12,
      frameEdgeDensity: 0.03,
      frameEdgeEnergy: 6,
      frameDominantColorRatio: 0.93,
      frameColorSpread: 5,
      frameNoiseRatio: 0.01,
      upperFrameContrast: 3,
      upperFrameLumaRange: 10,
      upperFrameEdgeDensity: 0.02,
      upperFrameEdgeEnergy: 4,
      upperFrameDominantColorRatio: 0.91,
      upperFrameColorSpread: 4,
      faceContrast: 2,
      faceLumaRange: 8,
      faceEdgeDensity: 0.02,
      faceEdgeEnergy: 3,
    });

    expect(decision.isValid).toBe(false);
    expect(decision.classification).toBe('invalid');
    expect(decision.reason).toBe('solid-color-block');
  });

  it('低结构抽象图会被质量门禁拦下', () => {
    const decision = __testOnlyResolveLinghuiImageQualityDecision({
      frameContrast: 18,
      frameLumaRange: 68,
      frameEdgeDensity: 0.07,
      frameEdgeEnergy: 10,
      frameDominantColorRatio: 0.38,
      frameColorSpread: 28,
      frameNoiseRatio: 0.06,
      upperFrameContrast: 16,
      upperFrameLumaRange: 52,
      upperFrameEdgeDensity: 0.06,
      upperFrameEdgeEnergy: 9,
      upperFrameDominantColorRatio: 0.34,
      upperFrameColorSpread: 24,
      faceContrast: 12,
      faceLumaRange: 40,
      faceEdgeDensity: 0.05,
      faceEdgeEnergy: 8,
    });

    expect(decision.isValid).toBe(false);
    expect(decision.classification).toBe('abstract');
    expect(decision.reason).toBe('low-structure');
  });

  it('高频噪声图会被质量门禁拦下', () => {
    const decision = __testOnlyResolveLinghuiImageQualityDecision({
      frameContrast: 88,
      frameLumaRange: 220,
      frameEdgeDensity: 0.72,
      frameEdgeEnergy: 46,
      frameDominantColorRatio: 0.18,
      frameColorSpread: 78,
      frameNoiseRatio: 0.46,
      upperFrameContrast: 64,
      upperFrameLumaRange: 180,
      upperFrameEdgeDensity: 0.52,
      upperFrameEdgeEnergy: 34,
      upperFrameDominantColorRatio: 0.16,
      upperFrameColorSpread: 66,
      faceContrast: 58,
      faceLumaRange: 160,
      faceEdgeDensity: 0.48,
      faceEdgeEnergy: 30,
    });

    expect(decision.isValid).toBe(false);
    expect(decision.classification).toBe('noisy');
    expect(decision.reason).toBe('noisy-texture');
  });

  it('正常有结构的人像指标会通过质量门禁', () => {
    const decision = __testOnlyResolveLinghuiImageQualityDecision({
      frameContrast: 28,
      frameLumaRange: 104,
      frameEdgeDensity: 0.24,
      frameEdgeEnergy: 22,
      frameDominantColorRatio: 0.24,
      frameColorSpread: 54,
      frameNoiseRatio: 0.08,
      upperFrameContrast: 24,
      upperFrameLumaRange: 82,
      upperFrameEdgeDensity: 0.22,
      upperFrameEdgeEnergy: 18,
      upperFrameDominantColorRatio: 0.22,
      upperFrameColorSpread: 44,
      faceContrast: 18,
      faceLumaRange: 64,
      faceEdgeDensity: 0.18,
      faceEdgeEnergy: 15,
    });

    expect(decision.isValid).toBe(true);
    expect(decision.classification).toBe('valid');
  });
});
