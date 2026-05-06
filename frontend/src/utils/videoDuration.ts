/**
 * @deprecated 历史 grok 风格枚举。新代码应使用 VideoDurationSpec（providers/itv/durationSpec.ts）
 * 按当前选择的 ITV 渠道动态计算允许值。这里仅作为兜底默认值，
 * 在没有 ctx / 找不到渠道 spec 时使用。
 */
export const ALLOWED_VIDEO_DURATIONS = [6, 12, 16, 20] as const;
export const ALLOWED_VIDEO_DURATION_SECONDS = ALLOWED_VIDEO_DURATIONS;

export type AllowedVideoDurationSeconds = typeof ALLOWED_VIDEO_DURATIONS[number];

export const DEFAULT_VIDEO_DURATION_SECONDS: AllowedVideoDurationSeconds = 6;

function coerceFiniteNumber(value: unknown): number | undefined {
  let parsed: number | undefined;

  if (typeof value === 'number' && Number.isFinite(value)) {
    parsed = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const directNumber = Number(trimmed);
    if (Number.isFinite(directNumber)) {
      parsed = directNumber;
    } else {
      const numericText = trimmed.match(/[-+]?\d+(?:\.\d+)?/)?.[0];
      if (numericText) {
        const extractedNumber = Number(numericText);
        parsed = Number.isFinite(extractedNumber) ? extractedNumber : undefined;
      }
    }
  }

  return parsed != null && parsed > 0 ? parsed : undefined;
}

function nearestAllowedVideoDuration(value: number): AllowedVideoDurationSeconds {
  return ALLOWED_VIDEO_DURATIONS.reduce<AllowedVideoDurationSeconds>((nearest, current) => {
    const currentDistance = Math.abs(current - value);
    const nearestDistance = Math.abs(nearest - value);
    if (currentDistance < nearestDistance) {
      return current;
    }
    // 固定平局策略：选择较大的档位，例如 8 -> 10，18 -> 20。
    if (currentDistance === nearestDistance && current > nearest) {
      return current;
    }
    return nearest;
  }, ALLOWED_VIDEO_DURATIONS[0]);
}

export function normalizeVideoDurationSeconds(
  value: unknown,
  fallback: unknown = DEFAULT_VIDEO_DURATION_SECONDS,
): AllowedVideoDurationSeconds {
  const numericValue = coerceFiniteNumber(value);
  if (numericValue != null) {
    return nearestAllowedVideoDuration(numericValue);
  }

  const numericFallback = coerceFiniteNumber(fallback);
  return nearestAllowedVideoDuration(numericFallback ?? DEFAULT_VIDEO_DURATION_SECONDS);
}
