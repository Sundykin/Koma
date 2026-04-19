import { describe, expect, it } from 'vitest';
import type { Character, Prop, Scene, Shot } from '../types';
import { repairShotAssetBindings } from './shotAssetBindingRepair';

function createShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: 'shot-1',
    scriptContent: '',
    shotType: 'medium',
    cameraMovement: 'static',
    duration: 3,
    characters: [],
    scenes: [],
    props: [],
    ...overrides,
  };
}

function createCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    name: '小明',
    prompt: '',
    description: '',
    episodeRefs: [],
    ...overrides,
  } as Character;
}

function createScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: 'scene-1',
    name: '森林',
    prompt: '',
    description: '',
    episodeRefs: [],
    ...overrides,
  } as Scene;
}

function createProp(overrides: Partial<Prop> = {}): Prop {
  return {
    id: 'prop-1',
    name: '宝剑',
    prompt: '',
    description: '',
    episodeRefs: [],
    ...overrides,
  } as Prop;
}

describe('repairShotAssetBindings', () => {
  it('把旧的名称引用修复成当前项目资产 ID', () => {
    const result = repairShotAssetBindings(
      [
        createShot({
          characters: ['小明'],
          scenes: ['森林'],
          props: ['宝剑'],
        }),
      ],
      {
        characters: [createCharacter()],
        scenes: [createScene()],
        props: [createProp()],
      },
    );

    expect(result.changedShotCount).toBe(1);
    expect(result.repairedReferenceCount).toBe(3);
    expect(result.shots[0].characters).toEqual(['char-1']);
    expect(result.shots[0].scenes).toEqual(['scene-1']);
    expect(result.shots[0].props).toEqual(['prop-1']);
  });

  it('把旧的 provider 资产 ID 归一化成项目资产 ID', () => {
    const result = repairShotAssetBindings(
      [
        createShot({
          characters: ['sora2-char-1'],
          props: ['sora2-prop-1'],
        }),
      ],
      {
        characters: [createCharacter({ sora2CharacterId: 'sora2-char-1' })],
        scenes: [createScene()],
        props: [createProp({ sora2PropId: 'sora2-prop-1' })],
      },
    );

    expect(result.changedShotCount).toBe(1);
    expect(result.repairedReferenceCount).toBe(2);
    expect(result.shots[0].characters).toEqual(['char-1']);
    expect(result.shots[0].props).toEqual(['prop-1']);
  });

  it('忽略无法匹配的旧引用', () => {
    const result = repairShotAssetBindings(
      [
        createShot({
          characters: ['不存在的角色'],
          scenes: ['scene-1'],
        }),
      ],
      {
        characters: [createCharacter()],
        scenes: [createScene()],
        props: [createProp()],
      },
    );

    expect(result.changedShotCount).toBe(1);
    expect(result.repairedReferenceCount).toBe(1);
    expect(result.shots[0].characters).toEqual([]);
    expect(result.shots[0].scenes).toEqual(['scene-1']);
  });

  it('已是当前项目资产 ID 时不做改动', () => {
    const shot = createShot({
      characters: ['char-1'],
      scenes: ['scene-1'],
      props: ['prop-1'],
    });

    const result = repairShotAssetBindings(
      [shot],
      {
        characters: [createCharacter()],
        scenes: [createScene()],
        props: [createProp()],
      },
    );

    expect(result.changedShotCount).toBe(0);
    expect(result.repairedReferenceCount).toBe(0);
    expect(result.shots[0]).toBe(shot);
  });
});
