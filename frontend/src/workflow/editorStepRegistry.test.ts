import { describe, expect, it } from 'vitest';
import {
  getEditorStep,
  listEditorStepIds,
  listEditorSteps,
  resolveEditorNavigatorStepId,
} from './editorStepRegistry';

describe('unified project editor steps', () => {
  it('shows project, storyboard and video as the main production flow', () => {
    expect(listEditorStepIds()).toEqual(['script', 'storyboard', 'video']);
    expect(listEditorSteps().map((step) => step.id)).toEqual(['script', 'storyboard', 'video']);
    expect(getEditorStep('script')?.nextAction?.targetStepId).toBe('storyboard');
  });

  it('no longer registers the legacy assets step (asset management lives in the project step drawer)', () => {
    expect(getEditorStep('assets')).toBeUndefined();
    expect(resolveEditorNavigatorStepId('storyboard')).toBe('storyboard');
  });
});
