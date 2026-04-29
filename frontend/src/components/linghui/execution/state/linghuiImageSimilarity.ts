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
const UPPER_FRAME_CROP = {
  x: 0.12,
  y: 0,
  width: 0.76,
  height: 0.52,
} as const;
const FULL_CROP = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
} as const;

const FACE_HASH_MAX_DISTANCE = 8;
const FACE_HASH_STRICT_MAX_DISTANCE = 5;
const FACE_AVERAGE_HASH_MAX_DISTANCE = 10;
const FACE_AVERAGE_HASH_STRICT_MAX_DISTANCE = 6;
const FRAME_HASH_MAX_DISTANCE = 10;
const FRAME_HASH_STRICT_MAX_DISTANCE = 7;
const FRAME_AVERAGE_HASH_MAX_DISTANCE = 12;
const UPPER_FRAME_HASH_MAX_DISTANCE = 10;
const UPPER_FRAME_HASH_STRICT_MAX_DISTANCE = 7;
const UPPER_FRAME_AVERAGE_HASH_MAX_DISTANCE = 10;
const FACE_COLOR_MAX_DISTANCE = 52;
const FACE_COLOR_STRICT_MAX_DISTANCE = 34;
const UPPER_FRAME_COLOR_MAX_DISTANCE = 56;
const FACE_LUMA_MAX_DELTA = 22;
const UPPER_FRAME_LUMA_MAX_DELTA = 24;
const FACE_CONTRAST_MAX_DELTA = 22;
const UPPER_FRAME_CONTRAST_MAX_DELTA = 24;
const DUPLICATE_SCORE_THRESHOLD = 11;

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

interface ImageSampleSignature {
  hash: string;
  averageHash: string;
  meanLuma: number;
  meanColor: [number, number, number];
  contrast: number;
}

interface LinghuiImageSignature {
  face: ImageSampleSignature;
  upperFrame: ImageSampleSignature;
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

interface LinghuiImageSimilarityMetrics extends LinghuiImageSimilarityDuplicate {
  faceAverageHashDistance: number;
  frameAverageHashDistance: number;
  upperFrameHashDistance: number;
  upperFrameAverageHashDistance: number;
  upperFrameColorDistance: number;
  upperFrameLumaDelta: number;
  upperFrameContrastDelta: number;
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

  let averageHash = '';
  grayscale.forEach((value) => {
    averageHash += value >= meanLuma ? '1' : '0';
  });

  return {
    hash,
    averageHash,
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
): LinghuiImageSimilarityMetrics {
  return {
    originalIndex,
    duplicateIndex,
    faceHashDistance: computeHammingDistance(original.face.hash, candidate.face.hash),
    faceAverageHashDistance: computeHammingDistance(original.face.averageHash, candidate.face.averageHash),
    frameHashDistance: computeHammingDistance(original.frame.hash, candidate.frame.hash),
    frameAverageHashDistance: computeHammingDistance(original.frame.averageHash, candidate.frame.averageHash),
    upperFrameHashDistance: computeHammingDistance(original.upperFrame.hash, candidate.upperFrame.hash),
    upperFrameAverageHashDistance: computeHammingDistance(
      original.upperFrame.averageHash,
      candidate.upperFrame.averageHash,
    ),
    faceColorDistance: computeColorDistance(original.face.meanColor, candidate.face.meanColor),
    faceLumaDelta: Math.abs(original.face.meanLuma - candidate.face.meanLuma),
    faceContrastDelta: Math.abs(original.face.contrast - candidate.face.contrast),
    upperFrameColorDistance: computeColorDistance(
      original.upperFrame.meanColor,
      candidate.upperFrame.meanColor,
    ),
    upperFrameLumaDelta: Math.abs(original.upperFrame.meanLuma - candidate.upperFrame.meanLuma),
    upperFrameContrastDelta: Math.abs(original.upperFrame.contrast - candidate.upperFrame.contrast),
  };
}

function resolveSignalScore(
  value: number,
  strictMax: number,
  relaxedMax: number,
  strictScore: number,
  relaxedScore: number,
): number {
  if (value <= strictMax) {
    return strictScore;
  }
  if (value <= relaxedMax) {
    return relaxedScore;
  }
  return 0;
}

function resolveDuplicateSignalScore(metrics: LinghuiImageSimilarityMetrics): number {
  return (
    resolveSignalScore(metrics.faceHashDistance, FACE_HASH_STRICT_MAX_DISTANCE, FACE_HASH_MAX_DISTANCE, 4, 3)
    + resolveSignalScore(
      metrics.faceAverageHashDistance,
      FACE_AVERAGE_HASH_STRICT_MAX_DISTANCE,
      FACE_AVERAGE_HASH_MAX_DISTANCE,
      4,
      3,
    )
    + resolveSignalScore(metrics.upperFrameHashDistance, UPPER_FRAME_HASH_STRICT_MAX_DISTANCE, UPPER_FRAME_HASH_MAX_DISTANCE, 3, 2)
    + resolveSignalScore(metrics.upperFrameAverageHashDistance, 6, UPPER_FRAME_AVERAGE_HASH_MAX_DISTANCE, 3, 2)
    + resolveSignalScore(metrics.frameHashDistance, FRAME_HASH_STRICT_MAX_DISTANCE, FRAME_HASH_MAX_DISTANCE, 2, 1)
    + resolveSignalScore(metrics.frameAverageHashDistance, 8, FRAME_AVERAGE_HASH_MAX_DISTANCE, 2, 1)
    + resolveSignalScore(metrics.faceColorDistance, FACE_COLOR_STRICT_MAX_DISTANCE, FACE_COLOR_MAX_DISTANCE, 2, 1)
    + resolveSignalScore(metrics.upperFrameColorDistance, 40, UPPER_FRAME_COLOR_MAX_DISTANCE, 1, 1)
    + resolveSignalScore(metrics.faceLumaDelta, 12, FACE_LUMA_MAX_DELTA, 1, 1)
    + resolveSignalScore(metrics.upperFrameLumaDelta, 14, UPPER_FRAME_LUMA_MAX_DELTA, 1, 1)
    + resolveSignalScore(metrics.faceContrastDelta, 12, FACE_CONTRAST_MAX_DELTA, 1, 1)
    + resolveSignalScore(metrics.upperFrameContrastDelta, 14, UPPER_FRAME_CONTRAST_MAX_DELTA, 1, 1)
  );
}

function resolveDuplicateDecision(metrics: LinghuiImageSimilarityMetrics): { isDuplicate: boolean; score: number } {
  const faceStructuralMatch = metrics.faceHashDistance <= FACE_HASH_MAX_DISTANCE
    && metrics.faceAverageHashDistance <= FACE_AVERAGE_HASH_MAX_DISTANCE;
  const upperStructuralMatch = metrics.upperFrameHashDistance <= UPPER_FRAME_HASH_MAX_DISTANCE
    || metrics.upperFrameAverageHashDistance <= UPPER_FRAME_AVERAGE_HASH_MAX_DISTANCE;
  const frameStructuralMatch = metrics.frameHashDistance <= FRAME_HASH_MAX_DISTANCE
    || metrics.frameAverageHashDistance <= FRAME_AVERAGE_HASH_MAX_DISTANCE;
  const faceAppearanceMatch = metrics.faceColorDistance <= FACE_COLOR_MAX_DISTANCE
    && metrics.faceLumaDelta <= FACE_LUMA_MAX_DELTA
    && metrics.faceContrastDelta <= FACE_CONTRAST_MAX_DELTA;
  const upperAppearanceMatch = metrics.upperFrameColorDistance <= UPPER_FRAME_COLOR_MAX_DISTANCE
    && metrics.upperFrameLumaDelta <= UPPER_FRAME_LUMA_MAX_DELTA
    && metrics.upperFrameContrastDelta <= UPPER_FRAME_CONTRAST_MAX_DELTA;

  const aggressiveFaceMatch = metrics.faceHashDistance <= FACE_HASH_STRICT_MAX_DISTANCE
    && metrics.faceAverageHashDistance <= FACE_AVERAGE_HASH_STRICT_MAX_DISTANCE
    && upperStructuralMatch;

  const portraitMatch = faceStructuralMatch
    && (upperStructuralMatch || frameStructuralMatch)
    && (faceAppearanceMatch || upperAppearanceMatch);

  const compositionMatch = metrics.frameHashDistance <= FRAME_HASH_MAX_DISTANCE
    && metrics.upperFrameHashDistance <= UPPER_FRAME_HASH_MAX_DISTANCE
    && metrics.faceAverageHashDistance <= FACE_AVERAGE_HASH_MAX_DISTANCE;

  const score = resolveDuplicateSignalScore(metrics);

  return {
    isDuplicate: aggressiveFaceMatch
      || portraitMatch
      || compositionMatch
      || (score >= DUPLICATE_SCORE_THRESHOLD && faceStructuralMatch && (upperStructuralMatch || frameStructuralMatch)),
    score,
  };
}

export function __testOnlyResolveLinghuiImageDuplicateDecision(
  metrics: LinghuiImageSimilarityDuplicate & {
    faceAverageHashDistance?: number;
    frameAverageHashDistance?: number;
    upperFrameHashDistance?: number;
    upperFrameAverageHashDistance?: number;
    upperFrameColorDistance?: number;
    upperFrameLumaDelta?: number;
    upperFrameContrastDelta?: number;
  },
): { isDuplicate: boolean; score: number } {
  return resolveDuplicateDecision({
    ...metrics,
    faceAverageHashDistance: metrics.faceAverageHashDistance ?? Number.POSITIVE_INFINITY,
    frameAverageHashDistance: metrics.frameAverageHashDistance ?? Number.POSITIVE_INFINITY,
    upperFrameHashDistance: metrics.upperFrameHashDistance ?? Number.POSITIVE_INFINITY,
    upperFrameAverageHashDistance: metrics.upperFrameAverageHashDistance ?? Number.POSITIVE_INFINITY,
    upperFrameColorDistance: metrics.upperFrameColorDistance ?? Number.POSITIVE_INFINITY,
    upperFrameLumaDelta: metrics.upperFrameLumaDelta ?? Number.POSITIVE_INFINITY,
    upperFrameContrastDelta: metrics.upperFrameContrastDelta ?? Number.POSITIVE_INFINITY,
  });
}

function isLikelyDuplicate(metrics: LinghuiImageSimilarityMetrics): boolean {
  return resolveDuplicateDecision(metrics).isDuplicate;
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
