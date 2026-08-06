/**
 * 灵绘预设与归一化：比例/分辨率/网格/电影感/多角度/打光配置
 * （从 types/linghui.ts 拆出）
 */
import type {
  LinghuiMultiAngleAzimuth,
  LinghuiMultiAngleDistance,
  LinghuiMultiAngleElevation,
  LinghuiMultiAngleMode,
  LinghuiMultiAnglePresetKey,
  LinghuiMultiAnglePromptProtocol,
  LinghuiRelightDirection,
} from './core';
import {
  DEFAULT_LINGHUI_IMAGE_CINEMATIC_CONFIG,
  type LinghuiGridType,
  type LinghuiImageAperturePreset,
  type LinghuiImageCinematicConfig,
  type LinghuiImageFocalLengthPreset,
  type LinghuiImageFocusRegion,
  type LinghuiImageLightingPreset,
  type LinghuiImageMarkPoint,
  type LinghuiImageRelightConfig,
  type LinghuiMultiAngleConfig,
} from './imageNodes';
export const IMAGE_ASPECT_RATIOS = [
  { label: '1:1', value: '1:1' },
  { label: '3:4', value: '3:4' },
  { label: '4:3', value: '4:3' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '21:9', value: '21:9' },
];

export const IMAGE_RESOLUTIONS = [
  { label: '自适应', value: 'auto' },
  { label: '1K', value: '1K' },
  { label: '2K', value: '2K' },
  { label: '4K', value: '4K' },
];

export const GRID_TYPES: Array<{ label: string; value: LinghuiGridType }> = [
  { label: '单图', value: 'none' },
  { label: '4宫格 (2×2)', value: '2x2' },
  { label: '9宫格 (3×3)', value: '3x3' },
  { label: '16宫格 (4×4)', value: '4x4' },
  { label: '25宫格 (5×5)', value: '5x5' },
];

export const LINGHUI_IMAGE_BATCH_COUNTS = [1, 2, 3, 4] as const;
export const DEFAULT_LINGHUI_MULTI_ANGLE_ENDPOINT = '/v1/images/multi-angle';

export const DEFAULT_LINGHUI_IMAGE_FOCUS_REGION: LinghuiImageFocusRegion = {
  enabled: true,
  x: 0.28,
  y: 0.22,
  width: 0.44,
  height: 0.42,
};

function clampLinghuiFocusUnit(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, numeric));
}

export function normalizeLinghuiImageFocusRegion(
  region?: Partial<LinghuiImageFocusRegion> | null,
): LinghuiImageFocusRegion | null {
  if (!region || typeof region !== 'object') {
    return null;
  }

  const fallback = DEFAULT_LINGHUI_IMAGE_FOCUS_REGION;
  const width = Math.max(0.08, Math.min(1, clampLinghuiFocusUnit(region.width, fallback.width)));
  const height = Math.max(0.08, Math.min(1, clampLinghuiFocusUnit(region.height, fallback.height)));
  const x = Math.max(0, Math.min(1 - width, clampLinghuiFocusUnit(region.x, fallback.x)));
  const y = Math.max(0, Math.min(1 - height, clampLinghuiFocusUnit(region.y, fallback.y)));
  const source = String(region.source ?? '').trim();
  const label = String(region.label ?? '').trim();
  const updatedAt = Number(region.updatedAt);

  return {
    enabled: region.enabled !== false,
    x,
    y,
    width,
    height,
    ...(source ? { source } : {}),
    ...(label ? { label } : {}),
    ...(Number.isFinite(updatedAt) && updatedAt > 0 ? { updatedAt } : {}),
  };
}

export const LINGHUI_IMAGE_MARK_POINT_LIMIT = 6;

function clampLinghuiMarkUnit(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, numeric));
}

export function normalizeLinghuiImageMarkPoint(
  point?: Partial<LinghuiImageMarkPoint> | null,
  index = 0,
): LinghuiImageMarkPoint | null {
  if (!point || typeof point !== 'object') {
    return null;
  }

  const id = String(point.id ?? '').trim() || `mark-${index + 1}`;
  const source = String(point.source ?? '').trim();
  const label = String(point.label ?? '').trim();
  const prompt = String(point.prompt ?? '').trim();
  const updatedAt = Number(point.updatedAt);

  return {
    id,
    enabled: point.enabled !== false,
    x: clampLinghuiMarkUnit(point.x, 0.5),
    y: clampLinghuiMarkUnit(point.y, 0.5),
    ...(source ? { source } : {}),
    ...(label ? { label } : {}),
    ...(prompt ? { prompt } : {}),
    ...(Number.isFinite(updatedAt) && updatedAt > 0 ? { updatedAt } : {}),
  };
}

export const LINGHUI_IMAGE_LIGHTING_PRESETS: Array<{
  value: LinghuiImageLightingPreset;
  label: string;
  prompt: string;
}> = [
  { value: 'auto', label: '自动', prompt: '' },
  { value: 'natural', label: '自然光', prompt: 'soft natural daylight' },
  { value: 'softbox', label: '柔光', prompt: 'studio softbox lighting, even diffused light' },
  { value: 'rembrandt', label: '伦勃朗', prompt: 'rembrandt lighting, dramatic triangular cheek light' },
  { value: 'rim', label: '边缘光', prompt: 'rim light hugging the silhouette, separation from background' },
  { value: 'backlight', label: '逆光', prompt: 'strong backlight, silhouette with luminous edge' },
  { value: 'low-key', label: '低调暗调', prompt: 'low-key lighting, deep shadows, single hard key light' },
  { value: 'high-key', label: '高调亮调', prompt: 'high-key lighting, soft shadows, airy bright tones' },
  { value: 'neon', label: '霓虹', prompt: 'neon-lit cyberpunk lighting, magenta and cyan reflections' },
  { value: 'golden-hour', label: '黄金时刻', prompt: 'golden hour warm directional light, long shadows' },
  { value: 'blue-hour', label: '蓝调', prompt: 'blue hour dusk lighting, cool gradient sky' },
];

export const LINGHUI_IMAGE_FOCAL_LENGTH_PRESETS: Array<{
  value: LinghuiImageFocalLengthPreset;
  label: string;
  prompt: string;
}> = [
  { value: 'auto', label: '自动', prompt: '' },
  { value: 'wide-24mm', label: '广角 24mm', prompt: '24mm wide angle perspective, expansive framing' },
  { value: 'standard-50mm', label: '标头 50mm', prompt: '50mm standard lens, natural perspective' },
  { value: 'portrait-85mm', label: '人像 85mm', prompt: '85mm portrait lens, slight background compression' },
  { value: 'tele-135mm', label: '长焦 135mm', prompt: '135mm telephoto compression, isolated subject' },
  { value: 'macro', label: '微距', prompt: 'macro close-up, ultra fine surface detail' },
];

export const LINGHUI_IMAGE_APERTURE_PRESETS: Array<{
  value: LinghuiImageAperturePreset;
  label: string;
  prompt: string;
}> = [
  { value: 'auto', label: '自动', prompt: '' },
  { value: 'shallow-f14', label: '浅景深 f/1.4', prompt: 'shallow depth of field f/1.4, creamy bokeh background' },
  { value: 'medium-f28', label: '中景深 f/2.8', prompt: 'moderate depth of field f/2.8, gently blurred background' },
  { value: 'deep-f8', label: '深景深 f/8', prompt: 'deep depth of field f/8, foreground to background sharp' },
];

export function normalizeLinghuiImageCinematicConfig(
  config?: Partial<LinghuiImageCinematicConfig> | null,
): LinghuiImageCinematicConfig {
  if (!config || typeof config !== 'object') {
    return { ...DEFAULT_LINGHUI_IMAGE_CINEMATIC_CONFIG };
  }
  const lightingValues = new Set(LINGHUI_IMAGE_LIGHTING_PRESETS.map(item => item.value));
  const focalValues = new Set(LINGHUI_IMAGE_FOCAL_LENGTH_PRESETS.map(item => item.value));
  const apertureValues = new Set(LINGHUI_IMAGE_APERTURE_PRESETS.map(item => item.value));
  return {
    lighting: lightingValues.has(config.lighting as LinghuiImageLightingPreset)
      ? (config.lighting as LinghuiImageLightingPreset)
      : 'auto',
    focalLength: focalValues.has(config.focalLength as LinghuiImageFocalLengthPreset)
      ? (config.focalLength as LinghuiImageFocalLengthPreset)
      : 'auto',
    aperture: apertureValues.has(config.aperture as LinghuiImageAperturePreset)
      ? (config.aperture as LinghuiImageAperturePreset)
      : 'auto',
  };
}

/**
 * 把电影感配置编译成英文短语，便于 provider/模型识别。
 * 全部为 'auto' 时返回空串；调用方决定是否拼到 prompt 末尾。
 */
export function buildLinghuiImageCinematicPromptFragment(
  config?: Partial<LinghuiImageCinematicConfig> | null,
): string {
  const normalized = normalizeLinghuiImageCinematicConfig(config);
  const parts: string[] = [];
  const lightingPreset = LINGHUI_IMAGE_LIGHTING_PRESETS.find(item => item.value === normalized.lighting);
  if (lightingPreset && lightingPreset.value !== 'auto' && lightingPreset.prompt) {
    parts.push(lightingPreset.prompt);
  }
  const focalPreset = LINGHUI_IMAGE_FOCAL_LENGTH_PRESETS.find(item => item.value === normalized.focalLength);
  if (focalPreset && focalPreset.value !== 'auto' && focalPreset.prompt) {
    parts.push(focalPreset.prompt);
  }
  const aperturePreset = LINGHUI_IMAGE_APERTURE_PRESETS.find(item => item.value === normalized.aperture);
  if (aperturePreset && aperturePreset.value !== 'auto' && aperturePreset.prompt) {
    parts.push(aperturePreset.prompt);
  }
  return parts.join(', ');
}

export function normalizeLinghuiImageMarkPoints(
  points?: Array<Partial<LinghuiImageMarkPoint> | null> | null,
): LinghuiImageMarkPoint[] {
  if (!Array.isArray(points)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: LinghuiImageMarkPoint[] = [];
  points.forEach((point, index) => {
    const nextPoint = normalizeLinghuiImageMarkPoint(point, index);
    if (!nextPoint || seen.has(nextPoint.id)) {
      return;
    }
    seen.add(nextPoint.id);
    normalized.push(nextPoint);
  });

  return normalized.slice(0, LINGHUI_IMAGE_MARK_POINT_LIMIT);
}

export const LINGHUI_MULTI_ANGLE_AZIMUTHS: Array<{
  value: LinghuiMultiAngleAzimuth;
  label: string;
  prompt: string;
}> = [
  { value: 0, label: '正面', prompt: 'front view' },
  { value: 45, label: '前右 3/4', prompt: 'front-right quarter view' },
  { value: 90, label: '右侧', prompt: 'right side view' },
  { value: 135, label: '后右 3/4', prompt: 'back-right quarter view' },
  { value: 180, label: '背面', prompt: 'back view' },
  { value: 225, label: '后左 3/4', prompt: 'back-left quarter view' },
  { value: 270, label: '左侧', prompt: 'left side view' },
  { value: 315, label: '前左 3/4', prompt: 'front-left quarter view' },
];

export const LINGHUI_MULTI_ANGLE_ELEVATIONS: Array<{
  value: LinghuiMultiAngleElevation;
  label: string;
  prompt: string;
}> = [
  { value: -30, label: '低角度', prompt: 'low-angle shot' },
  { value: 0, label: '平视', prompt: 'eye-level shot' },
  { value: 30, label: '稍高', prompt: 'elevated shot' },
  { value: 60, label: '高角度', prompt: 'high-angle shot' },
];

export const LINGHUI_MULTI_ANGLE_DISTANCES: Array<{
  value: LinghuiMultiAngleDistance;
  label: string;
  prompt: string;
}> = [
  { value: 0.6, label: '特写', prompt: 'close-up' },
  { value: 1, label: '中景', prompt: 'medium shot' },
  { value: 1.8, label: '广角', prompt: 'wide shot' },
];

export const LINGHUI_MULTI_ANGLE_PROMPT_PROTOCOLS: Array<{
  value: LinghuiMultiAnglePromptProtocol;
  label: string;
}> = [
  { value: 'sks-camera-v1', label: 'SKS 相机提示词' },
  { value: 'descriptor-only-v1', label: '纯描述符' },
];

export const DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG: LinghuiMultiAngleConfig = {
  enabled: false,
  mode: 'object',
  rotation: 0,
  tilt: 0,
  scale: 50,
  isWideAngle: false,
  presetKey: 'custom',
  prompt: '',
  promptEnabled: false,
  azimuth: 0,
  elevation: 0,
  distance: 1,
  ttiSelection: '',
  promptProtocol: 'sks-camera-v1',
  endpointPath: DEFAULT_LINGHUI_MULTI_ANGLE_ENDPOINT,
};

export const DEFAULT_LINGHUI_IMAGE_RELIGHT_CONFIG: LinghuiImageRelightConfig = {
  direction: 'front',
  brightness: 50,
  lightColor: '#ffffff',
  rimLight: false,
  smartMode: false,
  prompt: '',
  referenceImage: null,
  presetId: undefined,
  sceneActive: false,
  brightnessActive: false,
  colorActive: false,
};

function normalizeAzimuth(value: unknown): LinghuiMultiAngleAzimuth {
  return (LINGHUI_MULTI_ANGLE_AZIMUTHS.find(item => item.value === value)?.value ?? DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG.azimuth);
}

function normalizeElevation(value: unknown): LinghuiMultiAngleElevation {
  return (LINGHUI_MULTI_ANGLE_ELEVATIONS.find(item => item.value === value)?.value ?? DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG.elevation);
}

function normalizeDistance(value: unknown): LinghuiMultiAngleDistance {
  return (LINGHUI_MULTI_ANGLE_DISTANCES.find(item => item.value === value)?.value ?? DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG.distance);
}

function normalizePromptProtocol(value: unknown): LinghuiMultiAnglePromptProtocol {
  return (
    LINGHUI_MULTI_ANGLE_PROMPT_PROTOCOLS.find(item => item.value === value)?.value
    ?? DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG.promptProtocol
  );
}

function normalizeMultiAngleMode(value: unknown): LinghuiMultiAngleMode {
  return value === 'camera' || value === 'object'
    ? value
    : DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG.mode;
}

function normalizeMultiAnglePresetKey(value: unknown): LinghuiMultiAnglePresetKey {
  return (
    value === 'fisheye'
    || value === 'tilted'
    || value === 'front-down'
    || value === 'front-up'
    || value === 'panoramic-down'
    || value === 'back'
    || value === 'custom'
  )
    ? value
    : 'custom';
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function rotationToAzimuth(value: number): LinghuiMultiAngleAzimuth {
  const normalized = ((Math.round(value / 45) * 45) % 360 + 360) % 360;
  return normalizeAzimuth(normalized);
}

function tiltToElevation(value: number): LinghuiMultiAngleElevation {
  const snapped = Math.max(-30, Math.min(60, Math.round(value / 30) * 30));
  return normalizeElevation(snapped);
}

function scaleToDistance(value: number): LinghuiMultiAngleDistance {
  if (value <= 25) return 1.8;
  if (value >= 75) return 0.6;
  return 1;
}

function distanceToScale(value: LinghuiMultiAngleDistance): number {
  if (value === 0.6) return 100;
  if (value === 1.8) return 0;
  return 50;
}

export function normalizeLinghuiMultiAngleConfig(
  value: Partial<LinghuiMultiAngleConfig> | null | undefined,
): LinghuiMultiAngleConfig {
  const hasRotation = typeof value?.rotation === 'number';
  const hasTilt = typeof value?.tilt === 'number';
  const hasScale = typeof value?.scale === 'number';
  const azimuth = normalizeAzimuth(value?.azimuth);
  const elevation = normalizeElevation(value?.elevation);
  const distance = normalizeDistance(value?.distance);
  const rotation = clampNumber(
    hasRotation ? value?.rotation : azimuth,
    DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG.rotation,
    -360,
    360,
  );
  const tilt = clampNumber(
    hasTilt ? value?.tilt : elevation,
    DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG.tilt,
    -90,
    90,
  );
  const scale = clampNumber(
    hasScale ? value?.scale : distanceToScale(distance),
    DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG.scale,
    0,
    100,
  );

  return {
    enabled: value?.enabled === true,
    mode: normalizeMultiAngleMode(value?.mode),
    rotation,
    tilt,
    scale,
    isWideAngle: value?.isWideAngle === true,
    presetKey: normalizeMultiAnglePresetKey(value?.presetKey),
    prompt: String(value?.prompt ?? '').trim(),
    promptEnabled: value?.promptEnabled === true,
    azimuth: hasRotation ? rotationToAzimuth(rotation) : azimuth,
    elevation: hasTilt ? tiltToElevation(tilt) : elevation,
    distance: hasScale ? scaleToDistance(scale) : distance,
    ttiSelection: String(value?.ttiSelection ?? '').trim(),
    promptProtocol: normalizePromptProtocol(value?.promptProtocol),
    endpointPath: String(value?.endpointPath ?? DEFAULT_LINGHUI_MULTI_ANGLE_ENDPOINT).trim() || DEFAULT_LINGHUI_MULTI_ANGLE_ENDPOINT,
  };
}

function optionalAngle(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(min, Math.min(max, numeric));
}

export function normalizeLinghuiImageRelightConfig(
  value: Partial<LinghuiImageRelightConfig> | null | undefined,
): LinghuiImageRelightConfig {
  const direction = typeof value?.direction === 'string'
    ? value.direction as LinghuiRelightDirection
    : DEFAULT_LINGHUI_IMAGE_RELIGHT_CONFIG.direction;
  const lightColor = String(value?.lightColor ?? DEFAULT_LINGHUI_IMAGE_RELIGHT_CONFIG.lightColor).trim();
  return {
    direction,
    brightness: clampNumber(value?.brightness, DEFAULT_LINGHUI_IMAGE_RELIGHT_CONFIG.brightness, 0, 100),
    lightColor: /^#[0-9a-f]{6}$/i.test(lightColor) ? lightColor : DEFAULT_LINGHUI_IMAGE_RELIGHT_CONFIG.lightColor,
    rimLight: value?.rimLight === true,
    smartMode: value?.smartMode === true,
    prompt: String(value?.prompt ?? '').trim(),
    referenceImage: value?.referenceImage ? String(value.referenceImage) : null,
    presetId: value?.presetId ? String(value.presetId) : undefined,
    sceneActive: value?.sceneActive === true,
    brightnessActive: value?.brightnessActive === true,
    colorActive: value?.colorActive === true,
    mainAzimuthDeg: optionalAngle(value?.mainAzimuthDeg, -720, 720),
    mainElevationDeg: optionalAngle(value?.mainElevationDeg, -85, 85),
    fillAzimuthDeg: optionalAngle(value?.fillAzimuthDeg, -720, 720),
    fillElevationDeg: optionalAngle(value?.fillElevationDeg, -85, 85),
    previewMode: value?.previewMode === 'front' ? 'front' : value?.previewMode === 'perspective' ? 'perspective' : undefined,
  };
}

export const VIDEO_ASPECT_RATIOS = [
  { label: '自动', value: 'adaptive' },
  { label: '16:9', value: '16:9' },
  { label: '4:3', value: '4:3' },
  { label: '1:1', value: '1:1' },
  { label: '3:4', value: '3:4' },
  { label: '9:16', value: '9:16' },
  { label: '21:9', value: '21:9' },
];

export const VIDEO_RESOLUTIONS = [
  { label: '480P', value: '480p' },
  { label: '720P', value: '720p' },
  { label: '1080P', value: '1080p' },
];
