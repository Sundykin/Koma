/**
 * 把 prompt 里的音色 mention 编译成 @Audio N 占位符 + 一份 audioBindings 元数据。
 *
 * 输入端识别两种 mention（都来自 editor/mentionTypes 的 parseMentions）：
 *   - @voice_<profileId>         直接指向 VoiceProfile.id
 *   - @char_<charId>-音色        取该角色绑定的音色（兜底链：char.voiceId → project default）
 *
 * 输出端：
 *   - compiledPrompt：上面两种 token 都被替换成 @Audio N（N 1-based，按出现顺序去重编号）
 *   - audioBindings：N → 解析后的 voice profile + provider voice id，
 *                    给 TTS 任务后续按段切 voice 用
 *
 * 同一 VoiceProfile.id 在 prompt 里多次出现 → 共享同一个 N，不重复编号。
 * 解析失败的 voice mention：剥离 token（不留 raw id 污染 LLM prompt），并记录到 unresolved 里。
 *
 * 协议层的占位符语义复用 promptCompilation/types.ts 的 @Audio N（grok-image-index）。
 * Koma 即梦协议（@audio_file_N）目前没有 voice mention 用例，等真有再扩。
 */
import { parseMentions, type ParsedMention } from '../../editor/mentionTypes';
import {
  resolveCharacterVoiceMention,
  resolveVoiceMention,
  type ResolvedVoice,
  type VoiceResolveContext,
} from '../voiceLibrary/voiceResolver';

export interface AudioBinding {
  /** 在 @Audio N 中的 N（1-based） */
  index: number;
  /** VoiceProfile.id */
  voiceProfileId: string;
  /** 上游 provider 的 voice id；自定义音色未绑 provider 时可能为空（TTS 任务遇到 undefined 应回退到 channel 默认） */
  providerVoiceId?: string;
  /** 显示名（log / UI fallback 用） */
  voiceName: string;
  /** 复合 mention 来源：通过哪个 character.voiceId 解出来的（直接 @voice_ 时为 undefined） */
  sourceCharacterId?: string;
  /** prompt 原文 token，调试用 */
  originTokens: string[];
}

export interface AudioMentionCompilationResult {
  compiledPrompt: string;
  audioBindings: AudioBinding[];
  /** 未能解析的 voice / char-音色 mention，已从 prompt 剥离 */
  unresolvedMentions: Array<{ token: string; reason: 'voice-not-found' | 'character-voice-missing' }>;
}

interface PendingReplacement {
  from: number;
  to: number;
  replacement: string;
}

/**
 * 给定 prompt + 解析上下文，扫出 voice / char-音色 mention，编译成 @Audio N + audioBindings。
 * 不动其它类型的 mention（普通 char / scene / prop / anchor 留给后续 image 编译器处理）。
 */
export function compileAudioMentions(params: {
  prompt: string;
  ctx: VoiceResolveContext;
}): AudioMentionCompilationResult {
  const { prompt, ctx } = params;
  const mentions = parseMentions(prompt);
  const replacements: PendingReplacement[] = [];

  // VoiceProfile.id → { binding, originTokens } 累积，多次引用同一音色复用 N
  const bindingByProfileId = new Map<string, AudioBinding>();
  const unresolved: AudioMentionCompilationResult['unresolvedMentions'] = [];
  let nextIndex = 1;

  const upsertBinding = (resolved: ResolvedVoice, mention: ParsedMention, sourceCharacterId?: string): number => {
    const existing = bindingByProfileId.get(resolved.voiceProfileId);
    if (existing) {
      existing.originTokens.push(mention.fullMatch);
      return existing.index;
    }
    const binding: AudioBinding = {
      index: nextIndex++,
      voiceProfileId: resolved.voiceProfileId,
      providerVoiceId: resolved.providerVoiceId,
      voiceName: resolved.voiceName,
      sourceCharacterId,
      originTokens: [mention.fullMatch],
    };
    bindingByProfileId.set(resolved.voiceProfileId, binding);
    return binding.index;
  };

  for (const mention of mentions) {
    // 仅处理两种音色相关的 mention：@voice_xxx / @char_xxx-音色
    if (mention.type === 'voice') {
      const resolved = resolveVoiceMention(mention.id, ctx);
      if (!resolved) {
        unresolved.push({ token: mention.fullMatch, reason: 'voice-not-found' });
        replacements.push({ from: mention.from, to: mention.to, replacement: '' });
        continue;
      }
      const idx = upsertBinding(resolved, mention);
      replacements.push({ from: mention.from, to: mention.to, replacement: `@Audio ${idx}` });
      continue;
    }

    if (mention.type === 'char' && mention.property === 'voice') {
      const resolved = resolveCharacterVoiceMention(mention.id, ctx);
      if (!resolved) {
        unresolved.push({ token: mention.fullMatch, reason: 'character-voice-missing' });
        replacements.push({ from: mention.from, to: mention.to, replacement: '' });
        continue;
      }
      const idx = upsertBinding(resolved, mention, mention.id);
      replacements.push({ from: mention.from, to: mention.to, replacement: `@Audio ${idx}` });
      continue;
    }

    // 其它 mention（char / scene / prop / anchor）留给后续 image 编译器
  }

  // 从后往前替换避免位置错乱
  let compiledPrompt = prompt;
  for (const item of replacements.sort((a, b) => b.from - a.from)) {
    compiledPrompt = compiledPrompt.slice(0, item.from) + item.replacement + compiledPrompt.slice(item.to);
  }
  // 折叠剥离后的多余空白
  compiledPrompt = compiledPrompt.replace(/[ \t]{2,}/g, ' ');

  const audioBindings = Array.from(bindingByProfileId.values()).sort((a, b) => a.index - b.index);

  return { compiledPrompt, audioBindings, unresolvedMentions: unresolved };
}
