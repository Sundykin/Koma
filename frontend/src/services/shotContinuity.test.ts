import { describe, expect, it } from 'vitest';
import type { Shot } from '../types';
import {
  decideShotContinuity,
  normalizeShotContinuity,
  normalizeShotVideoReference,
} from './shotContinuity';

function makeShot(id: string, overrides: Partial<Shot> = {}): Shot {
  return {
    id,
    scriptLines: [{ id: `${id}-line`, text: '人物站在房间里' }],
    shotType: 'medium',
    cameraMovement: 'static',
    duration: 6,
    characters: [],
    ...overrides,
  };
}

describe('shot continuity', () => {
  it('always makes the first shot independent', () => {
    expect(decideShotContinuity(undefined, makeShot('a'), { usePreviousTailFrame: true })).toEqual({
      usePreviousTailFrame: false,
      reason: '第一镜没有上一镜，按独立镜头生成',
    });
  });

  it('inherits in the same scene and for an ongoing character action', () => {
    const previous = makeShot('a', { scenes: ['room'], characters: ['hero'] });
    const sameScene = makeShot('b', { scenes: ['room'] });
    const ongoingAction = makeShot('c', {
      characters: ['hero'],
      scriptLines: [{ id: 'c-line', text: '他接着转身，目光仍追随门外的人' }],
    });

    expect(decideShotContinuity(previous, sameScene).usePreviousTailFrame).toBe(true);
    expect(decideShotContinuity(previous, ongoingAction).usePreviousTailFrame).toBe(true);
  });

  it('rejects explicit transitions and distinct known scenes even when LLM suggests inheritance', () => {
    const previous = makeShot('a', { scenes: ['room'] });
    const transition = makeShot('b', {
      scenes: ['street'],
      scriptLines: [{ id: 'b-line', text: '次日，画面切到街道' }],
    });
    const decision = decideShotContinuity(previous, transition, {
      usePreviousTailFrame: true,
      reason: '模型误判',
    });

    expect(decision.usePreviousTailFrame).toBe(false);
    expect(decision.reason).toContain('转场');
  });

  it('normalizes final ordering and preserves manual overrides plus the auto suggestion', () => {
    const shots = normalizeShotContinuity([
      makeShot('a'),
      makeShot('b', {
        scenes: ['room'],
        videoReference: {
          mode: 'manual',
          usePreviousTailFrame: false,
          autoUsePreviousTailFrame: true,
          sourceShotId: 'old-source',
          referenceFrame: { kind: 'image', localPath: '/tmp/old.png', createdAt: 1 },
        },
      }),
    ]);

    expect(shots[0].videoReference).toMatchObject({ mode: 'auto', usePreviousTailFrame: false });
    expect(shots[1].videoReference).toMatchObject({
      mode: 'manual',
      usePreviousTailFrame: false,
      autoUsePreviousTailFrame: true,
      sourceShotId: 'a',
    });
    expect(shots[1].videoReference?.referenceFrame).toBeUndefined();
  });

  it('drops invalid persisted records safely', () => {
    expect(normalizeShotVideoReference({ mode: 'manual', usePreviousTailFrame: 'yes' })).toBeUndefined();
    expect(normalizeShotVideoReference({ mode: 'other', usePreviousTailFrame: true })).toBeUndefined();
  });
});
