export const HASH_SAMPLE_WIDTH = 9;
export const HASH_SAMPLE_HEIGHT = 8;
export const FACE_CROP = {
  x: 0.2,
  y: 0.08,
  width: 0.6,
  height: 0.6,
} as const;
export const UPPER_FRAME_CROP = {
  x: 0.12,
  y: 0,
  width: 0.76,
  height: 0.52,
} as const;
export const FULL_CROP = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
} as const;

export const FACE_HASH_MAX_DISTANCE = 8;
export const FACE_HASH_STRICT_MAX_DISTANCE = 5;
export const FACE_AVERAGE_HASH_MAX_DISTANCE = 10;
export const FACE_AVERAGE_HASH_STRICT_MAX_DISTANCE = 6;
export const FRAME_HASH_MAX_DISTANCE = 10;
export const FRAME_HASH_STRICT_MAX_DISTANCE = 7;
export const FRAME_AVERAGE_HASH_MAX_DISTANCE = 12;
export const UPPER_FRAME_HASH_MAX_DISTANCE = 10;
export const UPPER_FRAME_HASH_STRICT_MAX_DISTANCE = 7;
export const UPPER_FRAME_AVERAGE_HASH_MAX_DISTANCE = 10;
export const FACE_COLOR_MAX_DISTANCE = 52;
export const FACE_COLOR_STRICT_MAX_DISTANCE = 34;
export const UPPER_FRAME_COLOR_MAX_DISTANCE = 56;
export const FACE_LUMA_MAX_DELTA = 22;
export const UPPER_FRAME_LUMA_MAX_DELTA = 24;
export const FACE_CONTRAST_MAX_DELTA = 22;
export const UPPER_FRAME_CONTRAST_MAX_DELTA = 24;
export const DUPLICATE_SCORE_THRESHOLD = 11;
export const QUALITY_EDGE_THRESHOLD = 18;
export const QUALITY_NOISE_EDGE_THRESHOLD = 24;

export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export interface ImageSampleSignature {
  hash: string;
  averageHash: string;
  meanLuma: number;
  meanColor: [number, number, number];
  contrast: number;
  lumaRange: number;
  edgeDensity: number;
  edgeEnergy: number;
  dominantColorRatio: number;
  colorSpread: number;
  noiseRatio: number;
}

export interface LinghuiImageSignature {
  face: ImageSampleSignature;
  upperFrame: ImageSampleSignature;
  frame: ImageSampleSignature;
}

export interface SignatureSuccess {
  signature: LinghuiImageSignature;
  reason?: never;
}

export interface SignatureFailure {
  signature: null;
  reason: string;
}

export type SignatureResult = SignatureSuccess | SignatureFailure;


export interface LinghuiImageSimilarityDuplicate {
  originalIndex: number;
  duplicateIndex: number;
  faceHashDistance: number;
  frameHashDistance: number;
  faceColorDistance: number;
  faceLumaDelta: number;
  faceContrastDelta: number;
}

export interface LinghuiImageSimilarityMetrics extends LinghuiImageSimilarityDuplicate {
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

export interface LinghuiImageQualityMetrics {
  frameContrast: number;
  frameLumaRange: number;
  frameEdgeDensity: number;
  frameEdgeEnergy: number;
  frameDominantColorRatio: number;
  frameColorSpread: number;
  frameNoiseRatio: number;
  upperFrameContrast: number;
  upperFrameLumaRange: number;
  upperFrameEdgeDensity: number;
  upperFrameEdgeEnergy: number;
  upperFrameDominantColorRatio: number;
  upperFrameColorSpread: number;
  faceContrast: number;
  faceLumaRange: number;
  faceEdgeDensity: number;
  faceEdgeEnergy: number;
}

export interface LinghuiImageCandidateQualityResult {
  status: 'ok' | 'unknown';
  verdict: 'accept' | 'reject' | 'unknown';
  classification: 'valid' | 'invalid' | 'abstract' | 'no-subject' | 'noisy' | 'unknown';
  reason?: string;
  metrics?: LinghuiImageQualityMetrics;
}
