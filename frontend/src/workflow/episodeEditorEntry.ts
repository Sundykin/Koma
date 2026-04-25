import type { EditorStep, EpisodeStepProgress } from '../types';

const defaultStepProgress: EpisodeStepProgress = {
  assets: 'pending',
  storyboard: 'pending',
  video: 'pending',
};

const stepOrder: EditorStep[] = ['assets', 'storyboard', 'video'];

export type EpisodeEditorEntryMode = 'resume-progress' | 'start-production';

export interface EpisodeEditorEntryOptions {
  mode?: EpisodeEditorEntryMode;
}

export function resolveEpisodeEditorEntry(
  stepProgress?: EpisodeStepProgress,
  options: EpisodeEditorEntryOptions = {},
): { stepProgress: EpisodeStepProgress; initialStep: EditorStep } {
  const progress = stepProgress || { ...defaultStepProgress };

  if (options.mode === 'start-production') {
    return { stepProgress: progress, initialStep: 'assets' };
  }

  const initialStep = stepOrder.find(step => progress[step] === 'pending') || 'assets';
  return { stepProgress: progress, initialStep };
}
