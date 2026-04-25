export const ALLOWED_VIDEO_DURATION_SECONDS = [6, 10, 12, 16, 20] as const;

export type AllowedVideoDurationSeconds = (typeof ALLOWED_VIDEO_DURATION_SECONDS)[number];

export const DEFAULT_VIDEO_DURATION_SECONDS: AllowedVideoDurationSeconds = 10;

function parsePositiveDurationSeconds(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const match = trimmed.match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) {
    return undefined;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function normalizeVideoDurationSeconds(
  value: unknown,
  fallback: AllowedVideoDurationSeconds = DEFAULT_VIDEO_DURATION_SECONDS,
): AllowedVideoDurationSeconds {
  const parsed = parsePositiveDurationSeconds(value);
  if (parsed === undefined) {
    return fallback;
  }

  return ALLOWED_VIDEO_DURATION_SECONDS.reduce<AllowedVideoDurationSeconds>((nearest, candidate) => {
    const currentDistance = Math.abs(parsed - nearest);
    const candidateDistance = Math.abs(parsed - candidate);
    if (candidateDistance < currentDistance) {
      return candidate;
    }
    if (candidateDistance === currentDistance && candidate > nearest) {
      return candidate;
    }
    return nearest;
  }, ALLOWED_VIDEO_DURATION_SECONDS[0]);
}
