/**
 * 角色子形象解析
 *
 * 「哪个形象生效」只有这一处判定，下游（参考图构造 / 提示词编译 / UI 头像）
 * 都调 resolveCharacterAppearance，避免各处各写一套回落规则。
 *
 * 优先级：分镜级激活（Shot.characterVariants）> 角色全局激活（Character.activeVariantId）> 主形象。
 * 找不到对应 variantId（子形象被删了）时静默回落到主形象。
 */
import type { Character, CharacterVariant, Shot } from '../types';

/** 分镜里该角色生效的子形象；用主形象时返回 undefined */
export function resolveActiveVariant(
  character: Character,
  shot?: Pick<Shot, 'characterVariants'>,
): CharacterVariant | undefined {
  const variants = character.variants;
  if (!variants?.length) return undefined;
  const variantId = shot?.characterVariants?.[character.id] || character.activeVariantId;
  if (!variantId) return undefined;
  return variants.find(v => v.id === variantId);
}

/**
 * 把生效的子形象「压平」进角色本体：prompt 追加差异描述、媒体槽位换成子形象的。
 *
 * 返回的仍是一个 Character，所以所有已有的下游逻辑（参考图、提示词变量、@mention）
 * 不需要感知子形象的存在。用主形象时原样返回同一个对象引用（不产生额外渲染开销）。
 */
export function resolveCharacterAppearance(
  character: Character,
  shot?: Pick<Shot, 'characterVariants'>,
): Character {
  const variant = resolveActiveVariant(character, shot);
  if (!variant) return character;

  // 子形象没出图时保留主形象定妆照兜底：宁可用主形象的图，也不要让这镜没有角色参考。
  const media = variant.media?.costumePhoto
    ? { ...(character.media || {}), ...variant.media }
    : character.media;

  return {
    ...character,
    prompt: [character.prompt, `【${variant.name}】${variant.prompt}`].filter(Boolean).join('，'),
    media,
  };
}

/** 批量版本：分镜出场角色列表 → 已压平子形象的角色列表 */
export function resolveCharactersAppearance(
  characters: Character[],
  shot?: Pick<Shot, 'characterVariants'>,
): Character[] {
  return characters.map(character => resolveCharacterAppearance(character, shot));
}

/** 子形象是否已出图（未出图的在 UI 上要提示「待生成」） */
export function hasVariantImage(variant: CharacterVariant): boolean {
  const photo = variant.media?.costumePhoto;
  return Boolean(photo?.localPath || photo?.remoteUrl);
}
