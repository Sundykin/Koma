/**
 * 集中处理"VoiceProfile → 真正 provider voice id"的查询与兜底链。
 *
 * 兜底链（由调用方提供 ctx，链上只要任何一节命中即返回）：
 *   1) 显式 voiceProfileId（如 @voice_xxx 解析后）
 *   2) characterVoiceId（如 @char_xxx-音色 / 角色绑定）
 *   3) projectFallbackVoiceId（项目设置里的默认音色）
 *
 * 通道层的 channel.defaultVoice 不在这里兜底——那是 TTS provider 自己读 providerConfig 时
 * 用，不属于"哪个音色应该被请求"的范畴。
 *
 * 兼容老数据：character.voiceId 可能直接是 Koma voice id（'cherry'）。先做 legacy 归一。
 */
import type { VoiceLibrarySnapshot, VoiceProfile } from '../../types/voice-library';
import { resolveLegacyKomaVoiceProfileId } from './builtin';

export interface VoiceResolveContext {
  /** 音色库运行时快照（builtin + custom 合并后） */
  library: VoiceLibrarySnapshot;
  /** 项目级默认 voiceProfile id（兜底） */
  projectFallbackVoiceId?: string;
  /** 通过 character.id 查 character.voiceId，用于 @char_xxx-音色 复合 mention */
  getCharacterVoiceId?: (characterId: string) => string | undefined;
}

export interface ResolvedVoice {
  /** VoiceProfile.id（库里全局唯一） */
  voiceProfileId: string;
  /** 上游 provider 的 voice id（builtin 直接来自 Koma；自定义可能为空） */
  providerVoiceId?: string;
  /** 显示名 */
  voiceName: string;
  /** 完整 VoiceProfile（给 UI 试听 / 调试用） */
  profile: VoiceProfile;
}

function findInLibrary(library: VoiceLibrarySnapshot, id: string | undefined): VoiceProfile | undefined {
  if (!id) return undefined;
  const direct = library.profiles.find((p) => p.id === id);
  if (direct) return direct;
  // 老数据：character.voiceId 可能是 Koma voice id（'cherry'）→ 归一为 builtin-koma-voice-cherry
  const legacy = resolveLegacyKomaVoiceProfileId(id);
  return legacy ? library.profiles.find((p) => p.id === legacy) : undefined;
}

function toResolved(profile: VoiceProfile): ResolvedVoice {
  return {
    voiceProfileId: profile.id,
    providerVoiceId: profile.providerVoiceId,
    voiceName: profile.name,
    profile,
  };
}

/**
 * 解析一个显式的 @voice_xxx mention：xxx 直接是 VoiceProfile.id。
 * 没命中时不走兜底链——显式 mention 解析失败就是失败，调用方应保留 token 或剥离它。
 */
export function resolveVoiceMention(
  profileId: string,
  ctx: VoiceResolveContext,
): ResolvedVoice | null {
  const profile = findInLibrary(ctx.library, profileId);
  return profile ? toResolved(profile) : null;
}

/**
 * 解析一个 @char_xxx-音色 复合 mention。
 * 链：character.voiceId → projectFallbackVoiceId → null
 */
export function resolveCharacterVoiceMention(
  characterId: string,
  ctx: VoiceResolveContext,
): ResolvedVoice | null {
  const characterVoiceId = ctx.getCharacterVoiceId?.(characterId);
  let profile = findInLibrary(ctx.library, characterVoiceId);
  if (profile) return toResolved(profile);

  profile = findInLibrary(ctx.library, ctx.projectFallbackVoiceId);
  return profile ? toResolved(profile) : null;
}
