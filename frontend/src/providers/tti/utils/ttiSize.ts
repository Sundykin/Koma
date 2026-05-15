const SIZE_PATTERN = /^(\d{2,5})x(\d{2,5})$/i;

// 默认（≈2K 档）。配合下面 `IMAGE_SIZE_TIER_TO_LONG_EDGE` 在 1K/2K/4K 之间缩放。
const ASPECT_RATIO_TO_SIZE: Record<string, string> = {
  '16:9': '1920x1080',
  '9:16': '1080x1920',
  '1:1': '1024x1024',
  '4:3': '1440x1080',
  '3:4': '1080x1440',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
  '21:9': '2240x960',
  '9:21': '960x2240',
};

// "1K"/"2K"/"4K" 标签 → 长边像素近似值。
// 上层（chatComposer / linghui ImageGeneratorNodeEditor）会把这串 label 透传成 options.imageSize。
const IMAGE_SIZE_TIER_TO_LONG_EDGE: Record<string, number> = {
  '1k': 1280,
  '2k': 2048,
  '4k': 3840,
};

function normalizeImageSizeTier(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const key = value.trim().toLowerCase();
  return IMAGE_SIZE_TIER_TO_LONG_EDGE[key];
}

function scaleSizeToLongEdge(
  baseSize: string,
  targetLongEdge: number,
  alignTo = 8,
): string | undefined {
  const match = baseSize.match(SIZE_PATTERN);
  if (!match) return undefined;
  const baseWidth = Number(match[1]);
  const baseHeight = Number(match[2]);
  if (!Number.isFinite(baseWidth) || !Number.isFinite(baseHeight) || baseWidth <= 0 || baseHeight <= 0) {
    return undefined;
  }
  const longest = Math.max(baseWidth, baseHeight);
  if (longest === targetLongEdge) return `${baseWidth}x${baseHeight}`;
  const scale = targetLongEdge / longest;
  const align = (value: number) => Math.max(alignTo, Math.round(value * scale / alignTo) * alignTo);
  return `${align(baseWidth)}x${align(baseHeight)}`;
}

function normalizeSize(value: string | undefined): string | undefined {
  const raw = String(value || '').trim().toLowerCase();
  const match = raw.match(SIZE_PATTERN);
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
  return `${Math.round(width)}x${Math.round(height)}`;
}

function normalizeAspectRatio(value: string | undefined): string | undefined {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return undefined;
  const direct = raw.match(/^(\d{1,3})\s*:\s*(\d{1,3})$/);
  if (direct) {
    const width = Number(direct[1]);
    const height = Number(direct[2]);
    if (width > 0 && height > 0) return `${width}:${height}`;
  }
  const size = normalizeSize(raw);
  if (!size) return undefined;
  const [width, height] = size.split('x').map(Number);
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

export function resolveTTISize(options?: { width?: number; height?: number; aspectRatio?: string; imageSize?: string }, defaultSize?: string): string | undefined {
  if (typeof options?.width === 'number' && typeof options?.height === 'number') {
    const width = Math.round(options.width);
    const height = Math.round(options.height);
    if (width > 0 && height > 0) return `${width}x${height}`;
  }

  const tierLongEdge = normalizeImageSizeTier(options?.imageSize);
  const aspectRatio = normalizeAspectRatio(options?.aspectRatio);
  const baseFromAspect = aspectRatio ? ASPECT_RATIO_TO_SIZE[aspectRatio] : undefined;

  if (baseFromAspect) {
    if (tierLongEdge) {
      const scaled = scaleSizeToLongEdge(baseFromAspect, tierLongEdge);
      if (scaled) return scaled;
    }
    return baseFromAspect;
  }

  // 没指定 aspectRatio 但用户挑了 1K/2K/4K：缩放 defaultSize 或回落到 1:1 基线。
  const fallbackBase = normalizeSize(defaultSize) || ASPECT_RATIO_TO_SIZE['1:1'];
  if (tierLongEdge) {
    const scaled = scaleSizeToLongEdge(fallbackBase, tierLongEdge);
    if (scaled) return scaled;
  }
  return fallbackBase;
}
