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
  it('detects track-level transitions as Jianying-only features', () => {
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
    expect(report.jianyingOnlyFeatures).toContain('transition');
    expect(report.featureDetails.find((detail) => detail.feature === 'transition')?.clipCount).toBe(1);
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
});
