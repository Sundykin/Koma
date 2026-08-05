/**
 * 剧情模式结构化剧本的解析与序列化。
 *
 * 剧本以「一行一条标记行」的纯文本存储在 episode.scriptText，标记形如：
 *   [旁白] 旁白内容
 *   [台词·角色名] 台词内容
 *   [场景] 场景描述
 * 不带标记前缀的行按「旁白」兜底（兼容用户手改 / 自由文本）。
 *
 * 行结构与分镜字幕行（ShotScriptLine 的 role/characterId）对应：
 *   旁白 → narration ；台词 → dialogue + 说话人（先记名字，拆分镜时解析成 characterId）。
 */
import type { ShotScriptLineRole } from '../types/scene-character';

export type DramaScriptLineType = 'narration' | 'dialogue' | 'scene';

export interface DramaScriptLine {
  type: DramaScriptLineType;
  text: string;
  /** 仅台词行：说话人名字（原文称呼，后续映射到 Character.id） */
  speaker?: string;
}

const MARKER_RE = /^\[(旁白|台词|台词·([^\]]+)|场景)\]\s*(.*)$/;

/** 解析整段结构化剧本为标记行数组；空行被丢弃 */
export function parseDramaScript(text: string | null | undefined): DramaScriptLine[] {
  if (!text) return [];
  return text.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const m = line.match(MARKER_RE);
      if (!m) {
        return { type: 'narration', text: line };
      }
      if (m[3] !== undefined && m[2] !== undefined) {
        // [台词·角色名]
        return { type: 'dialogue', speaker: m[2].trim() || undefined, text: m[3] };
      }
      if (m[1] === '台词') {
        return { type: 'dialogue', text: m[3] };
      }
      if (m[1] === '场景') {
        return { type: 'scene', text: m[3] };
      }
      return { type: 'narration', text: m[3] };
    });
}

/** 把标记行序列化回带标记的纯文本 */
export function serializeDramaScript(lines: DramaScriptLine[]): string {
  return lines.map(line => {
    if (line.type === 'dialogue') {
      return line.speaker ? `[台词·${line.speaker}] ${line.text}` : `[台词] ${line.text}`;
    }
    if (line.type === 'scene') {
      return `[场景] ${line.text}`;
    }
    return `[旁白] ${line.text}`;
  }).join('\n');
}

/** 标记行类型 → 分镜字幕行 role */
export function dramaLineTypeToRole(type: DramaScriptLineType): ShotScriptLineRole {
  return type === 'dialogue' ? 'dialogue' : 'narration';
}
