import { describe, expect, it } from 'vitest';
import { mergeAssetEntities } from './entityMerge';

/**
 * 子形象是分块提取出来的：同一角色会在多个 chunk 里各出现一次，
 * 后来的那份通常没有 media。覆盖式合并会把已经出过图的子形象整批冲掉。
 */

interface TestVariant {
  id: string;
  name: string;
  prompt?: string;
  media?: { costumePhoto?: unknown };
}

interface TestCharacter {
  id: string;
  name: string;
  prompt?: string;
  aliases?: string;
  media?: { costumePhoto?: unknown };
  variants?: TestVariant[];
}

function character(partial: Partial<TestCharacter> & { id: string; name: string }): TestCharacter {
  return partial as TestCharacter;
}

describe('mergeAssetEntities 合并角色子形象', () => {
  it('同名子形象保留既有 id 与已生成的图', () => {
    const existing = [
      character({
        id: 'c1',
        name: '顾行',
        variants: [
          { id: 'v-old', name: '流浪时期', prompt: '衣衫褴褛', media: { costumePhoto: { localPath: '/a.png' } } },
        ],
      }),
    ];
    const incoming = [
      character({
        id: 'c2',
        name: '顾行',
        variants: [{ id: 'v-new', name: '流浪时期', prompt: '衣衫褴褛，赤脚' }],
      }),
    ];

    const merged = mergeAssetEntities(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].variants).toHaveLength(1);
    expect(merged[0].variants?.[0].id).toBe('v-old');
    expect(merged[0].variants?.[0].media?.costumePhoto).toEqual({ localPath: '/a.png' });
    // 已出图的子形象保留旧 prompt：新描述会与已生成的图打架
    expect(merged[0].variants?.[0].prompt).toBe('衣衫褴褛');
  });

  it('未出图的同名子形象采用新描述', () => {
    const existing = [
      character({ id: 'c1', name: '顾行', variants: [{ id: 'v1', name: '入府之后', prompt: '旧描述' }] }),
    ];
    const incoming = [
      character({ id: 'c2', name: '顾行', variants: [{ id: 'v2', name: '入府之后', prompt: '藕荷色云锦长衫' }] }),
    ];
    const merged = mergeAssetEntities(existing, incoming);
    expect(merged[0].variants?.[0].id).toBe('v1');
    expect(merged[0].variants?.[0].prompt).toBe('藕荷色云锦长衫');
  });

  it('新出现的子形象追加而不是覆盖', () => {
    const existing = [
      character({ id: 'c1', name: '顾行', variants: [{ id: 'v1', name: '流浪时期', prompt: 'a' }] }),
    ];
    const incoming = [
      character({ id: 'c2', name: '顾行', variants: [{ id: 'v2', name: '入府之后', prompt: 'b' }] }),
    ];
    const merged = mergeAssetEntities(existing, incoming);
    expect(merged[0].variants?.map(v => v.name)).toEqual(['流浪时期', '入府之后']);
  });

  it('按代称命中同一角色时也合并子形象', () => {
    const existing = [
      character({ id: 'c1', name: '顾行', aliases: '阿行', variants: [{ id: 'v1', name: '流浪时期', prompt: 'a' }] }),
    ];
    const incoming = [
      character({ id: 'c2', name: '阿行', variants: [{ id: 'v2', name: '入府之后', prompt: 'b' }] }),
    ];
    const merged = mergeAssetEntities(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].variants).toHaveLength(2);
  });

  it('一方没有子形象时取另一方，没有就是 undefined', () => {
    const withVariants = character({ id: 'c1', name: '顾行', variants: [{ id: 'v1', name: '流浪时期' }] });
    const without = character({ id: 'c2', name: '顾行' });

    expect(mergeAssetEntities([withVariants], [without])[0].variants).toHaveLength(1);
    expect(mergeAssetEntities([without], [withVariants])[0].variants).toHaveLength(1);
    expect(mergeAssetEntities([without], [character({ id: 'c3', name: '顾行' })])[0].variants).toBeUndefined();
  });
});
