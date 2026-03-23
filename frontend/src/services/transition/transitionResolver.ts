import type { Clip, Track, Transition } from '../../types/editor';

export const DEFAULT_TRANSITION_DURATION = 0.3;
export const TRANSITION_TYPE_FADE = 'fade';

export interface ResolvedClipWindow {
  clipId: string;
  trackId: string;
  resolvedStart: number;
  resolvedEnd: number;
}

export interface NormalizedTransitionPlan {
  transitionId: string;
  trackId: string;
  fromClipId: string;
  toClipId: string;
  type: 'fade';
  duration: number;
  cutPointTime: number;
  activeStartTime: number;
  activeEndTime: number;
  exportVideoOffset: number;
  exportAudioOverlap: number;
  maxDuration: number;
}

export interface ResolvedTrackTimeline {
  track: Track;
  clipWindows: ResolvedClipWindow[];
  transitionPlans: NormalizedTransitionPlan[];
  duration: number;
  invalidTransitions: Transition[];
}

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

export function getChainAwareMaxDuration(
  track: Track,
  transitionId: string,
): number {
  const normalizedTrack = normalizeTrackTransitions(track);
  const transitions = normalizedTrack.transitions ?? [];
  const target = transitions.find(t => t.id === transitionId);
  if (!target) return 0;

  const sortedClips = getSortedTrackClips(normalizedTrack);
  const fromClip = sortedClips.find(c => c.id === target.fromClipId);
  const toClip = sortedClips.find(c => c.id === target.toClipId);
  if (!fromClip || !toClip) return 0;

  const baseMax = Math.min(fromClip.duration, toClip.duration);

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

function validateTransitions(track: Track, transitions: Transition[]): Transition[] {
  if (track.type !== 'video') {
    return [];
  }

  const sortedClips = getSortedTrackClips(track);
  const clipIndex = new Map(sortedClips.map((clip, index) => [clip.id, index]));
  const usedAsFrom = new Set<string>();
  const usedAsTo = new Set<string>();
  const incomingDuration = new Map<string, number>();
  const outgoingDuration = new Map<string, number>();
  const valid: Transition[] = [];

  for (const transition of transitions) {
    const fromIndex = clipIndex.get(transition.fromClipId);
    const toIndex = clipIndex.get(transition.toClipId);
    const maxDuration = getMaxTransitionDuration(track, transition.fromClipId, transition.toClipId);

    if (
      transition.type !== TRANSITION_TYPE_FADE ||
      fromIndex === undefined ||
      toIndex === undefined ||
      toIndex !== fromIndex + 1 ||
      transition.duration <= 0 ||
      transition.duration > maxDuration ||
      usedAsFrom.has(transition.fromClipId) ||
      usedAsTo.has(transition.toClipId)
    ) {
      continue;
    }

    // 链式约束：fromClip 的 incoming + 本次 outgoing <= fromClip.duration
    const fromClip = sortedClips[fromIndex];
    const existingIncoming = incomingDuration.get(transition.fromClipId) ?? 0;
    if (existingIncoming + transition.duration > fromClip.duration + 1e-9) {
      continue;
    }

    // 链式约束：toClip 的本次 incoming + 已有 outgoing <= toClip.duration
    const toClip = sortedClips[toIndex];
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
      type: TRANSITION_TYPE_FADE,
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

export function normalizeTrackTransitions(track: Track): Track {
  return normalizeTrackTransitionsWithInvalid(track).track;
}

export function normalizeTimelineTracks(tracks: Track[]): Track[] {
  return tracks.map(normalizeTrackTransitions);
}

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
        type: TRANSITION_TYPE_FADE,
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
