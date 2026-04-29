import type { EditorStep, EpisodeStepProgress } from '../types';
import { listEditorStepIds } from './editorStepRegistry';

const defaultStepProgress: EpisodeStepProgress = {
  assets: 'pending',
  storyboard: 'pending',
  video: 'pending',
};

export type EpisodeEditorEntryMode = 'resume-progress' | 'start-production';

export interface EpisodeEditorEntryOptions {
  mode?: EpisodeEditorEntryMode;
}

export function resolveEpisodeEditorEntry(
  stepProgress?: EpisodeStepProgress,
  options: EpisodeEditorEntryOptions = {},
): { stepProgress: EpisodeStepProgress; initialStep: EditorStep } {
  const progress = stepProgress || { ...defaultStepProgress };
  const stepOrder = listEditorStepIds();
  const fallbackStep = (stepOrder[0] || 'assets') as EditorStep;

  if (options.mode === 'start-production') {
    return { stepProgress: progress, initialStep: fallbackStep };
  }

  const pending = stepOrder.find((step) => progress[step as EditorStep] === 'pending');
  return { stepProgress: progress, initialStep: (pending ?? fallbackStep) as EditorStep };
}
