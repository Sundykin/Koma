/**
 * Shot.scriptLines 的统一读写工具。
 *
 * 分镜里的"剧本"是一组字幕行块（ShotScriptLine[]）；下游 image / video prompt
 * 推理常常只需要拼回一段纯文本，UI 编辑时则需要逐行操作。集中在这里以避免
 * 每个 callsite 重复 join / split / id 生成逻辑。
 *
 * 行结构（role / characterId）随叙事模式不同：
 *   解说模式 → 全列 narration（纯字幕）；剧情模式 → narration 旁白 + dialogue 台词(带 characterId)。
 */
import type { ShotScriptLine, ShotScriptLineRole } from './scene-character';

let lineIdCounter = 0;

export function makeScriptLineId(): string {
  lineIdCounter += 1;
  return `line-${Date.now().toString(36)}-${lineIdCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** 把整段文本按 \n 拆成 ShotScriptLine[]，过滤空行、自动分配 id（默认旁白行） */
export function scriptLinesFromText(text: string | null | undefined): ShotScriptLine[] {
  if (!text) return [];
  return text.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(text => ({ id: makeScriptLineId(), text, role: 'narration' }));
}

/** 把 ShotScriptLine[] 拼成纯文本（一行一句，\n 分隔） */
export function scriptLinesToText(lines: ShotScriptLine[] | undefined): string {
  if (!lines || !lines.length) return '';
  return lines.map(line => line.text).join('\n');
}

/** 读取分镜的剧本字符串视图（下游 image/video prompt 推理常用） */
export function getShotScriptText(shot: { scriptLines?: ShotScriptLine[] }): string {
  return scriptLinesToText(shot.scriptLines);
}

/** 创建单行（默认旁白） */
export function createScriptLine(text: string, role: ShotScriptLineRole = 'narration', characterId?: string): ShotScriptLine {
  return { id: makeScriptLineId(), text, role, characterId };
}

/** 创建一条台词行 */
export function createDialogueScriptLine(text: string, characterId?: string): ShotScriptLine {
  return createScriptLine(text, 'dialogue', characterId);
}

/** 该行是否为台词 */
export function isDialogueLine(line: ShotScriptLine | undefined): boolean {
  return line?.role === 'dialogue';
}

/** 该行是否为旁白（缺省 role 视为旁白，向后兼容解说模式） */
export function isNarrationLine(line: ShotScriptLine | undefined): boolean {
  return !line?.role || line.role === 'narration';
}

/**
 * 分镜的配音文本与音色规划。
 * 剧情模式下按行类型拆分：台词按 characterId 走角色音色，旁白走项目级音色；
 * 解说模式整列都是旁白，直接拼成一段。
 * 返回有序的配音段（同一音色相邻合并），供 TTS 逐段合成。
 */
export interface ShotVoiceSegment {
  text: string;
  role: ShotScriptLineRole;
  /** 台词行才有：说话人角色 ID。旁白为空 → 用项目级音色。 */
  characterId?: string;
}

export function buildShotVoiceSegments(shot: { scriptLines?: ShotScriptLine[] }): ShotVoiceSegment[] {
  const lines = (shot.scriptLines ?? []).filter(line => line.text?.trim());
  const segments: ShotVoiceSegment[] = [];
  for (const line of lines) {
    const role: ShotScriptLineRole = isDialogueLine(line) ? 'dialogue' : 'narration';
    const characterId = role === 'dialogue' ? line.characterId : undefined;
    const last = segments[segments.length - 1];
    // 相邻同角色/同类型合并成一段，减少 TTS 请求数
    if (last && last.role === role && last.characterId === characterId) {
      last.text += '\n' + line.text.trim();
    } else {
      segments.push({ text: line.text.trim(), role, characterId });
    }
  }
  return segments;
}
