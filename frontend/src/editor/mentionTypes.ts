/**
 * Mention 相关类型定义
 */

// Mention 项目类型
export type MentionType = 'char' | 'prop' | 'scene';

// Mention 数据项
// 收口约定: id 一律使用项目内资产 ID（与持久化数据一致），不要在提示词层混入 Provider 私有 ID。
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
 * 规范化 Mention ID，去除重复前缀
 * 例如: normalizeMentionId('char', 'char_abc') => 'abc'
 */
export function normalizeMentionId(type: MentionType, id: string): string {
  const prefix = `${type}_`;
  // 如果 ID 以 type_ 开头，去除前缀
  if (id.startsWith(prefix)) {
    return id.slice(prefix.length);
  }
  return id;
}

/**
 * 生成 Mention 字符串
 * @param type - 类型 (char/prop/scene)
 * @param id - 资产 ID（项目内 ID）
 * @returns 格式为 @type_id 的字符串，如 @char_sora2xxx
 */
export function createMentionString(type: MentionType, id: string): string {
  // 先规范化 ID，避免双前缀
  const normalizedId = normalizeMentionId(type, id);
  return `@${type}_${normalizedId}`;
}

/**
 * 从 ID 解析 Mention 类型
 * 支持容错解析双前缀格式 @char_char_xxx
 */
export function parseMentionId(mentionStr: string): { type: MentionType; id: string } | null {
  // 先尝试标准格式
  const match = mentionStr.match(/@(char|prop|scene)_([a-zA-Z0-9_-]+)/);
  if (!match) return null;

  const type = match[1] as MentionType;
  let id = match[2];

  // 容错处理：如果 ID 以 type_ 开头（双前缀），去除
  const prefix = `${type}_`;
  if (id.startsWith(prefix)) {
    id = id.slice(prefix.length);
  }

  return { type, id };
}
