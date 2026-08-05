/**
 * 分镜脚本文本的提示词格式化（从 ShotPromptService.ts 拆出）。
 *
 * 剧情模式：scriptLines 带 role（description 分镜描述 / narration 旁白 / dialogue 台词），
 * 渲染成带标记的 scriptContent；台词行另提取为「角色名：台词」供 dialogueText 变量。
 * 解说模式：整列都是解说字幕，纯文本拼接。
 */
import type { Shot } from '../../types';
import type { ProjectNarrativeMode } from '../narrativeMode';
import {
  extractExplicitDialogueEvidence,
  isSpeakerDialogueLine,
  normalizeDialogueText,
} from './dialogueEvidence';

export function getShotDialogueText(shot: Pick<Shot, 'dialogue'>): string {
  return String(shot.dialogue ?? '').trim();
}

/**
 * 剧情模式的 scriptContent：按字幕行结构还原标记，让 LLM 明确区分画面描述、旁白与人物台词。
 *   - 分镜描述行（description）：主视觉内容，原样输出不加标记（生图/生视频的主输入）
 *   - 旁白行（narration）→ [画外音]（VOICEOVER，人物嘴闭合）
 *   - 台词行（dialogue）→ [台词·角色名]（DIALOGUE，口型同步）
 * 解说模式保持纯文本拼接（整列都是解说字幕）。
 */
export function formatShotScriptForPrompt(
  shot: Pick<Shot, 'scriptLines'>,
  projectMode: ProjectNarrativeMode,
  characterNameById?: Map<string, string>,
): string {
  const lines = (shot.scriptLines ?? []).filter(line => line.text?.trim());
  if (projectMode !== 'drama' || !lines.length) {
    return lines.map(line => line.text).join('\n');
  }
  return lines.map(line => {
    if (line.role === 'description') {
      return line.text.trim();
    }
    if (line.role === 'dialogue') {
      const speaker = line.characterId ? characterNameById?.get(line.characterId) : undefined;
      return speaker ? `[台词·${speaker}] ${line.text.trim()}` : `[台词] ${line.text.trim()}`;
    }
    return `[画外音] ${line.text.trim()}`;
  }).join('\n');
}

/**
 * 结构化台词提取：剧情模式下台词在 scriptLines 里（role='dialogue' + characterId），
 * 逐行格式化为「角色名：台词」；旁白行不算台词。
 * 没有结构化台词行时回退到旧的 shot.dialogue 字段（解说模式台词仍走这里）。
 */
export function resolveShotDialogueText(
  shot: Pick<Shot, 'scriptLines' | 'dialogue'>,
  characterNameById?: Map<string, string>,
): string {
  const dialogueLines = (shot.scriptLines ?? [])
    .filter(line => line.role === 'dialogue' && line.text?.trim())
    .map(line => {
      const speaker = line.characterId ? characterNameById?.get(line.characterId) : undefined;
      return speaker ? `${speaker}：${line.text.trim()}` : line.text.trim();
    });
  if (dialogueLines.length > 0) {
    return dialogueLines.join('\n');
  }
  return getShotDialogueText(shot);
}

export function firstNonEmptyLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean) || '';
}

export function buildShotVideoScriptContent(
  shot: Pick<Shot, 'scriptLines' | 'dialogue'>,
  characterNames: string[] = [],
  projectMode: ProjectNarrativeMode = 'drama',
  characterNameById?: Map<string, string>,
): string {
  const script = formatShotScriptForPrompt(shot, projectMode, characterNameById).trim();
  const dialogue = formatDialogueTextForPrompt(resolveShotDialogueText(shot, characterNameById), characterNames, projectMode);
  if (!dialogue) return script;
  if (script.includes(dialogue)) return script;
  return [script, `【分镜台词字段】\n${dialogue}`].filter(Boolean).join('\n\n');
}

export function formatDialogueTextForPrompt(
  text: string,
  characterNames: string[],
  projectMode: ProjectNarrativeMode = 'drama',
): string {
  const normalized = normalizeDialogueText(text);
  if (!normalized) return '';
  const evidence = extractExplicitDialogueEvidence(normalized, characterNames, {
    narrativeToScene: projectMode === 'drama',
  });
  const pieces = [
    ...evidence.spoken,
    ...evidence.narrativeScene.filter(isSpeakerDialogueLine),
    ...evidence.voiceover.map(line => `VOICEOVER：${line}`),
    ...evidence.commentary.map(line => `COMMENTARY：${line}`),
  ];
  return pieces.length > 0 ? pieces.join('\n') : normalized;
}
