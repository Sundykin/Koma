import { describe, expect, it } from 'vitest';
import { resolveLinghuiCanvasTouchMode } from '../hooks/useLinghuiCanvasTouchMode';

describe('resolveLinghuiCanvasTouchMode', () => {
  it('detects coarse pointer devices', () => {
    expect(resolveLinghuiCanvasTouchMode(() => ({
      matches: true,
    } as MediaQueryList))).toBe(true);
  });

  it('falls back to desktop mode when matchMedia is unavailable or throws', () => {
    expect(resolveLinghuiCanvasTouchMode()).toBe(false);
    expect(resolveLinghuiCanvasTouchMode(() => {
      throw new Error('matchMedia failed');
    })).toBe(false);
  });
});
