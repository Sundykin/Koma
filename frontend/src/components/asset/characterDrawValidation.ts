/**
 * 角色抽卡候选校验：人脸候选 metadata 构建 + 花屏/噪声图检测
 * （从 CharacterDetailPanel.tsx 拆出，纯逻辑可独立测试）
 *
 * 噪声检测思路：AI 生成失败的花屏图细粒度亮度差异极大但粗粒度几乎无结构，
 * 同时直方图熵偏高 —— 四个指标联合判定，避免误杀正常噪点/胶片颗粒风格图。
 */
import { createLogger } from '../../store/logger';
import {
  getAssetImageDrawCandidateSource,
  type AssetImageDrawCandidate,
} from './AssetImageDrawModal';

const logger = createLogger('CharacterDrawValidation');

export function buildSelectedFaceCandidateMetadata(
  candidate: AssetImageDrawCandidate,
  assetRole: 'faceReference' | 'costumePhoto',
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    assetRole,
    drawSessionId: candidate.sessionId,
    selectedCandidateId: candidate.id,
    sourceCandidateKind: 'characterIdentityDirection',
  };

  if (assetRole === 'costumePhoto') {
    metadata.generatedFrom = 'selectedFaceCandidate';
    metadata.faceReferenceSource = 'selectedFaceCandidate';
  } else {
    metadata.referenceSource = 'selectedFaceCandidate';
  }

  if (candidate.seed !== undefined) {
    metadata.faceCandidateSeed = candidate.seed;
  }
  if (candidate.variationLabel) {
    metadata.variationLabel = candidate.variationLabel;
  }
  if (candidate.variationPrompt) {
    metadata.variationPrompt = candidate.variationPrompt;
  }
  if (candidate.identityDirection) {
    metadata.identityDirection = candidate.identityDirection;
  }
  if (candidate.identitySpec) {
    metadata.identitySpec = candidate.identitySpec;
  }
  if (candidate.metadata) {
    metadata.candidateMetadata = candidate.metadata;
  }

  return metadata;
}

const CHARACTER_DRAW_VALIDATION_SAMPLE_SIZE = 48;
const CHARACTER_DRAW_VALIDATION_HISTOGRAM_BINS = 32;
const CHARACTER_DRAW_NOISE_FINE_DIFF_THRESHOLD = 0.32;
const CHARACTER_DRAW_NOISE_COARSE_DIFF_MAX = 0.12;
const CHARACTER_DRAW_NOISE_ENTROPY_THRESHOLD = 4.6;
const CHARACTER_DRAW_NOISE_FINE_TO_COARSE_RATIO_THRESHOLD = 2.4;

export interface CharacterDrawNoiseMetrics {
  fineDiff: number;
  coarseDiff: number;
  entropy: number;
  fineToCoarseRatio: number;
}

export function analyzeCharacterDrawNoiseMetrics(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): CharacterDrawNoiseMetrics {
  const luminance = new Float32Array(width * height);
  const histogram = new Array<number>(CHARACTER_DRAW_VALIDATION_HISTOGRAM_BINS).fill(0);

  for (let index = 0, pixelIndex = 0; index < data.length; index += 4, pixelIndex += 1) {
    const alpha = data[index + 3] / 255;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const value = alpha <= 0
      ? 255
      : (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
    luminance[pixelIndex] = value;
    const bucket = Math.min(
      CHARACTER_DRAW_VALIDATION_HISTOGRAM_BINS - 1,
      Math.floor((value / 256) * CHARACTER_DRAW_VALIDATION_HISTOGRAM_BINS),
    );
    histogram[bucket] += 1;
  }

  let fineDiffSum = 0;
  let fineEdges = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width) + x;
      const current = luminance[index];
      if (x + 1 < width) {
        fineDiffSum += Math.abs(current - luminance[index + 1]);
        fineEdges += 1;
      }
      if (y + 1 < height) {
        fineDiffSum += Math.abs(current - luminance[index + width]);
        fineEdges += 1;
      }
    }
  }

  const coarseCols = Math.min(8, width);
  const coarseRows = Math.min(8, height);
  const coarseValues = new Array<number>(coarseCols * coarseRows).fill(0);
  const coarseCounts = new Array<number>(coarseCols * coarseRows).fill(0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const coarseX = Math.min(coarseCols - 1, Math.floor((x / width) * coarseCols));
      const coarseY = Math.min(coarseRows - 1, Math.floor((y / height) * coarseRows));
      const coarseIndex = (coarseY * coarseCols) + coarseX;
      coarseValues[coarseIndex] += luminance[(y * width) + x];
      coarseCounts[coarseIndex] += 1;
    }
  }

  for (let index = 0; index < coarseValues.length; index += 1) {
    coarseValues[index] /= Math.max(1, coarseCounts[index]);
  }

  let coarseDiffSum = 0;
  let coarseEdges = 0;
  for (let y = 0; y < coarseRows; y += 1) {
    for (let x = 0; x < coarseCols; x += 1) {
      const index = (y * coarseCols) + x;
      const current = coarseValues[index];
      if (x + 1 < coarseCols) {
        coarseDiffSum += Math.abs(current - coarseValues[index + 1]);
        coarseEdges += 1;
      }
      if (y + 1 < coarseRows) {
        coarseDiffSum += Math.abs(current - coarseValues[index + coarseCols]);
        coarseEdges += 1;
      }
    }
  }

  const totalSamples = width * height;
  let entropy = 0;
  for (const count of histogram) {
    if (!count) {
      continue;
    }
    const probability = count / totalSamples;
    entropy -= probability * Math.log2(probability);
  }

  const fineDiff = fineDiffSum / Math.max(1, fineEdges * 255);
  const coarseDiff = coarseDiffSum / Math.max(1, coarseEdges * 255);

  return {
    fineDiff,
    coarseDiff,
    entropy,
    fineToCoarseRatio: fineDiff / Math.max(coarseDiff, 0.0001),
  };
}

async function loadCharacterDrawValidationImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;

    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      resolve(image);
    };

    const rejectOnce = () => {
      if (settled) return;
      settled = true;
      reject(new Error('Failed to load candidate image for validation'));
    };

    if (/^https?:\/\//i.test(source)) {
      image.crossOrigin = 'anonymous';
    }

    image.onload = resolveOnce;
    image.onerror = rejectOnce;
    image.src = source;

    if (image.complete && image.naturalWidth > 0) {
      resolveOnce();
    }
  });
}

export async function validateCharacterDrawCandidateImage(
  candidate: AssetImageDrawCandidate,
): Promise<boolean | string> {
  const source = getAssetImageDrawCandidateSource(candidate);
  if (!source) {
    return true;
  }

  if (
    typeof window === 'undefined'
    || typeof document === 'undefined'
    || typeof Image === 'undefined'
  ) {
    return true;
  }

  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return true;
    }

    const image = await loadCharacterDrawValidationImage(source);
    if (!image.naturalWidth || !image.naturalHeight) {
      return true;
    }

    canvas.width = CHARACTER_DRAW_VALIDATION_SAMPLE_SIZE;
    canvas.height = CHARACTER_DRAW_VALIDATION_SAMPLE_SIZE;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const metrics = analyzeCharacterDrawNoiseMetrics(data, canvas.width, canvas.height);
    const isLikelyNoise = (
      metrics.fineDiff >= CHARACTER_DRAW_NOISE_FINE_DIFF_THRESHOLD
      && metrics.coarseDiff <= CHARACTER_DRAW_NOISE_COARSE_DIFF_MAX
      && metrics.entropy >= CHARACTER_DRAW_NOISE_ENTROPY_THRESHOLD
      && metrics.fineToCoarseRatio >= CHARACTER_DRAW_NOISE_FINE_TO_COARSE_RATIO_THRESHOLD
    );

    if (!isLikelyNoise) {
      return true;
    }

    logger.warn('角色抽卡候选疑似花屏/噪声，已跳过并准备补抽', {
      candidateId: candidate.id,
      localPath: candidate.localPath,
      remoteUrl: candidate.remoteUrl,
      metrics,
    });

    return `Detected likely visual noise/static output (${metrics.fineDiff.toFixed(3)}/${metrics.coarseDiff.toFixed(3)}/${metrics.entropy.toFixed(3)})`;
  } catch {
    return true;
  }
}
