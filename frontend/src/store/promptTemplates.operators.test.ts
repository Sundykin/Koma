import { describe, expect, it } from 'vitest';
import {
  getCreativeOperatorsByPhase,
  resolveCreativeOperatorTemplate,
} from './promptTemplates';

describe('creative operators', () => {
  it('groups storyboard inference operators by phase and task', () => {
    const operators = getCreativeOperatorsByPhase('storyboard-inference', 'prompt-inference');

    expect(operators.map((operator) => operator.level)).toEqual(['basic', 'advanced', 'studio']);
  });

  it('resolves a concrete creative operator by level', () => {
    const operator = resolveCreativeOperatorTemplate({
      phase: 'batch-rewrite',
      task: 'batch-rewrite',
      level: 'studio',
    });

    expect(operator?.id).toBe('batch-rewrite-studio');
    expect(operator?.templateType).toBe('batch_rewrite');
    expect(operator?.extraInstruction).toContain('导演分镜');
  });
});
