import type { Clip, TimelineData, Track, Transition, TransitionType } from '../../../frontend/src/types/editor';

const CURRENT_TIMELINE_VERSION = 1;
const MIN_VISIBLE_DURATION = 0.1;
const TIME_EPSILON = 1e-6;
const TRANSITION_TYPE_FADE: TransitionType = 'fade';
const SUPPORTED_TRANSITION_TYPES: ReadonlySet<TransitionType> = new Set<TransitionType>(['fade']);

function clipOrder(a: Clip, b: Clip): number {
  if (a.start !== b.start) {
    return a.start - b.start;
  }
  return a.id.localeCompare(b.id);
}

function getRawVersion(raw: Record<string, unknown>): number {
  const version = typeof raw.version === 'number' ? raw.version : 0;
  if (!Number.isFinite(version) || version < 0) return 0;
  return Math.floor(version);
}

function getSortedTrackClips(track: Track): Clip[] {
  return [...track.clips].sort(clipOrder);
}

function getMaxTransitionDuration(track: Track, fromClipId: string, toClipId: string): number {
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
  const sameCutPoint = Math.abs(toClip.start - (fromClip.start + fromClip.duration)) < TIME_EPSILON;

  if (!sameCutPoint) {
    return 0;
  }

  return Math.max(0, Math.min(fromClip.duration, toClip.duration));
}

function deriveLegacyTransitions(track: Track): Transition[] {
  const sortedClips = getSortedTrackClips(track);

  return sortedClips.flatMap((clip, index) => {
    if (!clip.transition || index === 0 || clip.transition.duration <= 0) {
      return [];
    }

    const previousClip = sortedClips[index - 1];
    return [{
      id: `legacy-transition-${previousClip.id}-${clip.id}`,
      fromClipId: previousClip.id,
      toClipId: clip.id,
      type: TRANSITION_TYPE_FADE,
      duration: clip.transition.duration,
    }];
  });
}

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

  const sortedTransitions = [...transitions].sort((a, b) => {
    const aIdx = clipIndexMap.get(a.fromClipId) ?? Number.MAX_SAFE_INTEGER;
    const bIdx = clipIndexMap.get(b.fromClipId) ?? Number.MAX_SAFE_INTEGER;
    return aIdx - bIdx;
  });

  for (const transition of sortedTransitions) {
    const fromIdx = clipIndexMap.get(transition.fromClipId);
    const toIdx = clipIndexMap.get(transition.toClipId);
    const maxDuration = getMaxTransitionDuration(track, transition.fromClipId, transition.toClipId);

    const isValidType = SUPPORTED_TRANSITION_TYPES.has(transition.type);
    const isAdjacent = fromIdx !== undefined && toIdx !== undefined && toIdx === fromIdx + 1;
    const isUnique = !usedAsFrom.has(transition.fromClipId) && !usedAsTo.has(transition.toClipId);

    if (!isValidType || !isAdjacent || !isUnique) {
      continue;
    }

    const fromClip = sortedClips[fromIdx];
    const toClip = sortedClips[toIdx];
    const existingIncoming = incomingDuration.get(transition.fromClipId) ?? 0;
    const existingOutgoing = outgoingDuration.get(transition.toClipId) ?? 0;
    const fromBudget = fromClip.duration - existingIncoming;
    const toBudget = toClip.duration - existingOutgoing;
    const effectiveMax = Math.min(maxDuration, fromBudget, toBudget);
    const clampMax = Math.max(0, effectiveMax - MIN_VISIBLE_DURATION);

    if (clampMax <= 0) {
      continue;
    }

    let finalDuration = transition.duration;
    if (!Number.isFinite(finalDuration) || finalDuration <= 0) {
      continue;
    }

    if (finalDuration > clampMax + TIME_EPSILON) {
      finalDuration = clampMax;
    }

    usedAsFrom.add(transition.fromClipId);
    usedAsTo.add(transition.toClipId);
    outgoingDuration.set(transition.fromClipId, finalDuration);
    incomingDuration.set(transition.toClipId, finalDuration);
    valid.push(
      finalDuration !== transition.duration
        ? { ...transition, duration: finalDuration }
        : transition,
    );
  }

  return valid;
}

function normalizeTrackTransitions(track: Track): Track {
  const explicitTransitions = track.transitions ?? deriveLegacyTransitions(track);
  const transitions = validateTransitions(track, explicitTransitions);
  const clips = track.clips.map(({ transition: _legacyTransition, ...clip }) => clip);

  return {
    ...track,
    clips,
    transitions,
  };
}

function normalizeTimelineTracks(tracks: Track[]): Track[] {
  return tracks.map(normalizeTrackTransitions);
}

function normalizeSupportedTracks(version: number, tracks: Track[]): Track[] {
  if (version > CURRENT_TIMELINE_VERSION) {
    throw new Error(`Unsupported timeline version: ${version}`);
  }

  return normalizeTimelineTracks(tracks);
}

export function prepareTimelineForStorage(
  raw: Partial<TimelineData> & Pick<TimelineData, 'tracks'>,
): TimelineData {
  const now = Date.now();
  const source = raw as Record<string, unknown>;
  const tracks = Array.isArray(raw.tracks) ? raw.tracks : [];

  return {
    version: CURRENT_TIMELINE_VERSION,
    tracks: normalizeSupportedTracks(getRawVersion(source), tracks),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
  };
}
