import { describe, expect, it } from 'vitest';
import { getDefaultTemplate } from './promptTemplates';

describe('default shot breakdown prompt templates', () => {
  it('要求镜头时长只能填写上游允许的白名单值', () => {
    const systemTemplate = getDefaultTemplate('shot_breakdown_system').template;
    const userTemplate = getDefaultTemplate('shot_breakdown').template;
    const combined = `${systemTemplate}\n${userTemplate}`;

    expect(systemTemplate).toContain('只能填写 6、10、12、16、20 之一');
    expect(systemTemplate).toContain('推荐默认 10 秒');
    expect(userTemplate).toContain('duration 只能填写 6、10、12、16、20 之一');
    expect(userTemplate).toContain('无法判断时填写 10');
    expect(userTemplate).toContain('"duration": 10');
    expect(combined).not.toContain('15 秒以内');
    expect(combined).not.toContain('最大 15 秒');
    expect(combined).not.toContain('"duration": 15');
  });
});
