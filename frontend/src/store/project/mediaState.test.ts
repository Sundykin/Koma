import { describe, expect, it } from 'vitest';
import type { Character, Prop, Scene, StoredMediaAsset } from '../../types';
import {
  normalizeCharacterMediaState,
  normalizePropMediaState,
  normalizeSceneMediaState,
} from './mediaState';

function asset(path: string): StoredMediaAsset {
  return { kind: 'image', localPath: path, createdAt: 1 };
}

/** 没有任何来源的资产：compactAsset 应该把它归一成 undefined */
const emptyAsset: StoredMediaAsset = { kind: 'image', createdAt: 1 };

describe('normalize*MediaState 保留 referenceImage', () => {
  // 回归：normalize 是 load / save 共同的收口点，之前重建 media 时漏了 referenceImage，
  // 导致 AssetDock 里上传的「使用参考图」存进去下次读就没了。
  it('角色的使用参考图不会被丢掉', () => {
    const character: Character = {
      id: 'c1',
      name: '顾行',
      role: 'protagonist',
      prompt: '黑发男人',
      media: { costumePhoto: asset('/costume.png'), referenceImage: asset('/ref.png') },
    };
    expect(normalizeCharacterMediaState(character).media?.referenceImage?.localPath).toBe('/ref.png');
  });

  it('只有使用参考图、没有主图时 media 也要保留', () => {
    const character: Character = {
      id: 'c1',
      name: '顾行',
      role: 'protagonist',
      prompt: '黑发男人',
      media: { referenceImage: asset('/ref.png') },
    };
    expect(normalizeCharacterMediaState(character).media?.referenceImage?.localPath).toBe('/ref.png');
  });

  it('场景与道具的使用参考图同样保留', () => {
    const scene: Scene = { id: 's1', name: '旧宅', prompt: '', media: { referenceImage: asset('/s-ref.png') } };
    const prop: Prop = { id: 'p1', name: '铜镜', prompt: '', media: { referenceImage: asset('/p-ref.png') } };
    expect(normalizeSceneMediaState(scene).media?.referenceImage?.localPath).toBe('/s-ref.png');
    expect(normalizePropMediaState(prop).media?.referenceImage?.localPath).toBe('/p-ref.png');
  });

  it('没有任何可用来源时 media 归一成 undefined', () => {
    const character: Character = {
      id: 'c1',
      name: '顾行',
      role: 'protagonist',
      prompt: '黑发男人',
      media: { referenceImage: emptyAsset },
    };
    expect(normalizeCharacterMediaState(character).media).toBeUndefined();
  });
});

describe('normalizeCharacterMediaState 处理子形象', () => {
  it('保留子形象及其定妆照', () => {
    const character: Character = {
      id: 'c1',
      name: '顾行',
      role: 'protagonist',
      prompt: '黑发男人',
      activeVariantId: 'v1',
      variants: [
        { id: 'v1', name: '少年时期', kind: 'age', prompt: '少年体型', media: { costumePhoto: asset('/youth.png') } },
      ],
    };
    const normalized = normalizeCharacterMediaState(character);
    expect(normalized.activeVariantId).toBe('v1');
    expect(normalized.variants?.[0].media?.costumePhoto?.localPath).toBe('/youth.png');
  });

  it('还没出图的子形象保留文本、media 为 undefined', () => {
    const character: Character = {
      id: 'c1',
      name: '顾行',
      role: 'protagonist',
      prompt: '黑发男人',
      variants: [{ id: 'v2', name: '浴血重伤', kind: 'state', prompt: '肩上刀伤' }],
    };
    const normalized = normalizeCharacterMediaState(character);
    expect(normalized.variants?.[0].prompt).toBe('肩上刀伤');
    expect(normalized.variants?.[0].media).toBeUndefined();
  });

  it('空子形象列表归一成 undefined', () => {
    const character: Character = { id: 'c1', name: '顾行', role: 'protagonist', prompt: '黑发男人', variants: [] };
    expect(normalizeCharacterMediaState(character).variants).toBeUndefined();
  });
});
