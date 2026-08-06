import { describe, expect, it } from 'vitest';
import { stableWaveformHeight } from './Filmstrip';

describe('stableWaveformHeight', () => {
  it('同一片段同一柱序号结果稳定（渲染确定性）', () => {
    expect(stableWaveformHeight('clip-1', 0)).toBe(stableWaveformHeight('clip-1', 0));
    expect(stableWaveformHeight('clip-abc', 7)).toBe(stableWaveformHeight('clip-abc', 7));
  });

  it('输出落在 20%–100% 区间', () => {
    for (let i = 0; i < 200; i += 1) {
      const h = stableWaveformHeight('clip-x', i);
      expect(h).toBeGreaterThanOrEqual(20);
      expect(h).toBeLessThanOrEqual(100);
    }
  });

  it('相邻柱高度有差异（波形有起伏）', () => {
    const heights = Array.from({ length: 20 }, (_, i) => stableWaveformHeight('clip-1', i));
    const distinct = new Set(heights.map(h => h.toFixed(1)));
    expect(distinct.size).toBeGreaterThan(10);
  });

  it('不同片段同一柱序号高度不同', () => {
    expect(stableWaveformHeight('clip-a', 3)).not.toBe(stableWaveformHeight('clip-b', 3));
  });
});
