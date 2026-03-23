import type { Clip, Track, Transition } from '../../types/editor';
import { SUPPORTED_TRANSITION_TYPES, TRANSITION_TYPE_FADE } from './constants';
import type { NormalizedTransitionPlan, ResolvedClipWindow, ResolvedTrackTimeline } from './types';

// Re-export for consumers
export { DEFAULT_TRANSITION_DURATION, TRANSITION_TYPE_FADE } from './constants';
export type { NormalizedTransitionPlan, ResolvedClipWindow, ResolvedTrackTimeline } from './types';

const clipOrder = (a: Clip, b: Clip) => {
  if (a.start !== b.start) {
    return a.start - b.start;
  }
  return a.id.localeCompare(b.id);
};

export function getSortedTrackClips(track: Track): Clip[] {
  return [...track.clips].sort(clipOrder);
}

export function findTransitionByClipPair(
  track: Track,
  fromClipId: string,
  toClipId: string
): Transition | undefined {
  return track.transitions?.find(
    (transition) => transition.fromClipId === fromClipId && transition.toClipId === toClipId
  );
}

/**
 * 获取两个相邻 clip 之间转场的理论最大时长（不考虑链式约束）
 */
export function getMaxTransitionDuration(
  track: Track,
  fromClipId: string,
  toClipId: string
): number {
  if (track.type !== 'video') {
    return 0;
  }

  const sortedClips = getSortedTrackClips(track);
  const fromIndex = sortedClips.findIndex((clip) => clip.id === fromClipId);
  const toIndex = sortedClips.findIndex((clip) => clip.id === toClipId);

  if (fromIndex < 0 || toIndex !== fromIndex + 1) {
    return 0;
  }

  const fromClip = sortedClips[fromIndex];
  const toClip = sortedClips[toIndex];
  const sameCutPoint = Math.abs(toClip.start - (fromClip.start + fromClip.duration)) < 1e-6;
  if (!sameCutPoint) {
    return 0;
  }
  return Math.max(0, Math.min(fromClip.duration, toClip.duration));
}

/**
 * 获取链式约束下转场的最大时长，考虑邻居转场对 clip 预算的占用
 */
export function getChainAwareMaxDuration(
  track: Track,
  transitionId: string,
): number {
  const baseMax = getChainAwareBaseMax(track, transitionId);
  if (baseMax <= 0) return 0;

  const normalizedTrack = normalizeTrackTransitions(track);
  const transitions = normalizedTrack.transitions ?? [];
  const target = transitions.find(t => t.id === transitionId);
  if (!target) return 0;

  const sortedClips = getSortedTrackClips(normalizedTrack);
  const fromClip = sortedClips.find(c => c.id === target.fromClipId);
  const toClip = sortedClips.find(c => c.id === target.toClipId);
  if (!fromClip || !toClip) return 0;

  const incomingOnFrom = transitions.find(
    t => t.id !== transitionId && t.toClipId === target.fromClipId
  );
  const fromClipBudget = incomingOnFrom
    ? fromClip.duration - incomingOnFrom.duration
    : fromClip.duration;

  const outgoingOnTo = transitions.find(
    t => t.id !== transitionId && t.fromClipId === target.toClipId
  );
  const toClipBudget = outgoingOnTo
    ? toClip.duration - outgoingOnTo.duration
    : toClip.duration;

  return Math.max(0, Math.min(baseMax, fromClipBudget, toClipBudget));
}

/** 内部：复用 getMaxTransitionDuration 做前置校验 */
function getChainAwareBaseMax(track: Track, transitionId: string): number {
  const normalizedTrack = normalizeTrackTransitions(track);
  const target = (normalizedTrack.transitions ?? []).find(t => t.id === transitionId);
  if (!target) return 0;
  return getMaxTransitionDuration(normalizedTrack, target.fromClipId, target.toClipId);
}

function deriveLegacyTransitions(track: Track): Transition[] {
  const sortedClips = getSortedTrackClips(track);

  return sortedClips.flatMap((clip, index) => {
    if (!clip.transition || index === 0 || clip.transition.duration <= 0) {
      return [];
    }

    const previousClip = sortedClips[index - 1];
    return [
      {
        id: `legacy-transition-${previousClip.id}-${clip.id}`,
        fromClipId: previousClip.id,
        toClipId: clip.id,
        type: TRANSITION_TYPE_FADE,
        duration: clip.transition.duration,
      },
    ];
  });
}

/**
 * 过滤无效转场，返回合法子集。处理链式约束、类型校验、相邻性校验。
 */
function validateTransitions(track: Track, transitions: Transition[]): Transition[] {
  if (track.type !== 'video') {
    return [];
  }

  const sortedClips = getSortedTrackClips(track);
  const clipIndexMap = new Map(sortedClips.map((clip, index) => [clip.id, index]));
  const usedAsFrom = new Set<string>();
  const usedAsTo = new Set<string>();
  const incomingDuration = new Map<string, number>();
  const outgoingDuration = new Map<string, number>();
  const valid: Transition[] = [];

  for (const transition of transitions) {
    const fromIdx = clipIndexMap.get(transition.fromClipId);
    const toIdx = clipIndexMap.get(transition.toClipId);
    const maxDuration = getMaxTransitionDuration(track, transition.fromClipId, transition.toClipId);

    // 类型校验
    const isValidType = SUPPORTED_TRANSITION_TYPES.has(transition.type);
    // 相邻性校验
    const isAdjacent = fromIdx !== undefined && toIdx !== undefined && toIdx === fromIdx + 1;
    // 时长校验（含 NaN/undefined 防御）
    const isValidDuration = Number.isFinite(transition.duration) && transition.duration > 0 && transition.duration <= maxDuration;
    // 唯一性校验
    const isUnique = !usedAsFrom.has(transition.fromClipId) && !usedAsTo.has(transition.toClipId);

    if (!isValidType || !isAdjacent || !isValidDuration || !isUnique) {
      continue;
    }

    // 链式约束：fromClip 的 incoming + 本次 outgoing <= fromClip.duration
    const fromClip = sortedClips[fromIdx];
    const existingIncoming = incomingDuration.get(transition.fromClipId) ?? 0;
    if (existingIncoming + transition.duration > fromClip.duration + 1e-9) {
      continue;
    }

    // 链式约束：toClip 的本次 incoming + 已有 outgoing <= toClip.duration
    const toClip = sortedClips[toIdx];
    const existingOutgoing = outgoingDuration.get(transition.toClipId) ?? 0;
    if (transition.duration + existingOutgoing > toClip.duration + 1e-9) {
      continue;
    }

    usedAsFrom.add(transition.fromClipId);
    usedAsTo.add(transition.toClipId);
    outgoingDuration.set(transition.fromClipId, transition.duration);
    incomingDuration.set(transition.toClipId, transition.duration);
    valid.push({
      ...transition,
      type: transition.type,
    });
  }

  return valid;
}

function normalizeTrackTransitionsWithInvalid(track: Track): {
  track: Track;
  invalidTransitions: Transition[];
} {
  const explicitTransitions = track.transitions ?? deriveLegacyTransitions(track);
  const transitions = validateTransitions(track, explicitTransitions);
  const clips = track.clips.map(({ transition: _legacyTransition, ...clip }) => clip);
  const validIds = new Set(transitions.map((transition) => transition.id));
  const invalidTransitions = explicitTransitions.filter(
    (transition) => !validIds.has(transition.id)
  );

  return {
    track: {
      ...track,
      clips,
      transitions,
    },
    invalidTransitions,
  };
}

/**
 * 标准化 track 的转场数据：兼容 legacy clip.transition，验证并过滤无效转场
 */
export function normalizeTrackTransitions(track: Track): Track {
  return normalizeTrackTransitionsWithInvalid(track).track;
}

export function normalizeTimelineTracks(tracks: Track[]): Track[] {
  return tracks.map(normalizeTrackTransitions);
}

/**
 * 将 track 解析为带时间窗口的 timeline，考虑转场重叠产生的时间偏移
 */
export function resolveTrackTimeline(track: Track): ResolvedTrackTimeline {
  const normalized = normalizeTrackTransitionsWithInvalid(track);
  const normalizedTrack = normalized.track;
  const sortedClips = getSortedTrackClips(normalizedTrack);
  const outgoing = new Map(
    (normalizedTrack.transitions ?? []).map((transition) => [transition.fromClipId, transition])
  );
  const clipWindows: ResolvedClipWindow[] = [];
  const clipWindowsById = new Map<string, ResolvedClipWindow>();
  let cumulativeOverlap = 0;

  for (const clip of sortedClips) {
    const resolvedStart = clip.start - cumulativeOverlap;
    const resolvedEnd = resolvedStart + clip.duration;
    const window: ResolvedClipWindow = {
      clipId: clip.id,
      trackId: normalizedTrack.id,
      resolvedStart,
      resolvedEnd,
    };

    clipWindows.push(window);
    clipWindowsById.set(clip.id, window);

    const outgoingTransition = outgoing.get(clip.id);
    if (outgoingTransition) {
      cumulativeOverlap += outgoingTransition.duration;
    }
  }

  const transitionPlans = (normalizedTrack.transitions ?? [])
    .map((transition) => {
      const fromWindow = clipWindowsById.get(transition.fromClipId);
      const toWindow = clipWindowsById.get(transition.toClipId);

      if (!fromWindow || !toWindow) {
        return null;
      }

      return {
        transitionId: transition.id,
        trackId: normalizedTrack.id,
        fromClipId: transition.fromClipId,
        toClipId: transition.toClipId,
        type: transition.type,
        duration: transition.duration,
        cutPointTime: fromWindow.resolvedEnd,
        activeStartTime: toWindow.resolvedStart,
        activeEndTime: toWindow.resolvedStart + transition.duration,
        exportVideoOffset: fromWindow.resolvedEnd - fromWindow.resolvedStart - transition.duration,
        exportAudioOverlap: transition.duration,
        maxDuration: getMaxTransitionDuration(
          normalizedTrack,
          transition.fromClipId,
          transition.toClipId
        ),
      } satisfies NormalizedTransitionPlan;
    })
    .filter((transition): transition is NormalizedTransitionPlan => Boolean(transition));

  const duration = clipWindows.reduce(
    (maxDuration, window) => Math.max(maxDuration, window.resolvedEnd),
    0
  );

  return {
    track: normalizedTrack,
    clipWindows,
    transitionPlans,
    duration,
    invalidTransitions: normalized.invalidTransitions,
  };
}

export function resolveTimelineTracks(tracks: Track[]): ResolvedTrackTimeline[] {
  return tracks.map(resolveTrackTimeline);
}

export function getTimelineDuration(tracks: Track[]): number {
  return resolveTimelineTracks(tracks).reduce(
    (maxDuration, track) => Math.max(maxDuration, track.duration),
    0
  );
}

export function getClipResolvedWindow(
  tracks: Track[],
  clipId: string
): ResolvedClipWindow | undefined {
  for (const track of resolveTimelineTracks(tracks)) {
    const window = track.clipWindows.find((clipWindow) => clipWindow.clipId === clipId);
    if (window) {
      return window;
    }
  }
  return undefined;
}

export function getClipOpacityFromPlans(
  transitionPlans: NormalizedTransitionPlan[],
  clipId: string,
  currentTime: number
): number {
  const activeTransition = transitionPlans.find(
    (transition) =>
      currentTime >= transition.activeStartTime && currentTime < transition.activeEndTime
  );

  if (!activeTransition) {
    return 1;
  }

  const progress =
    (currentTime - activeTransition.activeStartTime) / activeTransition.duration;

  if (activeTransition.fromClipId === clipId) {
    return 1 - progress;
  }

  if (activeTransition.toClipId === clipId) {
    return progress;
  }

  return 1;
}

export function getClipOpacityMultiplier(
  track: Track,
  clipId: string,
  currentTime: number
): number {
  const { transitionPlans } = resolveTrackTimeline(track);
  return getClipOpacityFromPlans(transitionPlans, clipId, currentTime);
}
