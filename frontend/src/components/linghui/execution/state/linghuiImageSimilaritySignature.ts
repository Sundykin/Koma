import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import type { LinghuiImageMediaItem } from '../../../../types/linghui';
import { FACE_CROP, FULL_CROP, HASH_SAMPLE_HEIGHT, HASH_SAMPLE_WIDTH, QUALITY_EDGE_THRESHOLD, QUALITY_NOISE_EDGE_THRESHOLD, UPPER_FRAME_CROP } from './linghuiImageSimilarityTypes';
import type { CropRect, ImageSampleSignature, SignatureFailure, SignatureResult } from './linghuiImageSimilarityTypes';

export function isSignatureFailure(result: SignatureResult): result is SignatureFailure {
  return result.signature === null;
}

function createCanvasContext(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext('2d', { willReadFrequently: true });
}


function loadImageElement(source: string): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') {
    return null;
  }

  return new Promise(resolve => {
    const image = new Image();
    try {
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
    } catch {
      // ignore
    }
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}


function buildSampleSignature(data: Uint8ClampedArray, width: number, height: number): ImageSampleSignature {
  const grayscale: number[] = [];
  const colors: Array<[number, number, number]> = [];
  const colorBucketCounts = new Map<string, number>();
  let totalLuma = 0;
  let totalRed = 0;
  let totalGreen = 0;
  let totalBlue = 0;
  let minLuma = Number.POSITIVE_INFINITY;
  let maxLuma = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const luma = (red * 0.299) + (green * 0.587) + (blue * 0.114);
    grayscale.push(luma);
    colors.push([red, green, blue]);
    totalLuma += luma;
    totalRed += red;
    totalGreen += green;
    totalBlue += blue;
    minLuma = Math.min(minLuma, luma);
    maxLuma = Math.max(maxLuma, luma);

    const bucketKey = `${Math.floor(red / 64)}-${Math.floor(green / 64)}-${Math.floor(blue / 64)}`;
    colorBucketCounts.set(bucketKey, (colorBucketCounts.get(bucketKey) ?? 0) + 1);
  }

  const sampleCount = Math.max(1, grayscale.length);
  const meanLuma = totalLuma / sampleCount;
  const meanColor: [number, number, number] = [
    totalRed / sampleCount,
    totalGreen / sampleCount,
    totalBlue / sampleCount,
  ];
  const contrast = Math.sqrt(
    grayscale.reduce((sum, value) => sum + ((value - meanLuma) ** 2), 0) / sampleCount,
  );
  const colorSpread = colors.reduce(
    (sum, [red, green, blue]) => sum + Math.hypot(red - meanColor[0], green - meanColor[1], blue - meanColor[2]),
    0,
  ) / sampleCount;

  let hash = '';
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width - 1; column += 1) {
      const left = grayscale[(row * width) + column] ?? 0;
      const right = grayscale[(row * width) + column + 1] ?? 0;
      hash += left >= right ? '1' : '0';
    }
  }

  let averageHash = '';
  grayscale.forEach((value) => {
    averageHash += value >= meanLuma ? '1' : '0';
  });

  const resolveGrayscale = (row: number, column: number) => grayscale[(row * width) + column] ?? 0;
  let edgeCount = 0;
  let edgeEnergyTotal = 0;
  let transitionCount = 0;
  let noiseAlternationCount = 0;
  let alternationCount = 0;

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width - 1; column += 1) {
      const diff = Math.abs(resolveGrayscale(row, column) - resolveGrayscale(row, column + 1));
      edgeEnergyTotal += diff;
      transitionCount += 1;
      if (diff >= QUALITY_EDGE_THRESHOLD) {
        edgeCount += 1;
      }
    }
  }

  for (let row = 0; row < height - 1; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const diff = Math.abs(resolveGrayscale(row, column) - resolveGrayscale(row + 1, column));
      edgeEnergyTotal += diff;
      transitionCount += 1;
      if (diff >= QUALITY_EDGE_THRESHOLD) {
        edgeCount += 1;
      }
    }
  }

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width - 2; column += 1) {
      const leftDiff = resolveGrayscale(row, column + 1) - resolveGrayscale(row, column);
      const rightDiff = resolveGrayscale(row, column + 2) - resolveGrayscale(row, column + 1);
      alternationCount += 1;
      if (
        Math.abs(leftDiff) >= QUALITY_NOISE_EDGE_THRESHOLD
        && Math.abs(rightDiff) >= QUALITY_NOISE_EDGE_THRESHOLD
        && Math.sign(leftDiff) !== Math.sign(rightDiff)
      ) {
        noiseAlternationCount += 1;
      }
    }
  }

  for (let row = 0; row < height - 2; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const topDiff = resolveGrayscale(row + 1, column) - resolveGrayscale(row, column);
      const bottomDiff = resolveGrayscale(row + 2, column) - resolveGrayscale(row + 1, column);
      alternationCount += 1;
      if (
        Math.abs(topDiff) >= QUALITY_NOISE_EDGE_THRESHOLD
        && Math.abs(bottomDiff) >= QUALITY_NOISE_EDGE_THRESHOLD
        && Math.sign(topDiff) !== Math.sign(bottomDiff)
      ) {
        noiseAlternationCount += 1;
      }
    }
  }

  const dominantColorRatio = Array.from(colorBucketCounts.values()).reduce(
    (maxCount, count) => Math.max(maxCount, count),
    0,
  ) / sampleCount;

  return {
    hash,
    averageHash,
    meanLuma,
    meanColor,
    contrast,
    lumaRange: Math.max(0, maxLuma - minLuma),
    edgeDensity: edgeCount / Math.max(1, transitionCount),
    edgeEnergy: edgeEnergyTotal / Math.max(1, transitionCount),
    dominantColorRatio,
    colorSpread,
    noiseRatio: noiseAlternationCount / Math.max(1, alternationCount),
  };
}


function sampleImageRegion(image: HTMLImageElement, crop: CropRect): ImageSampleSignature | null {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) {
    return null;
  }

  const context = createCanvasContext(HASH_SAMPLE_WIDTH, HASH_SAMPLE_HEIGHT);
  if (!context) {
    return null;
  }

  const sourceX = Math.max(0, Math.round(width * crop.x));
  const sourceY = Math.max(0, Math.round(height * crop.y));
  const sourceWidth = Math.max(1, Math.round(width * crop.width));
  const sourceHeight = Math.max(1, Math.round(height * crop.height));

  try {
    context.clearRect(0, 0, HASH_SAMPLE_WIDTH, HASH_SAMPLE_HEIGHT);
    context.drawImage(
      image,
      sourceX,
      sourceY,
      Math.min(sourceWidth, width - sourceX),
      Math.min(sourceHeight, height - sourceY),
      0,
      0,
      HASH_SAMPLE_WIDTH,
      HASH_SAMPLE_HEIGHT,
    );
    const imageData = context.getImageData(0, 0, HASH_SAMPLE_WIDTH, HASH_SAMPLE_HEIGHT);
    return buildSampleSignature(imageData.data, HASH_SAMPLE_WIDTH, HASH_SAMPLE_HEIGHT);
  } catch {
    return null;
  }
}


export async function createImageSignature(item: LinghuiImageMediaItem): Promise<SignatureResult> {
  const previewSource = toFileSystemDisplayUrl(item.source) || item.source || '';
  if (!previewSource) {
    return { signature: null, reason: 'missing-source' };
  }

  if (typeof Image === 'undefined') {
    return { signature: null, reason: 'image-api-unavailable' };
  }

  const image = await loadImageElement(previewSource);
  if (!image) {
    return { signature: null, reason: 'image-load-failed' };
  }

  const face = sampleImageRegion(image, FACE_CROP);
  const upperFrame = sampleImageRegion(image, UPPER_FRAME_CROP);
  const frame = sampleImageRegion(image, FULL_CROP);
  if (!face || !upperFrame || !frame) {
    return { signature: null, reason: 'canvas-read-failed' };
  }

  return {
    signature: {
      face,
      upperFrame,
      frame,
    },
  };
}
