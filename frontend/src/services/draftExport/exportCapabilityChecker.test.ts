import { describe, expect, it } from 'vitest';
import { MediaType, type Clip, type Track } from '../../types/editor';
import { checkExportCompatibility } from './exportCapabilityChecker';

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

describe('checkExportCompatibility', () => {
  it('detects track-level transitions as natively exportable features', () => {
    const track: Track = {
      id: 'track-1',
      type: 'video',
      order: 0,
      clips: [createClip('clip-a', 0, 3), createClip('clip-b', 3, 3)],
      transitions: [
        {
          id: 'transition-1',
          fromClipId: 'clip-a',
          toClipId: 'clip-b',
          type: 'fade',
          duration: 0.5,
        },
      ],
    };

    const report = checkExportCompatibility([track]);
    expect(report.usedFeatures).toContain('transition');
    expect(report.jianyingOnlyFeatures).not.toContain('transition');
    expect(report.featureDetails.find((detail) => detail.feature === 'transition')?.clipCount).toBe(1);
  });

  it('treats transitions as natively exportable once renderer supports them', () => {
    const track: Track = {
      id: 'track-1',
      type: 'video',
      order: 0,
      clips: [createClip('clip-a', 0, 3), createClip('clip-b', 3, 3)],
      transitions: [
        {
          id: 'transition-1',
          fromClipId: 'clip-a',
          toClipId: 'clip-b',
          type: 'fade',
          duration: 0.5,
        },
      ],
    };

    const report = checkExportCompatibility([track]);
    expect(report.usedFeatures).toContain('transition');
    expect(report.jianyingOnlyFeatures).not.toContain('transition');
    expect(report.featureDetails.find((detail) => detail.feature === 'transition')?.support.native).toBe(true);
  });

  it('keeps legacy clip.transition readable through normalization', () => {
    const clips = [createClip('clip-a', 0, 3), createClip('clip-b', 3, 3)];
    clips[1].transition = {
      effectId: 'legacy-fade',
      duration: 0.75,
    };

    const track: Track = {
      id: 'track-1',
      type: 'video',
      order: 0,
      clips,
    };

    const report = checkExportCompatibility([track]);
    expect(report.usedFeatures).toContain('transition');
    expect(report.featureDetails.find((detail) => detail.feature === 'transition')?.clipCount).toBe(1);
  });

  it('reports empty transitions array as no transition feature', () => {
    const track: Track = {
      id: 'track-1',
      type: 'video',
      order: 0,
      clips: [createClip('clip-a', 0, 3), createClip('clip-b', 3, 3)],
      transitions: [],
    };

    const report = checkExportCompatibility([track]);
    expect(report.usedFeatures).not.toContain('transition');
    expect(report.hasAdvancedFeatures).toBe(false);
  });

  it('reports no advanced features for plain clips', () => {
    const track: Track = {
      id: 'track-1',
      type: 'video',
      order: 0,
      clips: [createClip('clip-a', 0, 5)],
      transitions: [],
    };

    const report = checkExportCompatibility([track]);
    expect(report.hasAdvancedFeatures).toBe(false);
    expect(report.usedFeatures).toEqual([]);
    expect(report.jianyingOnlyFeatures).toEqual([]);
    expect(report.recommendations).toEqual([]);
  });

  it('classifies transition as native and filter as jianying-only in mixed project', () => {
    const clips = [createClip('clip-a', 0, 3), createClip('clip-b', 3, 3)];
    (clips[0] as any).filter = { id: 'warm', intensity: 0.5 };

    const track: Track = {
      id: 'track-1',
      type: 'video',
      order: 0,
      clips,
      transitions: [
        { id: 't1', fromClipId: 'clip-a', toClipId: 'clip-b', type: 'fade' as const, duration: 0.5 },
      ],
    };

    const report = checkExportCompatibility([track]);
    expect(report.usedFeatures).toContain('transition');
    expect(report.usedFeatures).toContain('filter');
    expect(report.jianyingOnlyFeatures).toContain('filter');
    expect(report.jianyingOnlyFeatures).not.toContain('transition');
    expect(report.hasAdvancedFeatures).toBe(true);
  });

  it('pure transition project has no jianying-only features', () => {
    const track: Track = {
      id: 'track-1',
      type: 'video',
      order: 0,
      clips: [createClip('clip-a', 0, 3), createClip('clip-b', 3, 3)],
      transitions: [
        { id: 't1', fromClipId: 'clip-a', toClipId: 'clip-b', type: 'fade' as const, duration: 1 },
      ],
    };

    const report = checkExportCompatibility([track]);
    expect(report.hasAdvancedFeatures).toBe(true);
    expect(report.jianyingOnlyFeatures).toEqual([]);
    expect(report.recommendations).toEqual([]);
  });
});
