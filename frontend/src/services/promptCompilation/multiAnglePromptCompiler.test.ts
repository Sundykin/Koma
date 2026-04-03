import { describe, expect, it } from 'vitest';
import { compileLinghuiMultiAnglePrompt } from './multiAnglePromptCompiler';

describe('multiAnglePromptCompiler', () => {
  it('appends SKS camera prompt by default', () => {
    const result = compileLinghuiMultiAnglePrompt({
      prompt: '角色设定图，保持服装与发型一致',
      config: {
        azimuth: 45,
        elevation: 30,
        distance: 1,
      },
    });

    expect(result.anglePrompt).toBe('<sks> front-right quarter view elevated shot medium shot');
    expect(result.compiledPrompt).toBe(result.anglePrompt);
    expect(result.summary).toBe('前右 3/4 / 稍高 / 中景');
  });

  it('supports descriptor-only protocol', () => {
    const result = compileLinghuiMultiAnglePrompt({
      prompt: '',
      config: {
        azimuth: 180,
        elevation: -30,
        distance: 1.8,
        promptProtocol: 'descriptor-only-v1',
      },
    });

    expect(result.anglePrompt).toBe('back view low-angle shot wide shot');
    expect(result.compiledPrompt).toBe('back view low-angle shot wide shot');
  });
});
