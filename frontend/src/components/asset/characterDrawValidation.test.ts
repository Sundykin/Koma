import { describe, expect, it } from 'vitest';
import {
  analyzeCharacterDrawNoiseMetrics,
  buildSelectedFaceCandidateMetadata,
} from './characterDrawValidation';
import type { AssetImageDrawCandidate } from './AssetImageDrawModal';

/** 生成 RGBA 像素数据：valueFn(x, y) 返回亮度 0-255 */
function makePixels(width: number, height: number, valueFn: (x: number, y: number) => number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const v = valueFn(x, y);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe('analyzeCharacterDrawNoiseMetrics', () => {
  it('纯色图：差异与熵都为 0', () => {
    const metrics = analyzeCharacterDrawNoiseMetrics(makePixels(48, 48, () => 128), 48, 48);
    expect(metrics.fineDiff).toBe(0);
    expect(metrics.coarseDiff).toBe(0);
    expect(metrics.entropy).toBe(0);
    expect(metrics.fineToCoarseRatio).toBe(0);
  });

  it('平滑渐变：细粒度差异低、粗粒度有结构 → 比例远小于噪声阈值', () => {
    const metrics = analyzeCharacterDrawNoiseMetrics(makePixels(48, 48, (x) => (x / 48) * 255), 48, 48);
    expect(metrics.fineDiff).toBeLessThan(0.05);
    expect(metrics.coarseDiff).toBeGreaterThan(0.05);
    expect(metrics.fineToCoarseRatio).toBeLessThan(2.4);
  });

  it('逐像素随机噪声：细粒度差异高 + 粗粒度无结构 + 高熵 → 命中花屏阈值', () => {
    // 确定性伪随机（LCG），避免测试抖动
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const metrics = analyzeCharacterDrawNoiseMetrics(makePixels(48, 48, () => rand() * 255), 48, 48);
    expect(metrics.fineDiff).toBeGreaterThanOrEqual(0.32);
    expect(metrics.coarseDiff).toBeLessThanOrEqual(0.12);
    expect(metrics.entropy).toBeGreaterThanOrEqual(4.6);
    expect(metrics.fineToCoarseRatio).toBeGreaterThanOrEqual(2.4);
  });

  it('全透明像素按白底处理', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4); // 全 0（含 alpha）
    const metrics = analyzeCharacterDrawNoiseMetrics(data, 4, 4);
    // alpha=0 → 亮度按 255 → 等同于纯白图
    expect(metrics.fineDiff).toBe(0);
    expect(metrics.entropy).toBe(0);
  });
});

describe('buildSelectedFaceCandidateMetadata', () => {
  const candidate: AssetImageDrawCandidate = {
    id: 'cand-1',
    sessionId: 'sess-1',
    seed: 123,
    variationLabel: 'V1',
    variationPrompt: '更立体',
    identityDirection: '正面',
  } as AssetImageDrawCandidate;

  it('faceReference：referenceSource 标记 + 基础字段', () => {
    const meta = buildSelectedFaceCandidateMetadata(candidate, 'faceReference');
    expect(meta.assetRole).toBe('faceReference');
    expect(meta.referenceSource).toBe('selectedFaceCandidate');
    expect(meta.generatedFrom).toBeUndefined();
    expect(meta.drawSessionId).toBe('sess-1');
    expect(meta.selectedCandidateId).toBe('cand-1');
    expect(meta.faceCandidateSeed).toBe(123);
    expect(meta.variationLabel).toBe('V1');
    expect(meta.identityDirection).toBe('正面');
  });

  it('costumePhoto：generatedFrom/faceReferenceSource 标记', () => {
    const meta = buildSelectedFaceCandidateMetadata(candidate, 'costumePhoto');
    expect(meta.generatedFrom).toBe('selectedFaceCandidate');
    expect(meta.faceReferenceSource).toBe('selectedFaceCandidate');
    expect(meta.referenceSource).toBeUndefined();
  });

  it('缺省字段不产生键', () => {
    const minimal = { id: 'c2', sessionId: 's2' } as AssetImageDrawCandidate;
    const meta = buildSelectedFaceCandidateMetadata(minimal, 'faceReference');
    expect(meta.faceCandidateSeed).toBeUndefined();
    expect(meta.variationLabel).toBeUndefined();
    expect(meta.variationPrompt).toBeUndefined();
    expect(meta.identityDirection).toBeUndefined();
    expect(meta.identitySpec).toBeUndefined();
    expect(meta.candidateMetadata).toBeUndefined();
  });
});
