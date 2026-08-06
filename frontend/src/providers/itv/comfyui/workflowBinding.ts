/**
 * ComfyUI 工作流参数绑定：把 Koma 的媒体请求（提示词 / 参考图 / 时长 / 比例 / 种子）
 * 写进 API 格式工作流的具体节点。
 *
 * 绑定优先按**连线拓扑**解析（从 ref_images.* 宿主节点出发反查上游），拓扑缺失时
 * 回退到按 class_type 扫描；两者都可被渠道模型的 defaults.nodeBindings 显式覆盖，
 * 这样换一份自定义工作流也不必改代码。
 */
import type { ComfyWorkflow, ComfyWorkflowNode } from './types';
import { isComfyLink } from './types';

/** ref_images 是 COMFY_AUTOGROW_V3，输入键形如 ref_images.ref_image_0 */
const REF_IMAGE_INPUT_RE = /^ref_images\.ref_image_(\d+)$/;
const REF_IMAGE_INPUT_PREFIX = 'ref_images.ref_image_';

/** ref_videos / ref_audios 同为 COMFY_AUTOGROW_V3（MiniMax H3：视频/音频各上限 3） */
const REF_VIDEO_INPUT_PREFIX = 'ref_videos.ref_video_';
const REF_AUDIO_INPUT_PREFIX = 'ref_audios.ref_audio_';

/** 提示词节点：类名 → 承载文本的字段名 */
const PROMPT_CLASS_FIELDS: Record<string, string> = {
  PrimitiveStringMultiline: 'value',
  PrimitiveString: 'value',
  CLIPTextEncode: 'text',
  String: 'value',
};

/** 随机种子节点：类名 → 字段名 */
const SEED_CLASS_FIELDS: Record<string, string> = {
  RandomNoise: 'noise_seed',
  KSampler: 'seed',
  KSamplerAdvanced: 'noise_seed',
  PrimitiveInt: 'value',
};

/** 采样步数节点：类名 → 字段名 */
const STEPS_CLASS_FIELDS: Record<string, string> = {
  BasicScheduler: 'steps',
  KSampler: 'steps',
  KSamplerAdvanced: 'steps',
};

/** 帧率节点：类名 → 字段名（核心 CreateVideo 用 fps，VideoHelperSuite 用 frame_rate） */
const FPS_CLASS_FIELDS: Record<string, string> = {
  CreateVideo: 'fps',
  VHS_VideoCombine: 'frame_rate',
};

/**
 * ResolutionSelector.aspect_ratio 的 COMBO 取值（取自 ComfyUI /object_info）。
 * 送错枚举值 ComfyUI 会直接 400，所以这里做严格映射，未命中就不改该字段。
 */
const ASPECT_RATIO_OPTIONS: Record<string, string> = {
  '1:1': '1:1 (Square)',
  '2:3': '2:3 (Portrait Photo)',
  '3:2': '3:2 (Photo)',
  '3:4': '3:4 (Portrait Standard)',
  '4:3': '4:3 (Standard)',
  '9:16': '9:16 (Portrait Widescreen)',
  '16:9': '16:9 (Widescreen)',
  '21:9': '21:9 (Ultrawide)',
  square: '1:1 (Square)',
  portrait: '9:16 (Portrait Widescreen)',
  landscape: '16:9 (Widescreen)',
};

/** 清晰度档位 → ResolutionSelector.megapixels（总像素，节点自行按比例算宽高） */
const RESOLUTION_MEGAPIXELS: Record<string, number> = {
  '480p': 0.4,
  '540p': 0.5,
  '720p': 0.9,
  '1080p': 2.0,
  '2k': 3.7,
  '4k': 8.3,
};

const MEGAPIXELS_MIN = 0.1;
const MEGAPIXELS_MAX = 16;

export interface ComfyReferenceSlot {
  /** 宿主节点上的输入键，如 ref_images.ref_image_0 */
  inputKey: string;
  /** 对应的 LoadImage 节点 id */
  nodeId: string;
}

export interface ComfyNodeBindings {
  /** 汇聚参考图的节点（MiniMaxH3ReferenceToVideo 等） */
  hostNodeId?: string;
  promptNodeId?: string;
  promptField: string;
  referenceSlots: ComfyReferenceSlot[];
  resolutionNodeId?: string;
  durationNodeId?: string;
  durationField: string;
  seedNodeId?: string;
  seedField: string;
  stepsNodeId?: string;
  stepsField: string;
  fpsNodeId?: string;
  fpsField: string;
}

/** 渠道模型 defaults.nodeBindings 可覆盖的字段（节点 id 级） */
export type ComfyNodeBindingOverrides = Partial<Pick<
  ComfyNodeBindings,
  'hostNodeId' | 'promptNodeId' | 'promptField' | 'resolutionNodeId'
  | 'durationNodeId' | 'durationField' | 'seedNodeId' | 'seedField'
  | 'stepsNodeId' | 'stepsField' | 'fpsNodeId' | 'fpsField'
>>;

export interface ComfyWorkflowParams {
  prompt: string;
  /** 已上传到 ComfyUI 的参考图取值（LoadImage.inputs.image） */
  referenceImages?: string[];
  /** 已上传到 ComfyUI 的音频参考取值（LoadAudio.inputs.audio）——音色参考，接 ref_audios */
  audioReferences?: string[];
  /** 已上传到 ComfyUI 的视频参考取值（LoadVideo.inputs.file）——接 ref_videos */
  videoReferences?: string[];
  durationSec?: number;
  aspectRatio?: string;
  resolution?: string;
  seed?: number;
  steps?: number;
  fps?: number;
  /** 参考图数量上限（MiniMax H3 的 autogrow 上限为 9） */
  maxReferenceImages?: number;
  /** 音频参考数量上限（MiniMax H3 ref_audios 上限 3） */
  maxAudioReferences?: number;
  /** 视频参考数量上限（MiniMax H3 ref_videos 上限 3） */
  maxVideoReferences?: number;
}

/**
 * MiniMax H3 类模型的联合参考配额：9 图 + 3 视频 + 3 音频且总数 ≤ 12。
 * 分配优先级：用户显式附加的视觉参考（图 > 视频）优先，自动附加的音色参考吃剩余额度。
 * 返回各类实际可用数量（调用方据此 slice）。
 */
export function allocateComfyReferenceBudget(
  requested: { images: number; videos: number; audios: number },
  limits: { maxImages: number; maxVideos: number; maxAudios: number; maxTotal: number },
): { images: number; videos: number; audios: number; droppedAudios: number } {
  const images = Math.max(0, Math.min(requested.images, limits.maxImages, limits.maxTotal));
  const videos = Math.max(0, Math.min(requested.videos, limits.maxVideos, limits.maxTotal - images));
  const audios = Math.max(0, Math.min(requested.audios, limits.maxAudios, limits.maxTotal - images - videos));
  return { images, videos, audios, droppedAudios: Math.max(0, Math.min(requested.audios, limits.maxAudios) - audios) };
}

function findByClass(workflow: ComfyWorkflow, classNames: string[]): string | undefined {
  return Object.keys(workflow).find(id => classNames.includes(workflow[id]?.class_type));
}

function findAllByClass(workflow: ComfyWorkflow, className: string): string[] {
  return Object.keys(workflow).filter(id => workflow[id]?.class_type === className);
}

/** 顺着 inputs[key] 的连线拿到上游节点 id */
function followLink(node: ComfyWorkflowNode | undefined, key: string): string | undefined {
  const value = node?.inputs?.[key];
  return isComfyLink(value) ? value[0] : undefined;
}

function resolveRefSlots(workflow: ComfyWorkflow, hostNodeId?: string): ComfyReferenceSlot[] {
  const host = hostNodeId ? workflow[hostNodeId] : undefined;
  if (!host) {
    // 无宿主节点（自定义工作流）：退化为按出现顺序取所有 LoadImage
    return findAllByClass(workflow, 'LoadImage').map((nodeId, index) => ({
      inputKey: `${REF_IMAGE_INPUT_PREFIX}${index}`,
      nodeId,
    }));
  }
  return Object.keys(host.inputs)
    .map(key => ({ key, match: key.match(REF_IMAGE_INPUT_RE) }))
    .filter((item): item is { key: string; match: RegExpMatchArray } => Boolean(item.match))
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]))
    .map(item => ({ inputKey: item.key, nodeId: followLink(host, item.key) ?? '' }))
    .filter(slot => Boolean(slot.nodeId));
}

/**
 * 解析工作流的参数节点绑定。
 * 拓扑优先：从参考图宿主节点反查 prompt / 分辨率 / 时长；其余按 class_type 扫描。
 */
export function resolveComfyBindings(
  workflow: ComfyWorkflow,
  overrides?: ComfyNodeBindingOverrides,
): ComfyNodeBindings {
  const hostNodeId = overrides?.hostNodeId
    ?? Object.keys(workflow).find(id =>
      Object.keys(workflow[id]?.inputs || {}).some(key => REF_IMAGE_INPUT_RE.test(key)))
    ?? Object.keys(workflow).find(id => /ReferenceToVideo$/i.test(workflow[id]?.class_type || ''));
  const host = hostNodeId ? workflow[hostNodeId] : undefined;

  const promptNodeId = overrides?.promptNodeId
    ?? followLink(host, 'prompt')
    ?? findByClass(workflow, Object.keys(PROMPT_CLASS_FIELDS));
  const promptField = overrides?.promptField
    ?? PROMPT_CLASS_FIELDS[workflow[promptNodeId ?? '']?.class_type ?? '']
    ?? 'value';

  const resolutionNodeId = overrides?.resolutionNodeId
    ?? followLink(host, 'width')
    ?? findByClass(workflow, ['ResolutionSelector']);

  // 时长：宿主的 length 连到帧数换算节点，其 values.a 才是秒数
  const lengthSourceId = followLink(host, 'length');
  const durationNodeId = overrides?.durationNodeId
    ?? followLink(workflow[lengthSourceId ?? ''], 'values.a')
    ?? Object.keys(workflow).find(id =>
      workflow[id]?.class_type === 'PrimitiveFloat'
      && /时长|duration/i.test(workflow[id]?._meta?.title || ''))
    ?? findByClass(workflow, ['PrimitiveFloat']);
  const durationField = overrides?.durationField ?? 'value';

  const seedNodeId = overrides?.seedNodeId ?? findByClass(workflow, Object.keys(SEED_CLASS_FIELDS));
  const seedField = overrides?.seedField
    ?? SEED_CLASS_FIELDS[workflow[seedNodeId ?? '']?.class_type ?? '']
    ?? 'seed';

  const stepsNodeId = overrides?.stepsNodeId ?? findByClass(workflow, Object.keys(STEPS_CLASS_FIELDS));
  const stepsField = overrides?.stepsField
    ?? STEPS_CLASS_FIELDS[workflow[stepsNodeId ?? '']?.class_type ?? '']
    ?? 'steps';

  const fpsNodeId = overrides?.fpsNodeId ?? findByClass(workflow, Object.keys(FPS_CLASS_FIELDS));
  const fpsField = overrides?.fpsField
    ?? FPS_CLASS_FIELDS[workflow[fpsNodeId ?? '']?.class_type ?? '']
    ?? 'fps';

  return {
    hostNodeId,
    promptNodeId,
    promptField,
    referenceSlots: resolveRefSlots(workflow, hostNodeId),
    resolutionNodeId,
    durationNodeId,
    durationField,
    seedNodeId,
    seedField,
    stepsNodeId,
    stepsField,
    fpsNodeId,
    fpsField,
  };
}

export function normalizeAspectRatioOption(aspectRatio?: string): string | undefined {
  const raw = String(aspectRatio || '').trim().toLowerCase();
  if (!raw) return undefined;
  // 已经是 ComfyUI 的完整枚举值（如 "16:9 (Widescreen)"）就原样透传
  const known = Object.values(ASPECT_RATIO_OPTIONS).find(option => option.toLowerCase() === raw);
  if (known) return known;
  return ASPECT_RATIO_OPTIONS[raw];
}

export function normalizeMegapixels(resolution?: string): number | undefined {
  const raw = String(resolution || '').trim().toLowerCase();
  if (!raw) return undefined;
  const tier = RESOLUTION_MEGAPIXELS[raw];
  if (tier) return tier;
  const pixel = raw.match(/^(\d{2,5})x(\d{2,5})$/);
  if (pixel) {
    const mp = (Number(pixel[1]) * Number(pixel[2])) / 1_000_000;
    return Math.min(MEGAPIXELS_MAX, Math.max(MEGAPIXELS_MIN, Math.round(mp * 10) / 10));
  }
  return undefined;
}

function cloneWorkflow(workflow: ComfyWorkflow): ComfyWorkflow {
  return JSON.parse(JSON.stringify(workflow)) as ComfyWorkflow;
}

/** 删除不再被任何节点引用的参考图 LoadImage 节点，避免残留节点指向不存在的文件 */
function pruneOrphanNodes(workflow: ComfyWorkflow, candidateIds: string[]): void {
  for (const nodeId of candidateIds) {
    if (!workflow[nodeId]) continue;
    const referenced = Object.entries(workflow).some(([id, node]) =>
      id !== nodeId && Object.values(node.inputs || {}).some(v => isComfyLink(v) && v[0] === nodeId));
    if (!referenced) {
      delete workflow[nodeId];
    }
  }
}

/**
 * 把参数写进工作流副本（不修改入参模板）。
 *
 * 参考图数量与模板槽位不一致时：
 *   - 少于槽位 → 摘掉多余的 ref_images.ref_image_N 连线并清理孤立 LoadImage
 *   - 多于槽位 → 按 autogrow 规则新建 LoadImage 节点并接上（受 maxReferenceImages 限制）
 */
export function applyComfyWorkflowParams(
  workflow: ComfyWorkflow,
  bindings: ComfyNodeBindings,
  params: ComfyWorkflowParams,
): ComfyWorkflow {
  const next = cloneWorkflow(workflow);

  if (bindings.promptNodeId && next[bindings.promptNodeId]) {
    next[bindings.promptNodeId].inputs[bindings.promptField] = params.prompt;
  }

  const maxRefs = Math.max(0, params.maxReferenceImages ?? 9);
  const references = (params.referenceImages ?? []).filter(Boolean).slice(0, maxRefs);
  const host = bindings.hostNodeId ? next[bindings.hostNodeId] : undefined;
  const slots = bindings.referenceSlots;

  references.forEach((image, index) => {
    const slot = slots[index];
    if (slot && next[slot.nodeId]) {
      next[slot.nodeId].inputs.image = image;
      return;
    }
    // 超出模板槽位：新建 LoadImage 并接到宿主的 autogrow 输入上
    if (!host) return;
    // 防御：自定义工作流里若已存在同名节点，换一个不冲突的 id，避免覆盖原节点
    let nodeId = `koma_ref_${index}`;
    while (next[nodeId]) nodeId = `${nodeId}_x`;
    next[nodeId] = {
      class_type: 'LoadImage',
      inputs: { image },
      _meta: { title: `加载图像（Koma 参考图 ${index + 1}）` },
    };
    host.inputs[`${REF_IMAGE_INPUT_PREFIX}${index}`] = [nodeId, 0];
  });

  // 未用满的槽位：摘连线 + 清理孤立节点
  const unusedSlots = slots.slice(references.length);
  for (const slot of unusedSlots) {
    if (host) delete host.inputs[slot.inputKey];
  }
  pruneOrphanNodes(next, unusedSlots.map(slot => slot.nodeId));

  // 音频参考（音色参考）：ref_audios 同为 autogrow（prefix ref_audio_，max 3），
  // 模板通常不预连音频节点 —— 统一按需新建 LoadAudio 节点并接线。
  // 提示词占位符 <音频 N> / @Audio N 从 1 开始，对应 ref_audios.ref_audio_(N-1)。
  const audioReferences = (params.audioReferences ?? [])
    .filter(Boolean)
    .slice(0, params.maxAudioReferences ?? 3);
  audioReferences.forEach((audio, index) => {
    if (!host) return;
    let nodeId = `koma_audio_${index}`;
    while (next[nodeId]) nodeId = `${nodeId}_x`;
    next[nodeId] = {
      class_type: 'LoadAudio',
      inputs: { audio },
      _meta: { title: `加载音频（Koma 音色参考 ${index + 1}）` },
    };
    host.inputs[`${REF_AUDIO_INPUT_PREFIX}${index}`] = [nodeId, 0];
  });

  // 视频参考：ref_videos 同为 autogrow（prefix ref_video_，max 3），
  // 按需新建核心 LoadVideo 节点（inputs.file）并接线。
  // 提示词占位符 <视频 N> / @Video N 从 1 开始，对应 ref_videos.ref_video_(N-1)。
  const videoReferences = (params.videoReferences ?? [])
    .filter(Boolean)
    .slice(0, params.maxVideoReferences ?? 3);
  videoReferences.forEach((video, index) => {
    if (!host) return;
    let nodeId = `koma_video_${index}`;
    while (next[nodeId]) nodeId = `${nodeId}_x`;
    next[nodeId] = {
      class_type: 'LoadVideo',
      inputs: { file: video },
      _meta: { title: `加载视频（Koma 视频参考 ${index + 1}）` },
    };
    host.inputs[`${REF_VIDEO_INPUT_PREFIX}${index}`] = [nodeId, 0];
  });

  if (bindings.resolutionNodeId && next[bindings.resolutionNodeId]) {
    const aspectRatio = normalizeAspectRatioOption(params.aspectRatio);
    if (aspectRatio) {
      next[bindings.resolutionNodeId].inputs.aspect_ratio = aspectRatio;
    }
    const megapixels = normalizeMegapixels(params.resolution);
    if (megapixels !== undefined) {
      next[bindings.resolutionNodeId].inputs.megapixels = megapixels;
    }
  }

  if (bindings.durationNodeId && next[bindings.durationNodeId] && params.durationSec !== undefined) {
    next[bindings.durationNodeId].inputs[bindings.durationField] = params.durationSec;
  }

  if (bindings.seedNodeId && next[bindings.seedNodeId] && params.seed !== undefined) {
    next[bindings.seedNodeId].inputs[bindings.seedField] = params.seed;
  }

  if (bindings.stepsNodeId && next[bindings.stepsNodeId] && params.steps !== undefined) {
    next[bindings.stepsNodeId].inputs[bindings.stepsField] = params.steps;
  }

  if (bindings.fpsNodeId && next[bindings.fpsNodeId] && params.fps !== undefined) {
    next[bindings.fpsNodeId].inputs[bindings.fpsField] = params.fps;
  }

  return next;
}
