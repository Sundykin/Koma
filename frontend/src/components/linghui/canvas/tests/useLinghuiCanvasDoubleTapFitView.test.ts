import { describe, expect, it } from 'vitest';
import { shouldTriggerLinghuiDoubleTapFitView } from '../hooks/useLinghuiCanvasDoubleTapFitView';

describe('shouldTriggerLinghuiDoubleTapFitView', () => {
  it('accepts a fast nearby second tap', () => {
    expect(shouldTriggerLinghuiDoubleTapFitView(
      { time: 1000, x: 120, y: 220 },
      { time: 1260, x: 132, y: 228 },
    )).toBe(true);
  });

  it('rejects stale or distant taps', () => {
    expect(shouldTriggerLinghuiDoubleTapFitView(
      { time: 1000, x: 120, y: 220 },
      { time: 1400, x: 122, y: 223 },
    )).toBe(false);

    expect(shouldTriggerLinghuiDoubleTapFitView(
      { time: 1000, x: 120, y: 220 },
      { time: 1200, x: 220, y: 260 },
    )).toBe(false);
  });
});
