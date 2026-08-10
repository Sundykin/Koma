import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPLATES } from './defaults';
import {
  FIRST_FRAME_DURATIONS,
  MULTI_REF_DURATIONS,
} from '../templates/videoReasoning';

describe('视频推理模板按时长展开', () => {
  it.each(MULTI_REF_DURATIONS)('多参 %i 秒模板的时长全部落到位', (seconds) => {
    const template = DEFAULT_TEMPLATES[`shot_video_${seconds}s_multi`].template;
    expect(template).toContain(`（多参 · ${seconds} 秒）`);
    expect(template).toContain(`**总时长 ${seconds} 秒**：单元内全部镜头时长之和 = ${seconds} 秒（±0.2 秒）。`);
    expect(template.trimEnd().endsWith(`精确时长：${seconds}秒`)).toBe(true);
    expect(template).not.toContain('__DURATION__');
  });

  it.each(FIRST_FRAME_DURATIONS)('首帧延展 %i 秒模板的时长全部落到位', (seconds) => {
    const template = DEFAULT_TEMPLATES[`shot_video_${seconds}s_firstframe`].template;
    expect(template).toContain(`（首帧延展 · ${seconds} 秒）`);
    expect(template).toContain(`0 秒 = 单图首帧；${seconds} 秒 = 结束帧`);
    expect(template.trimEnd().endsWith(`精确时长：${seconds}秒`)).toBe(true);
    expect(template).not.toContain('__DURATION__');
  });

  /** 两个档位逐行比对，返回内容不同的行号。 */
  function differingLines(idA: string, idB: string): number[] {
    const a = DEFAULT_TEMPLATES[idA].template.split('\n');
    const b = DEFAULT_TEMPLATES[idB].template.split('\n');
    expect(a).toHaveLength(b.length);
    return a.map((line, i) => (line === b[i] ? -1 : i)).filter(i => i >= 0);
  }

  it('多参协议只有带时长的那几行随档位变化', () => {
    const diff = differingLines('shot_video_6s_multi', 'shot_video_20s_multi');
    const lines = DEFAULT_TEMPLATES.shot_video_20s_multi.template.split('\n');
    expect(diff.length).toBeGreaterThan(0);
    for (const i of diff) expect(lines[i]).toMatch(/20\s*秒/);
  });

  it('首帧协议只有带时长的那几行随档位变化', () => {
    const diff = differingLines('shot_video_6s_firstframe', 'shot_video_20s_firstframe');
    const lines = DEFAULT_TEMPLATES.shot_video_20s_firstframe.template.split('\n');
    expect(diff.length).toBeGreaterThan(0);
    for (const i of diff) expect(lines[i]).toMatch(/20\s*秒/);
  });
});

describe('已下线的模板不再注册', () => {
  // 三个模板都没有任何 resolvePromptTemplate 调用方，却仍在 PromptStudio 里可编辑，
  // 用户改了也不生效——属于误导性配置项，已移除。
  it.each(['itv_shot_video', 'tti_shot_image', 'script_generation'])('%s 已从默认模板移除', (id) => {
    expect(Object.keys(DEFAULT_TEMPLATES)).not.toContain(id);
  });
});
