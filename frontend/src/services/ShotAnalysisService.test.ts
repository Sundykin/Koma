import { describe, expect, it } from 'vitest';
import { normalizeShotDuration } from './ShotAnalysisService';

const ALLOWED_DURATIONS = [6, 10, 12, 16, 20];

describe('normalizeShotDuration', () => {
  it('保留已在白名单内的 duration', () => {
    for (const duration of ALLOWED_DURATIONS) {
      expect(normalizeShotDuration(duration)).toBe(duration);
    }
  });

  it('无效或缺失 duration 默认回落到 10 秒', () => {
    expect(normalizeShotDuration(undefined)).toBe(10);
    expect(normalizeShotDuration(null)).toBe(10);
    expect(normalizeShotDuration(0)).toBe(10);
    expect(normalizeShotDuration(-1)).toBe(10);
    expect(normalizeShotDuration(Number.NaN)).toBe(10);
    expect(normalizeShotDuration('abc')).toBe(10);
    expect(normalizeShotDuration('-1秒')).toBe(10);
  });

  it('支持模型返回的数字字符串和带单位字符串，并归一到白名单', () => {
    expect(normalizeShotDuration('10')).toBe(10);
    expect(normalizeShotDuration(' 12 秒 ')).toBe(12);
    expect(normalizeShotDuration('8秒')).toBe(10);
    expect(normalizeShotDuration('10s')).toBe(10);
    expect(normalizeShotDuration('约 18 秒')).toBe(20);
  });

  it('将近似值归一到最近合法时长，等距时取较大值', () => {
    expect(normalizeShotDuration(4)).toBe(6);
    expect(normalizeShotDuration(8)).toBe(10);
    expect(normalizeShotDuration(15)).toBe(16);
    expect(normalizeShotDuration(18)).toBe(20);
  });
});
