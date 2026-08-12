import { describe, expect, it } from 'vitest';
import type { Character, Prop, Scene } from '../../../frontend/src/types';
import {
  characterRowToEntity,
  characterToRow,
  propRowToEntity,
  propToRow,
  sceneRowToEntity,
  sceneToRow,
} from './projectPersistenceHelpers';

/**
 * 回归：characters / scenes / props 三张表的列是早期定死的，后加的字段没有列。
 * xxxToRow 之前把它们直接丢掉 —— UI 上能编辑，存完再读就没了（静默数据丢失）。
 * 这些用例锁死「写盘 → 读回」必须无损。
 */

const NOW = 1_700_000_000_000;

function roundTripCharacter(character: Character): Character {
  return characterRowToEntity(characterToRow(character, 'p1', 0, NOW));
}

function baseCharacter(partial?: Partial<Character>): Character {
  return {
    id: 'c1',
    name: '顾行',
    role: 'protagonist',
    prompt: '黑色微卷短发的年轻男人',
    ...partial,
  };
}

describe('character 写盘 → 读回', () => {
  it('保留代称', () => {
    expect(roundTripCharacter(baseCharacter({ aliases: '阿行,顾先生' })).aliases).toBe('阿行,顾先生');
  });

  it('保留子形象与激活状态', () => {
    const character = baseCharacter({
      activeVariantId: 'v1',
      variants: [
        {
          id: 'v1',
          name: '少年时期',
          kind: 'age',
          prompt: '少年体型，头发短而蓬乱',
          keywords: '少年,童年',
          media: { costumePhoto: { kind: 'image', localPath: '/youth.png', createdAt: 1 } },
        },
      ],
    });
    const restored = roundTripCharacter(character);
    expect(restored.activeVariantId).toBe('v1');
    expect(restored.variants).toHaveLength(1);
    expect(restored.variants?.[0].name).toBe('少年时期');
    expect(restored.variants?.[0].keywords).toBe('少年,童年');
    expect(restored.variants?.[0].media?.costumePhoto?.localPath).toBe('/youth.png');
  });

  it('保留使用参考图，且不影响定妆照/预览视频', () => {
    const character = baseCharacter({
      media: {
        costumePhoto: { kind: 'image', localPath: '/costume.png', createdAt: 1 },
        previewVideo: { kind: 'video', remoteUrl: 'https://x/p.mp4', createdAt: 1 },
        referenceImage: { kind: 'image', localPath: '/ref.png', createdAt: 1 },
      },
    });
    const restored = roundTripCharacter(character);
    expect(restored.media?.costumePhoto?.localPath).toBe('/costume.png');
    expect(restored.media?.previewVideo?.remoteUrl).toBe('https://x/p.mp4');
    expect(restored.media?.referenceImage?.localPath).toBe('/ref.png');
  });

  it('只有使用参考图时 media 依然重建得出来', () => {
    const character = baseCharacter({
      media: { referenceImage: { kind: 'image', remoteUrl: 'https://x/ref.png', createdAt: 1 } },
    });
    expect(roundTripCharacter(character).media?.referenceImage?.remoteUrl).toBe('https://x/ref.png');
  });

  it('清空音色后读回是 undefined（不会残留旧音色）', () => {
    const restored = roundTripCharacter(baseCharacter({ voiceId: undefined }));
    expect(restored.voiceId).toBeUndefined();
  });

  it('什么都没有时不写 metadata_json，也不凭空造出 media', () => {
    const row = characterToRow(baseCharacter(), 'p1', 0, NOW);
    expect(row.metadata_json).toBeUndefined();
    expect(characterRowToEntity(row).media).toBeUndefined();
  });

  it('metadata_json 损坏时降级读取，不影响其余字段', () => {
    const row = { ...characterToRow(baseCharacter({ aliases: '阿行' }), 'p1', 0, NOW), metadata_json: '{坏的' };
    const restored = characterRowToEntity(row);
    expect(restored.name).toBe('顾行');
    expect(restored.aliases).toBeUndefined();
  });
});

describe('scene / prop 写盘 → 读回', () => {
  it('场景保留代称与使用参考图', () => {
    const scene: Scene = {
      id: 's1',
      name: '旧宅',
      prompt: '荒废的院落',
      aliases: '老宅,故居',
      media: { referenceImage: { kind: 'image', localPath: '/s-ref.png', createdAt: 1 } },
    };
    const restored = sceneRowToEntity(sceneToRow(scene, 'p1', 0, NOW));
    expect(restored.aliases).toBe('老宅,故居');
    expect(restored.media?.referenceImage?.localPath).toBe('/s-ref.png');
  });

  it('道具保留代称与使用参考图', () => {
    const prop: Prop = {
      id: 'p1',
      name: '铜镜',
      prompt: '斑驳的青铜镜',
      aliases: '镜子',
      media: {
        previewImage: { kind: 'image', localPath: '/p.png', createdAt: 1 },
        referenceImage: { kind: 'image', localPath: '/p-ref.png', createdAt: 1 },
      },
    };
    const restored = propRowToEntity(propToRow(prop, 'p1', 0, NOW));
    expect(restored.aliases).toBe('镜子');
    expect(restored.media?.previewImage?.localPath).toBe('/p.png');
    expect(restored.media?.referenceImage?.localPath).toBe('/p-ref.png');
  });
});
