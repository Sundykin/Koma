import { describe, expect, it } from 'vitest';
import type { Shot } from '../types';
import { normalizeShotContinuity, parseContinuityMode } from './shotContinuity';

/**
 * 承接方式改由分镜拆解时 AI 判定。
 *
 * 「同机位无缝续演」和「同场景但换了机位」剧情信号不同，后期规则（同场景 / 相同角色 /
 * 连续动作词）区分不了 —— 以前一律退化成尾帧承接，整段延长模式基本没人用得上。
 */

function shot(id: string, partial?: Partial<Shot>): Shot {
  return {
    id,
    scriptLines: [],
    shotType: 'medium',
    cameraMovement: 'static',
    duration: 15,
    characters: [],
    scenes: ['scene-1'],
    ...partial,
  };
}

describe('parseContinuityMode', () => {
  it('识别三种承接方式与常见写法变体', () => {
    expect(parseContinuityMode('video-extend')).toBe('video-extend');
    expect(parseContinuityMode('videoExtend')).toBe('video-extend');
    expect(parseContinuityMode('tail-frame')).toBe('tail-frame');
    expect(parseContinuityMode('TailFrame')).toBe('tail-frame');
    expect(parseContinuityMode('none')).toBe('none');
    expect(parseContinuityMode('independent')).toBe('none');
  });

  it('识别不了就返回 undefined，交给既有规则兜底', () => {
    expect(parseContinuityMode('')).toBeUndefined();
    expect(parseContinuityMode(undefined)).toBeUndefined();
    expect(parseContinuityMode('随便什么')).toBeUndefined();
  });
});

describe('normalizeShotContinuity 采用 AI 判定的承接方式', () => {
  it('video-extend 落到 videoReference.continuity，并标记承接上一镜', () => {
    const [, second] = normalizeShotContinuity(
      [shot('s1'), shot('s2')],
      [{}, { continuityMode: 'video-extend', continuityReason: '同机位续演举杯动作' }],
    );
    expect(second.videoReference?.continuity).toBe('video-extend');
    expect(second.videoReference?.usePreviousTailFrame).toBe(true);
    expect(second.videoReference?.continuityReason).toBe('同机位续演举杯动作');
  });

  it('tail-frame 走尾帧承接', () => {
    const [, second] = normalizeShotContinuity(
      [shot('s1'), shot('s2')],
      [{}, { continuityMode: 'tail-frame', continuityReason: '同场景切特写' }],
    );
    expect(second.videoReference?.continuity).toBe('tail-frame');
    expect(second.videoReference?.usePreviousTailFrame).toBe(true);
  });

  it('none 不承接上一镜', () => {
    const [, second] = normalizeShotContinuity(
      [shot('s1'), shot('s2', { scenes: ['scene-2'] })],
      [{}, { continuityMode: 'none', continuityReason: '换场景' }],
    );
    expect(second.videoReference?.usePreviousTailFrame).toBe(false);
  });

  it('首镜永远独立', () => {
    const [first] = normalizeShotContinuity(
      [shot('s1'), shot('s2')],
      [{ continuityMode: 'video-extend' }, {}],
    );
    expect(first.videoReference?.usePreviousTailFrame).toBe(false);
  });

  it('用户手动选过的承接方式不被 AI 判定覆盖', () => {
    const manual = shot('s2', {
      videoReference: { mode: 'manual', usePreviousTailFrame: true, continuity: 'tail-frame' },
    });
    const [, second] = normalizeShotContinuity(
      [shot('s1'), manual],
      [{}, { continuityMode: 'video-extend' }],
    );
    expect(second.videoReference?.continuity).toBe('tail-frame');
  });

  it('硬断点否掉承接时，不留下不生效的 video-extend 脏值', () => {
    const [, second] = normalizeShotContinuity(
      // 换了场景 = 硬断点，规则层直接否掉承接，AI 的 video-extend 不该再落库
      [shot('s1'), shot('s2', { scenes: ['scene-2'] })],
      [{}, { continuityMode: 'video-extend' }],
    );
    expect(second.videoReference?.usePreviousTailFrame).toBe(false);
    expect(second.videoReference?.continuity).toBe('tail-frame');
  });

  it('chunk 首镜的局部建议被忽略（看不到真实上一镜）', () => {
    const [, second] = normalizeShotContinuity(
      [shot('s1'), shot('s2')],
      [{}, { continuityMode: 'video-extend', ignoreContinuitySuggestion: true }],
    );
    // 回落到规则判断：同场景 → 承接，但方式回到默认尾帧
    expect(second.videoReference?.continuity).toBe('tail-frame');
  });

  it('AI 没给 continuityMode 时行为不变（默认尾帧）', () => {
    const [, second] = normalizeShotContinuity(
      [shot('s1'), shot('s2')],
      [{}, { continuity: 'inherit' }],
    );
    expect(second.videoReference?.continuity).toBe('tail-frame');
    expect(second.videoReference?.usePreviousTailFrame).toBe(true);
  });
});
