/**
 * 分镜配音段的音色解析。
 *
 * 剧情模式下，字幕行已经结构化成 旁白 / 台词（带说话人），配音按行选音色：
 *   - 台词（dialogue + characterId）→ Character.voiceId；角色没绑音色则回退项目级
 *   - 旁白（narration）→ 项目级音色（Project.ttsVoiceId）
 * 解析不出时返回空串，交给 TTS provider 用自己的 channel default。
 */
import type { Character } from '../../types';
import type { ShotScriptLineRole } from '../../types/scene-character';

export function resolveShotLineVoiceId(params: {
  role: ShotScriptLineRole;
  characterId?: string;
  characters: Pick<Character, 'id' | 'voiceId'>[];
  /** 项目级音色（旁白与未绑定角色共用） */
  projectNarrationVoiceId?: string;
}): string {
  const { role, characterId, characters, projectNarrationVoiceId } = params;
  if (role === 'dialogue' && characterId) {
    const voice = characters.find(c => c.id === characterId)?.voiceId;
    if (voice) return voice;
  }
  return projectNarrationVoiceId ?? '';
}
