import { describe, expect, it } from 'vitest';
import { mergeAssetEntities, normalizeAssetName } from './entityMerge';

interface TestAsset {
  id: string;
  name: string;
  aliases?: string;
  createdAt?: number;
  media?: unknown;
  prompt?: string;
}

const asset = (id: string, name: string, extra: Partial<TestAsset> = {}): TestAsset => ({
  id, name, ...extra,
});

describe('normalizeAssetName', () => {
  it('去空白与标点、小写化', () => {
    expect(normalizeAssetName(' 魔兽山脉·小木屋（内部）')).toBe('魔兽山脉小木屋');
    expect(normalizeAssetName('Ye Shu')).toBe('yeshu');
  });

  it('尾部位置后缀剥离一次', () => {
    expect(normalizeAssetName('小木屋内部')).toBe('小木屋');
    expect(normalizeAssetName('废弃工厂外部')).toBe('废弃工厂');
    expect(normalizeAssetName('山谷里')).toBe('山谷');
  });

  it('剩余不足 2 字不剥离（防过度裁剪）', () => {
    expect(normalizeAssetName('屋内')).toBe('屋内');
  });
});

describe('mergeAssetEntities', () => {
  it('精确名合并：保留既有 id 与 media，新值覆盖其余字段', () => {
    const existing = [asset('c1', '叶赎', { createdAt: 100, media: { costumePhoto: 'x' } })];
    const merged = mergeAssetEntities(existing, [asset('c-new', '叶赎', { prompt: '新描述' })]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('c1');
    expect(merged[0].media).toEqual({ costumePhoto: 'x' });
    expect(merged[0].prompt).toBe('新描述');
    expect(merged[0].createdAt).toBe(100);
  });

  it('规范化名合并：内部后缀差异不再分裂', () => {
    const existing = [asset('s1', '魔兽山脉小木屋内部')];
    const merged = mergeAssetEntities(existing, [asset('s2', '魔兽山脉小木屋')]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('s1');
  });

  it('别名命中合并：新条目 alias 指向既有规范名', () => {
    const existing = [asset('s1', '魔兽山脉小木屋内部')];
    const merged = mergeAssetEntities(existing, [
      asset('s2', '小破屋内部', { aliases: '魔兽山脉小木屋内部' }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('s1');
  });

  it('反向别名：既有 alias 命中新条目的 name', () => {
    const existing = [asset('s1', '小木屋', { aliases: '破屋,山中木屋' })];
    const merged = mergeAssetEntities(existing, [asset('s2', '山中木屋')]);
    expect(merged).toHaveLength(1);
  });

  it('合并后别名取并集；不同名的旧名收进别名（防叫法回摆）', () => {
    const existing = [asset('s1', '小木屋', { aliases: '破屋' })];
    const merged = mergeAssetEntities(existing, [
      asset('s2', '小木屋内部', { aliases: '山中屋,破屋' }),
    ]);
    expect(merged).toHaveLength(1);
    // 合并后 name 为"小木屋内部"（新值覆盖），旧名"小木屋"收编为别名
    const aliases = (merged[0].aliases || '').split(',').sort();
    expect(aliases).toEqual(['小木屋', '山中屋', '破屋']);
  });

  it('名字不同时旧名进别名（防叫法回摆再分裂）', () => {
    const existing = [asset('s1', '小木屋')];
    const merged = mergeAssetEntities(existing, [asset('s2', '小木屋内部')]);
    expect(merged[0].aliases).toContain('小木屋');
  });

  it('无关实体不受影响；链式归并（A→B 合并后 C 也能命中）', () => {
    const existing = [asset('s1', '小木屋'), asset('s9', '域外战场')];
    const merged = mergeAssetEntities(existing, [
      asset('s2', '小木屋内部'),
      asset('s3', '小木屋', { prompt: '更新' }), // 命中合并后的 s1
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.map(m => m.id).sort()).toEqual(['s1', 's9']);
    expect(merged.find(m => m.id === 's1')?.prompt).toBe('更新');
  });

  it('不修改入参数组', () => {
    const existing = [asset('s1', '小木屋')];
    const newItems = [asset('s2', '小木屋内部')];
    mergeAssetEntities(existing, newItems);
    expect(existing).toHaveLength(1);
    expect(newItems).toHaveLength(1);
  });
});
