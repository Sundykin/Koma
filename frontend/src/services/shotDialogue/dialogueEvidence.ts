/**
 * 对白/旁白证据提取（从 ShotPromptService.ts 拆出）。
 *
 * 从剧本/台词文本中按四类分轨抽取音频内容：
 *   - spoken：人物开口台词（角色名：台词 / "说/问/喊"引出的引语）
 *   - voiceover：OS/OV/旁白/画外音（人物全程闭嘴）
 *   - commentary：第三方文本（网友评论/弹幕/字幕/新闻/短信，绝不是角色台词）
 *   - narrativeScene：第一人称叙述/转述已转写成真实剧情对白（drama 模式专用）
 */
import type { ProjectNarrativeMode } from '../narrativeMode';

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeDialogueText(text: string): string {
  return text
    .trim()
    .replace(/^[“”「」『』"']+|[“”「」『』"']+$/g, '')
    .trim();
}

export function pushUniqueDialogue(target: string[], text: string | undefined): void {
  const normalized = normalizeDialogueText(text || '');
  if (!normalized || target.includes(normalized)) return;
  target.push(normalized);
}

export function appendUniqueDialogue(target: string[], source: string[]): void {
  for (const text of source) {
    pushUniqueDialogue(target, text);
  }
}

export function isSpeakerDialogueLine(text: string): boolean {
  return /^.{1,30}[：:].+/.test(normalizeDialogueText(text));
}

export function extractDialogueSpeechText(text: string): string {
  return normalizeDialogueText(text)
    .replace(/^.{1,30}[：:]\s*/, '')
    .replace(/^[「『“"']+/, '')
    .replace(/[」』”"']+$/g, '')
    .trim();
}

export interface DialogueEvidence {
  spoken: string[];
  voiceover: string[];
  commentary: string[];
  narrativeScene: string[];
}

export function extractExplicitDialogueEvidence(
  scriptContent: string,
  characterNames: string[],
  options: { narrativeToScene?: boolean } = {},
): DialogueEvidence {
  const spoken: string[] = [];
  const voiceover: string[] = [];
  const commentary: string[] = [];
  const narrativeScene: string[] = [];
  const lines = scriptContent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const sortedNames = characterNames
    .map(name => name.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const speakerPattern = sortedNames.length > 0
    ? new RegExp(`^((?:${sortedNames.map(escapeRegex).join('|')})\\s*(?:[（(][^）)]{1,20}[）)])?)\\s*[：:]\\s*(.+)$`)
    : null;
  const genericSpeakerPattern = /^([\p{Script=Han}A-Za-z0-9_·（）()]{1,24})\s*[：:]\s*(.+)$/u;
  const voiceoverPattern = /^(?:OS|OV|旁白|画外音|内心OS|内心独白|内心旁白)\s*[：:]\s*(.+)$/i;
  // 第三方旁观者前缀：行首命中即为评论 / 弹幕 / 字幕等，跳过台词归类
  const commentaryLinePattern = /^(?:网友评论|网友|评论区|评论|弹幕|留言|短评|跟帖|回帖|微博|朋友圈|微信群|微信|QQ群|社交媒体|社交平台|字幕|标题|片头|片尾|新闻|播报|广播|公告|通知|短信|消息|推送|系统提示|系统提示音|提示音|背景音|环境音)\s*[：:]\s*(.+)$/i;
  const commentaryPrefixForQuote = /(?:网友评论|网友|评论区|评论|弹幕|留言|短评|跟帖|回帖|微博|朋友圈|微信群|微信|社交媒体|字幕|标题|片头|片尾|新闻|播报|广播|公告|通知|短信|消息|推送|系统提示|提示音|背景音|环境音)\s*[：:]?\s*$/;
  const speechCuePattern = /(?:自言自语|喃喃|嘀咕|低声说|轻声说|沉声说|说道|说|问道|问|答道|答|喊道|喊|叫道|叫)\s*[：:,，]\s*(.+)$/;
  const shouldRewriteNarrative = options.narrativeToScene !== false;

  for (const line of lines) {
    // 第三方评论 / 弹幕 / 字幕优先判定——命中后不再走台词归类
    const commentaryMatch = line.match(commentaryLinePattern);
    if (commentaryMatch) {
      pushUniqueDialogue(commentary, commentaryMatch[1]);
      continue;
    }

    const voiceoverMatch = line.match(voiceoverPattern);
    if (voiceoverMatch) {
      pushUniqueDialogue(voiceover, voiceoverMatch[1]);
      continue;
    }

    const narrativeRewrite = shouldRewriteNarrative
      ? buildNarrativeSceneRewrite(line, sortedNames)
      : null;
    if (narrativeRewrite) {
      pushUniqueDialogue(narrativeScene, narrativeRewrite);
      continue;
    }

    const speakerMatch = speakerPattern?.exec(line) || genericSpeakerPattern.exec(line);
    if (speakerMatch) {
      pushUniqueDialogue(spoken, `${speakerMatch[1].trim()}：${speakerMatch[2]}`);
      continue;
    }

    const speechCueMatch = line.match(speechCuePattern);
    if (speechCueMatch) {
      pushUniqueDialogue(spoken, speechCueMatch[1]);
    }
  }

  for (const match of scriptContent.matchAll(/[“「『"]([^“”「」『"\r\n]{1,80})[”」』"]/g)) {
    const quoted = normalizeDialogueText(match[1] || '');
    if (!quoted) continue;
    const idx = match.index ?? 0;
    // 前缀范围扩大到 80 字符，覆盖"前文：网友评论：『xxx』"这种长前缀写法
    const prefix = scriptContent.slice(Math.max(0, idx - 80), idx);
    if (commentaryPrefixForQuote.test(prefix)) {
      pushUniqueDialogue(commentary, quoted);
      continue;
    }
    if (/(?:OS|OV|旁白|画外音|内心OS|内心独白|内心旁白)/i.test(prefix)) {
      pushUniqueDialogue(voiceover, quoted);
      continue;
    }
    pushUniqueDialogue(spoken, quoted);
  }

  return { spoken, voiceover, commentary, narrativeScene };
}

function buildNarrativeSceneRewrite(line: string, characterNames: string[]): string | null {
  const normalized = normalizeDialogueText(line);
  if (!normalized) return null;
  if (/[：:]/.test(normalized)) return null;
  if (!/[我俺咱]/.test(normalized)) return null;

  const narratorName = characterNames.find(name => name === '我') || '我';
  const otherName = characterNames.find(name => name !== narratorName) || '对方';

  const selfClaimMatch = normalized.match(/^(?:她|他|TA|ta|它)?自称([^，,。；;]+)[，,]?(?:说要|说会|说可以|表示要|表示会|表示可以)?(.+)?$/);
  if (selfClaimMatch) {
    const identity = normalizeDialogueText(selfClaimMatch[1] || '');
    const promise = rewriteNarrativePronouns(selfClaimMatch[2] || '');
    const lineText = promise
      ? `${otherName}：我是${identity}，我可以${promise}`
      : `${otherName}：我是${identity}`;
    return lineText;
  }

  const reportMatch = normalized.match(/^(?:她|他|TA|ta|它)?(?:说要|说会|说可以|表示要|表示会|表示可以|告诉我|答应我|承诺)(.+)$/);
  if (reportMatch) {
    const promise = rewriteNarrativePronouns(reportMatch[1] || '');
    return `${otherName}：${promise}`;
  }

  const narratorLine = buildNarratorSceneDialogue(normalized, narratorName);
  if (narratorLine) return narratorLine;

  return null;
}

function rewriteNarrativePronouns(text: string): string {
  return normalizeDialogueText(text)
    .replace(/^要/, '')
    .replace(/^会/, '')
    .replace(/^可以/, '')
    .replace(/帮我/g, '帮你')
    .replace(/给我/g, '给你')
    .replace(/替我/g, '替你')
    .replace(/为我/g, '为你')
    .replace(/把我的/g, '把你的')
    .replace(/我的/g, '你的')
    .replace(/我/g, '你')
    .trim();
}

function buildNarratorSceneDialogue(text: string, narratorName: string): string | null {
  if (/(?:我|俺|咱)(?:只是|正在|已经|还在|坐|站|走|跑|躺|醒|睁眼|抬头|低头|伸手|转身|看向|拿起|放下|推开|打开|关上)/.test(text)
    && !/(?:意识到|发现|明白|反应过来|不敢相信|难以置信|不能|绝不能|必须|决定|凭什么|怎么可能|到底是谁|不对劲|认命|吐槽|质问|反问)/.test(text)) {
    return null;
  }

  const quotedReaction = text.match(/(?:我)?(?:忍不住)?(?:吐槽|嘀咕|低声骂|反问|质问)[，,：:]?(.{2,40})$/);
  if (quotedReaction) {
    return `${narratorName}：${cleanNarratorDialogueLine(quotedReaction[1])}`;
  }

  if (/(?:意识到|发现|明白|反应过来)/.test(text)) {
    if (/(?:不对劲|不对|有问题|不正常|不是我的|不是原来|不是这里|不是这个)/.test(text)) {
      return `${narratorName}：不对，这不对劲。`;
    }
    if (/(?:穿越|重生|夺舍|换了身体|不是原来的世界)/.test(text)) {
      return `${narratorName}：我这是……穿越了？`;
    }
    if (/(?:被骗|陷害|背叛|算计)/.test(text)) {
      return `${narratorName}：原来是你们在算计我。`;
    }
    return `${narratorName}：等等，这不对。`;
  }

  if (/(?:不敢相信|难以置信|无法相信|懵了|傻眼了|无语|震惊)/.test(text)) {
    if (/(?:词|话|句子|意思)/.test(text)) {
      return `${narratorName}：这些词怎么可能组成一句话？`;
    }
    return `${narratorName}：这怎么可能？`;
  }

  const resolveMatch = text.match(/(?:我|俺|咱)?(?:决定|必须|一定要|不能|绝不能|不会|不想|要)(.{2,36})/);
  if (resolveMatch) {
    const cleaned = cleanNarratorDialogueLine(resolveMatch[0]
      .replace(/^(?:我|俺|咱)?决定/, '我决定')
      .replace(/^(?:我|俺|咱)?必须/, '我必须')
      .replace(/^(?:我|俺|咱)?一定要/, '我一定要')
      .replace(/^(?:我|俺|咱)?不能/, '我不能')
      .replace(/^(?:我|俺|咱)?绝不能/, '我绝不能')
      .replace(/^(?:我|俺|咱)?不会/, '我不会')
      .replace(/^(?:我|俺|咱)?不想/, '我不想')
      .replace(/^(?:我|俺|咱)?要/, '我要'));
    return `${narratorName}：${cleaned}`;
  }

  if (/(?:凭什么|怎么可能|为什么|到底是谁|你是谁|认命|嫁给|背锅|送死)/.test(text)) {
    if (/(?:你是谁|到底是谁)/.test(text)) return `${narratorName}：你到底是谁？`;
    if (/(?:嫁给|认命|送死|背锅)/.test(text)) return `${narratorName}：凭什么要我认命？`;
    return `${narratorName}：凭什么？`;
  }

  return null;
}

function cleanNarratorDialogueLine(text: string): string {
  const cleaned = normalizeDialogueText(text)
    .replace(/^(?:我|俺|咱)(?:心里|心中|脑子里)?(?:想|想着|觉得|感觉到|意识到|发现|明白)[，,]?/, '')
    .replace(/^(?:这才|终于|突然|猛地|一下子)/, '')
    .replace(/[。；;，,]*$/, '')
    .trim();
  if (!cleaned) return '这不对。';
  return /[。！？!?]$/.test(cleaned) ? cleaned : `${cleaned}。`;
}

/** 供 narrativeMode.ts 的类型引用（避免循环依赖的占位） */
export type { ProjectNarrativeMode };
