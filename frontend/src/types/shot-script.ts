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

/** 该行是否为分镜描述（剧情模式的画面/动作文本，不入配音、不入剪辑字幕） */
export function isDescriptionLine(line: ShotScriptLine | undefined): boolean {
  return line?.role === 'description';
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

/**
 * 从分镜描述行（description）里提取引号包裹的台词。
 *
 * 剧情模式的分镜脚本是"完整一段"（画面+动作+台词自然行文，无 [台词] 标注），
 * 台词用引号包在段落里（如 `叶赎抬眼："你们来了。"`）。下游配音/字幕按
 * role=dialogue 消费，但这样的段落整体是 description —— 台词被漏掉，
 * 导致配音失败、字幕缺失。此函数在消费端把引号台词提取出来，存储结构不变。
 *
 * 说话人识别（尽力而为，识别不到留空走默认音色）：
 *   - `X："…"` / `X道：` / `X说：` / `X问：` / `X答：` 等，X 不以 的了话声音 结尾
 *   - 其余情况 speaker 留空
 */
export interface ExtractedDialogue {
  text: string;
  /** 尽力识别的说话人名（可能为空） */
  speaker?: string;
}

const DIALOGUE_QUOTE_RE = /([\u201c"\u300c\u300e])([^\u201d"\u300d\u300f]{1,300}?)([\u201d"\u300d\u300f])/g;
/** 说话动词紧邻（高置信，仅当整段以"主语+动词"开头时用） */
/** 前缀整体就是「主语+冒号」（如 `叶赎：`），高置信 */
const PREFIX_ONLY_COLON = /^([\u4e00-\u9fa5A-Za-z]{1,3})[：:]$/;
/** 前缀整体就是「主语+说话动词」（如 `叶赎道`），高置信 */
const PREFIX_ONLY_VERB = /^([\u4e00-\u9fa5A-Za-z]{1,3})(?:道|说|问|答|喊|叫|复述|开口|说道|问道|答道)$/;
/** 这些结尾说明片段不是说话人（"的话""的声音"等） */
const SPEAKER_TAIL_BLOCK = /(的|了|话|声|音)$/;

function extractSpeakerFromPrefix(prefix: string, knownSpeakers?: string[]): string | undefined {
  const cleaned = prefix.trimEnd();

  // 1. 角色名表：从引号前文本里从后往前找最近的已知角色名（最准，覆盖 2/3 字名）
  if (knownSpeakers && knownSpeakers.length > 0) {
    let best: string | undefined;
    let bestIndex = -1;
    for (const name of knownSpeakers) {
      const idx = cleaned.lastIndexOf(name);
      if (idx >= 0 && idx > bestIndex) {
        bestIndex = idx;
        best = name;
      }
    }
    if (best) return best;
  }

  // 2. 前缀极简（整体就是"主语+冒号/动词"，无动作描述）才启发式猜，避免误判。
  //    主语若以说话动词结尾（如"苏晓说："）剥掉动词
  const stripVerb = (s: string) => s.replace(/(?:道|说|问|答|喊|叫|复述|开口|说道|问道|答道)$/, '');
  const colon = cleaned.match(PREFIX_ONLY_COLON);
  if (colon) {
    const speaker = stripVerb(colon[1]);
    if (speaker && !SPEAKER_TAIL_BLOCK.test(speaker)) return speaker;
  }
  const verb = cleaned.match(PREFIX_ONLY_VERB);
  if (verb && !SPEAKER_TAIL_BLOCK.test(verb[1])) return verb[1];

  // 3. 其余留空（走默认音色，台词仍可配音）
  return undefined;
}

/**
 * 从一段 description 文本里提取全部引号台词；无台词返回空数组。
 * knownSpeakers 传入角色名表可显著提升说话人识别准确率。
 */
export function extractDialoguesFromDescription(text: string, knownSpeakers?: string[]): ExtractedDialogue[] {
  if (!text) return [];
  const dialogues: ExtractedDialogue[] = [];
  DIALOGUE_QUOTE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DIALOGUE_QUOTE_RE.exec(text)) !== null) {
    const dialogueText = match[2].trim();
    if (!dialogueText) continue;
    const prefix = text.slice(0, match.index);
    dialogues.push({
      text: dialogueText,
      speaker: extractSpeakerFromPrefix(prefix, knownSpeakers),
    });
  }
  return dialogues;
}

/** 判断一段文本里是否含引号台词（供 UI 标记"此镜含可配音台词"） */
export function containsDialogueInDescription(text: string): boolean {
  return extractDialoguesFromDescription(text).length > 0;
}

export interface BuildShotVoiceSegmentsOptions {
  /** 说话人名 → characterId 映射（配音按角色选音色） */
  speakerToCharacterId?: (speaker: string) => string | undefined;
  /** 已知角色名表：用于从 description 里更准地识别说话人 */
  knownSpeakers?: string[];
}

export function buildShotVoiceSegments(shot: {
  scriptLines?: ShotScriptLine[];
}, options?: BuildShotVoiceSegmentsOptions): ShotVoiceSegment[] {
  const { speakerToCharacterId, knownSpeakers } = options ?? {};
  // 只收旁白 / 台词行；分镜描述行（description）是画面文本，不入配音。
  // 但剧情模式的分镜脚本里台词用引号包在 description 里 —— 提取出来作为配音段，
  // 否则整段被当画面文本漏掉（配音失败、字幕缺失）。
  const segments: ShotVoiceSegment[] = [];
  const push = (text: string, role: ShotScriptLineRole, characterId?: string) => {
    const last = segments[segments.length - 1];
    // 相邻同角色/同类型合并成一段，减少 TTS 请求数
    if (last && last.role === role && last.characterId === characterId) {
      last.text += '\n' + text;
    } else {
      segments.push({ text, role, characterId });
    }
  };

  for (const line of shot.scriptLines ?? []) {
    const text = line.text?.trim();
    if (!text) continue;
    if (isDialogueLine(line) || isNarrationLine(line)) {
      push(text, isDialogueLine(line) ? 'dialogue' : 'narration', isDialogueLine(line) ? line.characterId : undefined);
      continue;
    }
    // description：提取引号台词为 dialogue 段；说话人名 → characterId（经注入的映射）
    for (const d of extractDialoguesFromDescription(text, knownSpeakers)) {
      const characterId = d.speaker ? speakerToCharacterId?.(d.speaker) : undefined;
      push(d.text, 'dialogue', characterId);
    }
  }
  return segments;
}
