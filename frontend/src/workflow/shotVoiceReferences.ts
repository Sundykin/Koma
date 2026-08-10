/**
 * 分镜视频的「音色参考」：把绑定了音色的角色的示例音频挂进视频生成请求，
 * 供音画同出模型（MiniMax H3 / Seedance 2.0 等）作为全能参考里的音频参考。
 *
 * 产物：
 *   - request.metadata.komaVoiceReferences：按序排列的音频素材（ProviderAssetInput）
 *   - 提示词追加的占位行：`<角色名>的台词使用 <音频 N> 的音色`（N 与 metadata 顺序一致，
 *     按编译协议渲染：minimax-image-tag → <音频 N>，grok-image-index → @Audio N，
 *     每类参考的序号都从 1 开始）
 */
import type { Character, ProviderAssetInput } from '../types';
import { loadVoiceLibrary, findVoiceProfile, resolveVoiceSampleUrl } from '../services/voiceLibrary/voiceLibraryService';
import { resolveProviderAssetInput } from '../services/mediaAssetResolver';
import { formatReferencePlaceholder } from '../services/promptCompilation/imageIndexProtocol';
import { normalizeMentionId } from '../editor/mentionTypes';
import { createLogger } from '../store/logger';

const logger = createLogger('ShotVoiceReference');

/** 视频模型的音频参考上限（MiniMax H3 ref_audios max 3） */
export const MAX_VOICE_REFERENCES = 3;

export interface ShotVoiceReference {
  characterId: string;
  characterName: string;
  asset: ProviderAssetInput;
}

export interface ShotVoiceReferencePlan {
  references: ShotVoiceReference[];
  /** 追加到视频提示词末尾的音色参考行（为空串则无音色参考） */
  promptSuffix: string;
}

/**
 * 为分镜构建音色参考计划。
 * 取分镜关联角色中绑定了音色且音色有示例音频的角色，按 shot.characters 顺序，
 * 最多 MAX_VOICE_REFERENCES 个。
 */
export async function buildShotVoiceReferencePlan(params: {
  shotCharacters: string[];
  characters: Array<Pick<Character, 'id' | 'name' | 'voiceId'>>;
  /** 当前 ITV provider 的提示词协议（决定占位符形态） */
  promptProtocol?: string;
}): Promise<ShotVoiceReferencePlan> {
  const { shotCharacters, characters, promptProtocol } = params;
  const empty: ShotVoiceReferencePlan = { references: [], promptSuffix: '' };

  const bound = (shotCharacters ?? [])
    .map(id => characters.find(c => c.id === id))
    .filter((c): c is Pick<Character, 'id' | 'name' | 'voiceId'> => Boolean(c?.voiceId));
  if (!bound.length) return empty;

  const library = await loadVoiceLibrary();
  const references: ShotVoiceReference[] = [];

  for (const character of bound) {
    if (references.length >= MAX_VOICE_REFERENCES) break;
    const profile = findVoiceProfile(character.voiceId, library);
    if (!profile?.sampleFile) continue;
    try {
      const sampleUrl = await resolveVoiceSampleUrl(profile.sampleFile);
      if (!sampleUrl) continue;
      const asset = await resolveProviderAssetInput(sampleUrl, { preferLocalFile: true });
      if (!asset) continue;
      references.push({
        characterId: character.id,
        characterName: character.name,
        asset,
      });
    } catch (error) {
      logger.warn('音色示例音频解析失败，跳过该角色音色参考', {
        characterId: character.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!references.length) return empty;

  const lines = references.map((ref, index) =>
    `${ref.characterName}的台词使用 ${formatReferencePlaceholder(promptProtocol, 'audio', index + 1)} 的音色`,
  );
  return {
    references,
    promptSuffix: ['【音色参考】', ...lines].join('\n'),
  };
}

// 视频提示词里的角色音色复合映射符：`@char_<id>-音色`（推理阶段由 ShotPromptService 写入）。
// 前面可能带一个"音色"字面标签（`@char_x 周明 音色 @char_x-音色`），一并吃掉，
// 剥离时不会留下孤零零的"音色"两个字。
const CHAR_VOICE_MENTION_RE = /(?:\s*音色)?\s*@char_([A-Za-z0-9_一-鿿-]+?)-音色/g;

/**
 * 把视频提示词里的 `@char_<id>-音色` 编译成协议占位符（`@Audio N` / `<音频 N>`），
 * N 与 plan.references 顺序一致，也就是 metadata.komaVoiceReferences 的顺序。
 *
 * 必须在 compileShotPromptToBundle 之前跑：图像编译器的 `@char_<id>` 正则会把
 * `@char_abc-音色` 前半段吃掉，编出 `@Image N-音色` 这种废 token。
 * 没有对应音频参考的角色（未绑音色 / 音色没有示例音频）直接剥离 token。
 */
export function compileShotVoiceMentions(params: {
  prompt: string;
  plan: ShotVoiceReferencePlan;
  promptProtocol?: string;
}): { prompt: string; unresolvedMentions: string[] } {
  // mention 里的 id 是去掉 `char_` 前缀的形式（createMentionString 的约定），
  // 而 plan.references 用的是完整 character.id，这里统一归一后再查表。
  const indexByMentionId = new Map(
    params.plan.references.map((ref, index) => [normalizeMentionId('char', ref.characterId), index + 1] as const),
  );
  const unresolvedMentions: string[] = [];
  const prompt = params.prompt.replace(CHAR_VOICE_MENTION_RE, (_match, mentionId: string) => {
    const index = indexByMentionId.get(mentionId);
    if (!index) {
      unresolvedMentions.push(`@char_${mentionId}-音色`);
      return '';
    }
    return ` 音色 ${formatReferencePlaceholder(params.promptProtocol, 'audio', index)}`;
  });
  return { prompt, unresolvedMentions };
}
