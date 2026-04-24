import { describe, expect, it } from 'vitest';
import { getDefaultTemplate } from './promptTemplates';

describe('default shot breakdown prompt templates', () => {
  it('要求镜头时长控制在 10 秒左右而不是 10 秒以内', () => {
    const systemTemplate = getDefaultTemplate('shot_breakdown_system').template;
    const userTemplate = getDefaultTemplate('shot_breakdown').template;

    expect(systemTemplate).toContain('duration: 预估时长（秒），约 10 秒');
    expect(systemTemplate).toContain('每个镜头控制在10秒左右');
    expect(userTemplate).toContain('每个镜头时长控制在10秒左右');
    expect(userTemplate).toContain('duration 建议填写约 10 秒');
    expect(userTemplate).toContain('"duration": 10');
    expect(`${systemTemplate}\n${userTemplate}`).not.toContain('10秒以内');
  });
});
