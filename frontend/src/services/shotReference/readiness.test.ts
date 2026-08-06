import { describe, expect, it } from 'vitest';
import { findShotAssetsMissingImages, formatMissingAssetWarning } from './readiness';
import type { Character, Prop, Scene, Shot, StoredMediaAsset } from '../../types';

function asset(localPath?: string, remoteUrl?: string): StoredMediaAsset {
  return { localPath, remoteUrl } as StoredMediaAsset;
}

function char(id: string, name: string, photo?: StoredMediaAsset): Character {
  return { id, name, media: photo ? { costumePhoto: photo } : undefined } as Character;
}

function scene(id: string, name: string, preview?: StoredMediaAsset): Scene {
  return { id, name, media: preview ? { previewImage: preview } : undefined } as Scene;
}

function prop(id: string, name: string, preview?: StoredMediaAsset): Prop {
  return { id, name, media: preview ? { previewImage: preview } : undefined } as Prop;
}

const shotWith = (characters: string[] = [], scenes: string[] = [], props: string[] = []): Shot =>
  ({ id: Math.random().toString(36), characters, scenes, props }) as unknown as Shot;

describe('findShotAssetsMissingImages', () => {
  it('角色无定妆照 → 缺图；有 localPath 或 remoteUrl → 就绪', () => {
    const characters = [
      char('c1', '叶赎'),                              // 无图
      char('c2', '小白', asset('/local/a.png')),       // 本地图
      char('c3', '苏晓', asset(undefined, 'https://x/y.png')), // 远程图
      char('c4', '丹霞', asset()),                     // 槽位存在但无可用源
    ];
    const shots = [shotWith(['c1', 'c2', 'c3', 'c4'])];
    const missing = findShotAssetsMissingImages(shots, characters, [], []);
    expect(missing.map(m => m.id)).toEqual(['c1', 'c4']);
  });

  it('场景与道具按 previewImage 判定', () => {
    const scenes = [scene('s1', '小木屋'), scene('s2', '山脉', asset('/img.png'))];
    const props = [prop('p1', '戒指')];
    const shots = [shotWith([], ['s1', 's2'], ['p1'])];
    const missing = findShotAssetsMissingImages(shots, [], scenes, props);
    expect(missing.map(m => `${m.kind}:${m.name}`)).toEqual(['scene:小木屋', 'prop:戒指']);
  });

  it('只检查目标分镜引用到的资产；跨分镜按 id 去重', () => {
    const characters = [char('c1', '叶赎'), char('c2', '未引用')];
    const shots = [shotWith(['c1']), shotWith(['c1'])];
    const missing = findShotAssetsMissingImages(shots, characters, [], []);
    expect(missing).toHaveLength(1);
    expect(missing[0].name).toBe('叶赎');
  });

  it('引用已删除的资产不报错、不计入', () => {
    const shots = [shotWith(['ghost'])];
    expect(findShotAssetsMissingImages(shots, [], [], [])).toEqual([]);
  });
});

describe('formatMissingAssetWarning', () => {
  it('按类别分组拼接', () => {
    const text = formatMissingAssetWarning([
      { kind: 'character', id: 'c1', name: '叶赎' },
      { kind: 'character', id: 'c2', name: '小白' },
      { kind: 'scene', id: 's1', name: '小木屋' },
    ]);
    expect(text).toBe('角色：叶赎、小白；场景：小木屋');
  });

  it('空列表返回空串', () => {
    expect(formatMissingAssetWarning([])).toBe('');
  });
});
