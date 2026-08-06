/**
 * 分镜脚本 → 提示词的新鲜度追踪。
 *
 * 问题：用户编辑分镜脚本后，此前生成的图片/视频提示词静默滞后——
 * 要么忘了重新生成提示词直接出图（画面与剧本不符），要么凭记忆核对。
 * 成熟管线工具（ComfyUI 把节点标 stale、构建系统追踪 dirty）都会显式标记。
 *
 * 做法：生成提示词成功时把当时的脚本指纹（FNV-1a 哈希）写到
 * shot.promptScriptHash；渲染时对比当前指纹，不一致即提示"脚本已改"。
 */
import type { ShotScriptLine } from '../types/scene-character';
import { extractDialoguesFromDescription } from '../types/shot-script';

/** FNV-1a 32 位：够用的内容指纹（非加密用途） */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** 计算脚本行列表的内容指纹（角色/文本/说话人都参与） */
export function computeShotScriptHash(scriptLines: ShotScriptLine[] | undefined): string {
  const normalized = (scriptLines ?? [])
    .map(line => `${line.role ?? 'narration'}|${line.characterId ?? ''}|${String(line.text ?? '').trim()}`)
    .join('\n');
  return fnv1a(normalized);
}

/**
 * 提示词是否滞后于当前脚本。
 * 仅当"有提示词 + 有生成时的指纹 + 与当前指纹不同"才判滞后；
 * 从未生成过提示词（无指纹）不算滞后——那是"还没生成"，由别的入口引导。
 */
export function isShotPromptStale(shot: {
  imagePrompt?: string;
  videoPrompt?: string;
  promptScriptHash?: string;
  scriptLines?: ShotScriptLine[];
}): boolean {
  const hasPrompt = Boolean(shot.imagePrompt?.trim() || shot.videoPrompt?.trim());
  if (!hasPrompt || !shot.promptScriptHash) return false;
  return computeShotScriptHash(shot.scriptLines) !== shot.promptScriptHash;
}

// ---------------------------------------------------------------------------
// 台词 → 配音新鲜度
// ---------------------------------------------------------------------------

/**
 * 计算分镜"可配音内容"的指纹（对话/旁白 + description 里的引号台词）。
 * 只依赖台词部分：画面描述改动不影响配音，指纹不变 → 不误报"配音待更新"。
 */
export function computeShotVoiceHash(shot: { scriptLines?: ShotScriptLine[] }): string {
  const parts: string[] = [];
  for (const line of shot.scriptLines ?? []) {
    const text = line.text?.trim();
    if (!text) continue;
    if (line.role === 'dialogue') {
      parts.push(`D|${line.characterId ?? ''}|${text}`);
      continue;
    }
    if (line.role === 'narration') {
      parts.push(`N|${text}`);
      continue;
    }
    // description：只取引号台词（画面文本不入配音）
    for (const d of extractDialoguesFromDescription(text)) {
      parts.push(`D|${d.speaker ?? ''}|${d.text}`);
    }
  }
  return fnv1a(parts.join('\n'));
}

/**
 * 配音是否滞后于当前台词（脚本台词被改后，旧配音与新台词不匹配）。
 * 仅当"有配音 + 有生成时的台词指纹 + 与当前不一致"才判滞后。
 */
export function isShotVoiceStale(shot: {
  media?: { audios?: unknown[] };
  voiceScriptHash?: string;
  scriptLines?: ShotScriptLine[];
}): boolean {
  const hasAudio = Boolean(shot.media?.audios?.length);
  if (!hasAudio || !shot.voiceScriptHash) return false;
  return computeShotVoiceHash(shot) !== shot.voiceScriptHash;
}

// ---------------------------------------------------------------------------
// 分镜时长 vs 台词量合理性
// ---------------------------------------------------------------------------

/** 中文朗读估算：每 4.5 字 ≈ 1 秒（含句间停顿），0.25s/字为保守下限 */
const CHARS_PER_SECOND = 4.5;

/**
 * 估算分镜可配音内容的朗读时长（秒）。
 * 台词 + 旁白 + description 里的引号台词都算；画面文本不算。
 */
export function estimateShotSpeechDuration(shot: { scriptLines?: ShotScriptLine[] }): number {
  let chars = 0;
  for (const line of shot.scriptLines ?? []) {
    const text = line.text?.trim();
    if (!text) continue;
    if (line.role === 'dialogue' || line.role === 'narration') {
      chars += text.length;
      continue;
    }
    for (const d of extractDialoguesFromDescription(text)) {
      chars += d.text.length;
    }
  }
  return chars / CHARS_PER_SECOND;
}

/**
 * 台词量是否超出分镜时长（配音会溢出）。
 * 朗读估算 > 时长 × 1.3 判为超配（给 30% 缓冲：语速快/停顿少可容忍）。
 */
export function isShotSpeechOverDuration(shot: {
  duration?: number;
  scriptLines?: ShotScriptLine[];
}): boolean {
  const duration = Number(shot.duration) || 0;
  if (duration <= 0) return false;
  return estimateShotSpeechDuration(shot) > duration * 1.3;
}

/** 分镜时长远大于台词量（几乎无对白却拖长）：> 时长 60% 无台词/少台词 */
export function isShotSpeechUnderused(shot: {
  duration?: number;
  scriptLines?: ShotScriptLine[];
}): boolean {
  const duration = Number(shot.duration) || 0;
  if (duration < 8) return false;
  return estimateShotSpeechDuration(shot) < duration * 0.4;
}

/** 短剧单镜时长上限（秒）：超过此值应拆镜而非无限加长 */
export const MAX_SINGLE_SHOT_SECONDS = 20;

/**
 * 台词超时长分镜的建议时长（秒）：补足到估算朗读时长，若已有实际配音则优先
 * 用配音真实时长（更准），但不超过单镜上限。未超时返回 undefined（无需校准）。
 * 超过上限的保持警示（提示拆镜）。
 */
export function suggestCalibratedDuration(shot: {
  duration?: number;
  scriptLines?: ShotScriptLine[];
  media?: { audios?: Array<{ durationMs?: number }>; currentAudioIndex?: number };
}): number | undefined {
  const estimated = Math.ceil(estimateShotSpeechDuration(shot));
  const audioSec = getShotAudioDurationSec(shot);
  const need = Math.max(estimated, audioSec ?? 0);
  const current = Number(shot.duration) || 0;
  // 目标不超过当前时长 × 1.3 视为可容忍（估算有缓冲；实际配音用同样口径）
  if (need <= current * 1.3) return undefined;
  return Math.min(MAX_SINGLE_SHOT_SECONDS, Math.max(current, need));
}

/** 当前选中配音的实际时长（秒）；无配音或时长缺失返回 undefined */
export function getShotAudioDurationSec(shot: {
  media?: { audios?: Array<{ durationMs?: number }>; currentAudioIndex?: number };
}): number | undefined {
  const audios = shot.media?.audios;
  if (!audios?.length) return undefined;
  const idx = shot.media?.currentAudioIndex ?? audios.length - 1;
  const audio = audios[idx] ?? audios[audios.length - 1];
  const ms = audio?.durationMs;
  return ms && ms > 0 ? ms / 1000 : undefined;
}

// ---------------------------------------------------------------------------
// 角色音色跨镜一致性
// ---------------------------------------------------------------------------

export interface CharacterVoiceInconsistency {
  characterId: string;
  name: string;
  /** 该角色在跨镜中使用过的音色 profile id 集合 */
  voices: string[];
}

/**
 * 检测同一角色在不同镜使用了不同音色（跨镜声音不一致）。
 * 基于 shot.audioBindings 的 sourceCharacterId → voiceProfileId 映射。
 */
export function detectInconsistentCharacterVoices(
  shots: Array<{ audioBindings?: Array<{
    index?: number;
    sourceCharacterId?: string;
    voiceProfileId?: string;
    voiceName?: string;
  }> }>,
): CharacterVoiceInconsistency[] {
  const byChar = new Map<string, { name: string; voices: Set<string> }>();
  for (const shot of shots) {
    for (const binding of shot.audioBindings ?? []) {
      if (!binding.sourceCharacterId || !binding.voiceProfileId) continue;
      const entry = byChar.get(binding.sourceCharacterId) ?? { name: binding.voiceName || '', voices: new Set<string>() };
      entry.voices.add(binding.voiceProfileId);
      byChar.set(binding.sourceCharacterId, entry);
    }
  }
  return Array.from(byChar.entries())
    .filter(([, entry]) => entry.voices.size > 1)
    .map(([characterId, entry]) => ({
      characterId,
      name: entry.name,
      voices: Array.from(entry.voices),
    }));
}
