import {
  getLinghuiResultPrimaryMedia,
  type LinghuiAgentExecutionMetadata,
  type LinghuiAgentNodeProperties,
  type LinghuiAudioNodeProperties,
  type LinghuiImageMediaItem,
  type LinghuiImageNodeProperties,
  type LinghuiNodeResult,
  type LinghuiScriptNodeProperties,
  type LinghuiTextNodeProperties,
  type LinghuiVideoCapability,
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

const imageExecutionLogger = createLogger('LinghuiImageExecution');

// 节点类型 → TaskManager subType 映射，便于面板按图标分组
const LINGHUI_NODE_TASK_SUBTYPE: Record<string, TaskSubType> = {
  'linghui/text': 'linghui-text',
  'linghui/agent': 'linghui-agent',
  'linghui/image': 'linghui-image',
  'linghui/video': 'linghui-video',
  'linghui/audio': 'linghui-audio',
  'linghui/script': 'linghui-script',
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

type NodeExecutionProgressHandler = (progress: number, message?: string, partialResult?: LinghuiNodeResult) => void;

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
  const referenceSources = mergeUniqueSources(upstreamReferenceSources, promptReferenceSources);
  const explicitPrompt = mergePromptWithTextInputs(prompt, textSnippets);
  const effectivePrompt = mergePromptWithTextInputs(prompt || node.title, textSnippets);
  const count = batchCount;

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
      prompt: explicitPrompt,
      referenceSources: upstreamReferenceSources,
      ttiSelection,
      promptReferences: [],
      settingsSnapshot: node.settingsSnapshot,
      multiAngle: multiAngleConfig,
      onProgress,
      placeholderTitle: node.title,
      placeholderSubtitle: prompt || '多角度图片占位预览',
      accent: '#4ade80',
      signal,
    });

    return {
      kind: 'image',
      primary: image,
      metadata: {
        prompt,
        mode: 'multi-angle',
        multiAngle: properties.multiAngle,
      },
    };
  }

  if (count > 1) {
    const batchResult = await generateBatchImagesWithCandidateSelection({
      prompt: effectivePrompt,
      count,
      title: node.title,
      placeholderBase: prompt || '图片占位预览',
      sharedParams: {
        referenceSources,
        ttiSelection,
        promptReferences,
        settingsSnapshot: node.settingsSnapshot,
        onProgress,
        placeholderTitle: node.title,
        placeholderSubtitle: prompt || '图片占位预览',
        accent: '#4ade80',
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
      },
    };
  }

  const image = await generateImageWithProvider({
    prompt: effectivePrompt,
    referenceSources,
    ttiSelection,
    promptReferences,
    settingsSnapshot: node.settingsSnapshot,
    onProgress,
    placeholderTitle: node.title,
    placeholderSubtitle: prompt || '图片占位预览',
    accent: '#4ade80',
    signal,
  });

  return {
    kind: 'image',
    primary: image,
    metadata: { prompt, mode: 'generate' },
  };
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
  const primaryReferenceId = promptReferences.find(item => item.source === primaryReferenceSource)?.id;
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
    case 'linghui/video':
      return executeVideoNode(node, onProgress, signal);
    case 'linghui/audio':
      return executeAudioNode(node, onProgress, signal);
    case 'linghui/script':
      return executeScriptNode(node, onProgress, signal);
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
