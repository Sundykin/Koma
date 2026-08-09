import {
  getMediaAssetSource,
  getShotScriptText,
  type Shot,
  type ShotVideoReference,
  type StoredMediaAsset,
} from '../types';

const EXPLICIT_BREAK_PATTERN = /(?:转场|切到|切至|场景切换|画面切换|与此同时|另一边|另一处|次日|翌日|多年后|数日后|几小时后|时间跳跃|闪回|回忆中|梦境|平行叙事|蒙太奇|黑场|淡出|新场景)/i;
const CONTINUATION_PATTERN = /(?:继续|接着|紧接|随即|随后|仍然|保持|承接|延续|连贯|目光|视线|转身|回头|抬手|放下|走向|跑向|追逐|跟随|动作未停)/i;

function compactText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const compacted = value.trim();
  return compacted || undefined;
}

function normalizeReferenceFrame(value: unknown): StoredMediaAsset | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Partial<StoredMediaAsset>;
  if (record.kind !== 'image' || !getMediaAssetSource(record as StoredMediaAsset)) return undefined;
  const createdAt = typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
    ? record.createdAt
    : Date.now();
  return { ...record, kind: 'image', createdAt } as StoredMediaAsset;
}

/** Strictly sanitize persisted or LLM-adjacent continuity metadata. */
export function normalizeShotVideoReference(value: unknown): ShotVideoReference | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const mode = record.mode === 'manual' ? 'manual' : record.mode === 'auto' ? 'auto' : undefined;
  if (!mode || typeof record.usePreviousTailFrame !== 'boolean') return undefined;

  return {
    mode,
    usePreviousTailFrame: record.usePreviousTailFrame,
    autoUsePreviousTailFrame: typeof record.autoUsePreviousTailFrame === 'boolean'
      ? record.autoUsePreviousTailFrame
      : undefined,
    continuityReason: compactText(record.continuityReason),
    sourceShotId: compactText(record.sourceShotId),
    referenceFrame: normalizeReferenceFrame(record.referenceFrame),
    capturedAt: typeof record.capturedAt === 'number' && Number.isFinite(record.capturedAt)
      ? record.capturedAt
      : undefined,
    sourceVideoKey: compactText(record.sourceVideoKey),
  };
}

function hasIntersection(left: string[] | undefined, right: string[] | undefined): boolean {
  if (!left?.length || !right?.length) return false;
  const rightSet = new Set(right);
  return left.some(item => rightSet.has(item));
}

function haveDistinctKnownScenes(previous: Shot, current: Shot): boolean {
  return Boolean(previous.scenes?.length && current.scenes?.length
    && !hasIntersection(previous.scenes, current.scenes));
}

function parseContinuitySuggestion(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['inherit', 'continuous', 'continue', 'yes', 'true', '继承', '连续'].includes(normalized)) return true;
  if (['independent', 'cut', 'no', 'false', '独立', '不继承', '转场'].includes(normalized)) return false;
  return undefined;
}

export interface ShotContinuitySuggestion {
  usePreviousTailFrame?: unknown;
  reason?: unknown;
}

export interface ShotContinuityDecision {
  usePreviousTailFrame: boolean;
  reason: string;
}

/**
 * Decide automatic continuity from final adjacent shots. Hard breaks win over LLM suggestions;
 * weak/absent metadata falls back to stable project data and visible script signals.
 */
export function decideShotContinuity(
  previous: Shot | undefined,
  current: Shot,
  suggestion?: ShotContinuitySuggestion,
): ShotContinuityDecision {
  if (!previous) {
    return { usePreviousTailFrame: false, reason: '第一镜没有上一镜，按独立镜头生成' };
  }

  const currentText = [getShotScriptText(current), current.dialogue, current.emotion].filter(Boolean).join('\n');
  if (EXPLICIT_BREAK_PATTERN.test(currentText)) {
    return { usePreviousTailFrame: false, reason: '检测到明确转场或时间/叙事跳跃' };
  }
  if (haveDistinctKnownScenes(previous, current)) {
    return { usePreviousTailFrame: false, reason: '相邻镜头属于不同场景' };
  }

  const suggested = parseContinuitySuggestion(suggestion?.usePreviousTailFrame);
  const suggestedReason = compactText(suggestion?.reason);
  if (typeof suggested === 'boolean') {
    return {
      usePreviousTailFrame: suggested,
      reason: suggestedReason || (suggested ? '分镜分析建议承接上一镜状态' : '分镜分析建议本镜独立'),
    };
  }

  if (hasIntersection(previous.scenes, current.scenes)) {
    return { usePreviousTailFrame: true, reason: '相邻镜头处于同一场景，建议延续空间与人物状态' };
  }
  if (hasIntersection(previous.characters, current.characters) && CONTINUATION_PATTERN.test(currentText)) {
    return { usePreviousTailFrame: true, reason: '相同角色存在连续动作、视线或机位信号' };
  }
  return { usePreviousTailFrame: false, reason: '未检测到足够的相邻镜头连续性信号' };
}

export interface ShotContinuityPayload {
  continuity?: unknown;
  usePreviousTailFrame?: unknown;
  continuityReason?: unknown;
  /** chunk 首镜没有真实上一镜上下文时忽略该局部建议。 */
  ignoreContinuitySuggestion?: boolean;
}

/** Normalize after all chunks are merged and final Shot IDs/order exist. */
export function normalizeShotContinuity(
  shots: Shot[],
  payloads: ShotContinuityPayload[] = [],
): Shot[] {
  return shots.map((shot, index) => {
    const previous = shots[index - 1];
    const existing = normalizeShotVideoReference(shot.videoReference);
    const payload = payloads[index];
    const decision = decideShotContinuity(
      previous,
      shot,
      payload?.ignoreContinuitySuggestion
        ? undefined
        : {
          usePreviousTailFrame: payload?.usePreviousTailFrame ?? payload?.continuity,
          reason: payload?.continuityReason,
        },
    );

    if (!previous) {
      return {
        ...shot,
        videoReference: {
          mode: 'auto',
          usePreviousTailFrame: false,
          autoUsePreviousTailFrame: false,
          continuityReason: decision.reason,
        },
      };
    }

    const autoUsePreviousTailFrame = existing?.autoUsePreviousTailFrame ?? decision.usePreviousTailFrame;
    const mode = existing?.mode ?? 'auto';
    const usePreviousTailFrame = mode === 'manual'
      ? Boolean(existing?.usePreviousTailFrame)
      : autoUsePreviousTailFrame;
    const sourceChanged = existing?.sourceShotId && existing.sourceShotId !== previous.id;
    return {
      ...shot,
      videoReference: {
        mode,
        usePreviousTailFrame,
        autoUsePreviousTailFrame,
        continuityReason: existing?.continuityReason ?? decision.reason,
        sourceShotId: previous.id,
        referenceFrame: sourceChanged ? undefined : existing?.referenceFrame,
        capturedAt: sourceChanged ? undefined : existing?.capturedAt,
        sourceVideoKey: sourceChanged ? undefined : existing?.sourceVideoKey,
      },
    };
  });
}

export function usesPreviousTailFrame(shot: Pick<Shot, 'videoReference'>): boolean {
  return Boolean(normalizeShotVideoReference(shot.videoReference)?.usePreviousTailFrame);
}
