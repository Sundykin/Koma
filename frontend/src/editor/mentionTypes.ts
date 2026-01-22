/**
 * Mention 相关类型定义
 */

// Mention 项目类型
export type MentionType = 'char' | 'prop' | 'scene';

// Mention 数据项
// 注意: 对于角色和道具，id 应使用 Sora2 返回的 ID (sora2CharacterId/sora2PropId)
// 对于场景，id 使用自定义 ID（场景不需要 Sora2 绑定）
export interface MentionItem {
  id: string;           // 用于生成 mention 格式 @type_id
  type: MentionType;
  name: string;
  description?: string;
  previewImage?: string;
}

// 解析后的 Mention
export interface ParsedMention {
  type: MentionType;
  id: string;
  fullMatch: string;
  from: number;
  to: number;
}

// Mention 正则匹配
// 匹配格式: @char_xxx, @prop_xxx, @scene_xxx
export const MENTION_REGEX = /@(char|prop|scene)_([a-zA-Z0-9_-]+)/g;

/**
 * 解析文本中的所有 Mention
 */
export function parseMentions(text: string): ParsedMention[] {
  const mentions: ParsedMention[] = [];
  let match: RegExpExecArray | null;

  const regex = new RegExp(MENTION_REGEX.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    mentions.push({
      type: match[1] as MentionType,
      id: match[2],
      fullMatch: match[0],
      from: match.index,
      to: match.index + match[0].length,
    });
  }

  return mentions;
}

/**
 * 生成 Mention 字符串
 * @param type - 类型 (char/prop/scene)
 * @param id - 对于角色/道具应使用 Sora2 ID，对于场景使用自定义 ID
 * @returns 格式为 @type_id 的字符串，如 @char_sora2xxx
 */
export function createMentionString(type: MentionType, id: string): string {
  return `@${type}_${id}`;
}

/**
 * 从 ID 解析 Mention 类型
 */
export function parseMentionId(mentionStr: string): { type: MentionType; id: string } | null {
  const match = mentionStr.match(/@(char|prop|scene)_([a-zA-Z0-9_-]+)/);
  if (!match) return null;
  return { type: match[1] as MentionType, id: match[2] };
}
