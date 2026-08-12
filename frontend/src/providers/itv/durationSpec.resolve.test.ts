import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIDEO_DURATION_SPEC,
  getDurationSpecForITVSelection,
  resolveItvDurationSpec,
} from './durationSpec';

/**
 * 回归：时长 spec 曾经有两套解析。
 *
 * 分镜分析走 getDurationSpecForITVSelection（先读模型 defaults），而 Storyboard /
 * App / 灵绘三处 UI 各自手写成 `byModel ?? byProviderType`，**漏掉 defaults 这一层**。
 * 后果：自建 ComfyUI 渠道明明配了 5–15 秒，UI 却拿到 grok 的 6/12/16/20 枚举，
 * 还会按它 clamp 掉存进去的时长（于是出现 16s 这种 5–15 里不可能有的值）。
 */

const COMFY_MODEL_DEFAULTS = { authMode: 'basic', durationMin: 5, durationMax: 15 };

describe('resolveItvDurationSpec 优先级', () => {
  it('模型 defaults 最优先', () => {
    expect(resolveItvDurationSpec({
      modelDefaults: COMFY_MODEL_DEFAULTS,
      modelId: 'seedance-2.0-f',      // 前缀表里有，但不该赢
      providerType: 'grok2api-imagine-itv', // provider 表里有，更不该赢
    })).toEqual({ kind: 'range', min: 5, max: 15, step: 1, default: 5 });
  });

  it('没有 defaults 时按 modelId 前缀', () => {
    expect(resolveItvDurationSpec({ modelId: 'seedance-2.0-f' }))
      .toEqual({ kind: 'range', min: 4, max: 15, step: 1, default: 5 });
  });

  it('再回落 providerType', () => {
    expect(resolveItvDurationSpec({ providerType: 'minimax-h3-itv' }))
      .toEqual({ kind: 'range', min: 4, max: 15, step: 1, default: 5 });
  });

  it('全都识别不了才用 DEFAULT', () => {
    expect(resolveItvDurationSpec({})).toEqual(DEFAULT_VIDEO_DURATION_SPEC);
  });

  it('ComfyUI 渠道没配时长时给宽区间，而不是 grok 枚举', () => {
    // 时长完全由工作流决定；落到 6/12/16/20 会让用户看到一个跟自己工作流无关的下拉
    const spec = resolveItvDurationSpec({ providerType: 'comfyui-itv' });
    expect(spec.kind).toBe('range');
    expect(spec).toMatchObject({ min: 4, max: 30 });
  });

  it('残缺的 defaults 不生效，继续往下回落', () => {
    // 只有 min 没有 max → 构不成 range
    expect(resolveItvDurationSpec({
      modelDefaults: { durationMin: 5 },
      providerType: 'minimax-h3-itv',
    })).toEqual({ kind: 'range', min: 4, max: 15, step: 1, default: 5 });
  });
});

describe('getDurationSpecForITVSelection 与 resolveItvDurationSpec 口径一致', () => {
  const channels = [{
    id: 'chan-comfy',
    providerType: 'comfyui-itv',
    models: [{ id: 'minimax-h3', providerModelName: 'MiniMax H3 参考生视频', defaults: COMFY_MODEL_DEFAULTS }],
  }];

  it('自建 ComfyUI 渠道解析出 5–15，而不是 grok 枚举', () => {
    const spec = getDurationSpecForITVSelection('chan-comfy::minimax-h3', channels);
    expect(spec).toEqual({ kind: 'range', min: 5, max: 15, step: 1, default: 5 });
    // 16 是 grok 枚举才有的值，不该出现在这个区间里
    expect(spec.kind === 'range' && spec.max).toBe(15);
  });

  it('两条入口对同一渠道给出相同结果', () => {
    const viaSelection = getDurationSpecForITVSelection('chan-comfy::minimax-h3', channels);
    const viaResolve = resolveItvDurationSpec({
      modelDefaults: COMFY_MODEL_DEFAULTS,
      modelId: 'minimax-h3',
      providerType: 'comfyui-itv',
    });
    expect(viaSelection).toEqual(viaResolve);
  });

  it('selectionKey 为空时用 DEFAULT', () => {
    expect(getDurationSpecForITVSelection(undefined, channels)).toEqual(DEFAULT_VIDEO_DURATION_SPEC);
  });
});
