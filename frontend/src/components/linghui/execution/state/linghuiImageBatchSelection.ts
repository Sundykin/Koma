import type { LinghuiImageMediaItem } from '../../../../types/linghui';
import { generateImageVariantsWithProvider } from './linghuiExecutionProviders';
import {
  analyzeLinghuiImageBatchSimilarity,
  analyzeLinghuiImageCandidateQuality,
  type LinghuiImageCandidateQualityResult,
} from './linghuiImageSimilarity';

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

export const IMAGE_BATCH_VARIANT_STRATEGY = 'linghui-parallel-diverse-prompts-v4';
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

export async function generateBatchImagesWithCandidateSelection(params: {
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
