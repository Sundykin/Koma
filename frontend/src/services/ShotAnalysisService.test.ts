import { describe, expect, it } from 'vitest';
import { normalizeShotDuration } from './ShotAnalysisService';

describe('normalizeShotDuration', () => {
  it('保留有效的正数 duration', () => {
    expect(normalizeShotDuration(8)).toBe(8);
    expect(normalizeShotDuration(10.5)).toBe(10.5);
  });

  it('支持模型返回的数字字符串，并转为 number', () => {
    expect(normalizeShotDuration('10')).toBe(10);
    expect(normalizeShotDuration(' 9.5 ')).toBe(9.5);
  });

  it('无效或缺失 duration 默认回落到 15 秒', () => {
    expect(normalizeShotDuration(undefined)).toBe(15);
    expect(normalizeShotDuration(null)).toBe(15);
    expect(normalizeShotDuration(0)).toBe(15);
    expect(normalizeShotDuration(-1)).toBe(15);
    expect(normalizeShotDuration(Number.NaN)).toBe(15);
    expect(normalizeShotDuration('abc')).toBe(15);
    expect(normalizeShotDuration('12秒')).toBe(15);
  });
});
