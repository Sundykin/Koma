/**
 * 口播台词守卫与视频提示词清洗（从 ShotPromptService.ts 拆出）。
 *
 * buildDialogueGuardNote：把分镜的音频内容按四类分轨（DIALOGUE / NARRATIVE_TO_SCENE /
 * VOICEOVER / COMMENTARY）明确列出，防止 LLM 把叙述/评论当角色开口台词。
 * sanitizeVideoPromptResult：剥掉模型输出里的 JSON 包裹、自检清单、叙述泄漏。
 * ensureExplicitDialogueInVideoPrompt：显式台词若没进对白提示词字段则强制补上。
 */
import type { ProjectNarrativeMode } from '../narrativeMode';
import { buildVideoDialogueModeDirective } from '../narrativeMode';
import {
  appendUniqueDialogue,
  extractDialogueSpeechText,
  extractExplicitDialogueEvidence,
  isSpeakerDialogueLine,
  normalizeDialogueText,
} from './dialogueEvidence';

export function sanitizeVideoPromptResult(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/_::~OUTPUT_START::~_/g, '');
  s = s.replace(/_::~OUTPUT_END::~_/g, '');
  s = s.replace(/^[ \t]*Grok视频生成\d+秒分镜单元【[^】]*】[ \t]*\r?\n?/gm, '');
  s = s.replace(/^\s*镜头\s*\d+\s*[-至到]\s*镜头\s*\d+\s+(?=整体画风\s*[:：])/u, '');
  s = s.replace(/(?:^|\r?\n)[ \t]*(?:#+[ \t]*)?(?:【自检】|【输出前自检】|输出前自检|自检清单)[\s\S]*$/m, '');
  s = s
    .split(/\r?\n/)
    .filter(line => !/^[ \t]*[-*]?[ \t]*\[[ xX✓✔]\][ \t]*/.test(line))
    .filter(line => !/^[ \t]*(?:以上是)?自检内容[。.]?[ \t]*$/.test(line))
    .join('\n');
  s = sanitizeNarrativeDialogueLeakage(s);
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

export function ensureExplicitDialogueInVideoPrompt(
  prompt: string,
  explicitDialogueText: string,
  characterNames: string[] = [],
  projectMode: ProjectNarrativeMode = 'drama',
): string {
  const evidence = extractExplicitDialogueEvidence(explicitDialogueText, characterNames, {
    narrativeToScene: projectMode === 'drama',
  });
  const dialogueLines = [
    ...evidence.spoken,
    ...(projectMode === 'drama' ? evidence.narrativeScene.filter(isSpeakerDialogueLine) : []),
  ];
  if (!dialogueLines.length) return prompt;

  const missingLines = dialogueLines.filter(line => {
    if (prompt.includes(line)) return false;
    const speech = extractDialogueSpeechText(line);
    return speech ? !prompt.includes(speech) : true;
  });
  if (!missingLines.length) return prompt;

  const lines = prompt.split(/\r?\n/);
  const dialogueIndex = lines.findIndex(line => /^\s*对白提示词\s*[:：]/.test(line));
  const missingText = missingLines.join('；');
  if (dialogueIndex >= 0) {
    const currentLine = lines[dialogueIndex].trim();
    const normalizedCurrent = currentLine.replace(/对白提示词\s*[:：]\s*/, '').trim();
    lines[dialogueIndex] = !normalizedCurrent || normalizedCurrent === '无'
      ? `对白提示词：${missingText}`
      : `${currentLine}；${missingText}`;
    return lines.join('\n').trim();
  }

  return [prompt.trim(), `对白提示词：${missingText}`].filter(Boolean).join('\n');
}

function sanitizeNarrativeDialogueLeakage(prompt: string): string {
  return prompt
    .split(/\r?\n/)
    .map(line => {
      const match = line.match(/^(\s*对白提示词\s*[:：]\s*)(.*)$/);
      if (!match) return line;
      const prefix = match[1];
      const body = match[2].trim();
      if (!body || body === '无') return line;

      const kept = body
        .split(/[；;]/)
        .map(part => part.trim())
        .filter(Boolean)
        .filter(part => !isNarrativeReportLeak(part));

      return `${prefix}${kept.length > 0 ? kept.join('；') : '无'}`;
    })
    .join('\n');
}

function isNarrativeReportLeak(text: string): boolean {
  const original = normalizeDialogueText(text);
  if (/台词\s*[:：]/.test(original)) return false;

  const normalized = original
    .replace(/^[^：:]{1,30}[：:]\s*/, '')
    .replace(/^[「『“"']+/, '')
    .trim();
  if (!normalized) return false;
  if (/^(?:她|他|TA|ta|它)?自称[^，,。；;！？!]{1,24}(?:[，,。；;！？!]|$)/.test(normalized) && /[我俺咱]/.test(normalized)) {
    return true;
  }
  return /^(?:她|他|TA|ta|它)?(?:说要|说会|说可以|表示要|表示会|表示可以|告诉我|答应我|承诺).*[我俺咱]/.test(normalized);
}

export function buildDialogueGuardNote(
  scriptContent: string,
  characterNames: string[],
  explicitDialogueText = '',
  projectMode: ProjectNarrativeMode = 'drama',
): string {
  const allowNarrativeToScene = projectMode === 'drama';
  const { spoken, voiceover, commentary, narrativeScene } = extractExplicitDialogueEvidence(scriptContent, characterNames, {
    narrativeToScene: allowNarrativeToScene,
  });
  const explicitEvidence = extractExplicitDialogueEvidence(explicitDialogueText, characterNames, {
    narrativeToScene: allowNarrativeToScene,
  });
  appendUniqueDialogue(spoken, explicitEvidence.spoken);
  appendUniqueDialogue(voiceover, explicitEvidence.voiceover);
  appendUniqueDialogue(commentary, explicitEvidence.commentary);
  appendUniqueDialogue(narrativeScene, explicitEvidence.narrativeScene);
  const modeDirective = buildVideoDialogueModeDirective(projectMode);
  return [
    '【口播台词判定（高优先级，覆盖模板里的"台词"占位习惯）】',
    modeDirective,
    '本分镜的音频内容必须严格分轨，不要混淆四类：',
    '  · **DIALOGUE（人物开口台词）**：仅当原文明确出现"角色名:" / 直接引语 / "说/问/喊/自言自语"等发声动作时才能写。显式直接对白要保留语义；第一人称叙述、转述句、心理活动、认知句、环境说明、作者说明都不能原句塞进对白。',
    '  · **NARRATIVE_TO_SCENE（第一人称剧情叙述 / 转述）**：这类内容只提供本源剧情事实，不是旁白成品，也不是角色原台词；必须改写成当场可拍动作或人称正确的角色对白。最终提示词只保留改写后的真实剧情 / 真实对白，禁止输出来源叙述句、转换说明、"改写为"等解释文本。',
    '  · **VOICEOVER（OS/OV/旁白/画外音）**：仅当原文明确写"OS:""OV:""旁白:""内心独白:"等标记时才有；播报全程对应人物嘴巴必须完全闭合。',
    '  · **COMMENTARY（社交评论 / 弹幕 / 字幕 / 新闻播报 / 短信 / 微博 / 朋友圈等第三方内容）**：**绝对不是主角口播台词**，**禁止改写为角色对白**，**也不属于 OS/OV**。如需在画面中呈现，只能用屏幕字幕 / 弹幕飘字 / 手机短信弹窗 等可视形式，并明确标注为"COMMENTARY (字幕)"——人物不发声、不张嘴、不读出来。',
    spoken.length > 0
      ? `本分镜显式口播台词（DIALOGUE，必须逐字进入最终"对白提示词"字段）：\n${spoken.map(text => `- ${text}`).join('\n')}`
      : '本分镜显式口播台词（DIALOGUE）：无。若要表现人物认知/情绪，只能通过表情、视线、动作、停顿体现，不得补写台词。',
    voiceover.length > 0
      ? `本分镜显式 OS/OV / 旁白（VOICEOVER，对应人物全程闭嘴）：\n${voiceover.map(text => `- ${text}`).join('\n')}`
      : '本分镜显式 OS/OV / 旁白（VOICEOVER）：无。',
    commentary.length > 0
      ? `本分镜社交评论 / 弹幕 / 字幕 / 第三方文本（COMMENTARY，禁止作为人物开口台词，仅可作为画面字幕显示）：\n${commentary.map(text => `- ${text}`).join('\n')}`
      : '本分镜无第三方评论 / 弹幕 / 字幕（COMMENTARY）。',
    narrativeScene.length > 0
      ? `本分镜已转写的本源剧情对白 / 动作素材（只输出这些结果，不要输出来源句或转换说明）：\n${narrativeScene.map(text => `- ${text}`).join('\n')}`
      : allowNarrativeToScene
        ? '本分镜无需要从第一人称叙述转成剧情对白的内容。'
        : '解说模式下不主动把第一人称解说改写成角色对白；无显式对白时最终对白提示词写“无”。',
  ].join('\n');
}
