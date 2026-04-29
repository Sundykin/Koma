import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import type { LinghuiImageMediaItem } from '../../../../types/linghui';

const HASH_SAMPLE_WIDTH = 9;
const HASH_SAMPLE_HEIGHT = 8;
const FACE_CROP = {
  x: 0.2,
  y: 0.08,
  width: 0.6,
  height: 0.6,
} as const;
const FULL_CROP = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
} as const;

const FACE_HASH_MAX_DISTANCE = 6;
const FACE_HASH_STRICT_MAX_DISTANCE = 4;
const FRAME_HASH_MAX_DISTANCE = 8;
const FRAME_HASH_STRICT_MAX_DISTANCE = 12;
const FACE_COLOR_MAX_DISTANCE = 42;
const FACE_COLOR_STRICT_MAX_DISTANCE = 28;
const FACE_LUMA_MAX_DELTA = 18;
const FACE_CONTRAST_MAX_DELTA = 18;

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

interface ImageSampleSignature {
  hash: string;
  meanLuma: number;
  meanColor: [number, number, number];
  contrast: number;
}

interface LinghuiImageSignature {
  face: ImageSampleSignature;
  frame: ImageSampleSignature;
}

interface SignatureSuccess {
  signature: LinghuiImageSignature;
  reason?: never;
}

interface SignatureFailure {
  signature: null;
  reason: string;
}

type SignatureResult = SignatureSuccess | SignatureFailure;

function isSignatureFailure(result: SignatureResult): result is SignatureFailure {
  return result.signature === null;
}

export interface LinghuiImageSimilarityDuplicate {
  originalIndex: number;
  duplicateIndex: number;
  faceHashDistance: number;
  frameHashDistance: number;
  faceColorDistance: number;
  faceLumaDelta: number;
  faceContrastDelta: number;
}

export interface LinghuiImageBatchSimilarityResult {
  status: 'ok' | 'unknown';
  duplicates: LinghuiImageSimilarityDuplicate[];
  comparedCount: number;
  reason?: string;
}

function createCanvasContext(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext('2d', { willReadFrequently: true } as any);
}

async function loadImageElement(source: string): Promise<HTMLImageElement | null> {
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
  let totalLuma = 0;
  let totalRed = 0;
  let totalGreen = 0;
  let totalBlue = 0;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const luma = (red * 0.299) + (green * 0.587) + (blue * 0.114);
    grayscale.push(luma);
    totalLuma += luma;
    totalRed += red;
    totalGreen += green;
    totalBlue += blue;
  }

  const sampleCount = Math.max(1, grayscale.length);
  const meanLuma = totalLuma / sampleCount;
  const contrast = Math.sqrt(
    grayscale.reduce((sum, value) => sum + ((value - meanLuma) ** 2), 0) / sampleCount,
  );

  let hash = '';
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width - 1; column += 1) {
      const left = grayscale[(row * width) + column] ?? 0;
      const right = grayscale[(row * width) + column + 1] ?? 0;
      hash += left >= right ? '1' : '0';
    }
  }

  return {
    hash,
    meanLuma,
    meanColor: [
      totalRed / sampleCount,
      totalGreen / sampleCount,
      totalBlue / sampleCount,
    ],
    contrast,
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

async function createImageSignature(item: LinghuiImageMediaItem): Promise<SignatureResult> {
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
  const frame = sampleImageRegion(image, FULL_CROP);
  if (!face || !frame) {
    return { signature: null, reason: 'canvas-read-failed' };
  }

  return {
    signature: {
      face,
      frame,
    },
  };
}

function computeHammingDistance(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) {
      distance += 1;
    }
  }
  return distance;
}

function computeColorDistance(
  left: [number, number, number],
  right: [number, number, number],
): number {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  );
}

function buildDuplicateMetrics(
  originalIndex: number,
  duplicateIndex: number,
  original: LinghuiImageSignature,
  candidate: LinghuiImageSignature,
): LinghuiImageSimilarityDuplicate {
  return {
    originalIndex,
    duplicateIndex,
    faceHashDistance: computeHammingDistance(original.face.hash, candidate.face.hash),
    frameHashDistance: computeHammingDistance(original.frame.hash, candidate.frame.hash),
    faceColorDistance: computeColorDistance(original.face.meanColor, candidate.face.meanColor),
    faceLumaDelta: Math.abs(original.face.meanLuma - candidate.face.meanLuma),
    faceContrastDelta: Math.abs(original.face.contrast - candidate.face.contrast),
  };
}

function isLikelyDuplicate(metrics: LinghuiImageSimilarityDuplicate): boolean {
  const conservativeMatch = metrics.faceHashDistance <= FACE_HASH_MAX_DISTANCE
    && metrics.frameHashDistance <= FRAME_HASH_MAX_DISTANCE
    && metrics.faceColorDistance <= FACE_COLOR_MAX_DISTANCE
    && metrics.faceLumaDelta <= FACE_LUMA_MAX_DELTA
    && metrics.faceContrastDelta <= FACE_CONTRAST_MAX_DELTA;

  const strictFaceMatch = metrics.faceHashDistance <= FACE_HASH_STRICT_MAX_DISTANCE
    && metrics.frameHashDistance <= FRAME_HASH_STRICT_MAX_DISTANCE
    && metrics.faceColorDistance <= FACE_COLOR_STRICT_MAX_DISTANCE
    && metrics.faceLumaDelta <= FACE_LUMA_MAX_DELTA
    && metrics.faceContrastDelta <= FACE_CONTRAST_MAX_DELTA;

  return conservativeMatch || strictFaceMatch;
}

export async function analyzeLinghuiImageBatchSimilarity(
  items: LinghuiImageMediaItem[],
): Promise<LinghuiImageBatchSimilarityResult> {
  if (items.length < 2) {
    return {
      status: 'ok',
      duplicates: [],
      comparedCount: items.length,
    };
  }

  const signatures = await Promise.all(items.map(item => createImageSignature(item)));
  const failedSignature = signatures.find(isSignatureFailure);
  if (failedSignature) {
    return {
      status: 'unknown',
      duplicates: [],
      comparedCount: 0,
      reason: failedSignature.reason,
    };
  }

  const resolvedSignatures = signatures.map(item => item.signature) as LinghuiImageSignature[];
  const keptIndices: number[] = [];
  const duplicates: LinghuiImageSimilarityDuplicate[] = [];

  resolvedSignatures.forEach((signature, index) => {
    const duplicateOf = keptIndices.find((keptIndex) => {
      const keptSignature = resolvedSignatures[keptIndex];
      return isLikelyDuplicate(buildDuplicateMetrics(keptIndex, index, keptSignature, signature));
    });

    if (typeof duplicateOf === 'number') {
      duplicates.push(buildDuplicateMetrics(duplicateOf, index, resolvedSignatures[duplicateOf], signature));
      return;
    }

    keptIndices.push(index);
  });

  return {
    status: 'ok',
    duplicates,
    comparedCount: items.length,
  };
}
