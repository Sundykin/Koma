/**
 * ComfyUI API 格式工作流的通用导入 / 分析 / 参数注入。
 *
 * 目标：新接一个 ComfyUI 工作流不再改代码 —— 用户在渠道模型配置里粘贴
 * 「导出（API）」的 JSON，本模块负责：
 *   1. parseComfyWorkflowJson  校验并解析 JSON 文本
 *   2. analyzeComfyWorkflow    按 class_type + 连线拓扑自动识别节点角色
 *      （提示词 / 负面提示词 / 种子 / 尺寸与批量 / 参考图 / 时长 / 帧率 / 输出类型），
 *      识别结果既用于运行时注入，也用于设置界面的识别预览与手动覆盖
 *   3. applyComfyImageParams   把生图请求参数写进工作流副本
 *
 * 运行时注入可通过模型 defaults.nodeBindings 覆盖自动识别结果：
 *   { promptNodeId, promptField, negativePromptNodeId, sizeNodeId, seedNodeIds,
 *     batchNodeId, batchField } —— 全部可选，缺省用自动识别值。
 *
 * 视频工作流的执行绑定仍走 workflowBinding.ts（resolveComfyBindings），
 * 本模块的 analyze 对视频工作流仅作导入预览用途（角色识别口径两者一致）。
 */
import type { ComfyWorkflow, ComfyWorkflowNode } from './types';
import { isComfyLink } from './types';
import { normalizeAspectRatioOption, normalizeMegapixels } from './workflowBinding';

// ---------------------------------------------------------------------------
// 解析
// ---------------------------------------------------------------------------

export interface ComfyWorkflowParseResult {
  ok: boolean;
  workflow?: ComfyWorkflow;
  error?: string;
}

/** 解析并校验「导出（API）」格式的 JSON 文本 */
export function parseComfyWorkflowJson(text: string): ComfyWorkflowParseResult {
  const raw = String(text || '').trim();
  if (!raw) return { ok: false, error: 'JSON 内容为空' };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `不是合法 JSON：${err instanceof Error ? err.message : String(err)}` };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: '格式不正确：API 格式工作流应是以节点 id 为键的对象' };
  }
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length === 0) return { ok: false, error: '工作流没有任何节点' };
  // API 格式的每个节点都必须有 class_type 与 inputs（允许 inputs 为空对象）
  const bad = entries.find(([, node]) => {
    const n = node as Partial<ComfyWorkflowNode> | null;
    return !n || typeof n !== 'object' || typeof n.class_type !== 'string' || !n.class_type
      || !n.inputs || typeof n.inputs !== 'object' || Array.isArray(n.inputs);
  });
  if (bad) {
    return {
      ok: false,
      error: `节点 ${bad[0]} 缺少 class_type/inputs —— 请确认导出的是「API 格式」而非界面格式`,
    };
  }
  return { ok: true, workflow: data as ComfyWorkflow };
}

// ---------------------------------------------------------------------------
// 分析
// ---------------------------------------------------------------------------

export type ComfyOutputKind = 'image' | 'video';

export interface ComfyNodeCandidate {
  nodeId: string;
  classType: string;
  title: string;
  /** 该角色写入的 inputs 字段名 */
  field: string;
}

export interface ComfyWorkflowAnalysis {
  /** 按输出节点推断的产物类型 */
  kind: ComfyOutputKind | 'unknown';
  nodeCount: number;
  outputNodeIds: string[];
  prompt?: ComfyNodeCandidate;
  negativePrompt?: ComfyNodeCandidate;
  /** 全部种子节点（注入时会全部写入同一种子） */
  seeds: ComfyNodeCandidate[];
  /** 承载 batch_size（且可能直接承载 width/height）的 latent 节点 */
  sizeNode?: ComfyNodeCandidate;
  /** sizeNode 的 width/height 是否为连线（连线时尺寸由上游节点决定，不直接改宽高） */
  sizeDimsLinked: boolean;
  /** ResolutionSelector 类节点（改 aspect_ratio/megapixels 枚举） */
  aspectNode?: ComfyNodeCandidate;
  referenceImages: ComfyNodeCandidate[];
  referenceAudios: ComfyNodeCandidate[];
  duration?: ComfyNodeCandidate;
  fps?: ComfyNodeCandidate;
  steps?: ComfyNodeCandidate;
  /** 各角色的候选节点（供设置界面手动覆盖下拉用） */
  candidates: {
    prompt: ComfyNodeCandidate[];
    negativePrompt: ComfyNodeCandidate[];
    seed: ComfyNodeCandidate[];
    size: ComfyNodeCandidate[];
  };
  warnings: string[];
}

/** 用户提示词入口节点：类名 → 文本字段 */
const PROMPT_ENTRY_CLASS_FIELDS: Record<string, string> = {
  PrimitiveStringMultiline: 'value',
  PrimitiveString: 'value',
  String: 'value',
  CLIPTextEncode: 'text',
};

const SEED_CLASS_FIELDS: Record<string, string> = {
  KSampler: 'seed',
  KSamplerAdvanced: 'noise_seed',
  RandomNoise: 'noise_seed',
  SeedNode: 'seed',
  PrimitiveInt: 'value',
};

const STEPS_CLASS_FIELDS: Record<string, string> = {
  KSampler: 'steps',
  KSamplerAdvanced: 'steps',
  BasicScheduler: 'steps',
};

const FPS_CLASS_FIELDS: Record<string, string> = {
  CreateVideo: 'fps',
  VHS_VideoCombine: 'frame_rate',
};

const SIZE_CLASS_NAMES = ['EmptyLatentImage', 'EmptySD3LatentImage'];
const ASPECT_CLASS_NAMES = ['ResolutionSelector'];
const SAMPLER_CLASS_NAMES = ['KSampler', 'KSamplerAdvanced', 'SamplerCustom'];

const IMAGE_OUTPUT_CLASSES = ['SaveImage', 'PreviewImage'];
const VIDEO_OUTPUT_CLASSES = ['SaveVideo', 'VHS_VideoCombine', 'CreateVideo'];

function titleOf(node: ComfyWorkflowNode | undefined): string {
  return String(node?._meta?.title || '');
}

function candidate(workflow: ComfyWorkflow, nodeId: string, field: string): ComfyNodeCandidate {
  const node = workflow[nodeId];
  return { nodeId, classType: node?.class_type ?? '', title: titleOf(node), field };
}

function isUserEntryTitle(title: string): boolean {
  return /提示词|prompt|输入|描述|user/i.test(title) && !/系统|system|负面|negative/i.test(title);
}

/** 顺着 inputs 里的连线收集字符串叶子节点（Primitive/String 类），限深防环 */
function collectStringLeaves(
  workflow: ComfyWorkflow,
  nodeId: string,
  depth: number,
  seen: Set<string>,
): string[] {
  if (depth > 6 || seen.has(nodeId)) return [];
  seen.add(nodeId);
  const node = workflow[nodeId];
  if (!node) return [];
  if (PROMPT_ENTRY_CLASS_FIELDS[node.class_type] && node.class_type !== 'CLIPTextEncode') {
    return [nodeId];
  }
  const leaves: string[] = [];
  for (const value of Object.values(node.inputs || {})) {
    if (isComfyLink(value)) {
      leaves.push(...collectStringLeaves(workflow, value[0], depth + 1, seen));
    }
  }
  return leaves;
}

/** 给用户入口候选打分：标题像用户输入 > 值短（用户入口通常为空/短，系统提示词很长） */
function scorePromptEntry(workflow: ComfyWorkflow, nodeId: string): number {
  const node = workflow[nodeId];
  if (!node) return -Infinity;
  const field = PROMPT_ENTRY_CLASS_FIELDS[node.class_type];
  const value = String(node.inputs?.[field] ?? '');
  let score = 0;
  if (isUserEntryTitle(titleOf(node))) score += 4;
  if (value.length === 0) score += 3;
  else if (value.length < 100) score += 1;
  else score -= 3; // 长文本多半是内置系统提示词
  if (node.class_type === 'PrimitiveStringMultiline') score += 1;
  return score;
}

/** 找到 sampler 的 positive/negative 输入所连的 CLIPTextEncode */
function findSamplerTextNodes(workflow: ComfyWorkflow): { positiveId?: string; negativeId?: string } {
  for (const node of Object.values(workflow)) {
    if (!SAMPLER_CLASS_NAMES.includes(node.class_type)) continue;
    const positive = node.inputs?.positive;
    const negative = node.inputs?.negative;
    const positiveId = isComfyLink(positive) ? positive[0] : undefined;
    const negativeId = isComfyLink(negative) ? negative[0] : undefined;
    if (positiveId && workflow[positiveId]?.class_type === 'CLIPTextEncode') {
      return { positiveId, negativeId };
    }
  }
  return {};
}

function detectPrompt(workflow: ComfyWorkflow): ComfyNodeCandidate | undefined {
  const { positiveId } = findSamplerTextNodes(workflow);
  if (positiveId) {
    const positiveNode = workflow[positiveId];
    const text = positiveNode.inputs?.text;
    // CLIPTextEncode.text 直接是字符串 → 它就是提示词入口
    if (typeof text === 'string') {
      return candidate(workflow, positiveId, 'text');
    }
    // text 是连线（如 LLM 反推/润色链）→ 向上游走找用户输入叶子
    if (isComfyLink(text)) {
      const leaves = collectStringLeaves(workflow, text[0], 0, new Set());
      if (leaves.length > 0) {
        const best = [...leaves].sort((a, b) => scorePromptEntry(workflow, b) - scorePromptEntry(workflow, a))[0];
        const field = PROMPT_ENTRY_CLASS_FIELDS[workflow[best]?.class_type ?? ''] ?? 'value';
        return candidate(workflow, best, field);
      }
    }
  }
  // 无 sampler 链路：全体字符串入口里挑最像用户输入的
  const entries = Object.keys(workflow).filter(id =>
    Boolean(PROMPT_ENTRY_CLASS_FIELDS[workflow[id]?.class_type ?? ''])
    && workflow[id]?.class_type !== 'CLIPTextEncode');
  if (entries.length === 0) return undefined;
  const best = entries.sort((a, b) => scorePromptEntry(workflow, b) - scorePromptEntry(workflow, a))[0];
  if (scorePromptEntry(workflow, best) < 1) return undefined;
  return candidate(workflow, best, PROMPT_ENTRY_CLASS_FIELDS[workflow[best].class_type]);
}

function detectNegativePrompt(workflow: ComfyWorkflow): ComfyNodeCandidate | undefined {
  const { negativeId } = findSamplerTextNodes(workflow);
  if (negativeId && typeof workflow[negativeId]?.inputs?.text === 'string') {
    return candidate(workflow, negativeId, 'text');
  }
  return undefined;
}

function detectSeeds(workflow: ComfyWorkflow): ComfyNodeCandidate[] {
  const out: ComfyNodeCandidate[] = [];
  for (const [id, node] of Object.entries(workflow)) {
    const field = SEED_CLASS_FIELDS[node.class_type];
    if (!field) continue;
    // PrimitiveInt 只有标题像种子才算（避免误抓步数/帧数 PrimitiveInt）
    if (node.class_type === 'PrimitiveInt' && !/seed|种子/i.test(titleOf(node))) continue;
    if (typeof node.inputs?.[field] !== 'number') continue;
    out.push(candidate(workflow, id, field));
  }
  return out;
}

function detectSteps(workflow: ComfyWorkflow): ComfyNodeCandidate | undefined {
  for (const [id, node] of Object.entries(workflow)) {
    const field = STEPS_CLASS_FIELDS[node.class_type];
    if (field && typeof node.inputs?.[field] === 'number') return candidate(workflow, id, field);
  }
  return undefined;
}

function detectSize(workflow: ComfyWorkflow): {
  sizeNode?: ComfyNodeCandidate;
  sizeDimsLinked: boolean;
  aspectNode?: ComfyNodeCandidate;
} {
  // 优先取接到 sampler latent_image 的 latent 节点
  let sizeId: string | undefined;
  outer: for (const [, node] of Object.entries(workflow)) {
    if (!SAMPLER_CLASS_NAMES.includes(node.class_type)) continue;
    const latent = node.inputs?.latent_image;
    if (isComfyLink(latent) && SIZE_CLASS_NAMES.includes(workflow[latent[0]]?.class_type ?? '')) {
      sizeId = latent[0];
      break outer;
    }
  }
  if (!sizeId) {
    sizeId = Object.keys(workflow).find(id => SIZE_CLASS_NAMES.includes(workflow[id]?.class_type ?? ''));
  }
  const sizeNode = sizeId ? workflow[sizeId] : undefined;
  const sizeDimsLinked = Boolean(sizeNode && isComfyLink(sizeNode.inputs?.width));

  // 宽高是连线时找上游 ResolutionSelector（改枚举比例），找不到也按类名兜底
  let aspectId: string | undefined;
  if (sizeNode && isComfyLink(sizeNode.inputs?.width)) {
    const upstream = workflow[sizeNode.inputs.width[0]];
    if (upstream && ASPECT_CLASS_NAMES.includes(upstream.class_type)) {
      aspectId = sizeNode.inputs.width[0];
    }
  }
  if (!aspectId) {
    aspectId = Object.keys(workflow).find(id => ASPECT_CLASS_NAMES.includes(workflow[id]?.class_type ?? ''));
  }

  return {
    sizeNode: sizeId ? candidate(workflow, sizeId, 'batch_size') : undefined,
    sizeDimsLinked,
    aspectNode: aspectId ? candidate(workflow, aspectId, 'aspect_ratio') : undefined,
  };
}

function detectDuration(workflow: ComfyWorkflow): ComfyNodeCandidate | undefined {
  // 标题带 时长/duration 的数值节点优先（视频工作流的秒数入口）
  const titled = Object.keys(workflow).find(id =>
    /时长|duration/i.test(titleOf(workflow[id]))
    && typeof workflow[id]?.inputs?.value === 'number');
  if (titled) return candidate(workflow, titled, 'value');
  const floatNode = Object.keys(workflow).find(id => workflow[id]?.class_type === 'PrimitiveFloat');
  return floatNode ? candidate(workflow, floatNode, 'value') : undefined;
}

function detectFps(workflow: ComfyWorkflow): ComfyNodeCandidate | undefined {
  for (const [id, node] of Object.entries(workflow)) {
    const field = FPS_CLASS_FIELDS[node.class_type];
    if (field && typeof node.inputs?.[field] === 'number') return candidate(workflow, id, field);
  }
  return undefined;
}

/** 分析工作流结构：输出类型 + 各角色节点识别 + 候选清单 */
export function analyzeComfyWorkflow(workflow: ComfyWorkflow): ComfyWorkflowAnalysis {
  const nodeIds = Object.keys(workflow);
  const outputNodeIds = nodeIds.filter(id =>
    IMAGE_OUTPUT_CLASSES.includes(workflow[id]?.class_type ?? '')
    || VIDEO_OUTPUT_CLASSES.includes(workflow[id]?.class_type ?? ''));
  const hasVideoOutput = outputNodeIds.some(id => VIDEO_OUTPUT_CLASSES.includes(workflow[id]?.class_type ?? ''));
  const hasImageOutput = outputNodeIds.some(id => IMAGE_OUTPUT_CLASSES.includes(workflow[id]?.class_type ?? ''));
  const kind: ComfyWorkflowAnalysis['kind'] = hasVideoOutput ? 'video' : hasImageOutput ? 'image' : 'unknown';

  const prompt = detectPrompt(workflow);
  const negativePrompt = detectNegativePrompt(workflow);
  const seeds = detectSeeds(workflow);
  const { sizeNode, sizeDimsLinked, aspectNode } = detectSize(workflow);
  const duration = detectDuration(workflow);
  const fps = detectFps(workflow);
  const steps = detectSteps(workflow);

  const referenceImages = nodeIds
    .filter(id => workflow[id]?.class_type === 'LoadImage')
    .sort((a, b) => Number(a) - Number(b))
    .map(id => candidate(workflow, id, 'image'));
  const referenceAudios = nodeIds
    .filter(id => workflow[id]?.class_type === 'LoadAudio')
    .sort((a, b) => Number(a) - Number(b))
    .map(id => candidate(workflow, id, 'audio'));

  const warnings: string[] = [];
  if (!prompt) warnings.push('未识别到提示词节点（需要 PrimitiveString/CLIPTextEncode 类节点）');
  if (kind === 'unknown') warnings.push('未识别到输出节点（SaveImage/SaveVideo/VHS_VideoCombine），执行后可能取不到产物');
  if (seeds.length === 0) warnings.push('未识别到种子节点，每次生成将沿用模板内置种子');
  if (referenceImages.length > 0) {
    warnings.push(`含 ${referenceImages.length} 个参考图节点（LoadImage）：未提供参考图时这些节点会被自动摘除`);
  }

  const promptCandidates = nodeIds
    .filter(id => Boolean(PROMPT_ENTRY_CLASS_FIELDS[workflow[id]?.class_type ?? '']))
    .map(id => candidate(workflow, id, PROMPT_ENTRY_CLASS_FIELDS[workflow[id].class_type]));
  const seedCandidates = nodeIds
    .filter(id => Boolean(SEED_CLASS_FIELDS[workflow[id]?.class_type ?? '']))
    .map(id => candidate(workflow, id, SEED_CLASS_FIELDS[workflow[id].class_type]));
  const sizeCandidates = nodeIds
    .filter(id => SIZE_CLASS_NAMES.includes(workflow[id]?.class_type ?? ''))
    .map(id => candidate(workflow, id, 'batch_size'));

  return {
    kind,
    nodeCount: nodeIds.length,
    outputNodeIds,
    prompt,
    negativePrompt,
    seeds,
    sizeNode,
    sizeDimsLinked,
    aspectNode,
    referenceImages,
    referenceAudios,
    duration,
    fps,
    steps,
    candidates: {
      prompt: promptCandidates,
      negativePrompt: promptCandidates.filter(c => c.classType === 'CLIPTextEncode'),
      seed: seedCandidates,
      size: sizeCandidates,
    },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// 参数注入（生图）
// ---------------------------------------------------------------------------

/** 模型 defaults.nodeBindings 支持的覆盖键（生图路径） */
export interface ComfyImageBindingOverrides {
  promptNodeId?: string;
  promptField?: string;
  negativePromptNodeId?: string;
  sizeNodeId?: string;
  /** 覆盖后只写这些种子节点（缺省写全部识别到的种子节点） */
  seedNodeIds?: string[];
  batchNodeId?: string;
  batchField?: string;
}

export interface ComfyImageApplyParams {
  prompt: string;
  negativePrompt?: string;
  /** 已上传到 ComfyUI 的参考图取值（LoadImage.inputs.image） */
  referenceImages?: string[];
  seed?: number;
  count?: number;
  aspectRatio?: string;
  /** 清晰度档位：1K/1.5K/2K/3K/4K */
  imageSize?: string;
  /** 覆盖采样步数（模型 defaults.steps） */
  steps?: number;
}

/** 通用 2K 档比例 → latent 尺寸（1K/4K 档按 0.75/1.5 缩放） */
const GENERIC_LATENT_SIZE_2K: Record<string, [number, number]> = {
  '1:1': [1024, 1024],
  '16:9': [1344, 768],
  '9:16': [768, 1344],
  '4:3': [1152, 864],
  '3:4': [864, 1152],
  '3:2': [1216, 832],
  '2:3': [832, 1216],
};

function normalizeRatioShort(value?: string): string | undefined {
  const raw = String(value || '').trim().toLowerCase();
  const direct = raw.match(/^(\d{1,3})\s*:\s*(\d{1,3})/);
  if (direct) return `${Number(direct[1])}:${Number(direct[2])}`;
  const wxh = raw.match(/^(\d{2,5})x(\d{2,5})$/);
  if (wxh) {
    const w = Number(wxh[1]);
    const h = Number(wxh[2]);
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const d = gcd(w, h);
    return `${w / d}:${h / d}`;
  }
  return undefined;
}

function scaleFromImageSize(imageSize?: string): number {
  const key = String(imageSize || '').trim().toLowerCase();
  if (key === '1k') return 0.75;
  if (key === '4k') return 1.5;
  return 1.0;
}

/** imageSize 档位 → ResolutionSelector.megapixels */
function megapixelsFromImageSize(imageSize?: string): number | undefined {
  const key = String(imageSize || '').trim().toLowerCase();
  if (key === '1k') return 0.5;
  if (key === '1.5k') return 0.75;
  if (key === '2k') return 1.0;
  if (key === '3k') return 1.5;
  if (key === '4k') return 2.0;
  return undefined;
}

/** 删除节点并摘掉所有指向它的输入连线（LoadImage 未用槽位清理用） */
function removeNodeAndInboundLinks(workflow: ComfyWorkflow, nodeId: string): void {
  if (!workflow[nodeId]) return;
  delete workflow[nodeId];
  for (const node of Object.values(workflow)) {
    for (const [key, value] of Object.entries(node.inputs || {})) {
      if (isComfyLink(value) && value[0] === nodeId) {
        delete node.inputs[key];
      }
    }
  }
}

/**
 * 把生图参数写进工作流副本（不改入参模板）。
 *
 * 参考图策略：按 LoadImage 节点顺序填充；多余参考图忽略；
 * 未填到的 LoadImage 节点连同其入边一起摘除（对应 krea2 无参考图摘掉
 * TextGenerate.image 连线的行为）。若工作流的参考图是必需输入（如 img2img
 * 的 VAEEncode 上游），不传参考图会在 ComfyUI 侧报校验错 —— 属预期行为。
 */
export function applyComfyImageParams(
  workflow: ComfyWorkflow,
  analysis: ComfyWorkflowAnalysis,
  params: ComfyImageApplyParams,
  overrides?: ComfyImageBindingOverrides,
): ComfyWorkflow {
  const next = JSON.parse(JSON.stringify(workflow)) as ComfyWorkflow;

  // 提示词
  const promptId = overrides?.promptNodeId ?? analysis.prompt?.nodeId;
  const promptField = overrides?.promptField
    ?? (promptId ? analysis.prompt?.nodeId === promptId ? analysis.prompt.field
      : PROMPT_ENTRY_CLASS_FIELDS[next[promptId]?.class_type ?? ''] : undefined)
    ?? 'value';
  if (promptId && next[promptId]) {
    next[promptId].inputs[promptField] = params.prompt;
  }

  // 负面提示词（仅当调用方显式给出时才覆盖模板内置值）
  const negativeId = overrides?.negativePromptNodeId ?? analysis.negativePrompt?.nodeId;
  if (negativeId && next[negativeId] && params.negativePrompt) {
    next[negativeId].inputs.text = params.negativePrompt;
  }

  // 种子：写全部识别到的种子节点（或覆盖清单）
  const seedTargets = overrides?.seedNodeIds?.length
    ? overrides.seedNodeIds.map(id => candidate(next, id, SEED_CLASS_FIELDS[next[id]?.class_type ?? ''] ?? 'seed'))
    : analysis.seeds;
  if (params.seed !== undefined) {
    for (const target of seedTargets) {
      if (next[target.nodeId]) next[target.nodeId].inputs[target.field] = params.seed;
    }
  }

  // 步数
  if (params.steps !== undefined && analysis.steps && next[analysis.steps.nodeId]) {
    next[analysis.steps.nodeId].inputs[analysis.steps.field] = params.steps;
  }

  // 尺寸：latent 直连宽高 or ResolutionSelector 枚举
  const sizeNodeId = overrides?.sizeNodeId ?? analysis.sizeNode?.nodeId;
  const sizeNode = sizeNodeId ? next[sizeNodeId] : undefined;
  if (sizeNode) {
    const dimsLinked = isComfyLink(sizeNode.inputs?.width);
    if (!dimsLinked) {
      const ratio = normalizeRatioShort(params.aspectRatio);
      const table = ratio ? GENERIC_LATENT_SIZE_2K[ratio] : undefined;
      if (table) {
        const scale = scaleFromImageSize(params.imageSize);
        sizeNode.inputs.width = Math.round(table[0] * scale);
        sizeNode.inputs.height = Math.round(table[1] * scale);
      }
    }
    const count = Math.max(1, Math.floor(Number(params.count) || 1));
    sizeNode.inputs.batch_size = count;
  }
  // ResolutionSelector：仅当存在且宽高由它决定时改枚举
  if (analysis.aspectNode && next[analysis.aspectNode.nodeId]) {
    const aspect = normalizeAspectRatioOption(params.aspectRatio);
    if (aspect) next[analysis.aspectNode.nodeId].inputs.aspect_ratio = aspect;
    const mp = megapixelsFromImageSize(params.imageSize) ?? normalizeMegapixels(params.imageSize);
    if (mp !== undefined) next[analysis.aspectNode.nodeId].inputs.megapixels = mp;
  }

  // 批量：独立 batch 节点覆盖（极少见；通常 batch_size 就在 sizeNode 上）
  if (overrides?.batchNodeId && next[overrides.batchNodeId]) {
    next[overrides.batchNodeId].inputs[overrides.batchField ?? 'batch_size'] = Math.max(1, Math.floor(Number(params.count) || 1));
  }

  // 参考图：按序填充，多余忽略，未填充的 LoadImage 摘除
  const refs = (params.referenceImages ?? []).filter(Boolean);
  analysis.referenceImages.forEach((slot, index) => {
    if (index < refs.length && next[slot.nodeId]) {
      next[slot.nodeId].inputs[slot.field] = refs[index];
    } else {
      removeNodeAndInboundLinks(next, slot.nodeId);
    }
  });

  return next;
}
