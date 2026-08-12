import { describe, expect, it } from 'vitest';
import type { Character, CharacterVariant, Shot, StoredMediaAsset } from '../types';
import {
  resolveActiveVariant,
  resolveCharacterAppearance,
  resolveCharactersAppearance,
} from './characterVariants';

function asset(path: string): StoredMediaAsset {
  return { kind: 'image', localPath: path, createdAt: 1 };
}

const youth: CharacterVariant = {
  id: 'var-youth',
  name: '少年时期',
  kind: 'age',
  prompt: '十三四岁的少年体型，头发短而蓬乱',
  media: { costumePhoto: asset('/youth.png') },
};

const wounded: CharacterVariant = {
  id: 'var-wounded',
  name: '浴血重伤',
  kind: 'state',
  // 故意没有 media：验证未出图的子形象回落到主形象定妆照
  prompt: '左肩一道深长刀伤，衣襟被血浸成暗红',
};

function makeCharacter(partial?: Partial<Character>): Character {
  return {
    id: 'char-1',
    name: '顾行',
    role: 'protagonist',
    prompt: '黑色微卷短发的年轻男人',
    media: { costumePhoto: asset('/main.png') },
    variants: [youth, wounded],
    ...partial,
  };
}

function makeShot(characterVariants?: Record<string, string>): Shot {
  return {
    id: 'shot-1',
    scriptLines: [],
    shotType: 'medium',
    cameraMovement: 'static',
    duration: 5,
    characters: ['char-1'],
    characterVariants,
  };
}

describe('resolveActiveVariant', () => {
  it('分镜级激活优先于角色级激活', () => {
    const character = makeCharacter({ activeVariantId: 'var-wounded' });
    expect(resolveActiveVariant(character, makeShot({ 'char-1': 'var-youth' }))?.id).toBe('var-youth');
  });

  it('分镜没指定时回落到角色级激活', () => {
    const character = makeCharacter({ activeVariantId: 'var-wounded' });
    expect(resolveActiveVariant(character, makeShot())?.id).toBe('var-wounded');
  });

  it('都没有激活时用主形象', () => {
    expect(resolveActiveVariant(makeCharacter(), makeShot())).toBeUndefined();
  });

  it('variantId 指向已删除的子形象时回落主形象', () => {
    const character = makeCharacter({ activeVariantId: 'var-gone' });
    expect(resolveActiveVariant(character, makeShot())).toBeUndefined();
  });

  it('角色没有子形象时永远是主形象', () => {
    const character = makeCharacter({ variants: undefined, activeVariantId: 'var-youth' });
    expect(resolveActiveVariant(character, makeShot({ 'char-1': 'var-youth' }))).toBeUndefined();
  });
});

describe('resolveCharacterAppearance', () => {
  it('激活子形象时把差异描述并入 prompt，并换成子形象定妆照', () => {
    const resolved = resolveCharacterAppearance(makeCharacter(), makeShot({ 'char-1': 'var-youth' }));
    expect(resolved.prompt).toContain('黑色微卷短发的年轻男人');
    expect(resolved.prompt).toContain('【少年时期】十三四岁的少年体型');
    expect(resolved.media?.costumePhoto?.localPath).toBe('/youth.png');
  });

  it('子形象还没出图时保留主形象定妆照（不能让这镜没有角色参考）', () => {
    const resolved = resolveCharacterAppearance(makeCharacter(), makeShot({ 'char-1': 'var-wounded' }));
    expect(resolved.prompt).toContain('【浴血重伤】');
    expect(resolved.media?.costumePhoto?.localPath).toBe('/main.png');
  });

  it('用主形象时原样返回同一引用', () => {
    const character = makeCharacter();
    expect(resolveCharacterAppearance(character, makeShot())).toBe(character);
  });

  it('不改动原对象', () => {
    const character = makeCharacter();
    resolveCharacterAppearance(character, makeShot({ 'char-1': 'var-youth' }));
    expect(character.prompt).toBe('黑色微卷短发的年轻男人');
    expect(character.media?.costumePhoto?.localPath).toBe('/main.png');
  });
});

describe('resolveCharactersAppearance', () => {
  it('按分镜逐个解析，未激活的角色保持原样', () => {
    const other: Character = { id: 'char-2', name: '林晚', role: 'supporting', prompt: '白衣女子' };
    const resolved = resolveCharactersAppearance(
      [makeCharacter(), other],
      makeShot({ 'char-1': 'var-youth' }),
    );
    expect(resolved[0].media?.costumePhoto?.localPath).toBe('/youth.png');
    expect(resolved[1]).toBe(other);
  });
});
