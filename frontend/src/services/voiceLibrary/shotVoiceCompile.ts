/**
 * Storyboard 配音流程的桥接层：把 dialogue 文本 + 角色清单 + 项目兜底 voiceId 编译为
 * 「TTS 实际要发出去的 text + 用哪个 voiceId + audioBindings 快照」。
 *
 * 当前 KomaTTS Provider 是「一请求一 voice」，所以多 voice 分段在这里**不**做切片合成，
 * 只取 bindings[0] 的 voice 给整段 text；剩余 bindings 仍持久化到 shot 上，等到将来支持
 * 「按段切 voice + 合并 audio」时再消费。
 *
 * 调用方（Storyboard.handleGenerateShotAudio / handleBatchAudios）只需要一次调用：
 *   const { text, voiceId, audioBindings } = prepareShotAudio({ ... });
 */
import type { Character } from '../../types';
import { compileAudioMentions } from '../promptCompilation/audioMentionCompiler';
import type { VoiceLibrarySnapshot } from '../../types/voice-library';
import type { ShotAudioBinding } from '../../types/scene-character';

export interface PrepareShotAudioInput {
  /** 用户写的 dialogue 文本，可能含 @voice_xxx / @char_xxx-音色 mention */
  dialogue: string;
  /** 音色库快照（builtin + custom 合并） */
  voiceLibrary: VoiceLibrarySnapshot;
  /** 项目级 character[]（用于查 character.voiceId） */
  characters: Pick<Character, 'id' | 'voiceId'>[];
  /** 项目级 TTS 默认 voiceId（VoiceProfile.id 或老 Koma voice id），character 没绑时兜底 */
  projectFallbackVoiceId?: string;
  /** 调用方手头的「默认 voiceId 入参」——dialogue 完全没有 voice mention 时回退用 */
  defaultVoiceId?: string;
}

export interface PrepareShotAudioResult {
  /** 真正发给 TTS provider 的 text（@Audio N 占位符已剥离，避免 TTS 念出来） */
  text: string;
  /** 真正发给 TTS provider 的 voiceId；空串/undefined 时让 provider 自己回退到 channel default */
  voiceId: string;
  /** 编译产物，存到 Shot.audioBindings 让 UI 能显示「识别到 N 个音色」 */
  audioBindings: ShotAudioBinding[];
  /** 解析失败的 mention 清单，方便 UI 提示 */
  unresolvedMentions: Array<{ token: string; reason: 'voice-not-found' | 'character-voice-missing' }>;
}

const AUDIO_PLACEHOLDER_RE = /\s*@Audio\s+\d+\s*/g;

export function prepareShotAudio(input: PrepareShotAudioInput): PrepareShotAudioResult {
  const characterVoiceMap = new Map<string, string | undefined>();
  for (const c of input.characters) {
    characterVoiceMap.set(c.id, c.voiceId);
  }

  // 编译 dialogue 里的 voice / @char-音色 mention
  const compileResult = compileAudioMentions({
    prompt: input.dialogue,
    ctx: {
      library: input.voiceLibrary,
      projectFallbackVoiceId: input.projectFallbackVoiceId,
      getCharacterVoiceId: (charId) => characterVoiceMap.get(charId),
    },
  });

  // 把 @Audio N 占位符从将要送给 TTS 的 text 里清理掉；KomaTTS 拿到 'Hello @Audio 1' 会念
  // "Hello at audio one"，因此必须去掉。bindings 信息已经从编译结果里拿到。
  // 同时折叠掉清理后的多余空白。
  const ttsText = compileResult.compiledPrompt
    .replace(AUDIO_PLACEHOLDER_RE, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  // bindings[0] 决定整段用哪个 voice；没解出 binding 时回退到 defaultVoiceId（项目偏好）
  const primaryVoiceId = compileResult.audioBindings[0]?.providerVoiceId
    ?? input.defaultVoiceId
    ?? '';

  return {
    text: ttsText,
    voiceId: primaryVoiceId,
    audioBindings: compileResult.audioBindings.map((b) => ({
      index: b.index,
      voiceProfileId: b.voiceProfileId,
      providerVoiceId: b.providerVoiceId,
      voiceName: b.voiceName,
      sourceCharacterId: b.sourceCharacterId,
    })),
    unresolvedMentions: compileResult.unresolvedMentions,
  };
}
