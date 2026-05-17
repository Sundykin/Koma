export interface GridSplitCellLayout {
  index: number;
  style: Record<`--${string}`, string>;
}

export interface GridSplitPreviewLayout {
  frameStyle: Record<`--${string}`, string>;
  cells: GridSplitCellLayout[];
  verticalLines: Array<Record<`--${string}`, string>>;
  horizontalLines: Array<Record<`--${string}`, string>>;
}

function parseAspectRatioValue(value?: string): number | null {
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

function resolveImageRatio(params: {
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

  return parseAspectRatioValue(params.aspectRatio);
}

function buildGridSplitBounds(total: number, gridSize: number): number[] {
  if (!Number.isFinite(total) || total <= 0 || gridSize <= 1) {
    return [0, Math.max(0, total)];
  }

  const bounds = [0];
  for (let index = 1; index < gridSize; index += 1) {
    const next = Math.round((total * index) / gridSize);
    bounds.push(Math.max(bounds[bounds.length - 1], next));
  }
  bounds.push(total);
  return bounds;
}

export function buildGridSplitPreviewLayout(params: {
  containerWidth: number;
  containerHeight: number;
  imageWidth?: number;
  imageHeight?: number;
  aspectRatio?: string;
  gridSize: number;
}): GridSplitPreviewLayout | null {
  const {
    containerWidth,
    containerHeight,
    imageWidth,
    imageHeight,
    aspectRatio,
    gridSize,
  } = params;

  if (containerWidth <= 0 || containerHeight <= 0 || gridSize <= 0) {
    return null;
  }

  const ratio = resolveImageRatio({ width: imageWidth, height: imageHeight, aspectRatio }) ?? (containerWidth / containerHeight);
  const containerRatio = containerWidth / containerHeight;

  let frameWidth = containerWidth;
  let frameHeight = containerHeight;

  if (ratio > 0) {
    if (ratio >= containerRatio) {
      frameWidth = containerWidth;
      frameHeight = containerWidth / ratio;
    } else {
      frameHeight = containerHeight;
      frameWidth = containerHeight * ratio;
    }
  }

  const frameLeft = (containerWidth - frameWidth) / 2;
  const frameTop = (containerHeight - frameHeight) / 2;

  const sourceWidth = typeof imageWidth === 'number' && imageWidth > 0
    ? Math.round(imageWidth)
    : Math.max(gridSize, Math.round((ratio > 0 ? ratio : 1) * 1000));
  const sourceHeight = typeof imageHeight === 'number' && imageHeight > 0
    ? Math.round(imageHeight)
    : Math.max(gridSize, Math.round(sourceWidth / (ratio > 0 ? ratio : 1)));

  const xBounds = buildGridSplitBounds(sourceWidth, gridSize);
  const yBounds = buildGridSplitBounds(sourceHeight, gridSize);

  const cells: GridSplitCellLayout[] = [];
  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      const left = (xBounds[col] / sourceWidth) * 100;
      const top = (yBounds[row] / sourceHeight) * 100;
      const width = ((xBounds[col + 1] - xBounds[col]) / sourceWidth) * 100;
      const height = ((yBounds[row + 1] - yBounds[row]) / sourceHeight) * 100;
      cells.push({
        index: row * gridSize + col,
        style: {
          '--linghui-grid-cell-left': `${left}%`,
          '--linghui-grid-cell-top': `${top}%`,
          '--linghui-grid-cell-width': `${width}%`,
          '--linghui-grid-cell-height': `${height}%`,
        },
      });
    }
  }

  const verticalLines = xBounds
    .slice(1, -1)
    .map(boundary => ({
      '--linghui-grid-line-left': `${(boundary / sourceWidth) * 100}%`,
    }));
  const horizontalLines = yBounds
    .slice(1, -1)
    .map(boundary => ({
      '--linghui-grid-line-top': `${(boundary / sourceHeight) * 100}%`,
    }));

  return {
    frameStyle: {
      '--linghui-grid-frame-left': `${frameLeft}px`,
      '--linghui-grid-frame-top': `${frameTop}px`,
      '--linghui-grid-frame-width': `${frameWidth}px`,
      '--linghui-grid-frame-height': `${frameHeight}px`,
    },
    cells,
    verticalLines,
    horizontalLines,
  };
}
