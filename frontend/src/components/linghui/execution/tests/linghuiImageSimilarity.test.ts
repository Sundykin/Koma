import { describe, expect, it } from 'vitest';
import { __testOnlyResolveLinghuiImageDuplicateDecision } from '../state/linghuiImageSimilarity';

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
});
