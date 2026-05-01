import { describe, expect, it } from 'vitest';
import { getDefaultTemplate } from './promptTemplates';

describe('default shot breakdown prompt templates', () => {
  it('使用运行时变量 durationConstraint / durationDefault 注入时长约束', () => {
    const systemTemplate = getDefaultTemplate('shot_breakdown_system').template;
    const userTemplate = getDefaultTemplate('shot_breakdown').template;
    const combined = `${systemTemplate}\n${userTemplate}`;

    // 模板里不再硬编码 grok 风格枚举，改为占位符；具体允许值由调用方按当前
    // ITV 渠道的 VideoDurationSpec 在编译模板时注入
    expect(systemTemplate).not.toContain('6、10、12、16、20');
    expect(userTemplate).not.toContain('6、10、12、16、20');

    expect(systemTemplate).toContain('{{durationConstraint}}');
    expect(systemTemplate).toContain('{{durationDefault}}');
    expect(userTemplate).toContain('{{durationConstraint}}');
    expect(userTemplate).toContain('{{durationDefault}}');

    // 历史回归保护：不应该出现历史"15 秒"等旧约束遗留
    expect(combined).not.toContain('15 秒以内');
    expect(combined).not.toContain('最大 15 秒');
    expect(combined).not.toContain('"duration": 15');
  });

  it('shot_breakdown_system 模板声明了 durationConstraint / durationDefault 变量', () => {
    const tpl = getDefaultTemplate('shot_breakdown_system');
    const names = tpl.variables.map((v) => v.name);
    expect(names).toContain('durationConstraint');
    expect(names).toContain('durationDefault');
  });

  it('shot_breakdown 模板声明了 durationConstraint / durationDefault 变量', () => {
    const tpl = getDefaultTemplate('shot_breakdown');
    const names = tpl.variables.map((v) => v.name);
    expect(names).toContain('durationConstraint');
    expect(names).toContain('durationDefault');
  });

  it('默认模板要求完整覆盖剧本，避免摘要式合并丢细节', () => {
    const systemTemplate = getDefaultTemplate('shot_breakdown_system').template;
    const userTemplate = getDefaultTemplate('shot_breakdown').template;

    expect(systemTemplate).toContain('不能跳段');
    expect(systemTemplate).toContain('不能摘要式合并中间动作');
    expect(systemTemplate).toContain('宁可分镜多，也不要丢失细节');
    expect(userTemplate).toContain('不得只抽取“大事件”');
    expect(userTemplate).toContain('每个原文句子/动作/环境变化/视线变化/停顿/台词都必须归入某个分镜');
    expect(userTemplate).toContain('宁可多分镜，也不要丢细节');
  });
});

