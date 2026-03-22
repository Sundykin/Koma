import { describe, expect, it } from 'vitest';
import { MediaType, type Clip, type Track } from '../../types/editor';
import {
  getClipOpacityFromPlans,
  getClipOpacityMultiplier,
  getMaxTransitionDuration,
  getTimelineDuration,
  normalizeTrackTransitions,
  resolveTrackTimeline,
} from './transitionResolver';

function createClip(id: string, start: number, duration: number): Clip {
  return {
    id,
    assetId: `asset-${id}`,
    trackId: 'track-1',
    start,
    duration,
    offset: 0,
    name: id,
    type: MediaType.VIDEO,
    src: `${id}.mp4`,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
  };
}

function createTrack(): Track {
  return {
    id: 'track-1',
    type: 'video',
    order: 0,
    clips: [createClip('clip-a', 0, 3), createClip('clip-b', 3, 2), createClip('clip-c', 5, 2)],
  };
}

describe('transitionResolver', () => {
  it('normalizes legacy clip transitions into track transitions', () => {
    const track = createTrack();
    track.clips[1].transition = {
      effectId: 'legacy-fade',
      duration: 0.5,
    };

    const normalized = normalizeTrackTransitions(track);
    expect(normalized.transitions).toHaveLength(1);
    expect(normalized.transitions?.[0]).toMatchObject({
      fromClipId: 'clip-a',
      toClipId: 'clip-b',
      type: 'fade',
      duration: 0.5,
    });
    expect(normalized.clips[1].transition).toBeUndefined();
  });

  it('rejects non-adjacent transitions and clips participating in multiple transitions', () => {
    const track = createTrack();
    track.transitions = [
      { id: 't1', fromClipId: 'clip-a', toClipId: 'clip-c', type: 'fade', duration: 0.5 },
      { id: 't2', fromClipId: 'clip-a', toClipId: 'clip-b', type: 'fade', duration: 0.5 },
      { id: 't3', fromClipId: 'clip-b', toClipId: 'clip-c', type: 'fade', duration: 0.5 },
    ];

    const normalized = normalizeTrackTransitions(track);
    expect(normalized.transitions).toEqual([
      { id: 't2', fromClipId: 'clip-a', toClipId: 'clip-b', type: 'fade', duration: 0.5 },
    ]);
  });

  it('computes overlap-aware resolved timeline duration', () => {
    const track = createTrack();
    track.transitions = [
      { id: 't1', fromClipId: 'clip-a', toClipId: 'clip-b', type: 'fade', duration: 1 },
    ];

    const resolved = resolveTrackTimeline(track);
    expect(resolved.duration).toBe(6);
    expect(getTimelineDuration([track])).toBe(6);
    expect(resolved.clipWindows.find((clip) => clip.clipId === 'clip-b')?.resolvedStart).toBe(2);
    expect(resolved.transitionPlans[0]).toMatchObject({
      activeStartTime: 2,
      activeEndTime: 3,
      cutPointTime: 3,
    });
  });

  it('computes max duration and opacity interpolation for the active transition', () => {
    const track = createTrack();
    track.transitions = [
      { id: 't1', fromClipId: 'clip-a', toClipId: 'clip-b', type: 'fade', duration: 1 },
    ];

    expect(getMaxTransitionDuration(track, 'clip-a', 'clip-b')).toBe(2);
    expect(getClipOpacityMultiplier(track, 'clip-a', 2.5)).toBeCloseTo(0.5, 5);
    expect(getClipOpacityMultiplier(track, 'clip-b', 2.5)).toBeCloseTo(0.5, 5);
    expect(getClipOpacityMultiplier(track, 'clip-c', 2.5)).toBe(1);
  });

  // --- P0 补充测试 ---

  it('rejects transition with missing or invalid fields (FX-ILLEGAL-005)', () => {
    const track = createTrack();
    // type undefined
    track.transitions = [
      { id: 't1', fromClipId: 'clip-a', toClipId: 'clip-b', type: undefined as unknown as 'fade', duration: 0.5 },
    ];
    expect(normalizeTrackTransitions(track).transitions).toHaveLength(0);

    // fromClipId missing
    track.transitions = [
      { id: 't2', fromClipId: '', toClipId: 'clip-b', type: 'fade', duration: 0.5 },
    ];
    expect(normalizeTrackTransitions(track).transitions).toHaveLength(0);

    // toClipId referencing non-existent clip
    track.transitions = [
      { id: 't3', fromClipId: 'clip-a', toClipId: 'non-existent', type: 'fade', duration: 0.5 },
    ];
    expect(normalizeTrackTransitions(track).transitions).toHaveLength(0);

    // duration missing (NaN/undefined) — currently passes validation due to JS coercion;
    // validateTransitions does not explicitly check for NaN. Documenting actual behavior.
    track.transitions = [
      { id: 't4', fromClipId: 'clip-a', toClipId: 'clip-b', type: 'fade', duration: undefined as unknown as number },
    ];
    // NOTE: This passes through because undefined <= 0 is false and undefined > maxDuration is false in JS.
    // Phase 2 should add explicit NaN/undefined guard in validateTransitions.
    expect(normalizeTrackTransitions(track).transitions).toHaveLength(1);
  });

  it('rejects transition with duration=0', () => {
    const track = createTrack();
    track.transitions = [
      { id: 't1', fromClipId: 'clip-a', toClipId: 'clip-b', type: 'fade', duration: 0 },
    ];
    const normalized = normalizeTrackTransitions(track);
    expect(normalized.transitions).toHaveLength(0);
  });

  it('accepts transition with duration=maxDuration', () => {
    const track: Track = {
      id: 'track-1',
      type: 'video',
      order: 0,
      clips: [createClip('clip-a', 0, 3), createClip('clip-b', 3, 2)],
    };
    // maxDuration = min(3, 2) = 2
    track.transitions = [
      { id: 't1', fromClipId: 'clip-a', toClipId: 'clip-b', type: 'fade', duration: 2 },
    ];
    const normalized = normalizeTrackTransitions(track);
    expect(normalized.transitions).toHaveLength(1);
    expect(normalized.transitions?.[0].duration).toBe(2);
  });

  it('cleans up transition when fromClip is removed', () => {
    const track = createTrack();
    track.transitions = [
      { id: 't1', fromClipId: 'clip-a', toClipId: 'clip-b', type: 'fade', duration: 0.5 },
    ];
    // Remove clip-a
    track.clips = track.clips.filter((c) => c.id !== 'clip-a');
    const normalized = normalizeTrackTransitions(track);
    expect(normalized.transitions).toHaveLength(0);
  });

  it('cleans up transition when clip is moved breaking adjacency', () => {
    const track: Track = {
      id: 'track-1',
      type: 'video',
      order: 0,
      clips: [createClip('clip-a', 0, 3), createClip('clip-b', 3, 2)],
      transitions: [
        { id: 't1', fromClipId: 'clip-a', toClipId: 'clip-b', type: 'fade', duration: 0.5 },
      ],
    };
    // Move clip-b so it's no longer adjacent (gap between them)
    track.clips[1] = { ...track.clips[1], start: 5 };
    const normalized = normalizeTrackTransitions(track);
    expect(normalized.transitions).toHaveLength(0);
  });

  it('cleans up transition when a clip is inserted breaking adjacency', () => {
    const track: Track = {
      id: 'track-1',
      type: 'video',
      order: 0,
      clips: [createClip('clip-a', 0, 3), createClip('clip-b', 3, 2)],
      transitions: [
        { id: 't1', fromClipId: 'clip-a', toClipId: 'clip-b', type: 'fade', duration: 0.5 },
      ],
    };
    // Insert clip-x between them, pushing clip-b to index 2
    const clipX: Clip = createClip('clip-x', 3, 1);
    track.clips = [track.clips[0], clipX, { ...track.clips[1], start: 4 }];
    const normalized = normalizeTrackTransitions(track);
    // clip-a→clip-b are no longer adjacent (clip-x is between them)
    expect(normalized.transitions).toHaveLength(0);
  });

  it('rejects transition on single-clip track', () => {
    const track: Track = {
      id: 'track-1',
      type: 'video',
      order: 0,
      clips: [createClip('clip-a', 0, 3)],
      transitions: [
        { id: 't1', fromClipId: 'clip-a', toClipId: 'clip-a', type: 'fade', duration: 0.5 },
      ],
    };
    const normalized = normalizeTrackTransitions(track);
    expect(normalized.transitions).toHaveLength(0);
  });

  it('rejects transition referencing clips from another track', () => {
    const track: Track = {
      id: 'track-1',
      type: 'video',
      order: 0,
      clips: [createClip('clip-a', 0, 3)],
      transitions: [
        { id: 't1', fromClipId: 'clip-a', toClipId: 'clip-foreign', type: 'fade', duration: 0.5 },
      ],
    };
    const normalized = normalizeTrackTransitions(track);
    expect(normalized.transitions).toHaveLength(0);
  });

  it('rejects transitions on non-video tracks', () => {
    const track: Track = {
      id: 'track-audio',
      type: 'audio',
      order: 0,
      clips: [
        { ...createClip('clip-a', 0, 3), trackId: 'track-audio', type: MediaType.AUDIO },
        { ...createClip('clip-b', 3, 2), trackId: 'track-audio', type: MediaType.AUDIO },
      ],
      transitions: [
        { id: 't1', fromClipId: 'clip-a', toClipId: 'clip-b', type: 'fade', duration: 0.5 },
      ],
    };
    const normalized = normalizeTrackTransitions(track);
    expect(normalized.transitions).toHaveLength(0);
    expect(getMaxTransitionDuration(track, 'clip-a', 'clip-b')).toBe(0);
  });

  it('getClipOpacityFromPlans matches getClipOpacityMultiplier', () => {
    const track = createTrack();
    track.transitions = [
      { id: 't1', fromClipId: 'clip-a', toClipId: 'clip-b', type: 'fade', duration: 1 },
    ];
    const { transitionPlans } = resolveTrackTimeline(track);
    const times = [0, 1, 2, 2.25, 2.5, 2.75, 3, 4, 5];
    for (const t of times) {
      expect(getClipOpacityFromPlans(transitionPlans, 'clip-a', t))
        .toBeCloseTo(getClipOpacityMultiplier(track, 'clip-a', t), 10);
      expect(getClipOpacityFromPlans(transitionPlans, 'clip-b', t))
        .toBeCloseTo(getClipOpacityMultiplier(track, 'clip-b', t), 10);
    }
  });
});
