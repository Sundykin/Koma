/**
 * 分镜配音段的音色解析。
 *
 * 剧情模式下，字幕行已经结构化成 旁白 / 台词（带说话人），配音按行选音色：
 *   - 台词（dialogue + characterId）→ Character.voiceId；角色没绑音色则回退项目级
 *   - 旁白（narration）→ 项目级音色（Project.ttsVoiceId）
 *
 * 注意：角色/项目里存的是音色库 VoiceProfile.id（或老数据的 Koma 原生 id），
 * 发给 TTS provider 的必须是 providerVoiceId（上游原生 voice id）。本模块统一经
 * 音色库快照做 legacy 归一 + providerVoiceId 解析，与 prepareShotAudio 的
 * voiceResolver 兜底链保持一致；解析失败时返回空串，交给 provider 的 channel default。
 */
import type { Character } from '../../types';
import type { ShotAudioBinding, ShotScriptLineRole } from '../../types/scene-character';
import type { VoiceLibrarySnapshot } from '../../types/voice-library';
import { resolveLegacyKomaVoiceProfileId } from './builtin';

export interface ShotLineVoiceResolution {
  /** 发给 TTS provider 的 voice id（providerVoiceId；解析失败为空串） */
  voiceId: string;
  /** 解析到的绑定信息（UI 展示"识别到 N 个音色"用）；库里查不到时为 undefined */
  binding?: Omit<ShotAudioBinding, 'index'>;
}

function resolveProfileId(
  library: VoiceLibrarySnapshot | undefined,
  rawId: string | undefined,
): ShotLineVoiceResolution | undefined {
  if (!rawId) return undefined;
  const profiles = library?.profiles ?? [];
  const direct = profiles.find(p => p.id === rawId);
  const legacy = direct ? undefined : resolveLegacyKomaVoiceProfileId(rawId);
  const profile = direct ?? (legacy ? profiles.find(p => p.id === legacy) : undefined);
  if (!profile) {
    // 库里查不到：按原生 id 透传（可能是上游自定义 voice id），不给 UI 绑定信息
    return { voiceId: rawId };
  }
  return {
    voiceId: profile.providerVoiceId ?? profile.id,
    binding: {
      voiceProfileId: profile.id,
      providerVoiceId: profile.providerVoiceId,
      voiceName: profile.name,
    },
  };
}

export function resolveShotLineVoice(params: {
  role: ShotScriptLineRole;
  characterId?: string;
  characters: Pick<Character, 'id' | 'voiceId'>[];
  /** 项目级音色（旁白与未绑定角色共用） */
  projectNarrationVoiceId?: string;
  /** 音色库快照（builtin + custom 合并）；缺省时按原生 id 透传 */
  voiceLibrary?: VoiceLibrarySnapshot;
}): ShotLineVoiceResolution {
  const { role, characterId, characters, projectNarrationVoiceId, voiceLibrary } = params;

  if (role === 'dialogue' && characterId) {
    const rawVoiceId = characters.find(c => c.id === characterId)?.voiceId;
    const resolved = resolveProfileId(voiceLibrary, rawVoiceId);
    if (resolved) {
      return {
        ...resolved,
        ...(resolved.binding ? { binding: { ...resolved.binding, sourceCharacterId: characterId } } : {}),
      };
    }
    // 角色没绑音色 → 回退项目级
  }

  const fallback = resolveProfileId(voiceLibrary, projectNarrationVoiceId);
  return fallback ?? { voiceId: '' };
}

/**
 * 兼容旧调用：只需要 voiceId 字符串的调用点。
 * 新代码请用 resolveShotLineVoice 拿 voiceId + binding。
 */
export function resolveShotLineVoiceId(params: {
  role: ShotScriptLineRole;
  characterId?: string;
  characters: Pick<Character, 'id' | 'voiceId'>[];
  projectNarrationVoiceId?: string;
  voiceLibrary?: VoiceLibrarySnapshot;
}): string {
  return resolveShotLineVoice(params).voiceId;
}
