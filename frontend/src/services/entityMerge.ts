/**
 * 实体归并：解析产出的角色/场景/道具按"规范名 + 别名"合并，避免同一实体
 * 因叫法差异（修饰语/位置后缀/别名）产生多条资产。
 *
 * 背景：LLM 提取提示词已要求合并同场景不同叫法，但实际输出仍会出现
 * 「小木屋内部」vs「小木屋」这类变体；精确名匹配挡不住。这里做确定性的
 * 兜底归并（提示词约束 + 代码兜底双层，对齐成熟 NLP 管线的 entity resolution）。
 *
 * 匹配优先级（任一命中即合并）：
 *   1. 名称精确/规范化相等（去空白/标点/尾部位置后缀：内部/外部/里/中…）
 *   2. 别名集合相交（name 本身计入对方的别名集）
 */

/** 规范化实体名：仅用于匹配键，不改动实体数据本身 */
export function normalizeAssetName(name: string): string {
  let key = String(name || '')
    .replace(/[\s·・,，、。.!！?？:：;；'"'"「」『』（）()\[\]【】<>《》]/gu, '')
    .toLowerCase();
  // 尾部位置后缀剥离一次（保内容词：剩余不足 2 字则不剥，防"内"→空串）
  const stripped = key.replace(/(内部|外部|旁边|附近|一带|之中|中|里|内|外)$/u, '');
  if (stripped.length >= 2) key = stripped;
  return key;
}

/** 拆分别名字符串（英文/中文逗号、顿号、分号分隔）为规范名集合 */
function aliasKeys(aliases: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!aliases) return out;
  for (const part of String(aliases).split(/[,，、;；]/)) {
    const key = normalizeAssetName(part);
    if (key) out.add(key);
  }
  return out;
}

interface MergeableAsset {
  id: string;
  name: string;
  aliases?: string;
  createdAt?: number;
  media?: unknown;
}

/**
 * 合并新实体进既有清单（不改动入参数组）。
 * 命中既有项时：保留既有 id/createdAt/media，其余字段取新值；
 * 别名取并集，且被合并方的旧名若与新名不同则收进别名（防止后续叫法回摆再分裂）。
 */
export function mergeAssetEntities<T extends MergeableAsset>(existing: T[], newItems: T[]): T[] {
  const result: T[] = [];
  const indexById = new Map<string, number>();
  // 匹配键 → 实体 id（合并后重登记覆盖旧键，保证链式命中的是合并体而不是旧对象）
  const idByKey = new Map<string, string>();

  const register = (item: T) => {
    const nameKey = normalizeAssetName(item.name);
    if (nameKey) idByKey.set(nameKey, item.id);
    for (const key of aliasKeys(item.aliases)) {
      idByKey.set(key, item.id);
    }
  };
  const findHit = (keys: Iterable<string>): T | undefined => {
    for (const key of keys) {
      const id = idByKey.get(key);
      if (!id) continue;
      const index = indexById.get(id);
      if (index !== undefined) return result[index];
    }
    return undefined;
  };

  for (const item of existing) {
    indexById.set(item.id, result.length);
    result.push(item);
    register(item);
  }

  for (const item of newItems) {
    const hit = findHit([normalizeAssetName(item.name), ...aliasKeys(item.aliases)]);

    if (!hit) {
      indexById.set(item.id, result.length);
      result.push(item);
      register(item);
      continue;
    }

    // 别名并集（排除双方 name 本身，合并后旧名单独收编）
    const mergedAliases = new Set<string>();
    const pushAliases = (raw: string | undefined, selfName: string) => {
      for (const part of String(raw || '').split(/[,，、;；]/)) {
        const trimmed = part.trim();
        if (trimmed && trimmed !== selfName) mergedAliases.add(trimmed);
      }
    };
    pushAliases(hit.aliases, hit.name);
    pushAliases(item.aliases, item.name);
    if (hit.name !== item.name) mergedAliases.add(hit.name);

    const merged = {
      ...hit,
      ...item,
      id: hit.id,
      createdAt: hit.createdAt ?? item.createdAt,
      media: hit.media ?? item.media,
      aliases: Array.from(mergedAliases).join(','),
    } as T;

    result[indexById.get(hit.id)!] = merged;
    indexById.delete(item.id);
    register(merged);
  }

  return result;
}
