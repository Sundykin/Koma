import {
  getLinghuiResultPrimaryMedia,
  type LinghuiAgentExecutionMetadata,
  type LinghuiAgentNodeProperties,
  type LinghuiAudioNodeProperties,
  type LinghuiImageFocusRegion,
  type LinghuiImageMarkPoint,
  type LinghuiImageMediaItem,
  type LinghuiImageNodeProperties,
  type LinghuiNodeResult,
  type LinghuiScriptNodeProperties,
  type LinghuiTextNodeProperties,
  type LinghuiVideoCapability,
} from '../../../../types/linghui';
import {
  buildLinghuiImageCinematicPromptFragment,
  normalizeLinghuiImageCinematicConfig,
  normalizeLinghuiImageFocusRegion,
  normalizeLinghuiImageMarkPoints,
} from '../../../../types/linghui';
import {
  collectLinghuiPromptReferenceImageSources,
  compileLinghuiPromptReferences,
} from '../../editors/state/linghuiPromptReferences';
import {
  formatLinghuiScriptShots,
  parseLinghuiScriptContent,
} from '../../editors/state/linghuiScriptNodeUtils';
import {
  buildMediaItem,
  collectReferenceSources,
  collectTextSnippets,
  collectVideoPosterSources,
  mergePromptWithTextInputs,
  mergeUniqueSources,
  resolveImageNodeMode,
  type ExecutionNodeView,
} from './linghuiExecutionShared';
import {
  getLinghuiImageImportItems,
  resolveLinghuiImagePrimaryImportItem,
} from '../../editors/state/linghuiImageCollections';
import {
  LIBTV_PANORAMA_SLASH_LABEL,
  LIBTV_PANORAMA_SLASH_QUALITY,
  LIBTV_PANORAMA_SLASH_SCENE,
  LIBTV_PANORAMA_SUBMIT_MODEL_KEY,
  LIBTV_PANORAMA_WITH_PROMPT_SCENE,
  compilePanoramaPrompt,
  getLibTVPanoramaRatioForModel,
  type PanoramaTemplateKind,
} from '../../panorama/panoramaPromptTemplate';
import { resolvePanoramaProjectionMode } from '../../panorama/panoramaProjection';
import {
  generateAudioWithProvider,
  generateImageVariantsWithProvider,
  generateImageWithProvider,
  generateTextWithProvider,
  runAgentWithProvider,
  generateVideoWithProvider,
} from './linghuiExecutionProviders';
import {
  getVideoCapabilityInputError,
  resolveVideoCapabilitySources,
} from '../../editors/state/videoCapabilityUtils';
import {
  analyzeLinghuiImageBatchSimilarity,
  analyzeLinghuiImageCandidateQuality,
  type LinghuiImageCandidateQualityResult,
} from './linghuiImageSimilarity';
import { createLogger } from '../../../../store/logger';
import { runWithTask } from '../../../../services/taskRunner';
import type { TaskSubType } from '../../../../services/TaskManager';
import { persistMediaAsset } from '../../../../services/mediaPersistenceService';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import { buildLinghuiVisualSourceKey } from '../../utils/linghuiMediaAssetSource';

const imageExecutionLogger = createLogger('LinghuiImageExecution');

// 节点类型 → TaskManager subType 映射，便于面板按图标分组
const LINGHUI_NODE_TASK_SUBTYPE: Record<string, TaskSubType> = {
  'linghui/text': 'linghui-text',
  'linghui/agent': 'linghui-agent',
  'linghui/image': 'linghui-image',
  // 全景节点也用 image subtype（任务面板按图标分组时与图片同列）
  'linghui/panorama': 'linghui-image',
  'linghui/video': 'linghui-video',
  'linghui/audio': 'linghui-audio',
  'linghui/script': 'linghui-script',
  // 故事板节点本质上和 script 走同一条 LLM 链路，subtype 复用 linghui-script
  'linghui/storyboard': 'linghui-script',
  // 3D 导演不真正调远程 provider，按 image subtype 分组（导出 lineart 走渲染器）
  'linghui/director3d': 'linghui-image',
};

const DEFAULT_SCRIPT_SYSTEM_PROMPT = [
  '你是灵绘的分镜脚本助手。',
  '请只输出 JSON，不要附加解释。',
  '输出格式必须是 {"shots":[{"title":"镜头标题","description":"画面描述","durationSec":10}] }。',
  'durationSec 只能填写 6、10、12、16、20 之一；无法判断时填写 10。',
  '至少生成 3 个镜头，描述需要明确主体、动作、构图和氛围。',
].join('\n');

function buildScriptSystemPrompt(systemPrompt: string): string {
  const normalized = String(systemPrompt).trim();
  if (!normalized) {
    return DEFAULT_SCRIPT_SYSTEM_PROMPT;
  }

  return [
    DEFAULT_SCRIPT_SYSTEM_PROMPT,
    '在严格遵守上述 JSON 输出要求的前提下，请额外满足以下要求：',
    normalized,
  ].join('\n\n');
}

/**
 * 故事板节点专用 system prompt：比脚本节点更详尽，覆盖镜头数量、可拍性、节奏、剪辑逻辑，
 * 让小白用户只填剧情大纲即可得到可拍摄的分镜表。
 */
function buildStoryboardSystemPrompt(targetShotCount: number): string {
  const clamped = Math.max(4, Math.min(24, Math.round(Number(targetShotCount) || 8)));
  return [
    '你是灵绘的专业故事板生成助手，擅长把剧情大纲拆解成画面可拍的分镜序列。',
    '请只输出 JSON，不要附加解释、不要 markdown 代码块、不要前后空行。',
    '输出格式必须严格符合：',
    '{"shots":[{"title":"镜头标题","description":"画面描述","durationSec":10}]}',
    '',
    '硬约束：',
    `1. shots 数组长度严格落在 [${Math.max(4, clamped - 2)}, ${Math.min(24, clamped + 2)}] 区间，目标 ${clamped} 个镜头。`,
    '2. durationSec 必须从 6 / 10 / 12 / 16 / 20 中选一个；无法判断时填 10。',
    '3. title 限 4–12 个中文字，表达画面核心动作或主体。',
    '4. description 限 30–80 个中文字，必须同时包含：',
    '   a) 主体（谁 / 什么 / 几个人）',
    '   b) 动作（在做什么、运动方向）',
    '   c) 景别（特写 / 近景 / 中景 / 远景 / 大全景 / 过肩 / 主观）',
    '   d) 光线或氛围（白昼 / 夜景 / 逆光 / 顶光 / 雨雾 / 暖色 / 冷色 等）',
    '',
    '叙事约束：',
    '- 第一个镜头建立场景与角色定位（who / where）。',
    '- 中段镜头之间要有清晰剪辑逻辑：连续动作、对切、平行、匹配剪辑、视线引导任选其一。',
    '- 高潮镜头要给画面冲击或情绪转折。',
    '- 收尾镜头要回应主题或留白，不能突兀结束。',
    '- 避免抽象情绪形容词堆砌；优先具体可拍的视觉描述。',
    '- 镜头描述使用中文。',
  ].join('\n');
}

type NodeExecutionProgressHandler = (progress: number, message?: string, partialResult?: LinghuiNodeResult) => void;

function buildImageFocusInstruction(region: LinghuiImageFocusRegion): string {
  const left = Math.round(region.x * 100);
  const top = Math.round(region.y * 100);
  const right = Math.round((region.x + region.width) * 100);
  const bottom = Math.round((region.y + region.height) * 100);
  const label = region.label ? ` (${region.label})` : '';

  return [
    `LibTV-style focus region${label}: prioritize local completion and repaint inside the marked box.`,
    `Focus box normalized coordinates: left ${left}%, top ${top}%, right ${right}%, bottom ${bottom}%.`,
    'Preserve the original image outside this box as much as possible: keep composition, identity, pose, lighting direction, camera angle, and style stable.',
    'Only repair, refine, or regenerate details inside the focus box unless the user prompt explicitly asks for a larger change.',
    'Avoid adding extra subjects, duplicate faces, collage panels, borders, captions, or UI marks.',
  ].join('\n');
}

function appendImageFocusInstruction(prompt: string, region: LinghuiImageFocusRegion | null): string {
  if (!region?.enabled) {
    return prompt;
  }

  const instruction = buildImageFocusInstruction(region);
  const normalizedPrompt = String(prompt).trim();
  if (!normalizedPrompt) {
    return instruction;
  }
  if (normalizedPrompt.includes('LibTV-style focus region')) {
    return normalizedPrompt;
  }
  return `${normalizedPrompt}\n\n${instruction}`;
}

function buildImageMarkInstruction(points: LinghuiImageMarkPoint[]): string {
  const enabledPoints = points.filter(point => point.enabled);
  if (!enabledPoints.length) {
    return '';
  }

  return [
    'LibTV-style mark points: use these image coordinates as explicit visual anchors.',
    ...enabledPoints.map((point, index) => {
      const x = Math.round(point.x * 100);
      const y = Math.round(point.y * 100);
      const label = point.label || `mark ${index + 1}`;
      const prompt = point.prompt ? ` ${point.prompt}` : '';
      return `Mark ${index + 1} (${label}) at x ${x}%, y ${y}%.${prompt}`;
    }),
    'Preserve the relationship between marked subjects/details and the surrounding scene; do not render visible UI pins, numbers, captions, or marker graphics.',
  ].join('\n');
}

function appendImageMarkInstruction(prompt: string, points: LinghuiImageMarkPoint[]): string {
  const instruction = buildImageMarkInstruction(points);
  if (!instruction) {
    return prompt;
  }

  const normalizedPrompt = String(prompt).trim();
  if (!normalizedPrompt) {
    return instruction;
  }
  if (normalizedPrompt.includes('LibTV-style mark points')) {
    return normalizedPrompt;
  }
  return `${normalizedPrompt}\n\n${instruction}`;
}

function appendImageCinematicInstruction(
  prompt: string,
  cinematic: ReturnType<typeof normalizeLinghuiImageCinematicConfig>,
): string {
  const fragment = buildLinghuiImageCinematicPromptFragment(cinematic);
  if (!fragment) {
    return prompt;
  }
  const normalizedPrompt = String(prompt).trim();
  // 标签前缀让模型识别这是导演级控制语句，避免被当成主体描述。
  const block = `Cinematic directive: ${fragment}.`;
  if (!normalizedPrompt) {
    return block;
  }
  if (normalizedPrompt.includes('Cinematic directive:')) {
    return normalizedPrompt;
  }
  return `${normalizedPrompt}\n\n${block}`;
}

const IMAGE_SINGLE_CANDIDATE_OUTPUT_CONSTRAINT = [
  '批量抽卡时每个请求只生成一张独立候选图。',
  'This request generates exactly one candidate image only.',
  'Return exactly one finished image composition for this request.',
  'Do not create a grid, collage, contact sheet, diptych, triptych, multi-panel layout, or multiple images inside one canvas.',
  'Do not create identical clone compositions or same face repeated within the image.',
].join('\n');

const IMAGE_BATCH_VARIATION_OPTION_BLUEPRINTS = [
  [
    'Variation direction: candidate #1 distinct facial identity blueprint.',
    'Identity recipe: long oval face shape, high cheekbones, almond eyes, straight brows over a clean brow bone, narrow nose bridge with a tapered tip, thin lips with a restrained mouth shape, refined jawline with a slim chin, smooth high hairline with an elongated hair silhouette, calm and aloof temperament. Facial identity must not match any other candidate in this draw; do not reuse the same face template.',
  ],
  [
    'Variation direction: candidate #2 distinct facial identity blueprint.',
    'Identity recipe: rounder heart-shaped face, softly raised cheekbones, large round eyes, soft arched brows with a gentle brow bone, small button nose with a short bridge, fuller lips with a bright mouth shape, soft tapered jawline with a neat chin, rounded hairline with a buoyant hair silhouette, warm and bright temperament. Facial identity must not match any other candidate in this draw; do not reuse the same face template.',
  ],
  [
    'Variation direction: candidate #3 distinct facial identity blueprint.',
    'Identity recipe: square face shape, angular cheekbones, deep-set eyes, thick straight brows with a pronounced brow bone, prominent straight nose bridge with a firm tip, firm mouth with medium-thin lips, strong jawline with a broad chin, low squared hairline with a blocky hair silhouette, stern and disciplined temperament. Facial identity must not match any other candidate in this draw; do not reuse the same face template.',
  ],
  [
    'Variation direction: candidate #4 distinct facial identity blueprint.',
    'Identity recipe: sharp V-shaped face, carved cheekbones, upturned eyes, sharply arched brows over a lifted brow bone, refined narrow nose bridge with a pointed tip, medium lips with a sly mouth shape, crisp jawline with a pointed chin, clean widow peak hairline with a tapered hair silhouette, sly and confident temperament. Facial identity must not match any other candidate in this draw; do not reuse the same face template.',
  ],
  [
    'Variation direction: candidate #5 distinct facial identity blueprint.',
    'Identity recipe: broad face shape, low wide cheekbones, hooded eyes, heavy brows with a dense brow bone, blunt nose bridge with a broad tip, wide mouth with flatter lips, sturdy jawline with a blunt chin, low straight hairline with a wide hair silhouette, grounded and stoic temperament. Facial identity must not match any other candidate in this draw; do not reuse the same face template.',
  ],
  [
    'Variation direction: candidate #6 distinct facial identity blueprint.',
    'Identity recipe: delicate narrow face, gentle cheekbones, drooping eyes, soft low brows with a subtle brow bone, small narrow nose bridge with a softened tip, small mouth with soft lips, slim jawline with a short rounded chin, wispy uneven hairline with a compact hair silhouette, gentle and melancholic temperament. Facial identity must not match any other candidate in this draw; do not reuse the same face template.',
  ],
] as const;

function appendSingleCandidateOutputConstraint(prompt: string): string {
  const normalizedPrompt = String(prompt).trim();

  if (!normalizedPrompt) {
    return IMAGE_SINGLE_CANDIDATE_OUTPUT_CONSTRAINT;
  }

  if (normalizedPrompt.includes('This request generates exactly one candidate image only.')) {
    return normalizedPrompt;
  }

  return `${normalizedPrompt}\n\n${IMAGE_SINGLE_CANDIDATE_OUTPUT_CONSTRAINT}`;
}

const IMAGE_BATCH_VARIANT_STRATEGY = 'linghui-parallel-diverse-prompts-v4';
const IMAGE_BATCH_CANDIDATE_SELECTION_MAX_RETRIES = 2;
const IMAGE_BATCH_MIN_REROLL_BUFFER = 2;
const IMAGE_BATCH_QUALITY_GUARDRAILS = [
  'Produce a concrete non-abstract character image.',
  'Ensure a clear readable subject with one concrete character or portrait as the obvious focus.',
  'no abstract texture.',
  'no symbolic pattern.',
  'no empty scene.',
  'Avoid subjectless backgrounds, texture-only compositions, flat color fields, placeholder silhouettes, and unreadable noisy artifacts.',
] as const;

type LinghuiBatchVariantRequest = Parameters<typeof generateImageVariantsWithProvider>[0]['variants'][number];
type LinghuiBatchVariantSharedParams = Omit<Parameters<typeof generateImageVariantsWithProvider>[0], 'variants'>;
type LinghuiBatchCandidateSelectionMetadata = {
  enabled: true;
  status: 'ok' | 'unknown';
  attempts: number;
  maxAttempts: number;
  rerolledCount: number;
  unresolvedDuplicateCount: number;
  candidatePoolSize: number;
  selectedCount: number;
  invalidRejectedCount: number;
  similarRejectedCount: number;
  qualityUnknownCount: number;
  reason?: string;
};
type LinghuiBatchCandidateRecord = {
  item: LinghuiImageMediaItem;
  quality: LinghuiImageCandidateQualityResult;
  poolCandidateIndex: number;
};
type LinghuiBatchCandidateSelectionPass = {
  status: 'ok' | 'unknown';
  reason?: string;
  qualityApproved: LinghuiBatchCandidateRecord[];
  uniqueSelected: LinghuiBatchCandidateRecord[];
  similarFallbackCandidates: LinghuiBatchCandidateRecord[];
  invalidRejectedCount: number;
  similarRejectedCount: number;
  qualityUnknownCount: number;
};

function resolveBatchVariantBlueprint(index: number) {
  return IMAGE_BATCH_VARIATION_OPTION_BLUEPRINTS[
    index % IMAGE_BATCH_VARIATION_OPTION_BLUEPRINTS.length
  ];
}

function resolveInitialCandidatePoolSize(count: number): number {
  return Math.max(count, Math.min(count * 2, count + 4));
}

function resolveRerollCandidateCount(missingCount: number): number {
  return Math.max(IMAGE_BATCH_MIN_REROLL_BUFFER, missingCount * 2);
}

function buildBatchIdentityExtensionInstructions(params: {
  candidateOrdinal: number;
  requestedCount: number;
  blueprintIndex: number;
  rerollAttempt: number;
}): string[] {
  const blueprintCycle = Math.floor(params.blueprintIndex / IMAGE_BATCH_VARIATION_OPTION_BLUEPRINTS.length);
  if (blueprintCycle <= 0) {
    return [];
  }

  const alternateSeed = `${params.candidateOrdinal}-${params.requestedCount}-${params.rerollAttempt}-${blueprintCycle}`;
  return [
    `Alternate identity seed ${alternateSeed}. This candidate extends beyond the base blueprint list.`,
    'Treat the repeated blueprint only as a loose direction; invent a fresh facial template with different facial geometry, eye spacing, nose bridge, mouth shape, jawline rhythm, hairline silhouette, and thumbnail silhouette.',
  ];
}

function buildBatchVariantPromptFromBlueprint(
  prompt: string,
  count: number,
  candidateIndex: number,
  blueprint: (typeof IMAGE_BATCH_VARIATION_OPTION_BLUEPRINTS)[number],
  extraInstructions: string[] = [],
): string {
  return [
    appendSingleCandidateOutputConstraint(prompt),
    `Linghui draw candidate #${candidateIndex} of ${count}.`,
    `This request generates candidate #${candidateIndex} only.`,
    `Design a distinct facial identity for candidate #${candidateIndex}. Do not share face shape, eye shape, nose, mouth, jawline, eyebrow structure, cheekbone pattern, hairline silhouette, or overall face template with other candidates. Facial identity must not match any other candidate in this draw; do not reuse the same face template.`,
    `Variation option ${candidateIndex}: ${blueprint[0]}`,
    blueprint[1],
    'Keep the original prompt locked on the same main subject, gender, age range, outfit category, world setting, and overall style/theme. Do not drift into a different gender, age group, species, subject, costume class, or genre.',
    'Preserve the original clothing category, narrative premise, and rendering style while only changing the candidate-specific facial identity recipe and compatible styling accents.',
    'Make this candidate visibly different from the other batch candidates at thumbnail size.',
    'Forbidden: no grid, no collage, no contact sheet, no multi-panel, no identical clone, no same face repeated.',
    ...IMAGE_BATCH_QUALITY_GUARDRAILS,
    ...extraInstructions,
  ].join('\n');
}

function buildBatchVariantPrompt(params: {
  prompt: string;
  requestedCount: number;
  totalCandidateCountHint: number;
  candidateOrdinal: number;
  rerollAttempt?: number;
  fillSlot?: number;
}): string {
  const rerollAttempt = Math.max(0, Number(params.rerollAttempt ?? 0));
  const blueprintIndex = (params.candidateOrdinal - 1) + (rerollAttempt * params.requestedCount);
  const extraInstructions = [
    ...buildBatchIdentityExtensionInstructions({
      candidateOrdinal: params.candidateOrdinal,
      requestedCount: params.requestedCount,
      blueprintIndex,
      rerollAttempt,
    }),
  ];

  if (rerollAttempt > 0) {
    const fillSlot = Math.max(1, Math.min(params.requestedCount, Number(params.fillSlot ?? 1)));
    extraInstructions.push(
      `REROLL fill slot #${fillSlot} for requested batch of ${params.requestedCount}.`,
      `Retry round ${rerollAttempt} of ${IMAGE_BATCH_CANDIDATE_SELECTION_MAX_RETRIES}.`,
      'avoid abstract output.',
      'must show a concrete character/portrait.',
      'avoid same facial template.',
      'use an aggressively different facial identity recipe.',
      'Push the facial geometry farther away from previous candidates by changing face shape, orbital structure, nose bridge, mouth proportions, jawline, cheekbone rhythm, perceived age cues, and hairline silhouette while keeping the same subject, outfit category, and world setting.',
      'Anti-clone enforcement: avoid same person energy, same facial geometry, same crop rhythm, same lighting rhythm, and same thumbnail silhouette as any previous candidate in this batch.',
    );
  } else if (params.candidateOrdinal > params.requestedCount) {
    extraInstructions.push(
      `Oversampled candidate pool entry #${params.candidateOrdinal}. This candidate exists to enlarge the candidate pool for quality and diversity selection; push stronger facial divergence while preserving the same core subject, outfit category, and world setting.`,
    );
  }

  return buildBatchVariantPromptFromBlueprint(
    params.prompt,
    params.totalCandidateCountHint,
    params.candidateOrdinal,
    resolveBatchVariantBlueprint(blueprintIndex),
    extraInstructions,
  );
}

function buildBatchVariantMetadata(extraMetadata?: Record<string, unknown>): Record<string, unknown> {
  return {
    batchMode: 'parallel-variant-prompts',
    variantStrategy: IMAGE_BATCH_VARIANT_STRATEGY,
    ...(extraMetadata ?? {}),
  };
}

function createBatchVariantRequest(params: {
  prompt: string;
  requestedCount: number;
  totalCandidateCountHint: number;
  candidateOrdinal: number;
  title: string;
  placeholderBase: string;
  rerollAttempt?: number;
  fillSlot?: number;
}): LinghuiBatchVariantRequest {
  const rerollAttempt = Math.max(0, Number(params.rerollAttempt ?? 0));
  const fillSlot = params.fillSlot ? Math.max(1, Math.min(params.requestedCount, params.fillSlot)) : undefined;

  return {
    label: `#${params.candidateOrdinal}`,
    prompt: buildBatchVariantPrompt({
      prompt: params.prompt,
      requestedCount: params.requestedCount,
      totalCandidateCountHint: params.totalCandidateCountHint,
      candidateOrdinal: params.candidateOrdinal,
      rerollAttempt,
      fillSlot,
    }),
    placeholderTitle: params.title,
    placeholderSubtitle: rerollAttempt > 0
      ? `${params.placeholderBase} · 候选 #${params.candidateOrdinal} · 补位 #${fillSlot ?? 1} · 重抽 ${rerollAttempt}`
      : `${params.placeholderBase} · 候选 #${params.candidateOrdinal}`,
    metadata: buildBatchVariantMetadata({
      candidateIndex: params.candidateOrdinal,
      requestedBatchCount: params.requestedCount,
      totalCandidateCountHint: params.totalCandidateCountHint,
      ...(typeof fillSlot === 'number' ? { fillSlot } : {}),
      ...(rerollAttempt > 0 ? { similarityRerollAttempt: rerollAttempt } : {}),
    }),
  };
}

function relabelSelectedBatchItem(
  record: LinghuiBatchCandidateRecord,
  index: number,
): LinghuiImageMediaItem {
  const originalLabel = String(record.item.label ?? `#${record.poolCandidateIndex}`).trim() || `#${record.poolCandidateIndex}`;

  return {
    ...record.item,
    label: `#${index + 1}`,
    metadata: {
      ...(record.item.metadata ?? {}),
      candidateSelection: {
        originalLabel,
        poolCandidateIndex: record.poolCandidateIndex,
        qualityStatus: record.quality.status,
        qualityVerdict: record.quality.verdict,
        qualityClassification: record.quality.classification,
        ...(record.quality.reason ? { qualityReason: record.quality.reason } : {}),
      },
    },
  };
}

async function evaluateBatchCandidatePool(
  records: LinghuiBatchCandidateRecord[],
): Promise<LinghuiBatchCandidateSelectionPass> {
  const qualityApproved: LinghuiBatchCandidateRecord[] = [];
  let invalidRejectedCount = 0;
  let qualityUnknownCount = 0;

  records.forEach((record) => {
    if (record.quality.status === 'unknown') {
      qualityUnknownCount += 1;
      qualityApproved.push(record);
      return;
    }

    if (record.quality.verdict === 'reject') {
      invalidRejectedCount += 1;
      return;
    }

    qualityApproved.push(record);
  });

  if (qualityApproved.length < 2) {
    return {
      status: 'ok',
      qualityApproved,
      uniqueSelected: qualityApproved,
      similarFallbackCandidates: [],
      invalidRejectedCount,
      similarRejectedCount: 0,
      qualityUnknownCount,
    };
  }

  const analysis = await analyzeLinghuiImageBatchSimilarity(qualityApproved.map(record => record.item));
  if (analysis.status === 'unknown') {
    return {
      status: 'unknown',
      reason: analysis.reason,
      qualityApproved,
      uniqueSelected: qualityApproved,
      similarFallbackCandidates: [],
      invalidRejectedCount,
      similarRejectedCount: 0,
      qualityUnknownCount,
    };
  }

  const duplicateIndices = new Set<number>(analysis.duplicates.map(item => item.duplicateIndex));
  const uniqueSelected = qualityApproved.filter((_record, index) => !duplicateIndices.has(index));
  const similarFallbackCandidates = qualityApproved.filter((_record, index) => duplicateIndices.has(index));

  return {
    status: 'ok',
    qualityApproved,
    uniqueSelected,
    similarFallbackCandidates,
    invalidRejectedCount,
    similarRejectedCount: duplicateIndices.size,
    qualityUnknownCount,
  };
}

async function generateBatchImagesWithCandidateSelection(params: {
  prompt: string;
  count: number;
  title: string;
  placeholderBase: string;
  sharedParams: LinghuiBatchVariantSharedParams;
}): Promise<{
  items: LinghuiImageMediaItem[];
  candidateSelection: LinghuiBatchCandidateSelectionMetadata;
}> {
  const candidateSelection: LinghuiBatchCandidateSelectionMetadata = {
    enabled: true,
    status: 'ok',
    attempts: 0,
    maxAttempts: IMAGE_BATCH_CANDIDATE_SELECTION_MAX_RETRIES,
    rerolledCount: 0,
    unresolvedDuplicateCount: 0,
    candidatePoolSize: 0,
    selectedCount: 0,
    invalidRejectedCount: 0,
    similarRejectedCount: 0,
    qualityUnknownCount: 0,
  };
  const candidateRecords: LinghuiBatchCandidateRecord[] = [];
  let nextCandidateOrdinal = 1;

  const appendCandidateBatch = async (options: {
    batchSize: number;
    rerollAttempt?: number;
    selectedCount?: number;
    missingCount?: number;
  }): Promise<void> => {
    const rerollAttempt = Math.max(0, Number(options.rerollAttempt ?? 0));
    const selectedCount = Math.max(0, Number(options.selectedCount ?? 0));
    const missingCount = Math.max(1, Number(options.missingCount ?? Math.max(1, params.count - selectedCount)));
    const totalCandidateCountHint = nextCandidateOrdinal + options.batchSize - 1;
    const variants = Array.from({ length: options.batchSize }, (_unused, index) => createBatchVariantRequest({
      prompt: params.prompt,
      requestedCount: params.count,
      totalCandidateCountHint,
      candidateOrdinal: nextCandidateOrdinal + index,
      title: params.title,
      placeholderBase: params.placeholderBase,
      rerollAttempt,
      fillSlot: rerollAttempt > 0
        ? Math.min(params.count, selectedCount + 1 + (index % missingCount))
        : undefined,
    }));

    if (rerollAttempt > 0) {
      candidateSelection.attempts = rerollAttempt;
      candidateSelection.rerolledCount += variants.length;
    }

    const items = await generateImageVariantsWithProvider({
      ...params.sharedParams,
      variants,
    });
    const qualities = await Promise.all(items.map(item => analyzeLinghuiImageCandidateQuality(item)));

    items.forEach((item, index) => {
      const quality = qualities[index] ?? {
        status: 'unknown',
        verdict: 'unknown',
        classification: 'unknown',
        reason: 'quality-analysis-missing',
      } as LinghuiImageCandidateQualityResult;

      candidateRecords.push({
        item,
        quality,
        poolCandidateIndex: nextCandidateOrdinal + index,
      });
    });

    nextCandidateOrdinal += variants.length;
    candidateSelection.candidatePoolSize = candidateRecords.length;
  };

  await appendCandidateBatch({
    batchSize: resolveInitialCandidatePoolSize(params.count),
  });

  let selectionPass = await evaluateBatchCandidatePool(candidateRecords);
  if (selectionPass.status === 'unknown') {
    candidateSelection.status = 'unknown';
    candidateSelection.reason = selectionPass.reason;
  }

  for (
    let attempt = 1;
    attempt <= IMAGE_BATCH_CANDIDATE_SELECTION_MAX_RETRIES && selectionPass.uniqueSelected.length < params.count;
    attempt += 1
  ) {
    const missingCount = params.count - selectionPass.uniqueSelected.length;
    await appendCandidateBatch({
      batchSize: resolveRerollCandidateCount(missingCount),
      rerollAttempt: attempt,
      selectedCount: selectionPass.uniqueSelected.length,
      missingCount,
    });

    selectionPass = await evaluateBatchCandidatePool(candidateRecords);
    if (selectionPass.status === 'unknown') {
      candidateSelection.status = 'unknown';
      candidateSelection.reason = selectionPass.reason;
    }
  }

  candidateSelection.invalidRejectedCount = selectionPass.invalidRejectedCount;
  candidateSelection.similarRejectedCount = selectionPass.similarRejectedCount;
  candidateSelection.qualityUnknownCount = selectionPass.qualityUnknownCount;

  const uniqueSelected = selectionPass.uniqueSelected.slice(0, params.count);
  const usedPoolIndices = new Set(uniqueSelected.map(record => record.poolCandidateIndex));
  const preferredFallbackPoolIndices = new Set(selectionPass.similarFallbackCandidates.map(record => record.poolCandidateIndex));
  const preferredFallbackCandidates = selectionPass.similarFallbackCandidates.filter(
    record => !usedPoolIndices.has(record.poolCandidateIndex),
  );
  const secondaryFallbackCandidates = candidateRecords.filter(
    record => !usedPoolIndices.has(record.poolCandidateIndex)
      && !preferredFallbackPoolIndices.has(record.poolCandidateIndex),
  );

  candidateSelection.unresolvedDuplicateCount = Math.max(0, params.count - uniqueSelected.length);

  const items = uniqueSelected
    .concat(preferredFallbackCandidates)
    .concat(secondaryFallbackCandidates)
    .slice(0, params.count)
    .map((record, index) => relabelSelectedBatchItem(record, index));

  candidateSelection.selectedCount = items.length;

  return {
    items,
    candidateSelection,
  };
}

function resolveStreamingProgress(accumulated: string, base = 18, cap = 92): number {
  return Math.max(base, Math.min(cap, base + Math.floor(accumulated.trim().length / 48)));
}

export async function executeTextNode(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const {
    mode = 'manual',
    content = '',
    prompt = '',
    systemPrompt = '',
    llmSelection = '',
  } = node.properties as unknown as LinghuiTextNodeProperties;

  if (mode === 'manual') {
    const normalizedContent = String(content).trim();
    if (!normalizedContent) {
      throw new Error('请先输入文本内容');
    }

    return {
      kind: 'text',
      text: normalizedContent,
      metadata: { mode: 'manual' },
    };
  }

  const promptReferences = node.getPromptReferences();
  const textSnippets = collectTextSnippets([
    ...node.getAllInputResults(1),
    ...node.getAllInputResults(2),
    ...node.getAllInputResults(3),
  ]);
  const promptWithTextInputs = mergePromptWithTextInputs(String(prompt).trim(), textSnippets);
  const promptWithRefs = promptReferences.length > 0
    ? compileLinghuiPromptReferences({
        prompt: promptWithTextInputs,
        references: promptReferences,
        replacementStrategy: 'readable-name',
      }).compiledPrompt
    : promptWithTextInputs;

  if (!promptWithRefs) {
    throw new Error('请先输入生成文本的提示词');
  }

  const generatedText = await generateTextWithProvider({
    prompt: promptWithRefs,
    systemPrompt: String(systemPrompt).trim(),
    llmSelection: String(llmSelection),
    settingsSnapshot: node.settingsSnapshot,
    onChunk: (_delta, accumulated) => {
      onProgress?.(
        resolveStreamingProgress(accumulated),
        '文本生成中',
        {
          kind: 'text',
          text: accumulated,
          metadata: {
            mode: 'generate',
            prompt: String(prompt).trim(),
            systemPrompt: String(systemPrompt).trim(),
            partial: true,
          },
        },
      );
    },
    signal,
  });

  return {
    kind: 'text',
    text: generatedText.trim(),
    metadata: {
      mode: 'generate',
      prompt: String(prompt).trim(),
      systemPrompt: String(systemPrompt).trim(),
    },
  };
}

export async function executeAgentNode(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const {
    prompt = '',
    systemPrompt = '',
    llmSelection = '',
    enabledTools = [],
    maxIterations = 6,
  } = node.properties as unknown as LinghuiAgentNodeProperties;

  const promptReferences = node.getPromptReferences();
  const textSnippets = collectTextSnippets(node.getAllInputResults(1));
  const promptWithTextInputs = mergePromptWithTextInputs(String(prompt).trim(), textSnippets);
  const compiledPrompt = promptReferences.length > 0
    ? compileLinghuiPromptReferences({
        prompt: promptWithTextInputs,
        references: promptReferences,
        replacementStrategy: 'readable-name',
      }).compiledPrompt
    : promptWithTextInputs;

  if (!compiledPrompt.trim()) {
    throw new Error('请先输入 Agent 提示词');
  }

  const imageSources = collectReferenceSources(node.getAllInputResults(0));
  const execution = await runAgentWithProvider({
    prompt: compiledPrompt,
    systemPrompt: String(systemPrompt).trim(),
    llmSelection: String(llmSelection),
    enabledTools: Array.isArray(enabledTools) ? enabledTools.map(item => String(item)) : [],
    maxIterations: Number(maxIterations ?? 6),
    imageSources,
    inputTextCount: textSnippets.length,
    settingsSnapshot: node.settingsSnapshot,
    onChunk: (_delta, accumulated) => {
      onProgress?.(
        resolveStreamingProgress(accumulated, 20, 95),
        'Agent 输出中',
        {
          kind: 'text',
          text: accumulated,
          metadata: {
            mode: 'agent',
            prompt: String(prompt).trim(),
            systemPrompt: String(systemPrompt).trim(),
            llmSelection: String(llmSelection),
            enabledTools: Array.isArray(enabledTools) ? enabledTools.map(item => String(item)) : [],
            maxIterations: Number(maxIterations ?? 6),
            observedToolRounds: 0,
            toolTrace: [],
            inputTextCount: textSnippets.length,
            inputImageCount: imageSources.length,
            partial: true,
          } as LinghuiAgentExecutionMetadata,
        },
      );
    },
    onProgress,
    signal,
  });

  return {
    kind: 'text',
    text: execution.text.trim(),
    metadata: execution.metadata,
  };
}

export async function executeImageNode(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const source = String(node.properties.source ?? '').trim();
  const properties = node.properties as unknown as LinghuiImageNodeProperties;
  const mode = resolveImageNodeMode({ source, mode: properties.mode });
  const prompt = String(node.properties.prompt ?? '').trim();
  const ttiSelection = String(node.properties.ttiSelection ?? '');
  const batchCount = Math.max(1, Math.min(4, Number(node.properties.batchCount ?? 1)));
  const focusRegion = normalizeLinghuiImageFocusRegion(properties.focusRegion);
  const markPoints = normalizeLinghuiImageMarkPoints(properties.markPoints);
  const activeMarkPoints = markPoints.filter(point => point.enabled);
  const cinematic = normalizeLinghuiImageCinematicConfig(properties.cinematic);
  const hasCinematicDirective = (
    cinematic.lighting !== 'auto'
    || cinematic.focalLength !== 'auto'
    || cinematic.aperture !== 'auto'
  );
  // 画布 UI 选的比例 / 分辨率以前在执行器这层就被丢了 —— provider 永远拿不到用户的选择。
  // 这里收集起来，下面所有 generateImageWithProvider / 批量调用统一透传到 provider.start。
  const aspectRatio = String(properties.aspectRatio ?? '').trim() || undefined;
  const resolution = String(properties.resolution ?? '').trim() || undefined;
  const multiAngleConfig = properties.multiAngle?.enabled === true
    ? {
        endpointPath: properties.multiAngle.endpointPath,
        promptProtocol: properties.multiAngle.promptProtocol,
        azimuth: properties.multiAngle.azimuth,
        elevation: properties.multiAngle.elevation,
        distance: properties.multiAngle.distance,
        sourceReferenceIndex: 0,
      }
    : null;

  if (mode === 'import') {
    const importItems = getLinghuiImageImportItems(properties);
    const primaryImport = resolveLinghuiImagePrimaryImportItem(properties);
    if (!importItems.length) {
      throw new Error('请先上传图片素材');
    }

    const items = importItems.map(item => buildMediaItem({
      kind: 'image',
      source: item.source,
      label: item.label || node.title,
      width: item.width,
      height: item.height,
      mimeType: item.mimeType,
      metadata: item.aspectRatio ? { aspectRatio: item.aspectRatio } : undefined,
    }));
    const primary = items.find(item => item.source === primaryImport?.source) ?? items[0];
    const metadata = { source: primary?.source ?? source, mode: 'import', itemCount: items.length };

    if (items.length > 1) {
      return {
        kind: 'images',
        primary,
        items,
        metadata,
      };
    }

    return {
      kind: 'image',
      primary,
      metadata,
    };
  }

  const upstreamReferenceSources = collectReferenceSources(node.getAllInputImages());
  const textSnippets = collectTextSnippets(node.getAllInputResults(1));
  const promptReferences = node.getPromptReferences();
  const promptReferenceSources = collectLinghuiPromptReferenceImageSources(promptReferences);
  const focusRegionReferenceSources = focusRegion?.enabled && focusRegion.source ? [focusRegion.source] : [];
  const markPointReferenceSources = activeMarkPoints.map(point => point.source).filter(Boolean) as string[];
  const referenceSources = mergeUniqueSources(
    upstreamReferenceSources,
    focusRegionReferenceSources,
    markPointReferenceSources,
    promptReferenceSources,
  );
  const explicitPrompt = mergePromptWithTextInputs(prompt, textSnippets);
  const effectivePrompt = mergePromptWithTextInputs(prompt || node.title, textSnippets);
  const explicitPromptWithFocus = appendImageCinematicInstruction(
    appendImageMarkInstruction(
      appendImageFocusInstruction(explicitPrompt, focusRegion),
      activeMarkPoints,
    ),
    cinematic,
  );
  const effectivePromptWithFocus = appendImageCinematicInstruction(
    appendImageMarkInstruction(
      appendImageFocusInstruction(effectivePrompt, focusRegion),
      activeMarkPoints,
    ),
    cinematic,
  );
  const count = batchCount;
  const placeholderSubtitle = focusRegion?.enabled
    ? '聚焦区域生成'
    : hasCinematicDirective
      ? '电影感生成'
      : (prompt || '图片占位预览');
  const multiAnglePlaceholderSubtitle = focusRegion?.enabled
    ? '聚焦区域生成'
    : hasCinematicDirective
      ? '电影感多角度生成'
      : (prompt || '多角度图片占位预览');

  if (multiAngleConfig) {
    if (!upstreamReferenceSources.length) {
      imageExecutionLogger.warn('灵绘图片节点多角度执行缺少上游图片，保持失败', {
        nodeId: node.id,
        title: node.title,
        promptLength: explicitPrompt.trim().length,
        textInputCount: textSnippets.length,
        ttiSelection,
      });
      throw new Error('多角度生图需要先连接一张上游图片');
    }

    const image = await generateImageWithProvider({
      prompt: explicitPromptWithFocus,
      referenceSources: upstreamReferenceSources,
      ttiSelection,
      aspectRatio,
      resolution,
      promptReferences: [],
      settingsSnapshot: node.settingsSnapshot,
      multiAngle: multiAngleConfig,
      onProgress,
      placeholderTitle: node.title,
      placeholderSubtitle: multiAnglePlaceholderSubtitle,
      signal,
    });

    return {
      kind: 'image',
      primary: image,
      metadata: {
        prompt,
        mode: 'multi-angle',
        multiAngle: properties.multiAngle,
        ...(focusRegion?.enabled ? { focusRegion } : {}),
        ...(activeMarkPoints.length ? { markPoints: activeMarkPoints } : {}),
        ...(hasCinematicDirective ? { cinematic } : {}),
      },
    };
  }

  if (count > 1) {
    const batchResult = await generateBatchImagesWithCandidateSelection({
      prompt: effectivePromptWithFocus,
      count,
      title: node.title,
      placeholderBase: placeholderSubtitle,
      sharedParams: {
        referenceSources,
        ttiSelection,
        aspectRatio,
        resolution,
        promptReferences,
        settingsSnapshot: node.settingsSnapshot,
        onProgress,
        placeholderTitle: node.title,
        placeholderSubtitle,
        signal,
      },
    });

    const primary = batchResult.items[0];
    if (!primary) {
      throw new Error('图片生成未返回有效结果');
    }

    return {
      kind: 'images',
      primary,
      items: batchResult.items,
      metadata: {
        prompt,
        batchCount: count,
        batchMode: 'parallel-variant-prompts',
        variantStrategy: IMAGE_BATCH_VARIANT_STRATEGY,
        candidateSelection: batchResult.candidateSelection,
        similarityDedupe: batchResult.candidateSelection,
        mode: 'generate',
        ...(focusRegion?.enabled ? { focusRegion } : {}),
        ...(activeMarkPoints.length ? { markPoints: activeMarkPoints } : {}),
        ...(hasCinematicDirective ? { cinematic } : {}),
      },
    };
  }

  const image = await generateImageWithProvider({
    prompt: effectivePromptWithFocus,
    referenceSources,
    ttiSelection,
    aspectRatio,
    resolution,
    promptReferences,
    settingsSnapshot: node.settingsSnapshot,
    onProgress,
    placeholderTitle: node.title,
    placeholderSubtitle,
    signal,
  });

  return {
    kind: 'image',
    primary: image,
    metadata: {
      prompt,
      mode: 'generate',
      ...(focusRegion?.enabled ? { focusRegion } : {}),
      ...(activeMarkPoints.length ? { markPoints: activeMarkPoints } : {}),
      ...(hasCinematicDirective ? { cinematic } : {}),
    },
  };
}

/**
 * 全景节点执行：把用户 prompt 通过 PANORAMA_SYSTEM_PROMPT 模板包成 720° 投影提示词，
 * 再委托给 executeImageNode 复用全部图片生成逻辑（参考图、批量、占位 / 流式 / TaskManager 桥接等）。
 *
 * 通过"创建一个 properties.prompt 已替换的 NodeView"实现，原图片节点路径完全不感知全景，
 * 也就不再需要 LinghuiImageNodeProperties.panoramaMode 这种污染字段。
 */
export async function executePanoramaNode(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const originalPrompt = String(node.properties.prompt ?? '');
  const rawTemplate = String(node.properties.panoramaTemplate ?? 'auto');
  const templateKind: PanoramaTemplateKind = rawTemplate === 'indoor' || rawTemplate === 'outdoor'
    ? rawTemplate
    : 'auto';
  const panoramaModelKey = String(node.properties.panoramaModelKey ?? LIBTV_PANORAMA_SUBMIT_MODEL_KEY);
  const panoramaRatio = String(node.properties.aspectRatio ?? '').trim()
    || getLibTVPanoramaRatioForModel(panoramaModelKey);
  const panoramaQuality = String(node.properties.panoramaQuality ?? LIBTV_PANORAMA_SLASH_QUALITY);
  const panoramaSlashScene = String(node.properties.panoramaSlashScene ?? LIBTV_PANORAMA_SLASH_SCENE);
  const panoramaWithPromptScene = String(node.properties.panoramaWithPromptScene ?? LIBTV_PANORAMA_WITH_PROMPT_SCENE);
  const panoramaSlashLabel = String(node.properties.panoramaSlashLabel ?? LIBTV_PANORAMA_SLASH_LABEL);
  const projectionMode = resolvePanoramaProjectionMode(node.properties.projectionMode);
  const wrappedPrompt = compilePanoramaPrompt(originalPrompt, { templateKind, projectionMode });
  const wrappedNode: ExecutionNodeView = {
    ...node,
    properties: {
      ...node.properties,
      prompt: wrappedPrompt,
      aspectRatio: panoramaRatio,
      panoramaSlashScene,
      panoramaWithPromptScene,
      panoramaSlashLabel,
      panoramaModelKey,
      panoramaQuality,
    },
  };

  const result = await executeImageNode(wrappedNode, onProgress, signal);

  // 把编辑器侧 crop 出的方向细节图合并到 result.items，让下游能用 @ref_xxx__item_N 引用。
  // 编辑器 crop 出来的是 PNG dataUrl，必须落盘成 koma-local URL，
  // 否则 grok / 视频 provider 会因 transport 限制 reject。
  const rawDetailCrops = Array.isArray(node.properties.detailCrops) ? node.properties.detailCrops : [];
  interface DetailItem { kind: 'image'; source: string; label?: string; width?: number; height?: number; mimeType?: string }
  const detailItems: DetailItem[] = (await Promise.all(
    rawDetailCrops.map(async (crop, index): Promise<DetailItem | null> => {
      const source = typeof (crop as { source?: unknown })?.source === 'string' ? (crop as { source: string }).source : '';
      if (!source) return null;
      const label = typeof (crop as { label?: unknown })?.label === 'string' ? (crop as { label: string }).label : `方向 ${index + 1}`;
      const width = typeof (crop as { width?: unknown })?.width === 'number' ? (crop as { width: number }).width : undefined;
      const height = typeof (crop as { height?: unknown })?.height === 'number' ? (crop as { height: number }).height : undefined;
      const mimeType = typeof (crop as { mimeType?: unknown })?.mimeType === 'string' ? (crop as { mimeType: string }).mimeType : undefined;
      const persistedSource = await persistDirectorMediaSource({
        source,
        nodeId: node.id,
        slot: `panorama-detail-${index}`,
        mimeType: mimeType || 'image/png',
      });
      return { kind: 'image', source: persistedSource, label, width, height, mimeType };
    }),
  )).filter((value): value is DetailItem => value !== null);

  // 全景"伪 3D 视角"：用户在 PanoramaViewer 上抽取的虚拟相机角度产物。
  // 这些图已经在编辑器侧通过 panoramaPerspectiveExtractor 重采样并落盘，
  // 这里直接当 image collection item 输出给下游做场景一致性。
  const rawPerspectiveViews = Array.isArray(node.properties.perspectiveViews) ? node.properties.perspectiveViews : [];
  const perspectiveItems: DetailItem[] = (await Promise.all(
    rawPerspectiveViews.map(async (view, index): Promise<DetailItem | null> => {
      const source = typeof (view as { source?: unknown })?.source === 'string' ? (view as { source: string }).source : '';
      if (!source) return null;
      const label = typeof (view as { label?: unknown })?.label === 'string' ? (view as { label: string }).label : `视角 ${index + 1}`;
      const width = typeof (view as { width?: unknown })?.width === 'number' ? (view as { width: number }).width : undefined;
      const height = typeof (view as { height?: unknown })?.height === 'number' ? (view as { height: number }).height : undefined;
      // perspectiveViews.source 一般已经是 koma-local（PanoramaViewer 抽取时调 persistMediaAsset）；
      // 若仍是 dataUrl（比如老数据 / 离线场景），这里兜底落盘
      const persistedSource = await persistDirectorMediaSource({
        source,
        nodeId: node.id,
        slot: `panorama-view-${index}`,
        mimeType: 'image/png',
      });
      return { kind: 'image', source: persistedSource, label, width, height, mimeType: 'image/png' };
    }),
  )).filter((value): value is DetailItem => value !== null);

  let merged: LinghuiNodeResult = result;
  const extraItems = [...detailItems, ...perspectiveItems];
  if (extraItems.length > 0 && (result.kind === 'image' || result.kind === 'images')) {
    const baseItems = result.kind === 'images' ? result.items : [result.primary];
    const dedupe = new Set<string>();
    const items = [...baseItems, ...extraItems].filter(item => {
      const source = item.source || '';
      if (!source || dedupe.has(source)) return false;
      dedupe.add(source);
      return true;
    });
    merged = {
      ...result,
      kind: 'images',
      primary: result.primary,
      items,
    } as LinghuiNodeResult;
  }

  return {
    ...merged,
    metadata: {
      ...(merged.metadata ?? {}),
      mode: 'panorama',
      panoramaTemplate: templateKind,
      panoramaProjection: projectionMode,
      panoramaSlashScene,
      panoramaWithPromptScene,
      panoramaSlashLabel,
      panoramaModelKey,
      panoramaQuality,
      panoramaRatio,
      originalPrompt: originalPrompt.trim(),
      detailCropCount: detailItems.length,
      perspectiveViewCount: perspectiveItems.length,
    },
  } as LinghuiNodeResult;
}

export async function executeScriptNode(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const {
    mode = 'manual',
    content = '',
    prompt = '',
    systemPrompt = '',
    llmSelection = '',
  } = node.properties as unknown as LinghuiScriptNodeProperties;

  if (mode === 'manual') {
    const parsed = parseLinghuiScriptContent(String(content).trim());
    if (!parsed.shots.length) {
      throw new Error('请先输入可解析的脚本内容');
    }

    return {
      kind: 'storyboard',
      text: parsed.formattedText,
      primary: parsed.shots[0]?.image,
      shots: parsed.shots,
      metadata: {
        mode: 'manual',
        parseSource: parsed.source,
        rawContent: String(content).trim(),
      },
    };
  }

  const promptReferences = node.getPromptReferences();
  const textSnippets = collectTextSnippets([
    ...node.getAllInputResults(1),
    ...node.getAllInputResults(2),
  ]);
  const promptWithTextInputs = mergePromptWithTextInputs(String(prompt).trim(), textSnippets);
  const compiledPrompt = promptReferences.length > 0
    ? compileLinghuiPromptReferences({
        prompt: promptWithTextInputs,
        references: promptReferences,
        replacementStrategy: 'readable-name',
      }).compiledPrompt
    : promptWithTextInputs;

  if (!compiledPrompt.trim()) {
    throw new Error('请先输入脚本生成提示词');
  }

  const generatedText = await generateTextWithProvider({
    prompt: compiledPrompt,
    systemPrompt: buildScriptSystemPrompt(systemPrompt),
    llmSelection: String(llmSelection),
    settingsSnapshot: node.settingsSnapshot,
    onChunk: (_delta, accumulated) => {
      const partialParsed = parseLinghuiScriptContent(accumulated);
      onProgress?.(
        resolveStreamingProgress(accumulated, 20, 94),
        '脚本整理中',
        {
          kind: 'storyboard',
          text: partialParsed.formattedText || accumulated,
          shots: partialParsed.shots,
          primary: partialParsed.shots[0]?.image,
          metadata: {
            mode: 'generate',
            parseSource: partialParsed.source,
            prompt: String(prompt).trim(),
            systemPrompt: String(systemPrompt).trim(),
            rawGeneratedText: accumulated,
            partial: true,
          },
        },
      );
    },
    signal,
  });
  const parsed = parseLinghuiScriptContent(generatedText);

  if (!parsed.shots.length) {
    throw new Error('脚本生成结果无法解析成结构化镜头，请调整提示词后重试');
  }

  return {
    kind: 'storyboard',
    text: parsed.formattedText || formatLinghuiScriptShots(parsed.shots),
    primary: parsed.shots[0]?.image,
    shots: parsed.shots,
    metadata: {
      mode: 'generate',
      parseSource: parsed.source,
      prompt: String(prompt).trim(),
      systemPrompt: String(systemPrompt).trim(),
      rawGeneratedText: generatedText.trim(),
    },
  };
}

/**
 * 故事板节点执行：剧情大纲 → 结构化分镜的傻瓜版。
 *
 * 与 script 节点相比：
 *  - 没有 manual 模式：未填剧情直接报错，不解析任何遗留 content
 *  - systemPrompt 完全由 buildStoryboardSystemPrompt 内置生成，用户不可改
 *  - 复用 generateText / parseLinghuiScriptContent，输出同样的 storyboard kind result，
 *    让现有 "派生镜头文本 / 生成分镜图 / 生成视频流程" 链路无需任何改动
 */
export async function executeStoryboardNode(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const prompt = String(node.properties.prompt ?? '').trim();
  const llmSelection = String(node.properties.llmSelection ?? '');
  const targetShotCount = Number(node.properties.targetShotCount ?? 8);

  if (!prompt) {
    throw new Error('请先输入剧情大纲');
  }

  const promptReferences = node.getPromptReferences();
  const textSnippets = collectTextSnippets([
    ...node.getAllInputResults(1),
    ...node.getAllInputResults(2),
  ]);
  const promptWithTextInputs = mergePromptWithTextInputs(prompt, textSnippets);
  const compiledPrompt = promptReferences.length > 0
    ? compileLinghuiPromptReferences({
        prompt: promptWithTextInputs,
        references: promptReferences,
        replacementStrategy: 'readable-name',
      }).compiledPrompt
    : promptWithTextInputs;

  const systemPrompt = buildStoryboardSystemPrompt(targetShotCount);

  const generatedText = await generateTextWithProvider({
    prompt: compiledPrompt,
    systemPrompt,
    llmSelection,
    settingsSnapshot: node.settingsSnapshot,
    onChunk: (_delta, accumulated) => {
      const partialParsed = parseLinghuiScriptContent(accumulated);
      onProgress?.(
        resolveStreamingProgress(accumulated, 20, 94),
        '故事板生成中',
        {
          kind: 'storyboard',
          text: partialParsed.formattedText || accumulated,
          shots: partialParsed.shots,
          primary: partialParsed.shots[0]?.image,
          metadata: {
            mode: 'storyboard',
            parseSource: partialParsed.source,
            prompt,
            targetShotCount,
            rawGeneratedText: accumulated,
            partial: true,
          },
        },
      );
    },
    signal,
  });

  const parsed = parseLinghuiScriptContent(generatedText);
  if (!parsed.shots.length) {
    throw new Error('故事板生成结果无法解析成分镜，请调整剧情描述或更换 LLM 后重试');
  }

  return {
    kind: 'storyboard',
    text: parsed.formattedText || formatLinghuiScriptShots(parsed.shots),
    primary: parsed.shots[0]?.image,
    shots: parsed.shots,
    metadata: {
      mode: 'storyboard',
      parseSource: parsed.source,
      prompt,
      targetShotCount,
      rawGeneratedText: generatedText.trim(),
    },
  };
}

export async function executeVideoNode(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const source = String(node.properties.source ?? '').trim();
  const posterSource = String(node.properties.posterSource ?? '').trim();
  const prompt = String(node.properties.prompt ?? '').trim();
  const itvSelection = String(node.properties.itvSelection ?? '');
  const videoCapability = (node.properties.videoCapability ?? 'video.text-to-video') as LinghuiVideoCapability;
  const duration = Number(node.properties.duration ?? 5);
  const aspectRatio = String(node.properties.aspectRatio ?? '16:9');
  const resolution = String(node.properties.resolution ?? '720p');

  if (source) {
    return {
      kind: 'video',
      primary: buildMediaItem({
        kind: 'video',
        source,
        posterSource,
        label: node.title,
      }),
      metadata: { source, posterSource, mode: 'upload' },
    };
  }

  const imageReferenceSources = collectReferenceSources(node.getAllInputResults(0));
  const videoPosterSources = collectVideoPosterSources(node.getAllInputResults(3));
  const referenceSources = mergeUniqueSources(imageReferenceSources, videoPosterSources);
  const textSnippets = collectTextSnippets([
    ...node.getAllInputResults(1),
    ...node.getAllInputResults(2),
  ]);
  const promptReferences = node.getPromptReferences();
  const resolvedSources = resolveVideoCapabilitySources(videoCapability, referenceSources);
  const inputError = getVideoCapabilityInputError(videoCapability, resolvedSources);
  if (inputError) {
    throw new Error(inputError);
  }

  const primaryReferenceSource = resolvedSources.primaryImageSource || resolvedSources.startFrameSource;
  const primaryReferenceKey = buildLinghuiVisualSourceKey(primaryReferenceSource);
  const primaryReferenceId = primaryReferenceKey
    ? promptReferences.find(item => (
        buildLinghuiVisualSourceKey(item.source) === primaryReferenceKey
      ))?.id
    : undefined;
  const effectivePrompt = mergePromptWithTextInputs(prompt || node.title, textSnippets);

  const video = await generateVideoWithProvider({
    capability: videoCapability,
    prompt: effectivePrompt,
    primaryImageSource: resolvedSources.primaryImageSource,
    additionalReferenceSources: resolvedSources.additionalReferenceSources,
    referenceImageSources: resolvedSources.referenceImageSources,
    startFrameSource: resolvedSources.startFrameSource,
    endFrameSource: resolvedSources.endFrameSource,
    duration,
    aspectRatio,
    resolution,
    itvSelection,
    promptReferences,
    primaryReferenceId,
    settingsSnapshot: node.settingsSnapshot,
    onProgress,
    signal,
  });

  return {
    kind: 'video',
    primary: video,
    metadata: {
      prompt,
      capability: videoCapability,
      duration,
      aspectRatio,
      resolution,
      audioSource: getLinghuiResultPrimaryMedia(node.getInputResult(2))?.source,
      visualReferenceCount: resolvedSources.visualSources.length,
      imageReferenceCount: imageReferenceSources.length,
      videoReferenceCount: videoPosterSources.length,
    },
  };
}

export async function executeAudioNode(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const {
    source = '',
    prompt = '',
    ttsSelection = '',
    voiceId = '',
  } = node.properties as unknown as LinghuiAudioNodeProperties;
  const normalizedSource = String(source).trim();
  const normalizedPrompt = String(prompt).trim();
  const normalizedVoiceId = String(voiceId).trim();

  if (normalizedSource) {
    return {
      kind: 'audio',
      primary: buildMediaItem({
        kind: 'audio',
        source: normalizedSource,
        label: node.title,
      }),
      text: normalizedPrompt || undefined,
      metadata: { source: normalizedSource, mode: 'upload' },
    };
  }

  if (!normalizedPrompt) {
    const upstreamTextSnippets = collectTextSnippets([
      ...node.getAllInputResults(1),
      ...node.getAllInputResults(2),
      ...node.getAllInputResults(3),
    ]);
    if (!upstreamTextSnippets.length && node.getPromptReferences().length === 0) {
      throw new Error('请先上传音频，或输入要合成的文本');
    }
  }

  const promptReferences = node.getPromptReferences();
  const textSnippets = collectTextSnippets([
    ...node.getAllInputResults(1),
    ...node.getAllInputResults(2),
    ...node.getAllInputResults(3),
  ]);
  const promptWithTextInputs = mergePromptWithTextInputs(normalizedPrompt, textSnippets);
  const compiledPrompt = promptReferences.length > 0
    ? compileLinghuiPromptReferences({
        prompt: promptWithTextInputs,
        references: promptReferences,
        replacementStrategy: 'readable-name',
      }).compiledPrompt
    : promptWithTextInputs;

  if (!compiledPrompt.trim()) {
    throw new Error('请先上传音频，或输入要合成的文本');
  }

  const audio = await generateAudioWithProvider({
    text: compiledPrompt,
    ttsSelection: String(ttsSelection),
    voiceId: normalizedVoiceId || undefined,
    settingsSnapshot: node.settingsSnapshot,
    onProgress,
    signal,
  });

  return {
    kind: 'audio',
    primary: {
      ...audio,
      label: node.title,
    },
    text: compiledPrompt,
    metadata: {
      prompt: normalizedPrompt,
      compiledPrompt,
      voiceId: normalizedVoiceId || undefined,
      mode: 'tts',
      upstreamTextCount: textSnippets.length,
    },
  };
}

/**
 * 把 director3d / panorama 编辑器写到 properties 的 PNG dataUrl 落盘成 koma-local URL。
 *
 * 为什么必须落盘：
 *  - grok-imagine-itv 等渠道 assetTransports 只接受 'remote-url'，dataUrl 会被 reject
 *  - 视频 provider 多数要求文件路径，dataUrl 直接 fail
 *  - 工作区文档存 base64 字符串会撑爆 IndexedDB（一张 1280px lineart ≈ 500KB）
 *
 * 落盘失败（非 Electron / 写盘异常）时回退到原 dataUrl，保证不阻塞用户。
 */
async function persistDirectorMediaSource(params: {
  source: string;
  nodeId: string;
  slot: string;
  mimeType?: string;
}): Promise<string> {
  const { source, nodeId, slot, mimeType = 'image/png' } = params;
  if (!source || !source.startsWith('data:')) {
    return source;
  }
  try {
    const stored = await persistMediaAsset({
      projectId: 'linghui',
      kind: 'image',
      source,
      mimeType,
      provider: 'director3d-local',
      metadata: { nodeId, slot, origin: 'director3d-capture' },
    });
    if (stored.localPath) {
      // toFileSystemDisplayUrl 把绝对路径转 koma-local://files/...
      return toFileSystemDisplayUrl(stored.localPath) ?? stored.localPath;
    }
    return source;
  } catch (error) {
    // 在非 Electron 环境 / 写盘异常时静默回退
    return source;
  }
}

/**
 * 3D 导演节点执行：把编辑器导出的 lineartDataUrl 落盘后当作主输出。
 *
 * 不调用任何远程 provider —— 渲染发生在编辑器里（Director3DViewport.captureCurrentView），
 * 用户点击「导出线稿参考」按钮即可写入 properties.lineartDataUrl。
 * 执行节点时：
 *   1. 把 dataUrl 落盘成 koma-local URL（下游 image/video provider 才接受）
 *   2. angleViews 同样落盘
 *   3. 主图 + 多视角包装成 LinghuiNodeResult，下游图片/视频节点可直接引用
 *
 * 如果还没导出，节点会失败并提示用户先在编辑器里导出。
 */
export async function executeDirector3DNode(
  node: ExecutionNodeView,
  _onProgress?: NodeExecutionProgressHandler,
  _signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  const properties = node.properties as Record<string, unknown> | undefined;
  const lineartDataUrl = typeof properties?.lineartDataUrl === 'string' ? properties.lineartDataUrl : '';
  const directorPromptFragment = typeof properties?.directorPromptFragment === 'string' ? properties.directorPromptFragment : '';
  if (!lineartDataUrl) {
    throw new Error('请先在 3D 导演工作台编辑器里点击「导出线稿参考」');
  }

  const sceneJson = (() => {
    try {
      return JSON.stringify(properties?.scene ?? {});
    } catch {
      return '';
    }
  })();

  // 视频输出模式：用户在编辑器导出时间轴动画后，properties.timelineVideoUrl 已经
  // 是落盘 koma-local URL，直接打包成 video kind 给下游视频节点用（image-to-video / 视频参考）。
  const outputMode = properties?.outputMode === 'video' ? 'video' : 'lineart';
  const timelineVideoUrl = typeof properties?.timelineVideoUrl === 'string' ? properties.timelineVideoUrl : '';
  const timelineVideoPosterUrl = typeof properties?.timelineVideoPosterUrl === 'string' ? properties.timelineVideoPosterUrl : '';

  if (outputMode === 'video' && timelineVideoUrl) {
    const meta = (properties?.timelineVideoMeta ?? {}) as { duration?: number; fps?: number; frameCount?: number; width?: number; height?: number };
    // posterSource 优先用导出时落盘的首帧；缺失时回退到 lineartDataUrl 但仅当它已经是 koma-local
    const posterCandidate = timelineVideoPosterUrl
      || (lineartDataUrl.startsWith('koma-local://') ? lineartDataUrl : '');
    return {
      kind: 'video',
      primary: {
        kind: 'video',
        source: timelineVideoUrl,
        posterSource: posterCandidate || undefined,
        label: '3D 导演时间轴动画',
        mimeType: 'video/mp4',
        durationSec: typeof meta.duration === 'number' ? meta.duration : undefined,
        width: typeof meta.width === 'number' ? meta.width : undefined,
        height: typeof meta.height === 'number' ? meta.height : undefined,
      },
      metadata: {
        mode: 'director3d-video',
        directorPromptFragment,
        // description 写入 fragment：collectTextSnippets 自动喂给下游 video provider 的 prompt
        description: directorPromptFragment || undefined,
        scene: sceneJson,
        timeline: {
          duration: meta.duration,
          fps: meta.fps,
          frameCount: meta.frameCount,
        },
        // posterSource 显式标注：下游 image-to-video 用 posterSource 作为参考首帧
        posterSource: posterCandidate || undefined,
      },
    } as unknown as LinghuiNodeResult;
  }

  // 主图落盘：dataUrl → koma-local URL
  const persistedLineart = await persistDirectorMediaSource({
    source: lineartDataUrl,
    nodeId: node.id,
    slot: 'lineart',
  });

  const rawAngleViews = Array.isArray(properties?.angleViews) ? properties.angleViews : [];
  interface AngleItem { id: string; source: string; mimeType: string; label: string }
  // angleViews 落盘：每张并行 persist，失败回退到原 dataUrl
  const angleItems: AngleItem[] = (await Promise.all(
    rawAngleViews.map(async (view, index): Promise<AngleItem | null> => {
      const dataUrl = typeof (view as { dataUrl?: unknown })?.dataUrl === 'string' ? (view as { dataUrl: string }).dataUrl : '';
      if (!dataUrl) return null;
      const label = typeof (view as { label?: unknown })?.label === 'string' ? (view as { label: string }).label : `视角 ${index + 1}`;
      const id = typeof (view as { id?: unknown })?.id === 'string' ? (view as { id: string }).id : `angle-${index + 1}`;
      const persistedSource = await persistDirectorMediaSource({
        source: dataUrl,
        nodeId: node.id,
        slot: `angle-${id}`,
      });
      return { id: `director3d-${node.id}-${id}`, source: persistedSource, mimeType: 'image/png', label };
    }),
  )).filter((value): value is AngleItem => value !== null);

  const primaryItem = {
    id: `director3d-${node.id}`,
    source: persistedLineart,
    mimeType: 'image/png',
    label: '3D 导演线稿',
  };

  // 全局资产参考图聚合：把 scene.actors 上 snapshot 的 referenceImages 全部拼进 result.items，
  // 让下游图片节点拿到真实角色脸 / 服装 / 道具样式做参考。去重，按 actor.label 命名。
  interface ReferenceItem { id: string; source: string; mimeType: string; label: string }
  const referenceItems: ReferenceItem[] = [];
  const sceneActors = Array.isArray((properties?.scene as { actors?: unknown })?.actors)
    ? ((properties?.scene as { actors: unknown[] }).actors)
    : [];
  const seenReferenceUrls = new Set<string>();
  for (const actorRaw of sceneActors) {
    if (!actorRaw || typeof actorRaw !== 'object') continue;
    const actor = actorRaw as { label?: unknown; referenceImages?: unknown; id?: unknown };
    if (!Array.isArray(actor.referenceImages)) continue;
    const actorLabel = typeof actor.label === 'string' ? actor.label : '资产';
    const actorId = typeof actor.id === 'string' ? actor.id : 'unknown';
    let refIndex = 0;
    for (const url of actor.referenceImages) {
      if (typeof url !== 'string' || !url || seenReferenceUrls.has(url)) continue;
      seenReferenceUrls.add(url);
      refIndex += 1;
      referenceItems.push({
        id: `director3d-${node.id}-ref-${actorId}-${refIndex}`,
        source: url,
        mimeType: 'image/png',
        label: `${actorLabel} 参考图 ${refIndex}`,
      });
    }
  }

  const items = [primaryItem, ...angleItems, ...referenceItems];

  return {
    // angleViews / referenceImages 任一非空 → images 集合（用户可用 @ref_{nodeId}__item_N 引用）
    // 否则保持单图 kind，避免破坏既有节点行为
    kind: (angleItems.length > 0 || referenceItems.length > 0) ? 'images' : 'image',
    status: 'succeeded',
    label: '3D 导演线稿',
    items,
    primary: primaryItem,
    metadata: {
      mode: 'director3d',
      directorPromptFragment,
      // 把构图意图（机位 / 演员位置 / 姿态）同步写进 description，下游 image/video
      // executor 通过 collectTextSnippets → getLinghuiResultDescriptionText 会自动拼到
      // prompt 前面，避免"线稿能传，但镜头/姿态描述消失"的断链
      description: directorPromptFragment || undefined,
      scene: sceneJson,
      angleViewCount: angleItems.length,
      referenceImageCount: referenceItems.length,
    },
  } as unknown as LinghuiNodeResult;
}

async function executeNodeInner(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
): Promise<LinghuiNodeResult> {
  switch (node.type) {
    case 'linghui/text':
      return executeTextNode(node, onProgress, signal);
    case 'linghui/agent':
      return executeAgentNode(node, onProgress, signal);
    case 'linghui/image':
      return executeImageNode(node, onProgress, signal);
    case 'linghui/panorama':
      return executePanoramaNode(node, onProgress, signal);
    case 'linghui/video':
      return executeVideoNode(node, onProgress, signal);
    case 'linghui/audio':
      return executeAudioNode(node, onProgress, signal);
    case 'linghui/script':
      return executeScriptNode(node, onProgress, signal);
    case 'linghui/storyboard':
      return executeStoryboardNode(node, onProgress, signal);
    case 'linghui/director3d':
      return executeDirector3DNode(node, onProgress, signal);
    default:
      throw new Error(`暂不支持执行节点类型：${node.type}`);
  }
}

/**
 * 执行单个灵绘节点。
 *
 * 入口包了 runWithTask：所有 6 类节点（text/agent/image/video/audio/script）的执行
 * 都会作为一条 Task 出现在统一任务面板里，进度通过 ctx.progress 桥接。
 *
 * `taskMeta.projectId` 取激活的灵绘 workspace id（无独立项目时即等于 workspace id），
 * 即用户拍板的"workspaceId 当 projectId 兜底"最简策略。
 */
export async function executeNode(
  node: ExecutionNodeView,
  onProgress?: NodeExecutionProgressHandler,
  signal?: AbortSignal,
  taskMeta?: { projectId: string; nodeLabel?: string },
): Promise<LinghuiNodeResult> {
  // 没有 projectId 兜底（极少见，比如未激活 workspace 直接执行）则跳过 task 包装
  if (!taskMeta?.projectId) {
    return executeNodeInner(node, onProgress, signal);
  }

  const subType = LINGHUI_NODE_TASK_SUBTYPE[node.type] ?? 'linghui-text';
  const { result } = await runWithTask({
    projectId: taskMeta.projectId,
    category: 'linghui',
    subType,
    type: 'linghui-execution',
    targetType: 'linghui-node',
    targetId: node.id,
    targetName: taskMeta.nodeLabel || node.title || node.id,
    metadata: { nodeType: node.type },
    execute: async (ctx) => {
      // 把节点 onProgress 桥接到 TaskManager；既保留原有 React state 更新，又同步任务面板
      const wrappedProgress: NodeExecutionProgressHandler = (progress, message, partialResult) => {
        ctx.progress(progress, message);
        onProgress?.(progress, message, partialResult);
      };
      return executeNodeInner(node, wrappedProgress, signal);
    },
  });
  return result;
}
