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

  it('keeps the legacy assets step callable while grouping it under project navigation', () => {
    expect(getEditorStep('assets')).toMatchObject({
      id: 'assets',
      visibleInNavigator: false,
      navigatorStepId: 'script',
    });
    expect(resolveEditorNavigatorStepId('assets')).toBe('script');
    expect(resolveEditorNavigatorStepId('storyboard')).toBe('storyboard');
  });
});
