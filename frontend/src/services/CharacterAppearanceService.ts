/**
 * 角色形象 AI 服务
 *
 * 三件事，都是「给角色资产做推理」，共用同一个 LLM provider：
 *  1. generatePreviewVideoPrompt —— 从剧本归纳角色性格与口头禅，推出预览视频的「动作 + 台词」
 *     （台词是给音轨用的：预览视频的音频后续会被提取成音色样本，所以必须有话可说）
 *  2. deriveCharacterVariants     —— 从主形象派生子形象清单（不同年龄 / 状态 / 穿着）
 *  3. matchShotCharacterVariants  —— 给每个分镜挑出该镜生效的子形象
 *
 * 提示词全部走 promptTemplates（用户可在 PromptStudio 覆盖），本文件只负责
 * 组装变量、调用 LLM、把返回 JSON 规整成类型安全的结构。
 */
import { v4 as uuidv4 } from 'uuid';
import type { Character, CharacterVariant, CharacterVariantKind, Shot } from '../types';
import type { LLMProvider } from '../providers/llm/types';
import { resolvePromptTemplate } from '../store/promptTemplates';
import { parseLLMJSON } from '../utils/llmJsonParser';
import { buildCharacterCostumeTemplateVariables } from '../workflow/promptVariableBuilders';
import { createLogger } from '../store/logger';

const logger = createLogger('CharacterAppearance');

const VARIANT_KINDS: CharacterVariantKind[] = ['age', 'state', 'outfit', 'other'];
const DEFAULT_VARIANT_COUNT = 4;
/** 喂给模型的剧本上下文上限，避免长剧本撑爆单次调用 */
const MATCH_SCRIPT_LIMIT = 24_000;

const ROLE_LABEL: Record<Character['role'], string> = {
  protagonist: '主角',
  antagonist: '反派',
  supporting: '配角',
};

export interface CharacterPreviewVideoPrompt {
  /** 英文动作提示词 */
  action: string;
  /** 中文台词（预览视频里角色说出口的话） */
  dialogue: string;
}

export interface ShotVariantAssignment {
  shotId: string;
  characterId: string;
  variantId: string;
  reason?: string;
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeVariantKind(value: unknown): CharacterVariantKind {
  const raw = toText(value).toLowerCase();
  return (VARIANT_KINDS as string[]).includes(raw) ? (raw as CharacterVariantKind) : 'other';
}

/** 角色资料 → 模板变量（复用定妆照那套 demographic / appearance 口径） */
function buildCharacterFacts(character: Character): Record<string, string> {
  const base = buildCharacterCostumeTemplateVariables(character, '');
  return {
    characterName: character.name,
    demographic: base.demographic,
    appearance: base.appearance,
    role: ROLE_LABEL[character.role] || '配角',
    aliases: toText(character.aliases),
  };
}

/**
 * 推理预览视频的动作 + 台词。
 *
 * 性格与口头禅不作为角色字段维护，由模型直接从剧本里该角色（含代称）的台词和行为归纳；
 * 剧本为空时模板内部按定位与外观保守兜底，这里不另写一套逻辑。
 */
export async function generatePreviewVideoPrompt(
  provider: LLMProvider,
  character: Character,
  options: { script?: string } = {},
): Promise<CharacterPreviewVideoPrompt> {
  const resolved = await resolvePromptTemplate('character_preview_video_prompt', {
    ...buildCharacterFacts(character),
    script: (options.script || '').slice(0, MATCH_SCRIPT_LIMIT),
  });

  const response = await provider.generateText(resolved.prompt, undefined, {
    source: 'CharacterAppearanceService.generatePreviewVideoPrompt',
    operation: 'character_preview_video_prompt',
    taskKind: 'analyze',
  });

  const parsed = parseLLMJSON<{ action?: unknown; dialogue?: unknown }>(response);
  const action = toText(parsed?.action);
  const dialogue = toText(parsed?.dialogue);
  if (!action && !dialogue) {
    throw new Error('AI 未返回可用的动作/台词提示词');
  }
  return { action, dialogue };
}

/**
 * 从主形象派生子形象清单。返回的是「草稿」——只有文本，没有图；
 * 调用方决定要不要逐个生图（见 workflow/characterVariantWorkflow）。
 */
export async function deriveCharacterVariants(
  provider: LLMProvider,
  character: Character,
  options: { script?: string; count?: number } = {},
): Promise<CharacterVariant[]> {
  const count = Math.max(1, Math.min(8, options.count ?? DEFAULT_VARIANT_COUNT));
  const resolved = await resolvePromptTemplate('character_variant_derivation', {
    ...buildCharacterFacts(character),
    script: (options.script || '').slice(0, MATCH_SCRIPT_LIMIT),
    variantCount: String(count),
  });

  const response = await provider.generateText(resolved.prompt, undefined, {
    source: 'CharacterAppearanceService.deriveCharacterVariants',
    operation: 'character_variant_derivation',
    taskKind: 'analyze',
  });

  const parsed = parseLLMJSON<{ variants?: unknown }>(response);
  const rawVariants = Array.isArray(parsed?.variants) ? parsed.variants : [];

  const existingNames = new Set((character.variants || []).map(v => v.name));
  const variants: CharacterVariant[] = [];
  for (const raw of rawVariants) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const name = toText(record.name);
    const prompt = toText(record.prompt);
    // 没名字或没差异描述的条目无法生图也无法匹配，直接丢
    if (!name || !prompt || existingNames.has(name)) continue;
    existingNames.add(name);
    variants.push({
      id: uuidv4(),
      name,
      kind: normalizeVariantKind(record.kind),
      prompt,
      keywords: toText(record.keywords),
      createdAt: Date.now(),
    });
  }

  if (variants.length === 0) {
    throw new Error('AI 未返回可用的子形象');
  }
  logger.info(`为「${character.name}」派生 ${variants.length} 个子形象`);
  return variants;
}

/** 子形象清单文本（喂给分镜匹配模板） */
function formatVariantCatalog(characters: Character[]): string {
  return characters
    .filter(c => (c.variants?.length || 0) > 0)
    .map(c => {
      const lines = (c.variants || []).map(
        v => `    - id=${v.id} | ${v.name}（${v.kind}）| 差异：${v.prompt}${v.keywords ? ` | 触发词：${v.keywords}` : ''}`,
      );
      return [`  角色 characterId=${c.id} ${c.name}`, ...lines].join('\n');
    })
    .join('\n');
}

/** 分镜清单文本：只给匹配需要的信息（画面 + 台词 + 出场角色） */
function formatShotList(shots: Shot[], characters: Character[]): string {
  const nameById = new Map(characters.map(c => [c.id, c.name]));
  return shots
    .map((shot, index) => {
      const cast = (shot.characters || [])
        .map(id => `${nameById.get(id) || id}(characterId=${id})`)
        .join('、') || '无';
      const lines = (shot.scriptLines || [])
        .map(line => (typeof line?.text === 'string' ? line.text.trim() : ''))
        .filter(Boolean)
        .join(' / ');
      return [
        `  分镜 ${index + 1} shotId=${shot.id}`,
        `    出场角色：${cast}`,
        `    画面：${shot.imagePrompt?.trim() || '（未生成）'}`,
        `    台词/旁白：${lines || '无'}`,
      ].join('\n');
    })
    .join('\n');
}

/**
 * 给每个分镜挑出应激活的子形象。
 * 只返回「需要切换」的条目；模型给不出线索的分镜不出现在结果里（= 用主形象）。
 */
export async function matchShotCharacterVariants(
  provider: LLMProvider,
  shots: Shot[],
  characters: Character[],
): Promise<ShotVariantAssignment[]> {
  const variantCatalog = formatVariantCatalog(characters);
  if (!variantCatalog) {
    return [];
  }

  // 只处理有子形象的角色出场的分镜，别让模型对着无关分镜空转
  const charactersWithVariants = new Set(
    characters.filter(c => (c.variants?.length || 0) > 0).map(c => c.id),
  );
  const relevantShots = shots.filter(shot =>
    (shot.characters || []).some(id => charactersWithVariants.has(id)),
  );
  if (relevantShots.length === 0) {
    return [];
  }

  const resolved = await resolvePromptTemplate('shot_character_variant_match', {
    variantCatalog,
    shotList: formatShotList(relevantShots, characters),
  });

  const response = await provider.generateText(resolved.prompt, undefined, {
    source: 'CharacterAppearanceService.matchShotCharacterVariants',
    operation: 'shot_character_variant_match',
    taskKind: 'analyze',
  });

  const parsed = parseLLMJSON<{ shots?: unknown }>(response);
  const rawShots = Array.isArray(parsed?.shots) ? parsed.shots : [];

  // 只接受真实存在的 shotId / characterId / variantId，模型幻觉出的 id 一律丢弃
  const shotIds = new Set(relevantShots.map(s => s.id));
  const variantOwner = new Map<string, string>();
  for (const character of characters) {
    for (const variant of character.variants || []) {
      variantOwner.set(variant.id, character.id);
    }
  }

  const assignments: ShotVariantAssignment[] = [];
  for (const rawShot of rawShots) {
    if (!rawShot || typeof rawShot !== 'object') continue;
    const shotRecord = rawShot as Record<string, unknown>;
    const shotId = toText(shotRecord.shotId);
    if (!shotIds.has(shotId)) continue;
    const rawAssignments = Array.isArray(shotRecord.assignments) ? shotRecord.assignments : [];
    for (const rawAssignment of rawAssignments) {
      if (!rawAssignment || typeof rawAssignment !== 'object') continue;
      const record = rawAssignment as Record<string, unknown>;
      const characterId = toText(record.characterId);
      const variantId = toText(record.variantId);
      if (!variantId || variantOwner.get(variantId) !== characterId) continue;
      assignments.push({ shotId, characterId, variantId, reason: toText(record.reason) || undefined });
    }
  }

  logger.info(`分镜子形象匹配：${assignments.length} 处切换（覆盖 ${relevantShots.length} 个候选分镜）`);
  return assignments;
}
