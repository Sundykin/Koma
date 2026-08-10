import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPLATES } from './defaults';

describe('视频推理模板的时长由变量注入', () => {
  it.each(['shot_video_multi', 'shot_video_firstframe'] as const)('%s 用 {{durationSeconds}} 而不是写死档位', (id) => {
    const template = DEFAULT_TEMPLATES[id];
    expect(template.template).toContain('{{durationSeconds}}');
    expect(template.template).toContain('精确时长：{{durationSeconds}}秒');
    expect(template.variables.map(v => v.name)).toContain('durationSeconds');
    // 正文里不应再残留任何写死的档位秒数
    expect(template.template).not.toMatch(/总时长\s*\d+\s*秒/);
    expect(template.template).not.toMatch(/精确时长：\d+秒/);
  });
});

describe('已下线的模板不再注册', () => {
  // 零调用方却仍在 PromptStudio 里可编辑的模板（改了不生效，误导性配置项）
  const retired = ['itv_shot_video', 'tti_shot_image', 'script_generation'];
  // 时长档位取消后，8 个按档位拆分的视频模板收敛成 2 个
  const retiredBuckets = [
    'shot_video_6s_multi', 'shot_video_10s_multi', 'shot_video_15s_multi', 'shot_video_20s_multi',
    'shot_video_6s_firstframe', 'shot_video_10s_firstframe', 'shot_video_16s_firstframe', 'shot_video_20s_firstframe',
  ];

  it.each([...retired, ...retiredBuckets])('%s 已从默认模板移除', (id) => {
    expect(Object.keys(DEFAULT_TEMPLATES)).not.toContain(id);
  });
});
