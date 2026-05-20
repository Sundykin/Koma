/**
 * 把 Koma 46 个内置音色"挂载"到音色库的运行时快照里。
 *
 * 不写入主进程持久化（library.json 只存 custom 部分），每次 loadVoiceLibrary 时合并。
 * sampleFile 用 `koma-builtin://<KomaSampleFile>` 协议占位，渲染端通过
 * 已有的 controller/app/getKomaTTSVoiceSamplePath 解析。
 */
import {
  KOMA_TTS_VOICES,
  KOMA_TTS_VOICE_CATEGORY_LABEL,
  type KomaTTSVoiceCategory,
} from '../../providers/tts/komaTTSVoices';
import {
  KOMA_BUILTIN_CATEGORY_PREFIX,
  type VoiceCategory,
  type VoiceProfile,
} from '../../types/voice-library';

const CATEGORY_ORDER: KomaTTSVoiceCategory[] = ['common', 'multilang', 'premium', 'dialect'];

export function builtinKomaCategoryId(category: KomaTTSVoiceCategory): string {
  return `${KOMA_BUILTIN_CATEGORY_PREFIX}${category}`;
}

export function builtinKomaProfileId(voiceId: string): string {
  return `builtin-koma-voice-${voiceId}`;
}

export function buildBuiltinVoiceCategories(): VoiceCategory[] {
  return CATEGORY_ORDER.map((category, index) => ({
    id: builtinKomaCategoryId(category),
    name: `内置·${KOMA_TTS_VOICE_CATEGORY_LABEL[category]}`,
    source: 'builtin' as const,
    order: index,
  }));
}

export function buildBuiltinVoiceProfiles(): VoiceProfile[] {
  const now = Date.now();
  return KOMA_TTS_VOICES.map((voice) => ({
    id: builtinKomaProfileId(voice.id),
    categoryId: builtinKomaCategoryId(voice.category),
    name: voice.name,
    source: 'builtin' as const,
    providerVoiceId: voice.id,
    sampleFile: `koma-builtin://${voice.sampleFile}`,
    language: voice.language,
    gender: voice.gender === 'unknown' ? 'neutral' : voice.gender,
    createdAt: now,
    updatedAt: now,
  }));
}

/**
 * legacy character.voiceId 可能直接是 Koma voice id（'cherry' 等），
 * 这里把它转成 VoiceProfile.id（'builtin-koma-voice-cherry'）以便 UI 显示。
 */
export function resolveLegacyKomaVoiceProfileId(legacyId: string | undefined): string | undefined {
  if (!legacyId) return undefined;
  const lower = legacyId.trim().toLowerCase();
  if (!lower) return undefined;
  if (lower.startsWith('builtin-koma-voice-')) return lower;
  const matched = KOMA_TTS_VOICES.some((v) => v.id === lower);
  return matched ? builtinKomaProfileId(lower) : undefined;
}
