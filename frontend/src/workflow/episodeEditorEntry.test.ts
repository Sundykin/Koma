import { describe, expect, it } from 'vitest';
import { resolveEpisodeEditorEntry } from './episodeEditorEntry';
import type { EpisodeStepProgress } from '../types';

describe('resolveEpisodeEditorEntry', () => {
  it('starts production on assets even when assets are completed and storyboard is pending', () => {
    const stepProgress: EpisodeStepProgress = {
      assets: 'completed',
      storyboard: 'pending',
      video: 'pending',
    };

    const entry = resolveEpisodeEditorEntry(stepProgress, { mode: 'start-production' });

    expect(entry.initialStep).toBe('assets');
    expect(entry.stepProgress).toEqual(stepProgress);
  });

  it('keeps resume-progress behavior on the first pending step', () => {
    const stepProgress: EpisodeStepProgress = {
      assets: 'completed',
      storyboard: 'pending',
      video: 'pending',
    };

    expect(resolveEpisodeEditorEntry(stepProgress).initialStep).toBe('storyboard');
  });
});
