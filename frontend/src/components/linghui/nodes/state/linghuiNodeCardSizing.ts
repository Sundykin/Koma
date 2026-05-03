type MediaCardOrientation = 'portrait' | 'landscape' | 'square';

interface MediaCardPreset {
  width: number;
  height: number;
}

type MediaCardStyle = Record<`--${string}`, string>;

const MEDIA_CARD_PRESETS: Record<MediaCardOrientation, MediaCardPreset> = {
  portrait: { width: 350, height: 627 },
  landscape: { width: 627, height: 350 },
  square: { width: 350, height: 350 },
};

const DEFAULT_NODE_WIDTH = 350;
const DEFAULT_NODE_MIN_HEIGHT = 350;

function parseAspectRatio(value?: string): number | null {
  if (!value) {
    return null;
  }

  const [widthText, heightText] = value.split(':');
  const width = Number(widthText);
  const height = Number(heightText);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return width / height;
}

function resolveAspectRatioValue(params: {
  width?: number;
  height?: number;
  aspectRatio?: string;
}): number | null {
  if (
    typeof params.width === 'number'
    && typeof params.height === 'number'
    && Number.isFinite(params.width)
    && Number.isFinite(params.height)
    && params.width > 0
    && params.height > 0
  ) {
    return params.width / params.height;
  }

  return parseAspectRatio(params.aspectRatio);
}

function classifyMediaCardOrientation(ratio: number | null): MediaCardOrientation {
  if (ratio === null) {
    return 'square';
  }

  if (ratio >= 1.15) {
    return 'landscape';
  }

  if (ratio <= 0.85) {
    return 'portrait';
  }

  return 'square';
}

export function resolveMediaCardSize(params: {
  width?: number;
  height?: number;
  aspectRatio?: string;
}): {
  orientation: MediaCardOrientation;
  width: number;
  height: number;
  style: MediaCardStyle;
} {
  const orientation = classifyMediaCardOrientation(resolveAspectRatioValue(params));
  const preset = MEDIA_CARD_PRESETS[orientation];

  return {
    orientation,
    width: preset.width,
    height: preset.height,
    style: {
      '--linghui-node-width': `${preset.width}px`,
      '--linghui-thumb-height': `${preset.height}px`,
      '--linghui-node-min-height': `${preset.height}px`,
    },
  };
}

export function resolveDefaultCompactNodeStyle(params?: {
  width?: number;
  thumbHeight?: number;
  minHeight?: number;
}): MediaCardStyle {
  const width = params?.width ?? DEFAULT_NODE_WIDTH;
  const thumbHeight = params?.thumbHeight ?? 208;
  const minHeight = params?.minHeight ?? DEFAULT_NODE_MIN_HEIGHT;

  return {
    '--linghui-node-width': `${width}px`,
    '--linghui-thumb-height': `${thumbHeight}px`,
    '--linghui-node-min-height': `${Math.max(minHeight, thumbHeight)}px`,
  };
}
