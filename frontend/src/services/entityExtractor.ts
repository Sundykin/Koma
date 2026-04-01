/**
 * 实体提取服务
 * 从剧本中自动提取角色、场景、道具
 */
import type { Character, Scene } from '../types';
import type { CreationContext } from './CreationContext';
import { resolvePromptTemplate } from '../store/promptTemplates';
import { parseLLMJSON } from '../utils/llmJsonParser';
import { cleanText, sanitizeCharacterAppearance } from '../utils/textUtils';

// 道具接口
export interface Prop {
  name: string;
  description: string;
  importance: 'high' | 'medium' | 'low';
  scenes: string[];
}

// 提取结果接口
export interface ExtractionResult {
  characters?: Character[];
  scenes?: Scene[];
  props?: Prop[];
}

type EntityType = 'character' | 'scene' | 'prop';

/**
 * 从剧本提取角色
 */
export async function extractCharacters(
  ctx: CreationContext,
  script: string,
  onProgress?: (progress: number, step?: string) => void,
): Promise<Character[]> {
  onProgress?.(5, '加载 Prompt 模板...');
  const resolvedPrompt = await resolvePromptTemplate('character_extraction', { script });

  onProgress?.(10, '分析剧本角色...');
  const response = await ctx.llmProvider.chat([
    { role: 'user', content: resolvedPrompt.prompt },
  ]);

  onProgress?.(80, '解析角色数据...');

  const data = parseLLMJSON<any>(response);

  const characters: Character[] = (data.characters || []).map((c: any, idx: number) => ({
    id: `char_${Date.now()}_${idx}`,
    name: c.name,
    age: c.age || '未知',
    gender: ['male', 'female', 'neutral', 'unknown'].includes(c.gender) ? c.gender : 'unknown',
    appearance: sanitizeCharacterAppearance(c.appearance, c.name),
    description: cleanText(c.description || ''),
    prompt: sanitizeCharacterAppearance(c.appearance, c.name) || c.name,
    role: c.role || 'supporting',
  }));

  onProgress?.(100, '角色提取完成');
  return characters;
}

/**
 * 从剧本提取场景
 */
export async function extractScenes(
  ctx: CreationContext,
  script: string,
  onProgress?: (progress: number, step?: string) => void,
): Promise<Scene[]> {
  onProgress?.(5, '加载 Prompt 模板...');
  const resolvedPrompt = await resolvePromptTemplate('scene_extraction', { script });

  onProgress?.(10, '分析剧本场景...');
  const response = await ctx.llmProvider.chat([
    { role: 'user', content: resolvedPrompt.prompt },
  ]);

  onProgress?.(80, '解析场景数据...');

  const data = parseLLMJSON<any>(response);

  const scenes: Scene[] = (data.scenes || []).map((s: any, idx: number) => ({
    id: `scene_${Date.now()}_${idx}`,
    name: s.name,
    description: s.description || '',
    time: s.time,
    weather: s.weather,
    mood: s.mood,
    keyElements: s.keyElements || [],
    referenceImages: [],
  }));

  onProgress?.(100, '场景提取完成');
  return scenes;
}

/**
 * 从剧本提取道具
 */
export async function extractProps(
  ctx: CreationContext,
  script: string,
  onProgress?: (progress: number, step?: string) => void,
): Promise<Prop[]> {
  onProgress?.(5, '加载 Prompt 模板...');
  const resolvedPrompt = await resolvePromptTemplate('prop_extraction', { script });

  onProgress?.(10, '分析剧本道具...');
  const propResponse = await ctx.llmProvider.chat([
    { role: 'user', content: resolvedPrompt.prompt },
  ]);

  onProgress?.(80, '解析道具数据...');

  const data = parseLLMJSON<any>(propResponse);

  const props: Prop[] = (data.props || []).map((p: any) => ({
    name: p.name,
    description: p.description || '',
    importance: p.importance || 'medium',
    scenes: p.scenes || [],
  }));

  onProgress?.(100, '道具提取完成');
  return props;
}

/**
 * 统一提取接口
 */
export async function extractEntities(
  ctx: CreationContext,
  script: string,
  type: EntityType,
  onProgress?: (progress: number, step?: string) => void,
): Promise<ExtractionResult> {
  switch (type) {
    case 'character':
      return { characters: await extractCharacters(ctx, script, onProgress) };
    case 'scene':
      return { scenes: await extractScenes(ctx, script, onProgress) };
    case 'prop':
      return { props: await extractProps(ctx, script, onProgress) };
    default:
      throw new Error(`未知的实体类型: ${type}`);
  }
}

/**
 * 批量提取所有实体
 */
export async function extractAllEntities(
  ctx: CreationContext,
  script: string,
  onProgress?: (progress: number, step?: string) => void,
): Promise<ExtractionResult> {
  onProgress?.(0, '开始提取实体...');

  const characters = await extractCharacters(ctx, script, (p, s) => {
    onProgress?.(p * 0.33, s);
  });

  const scenes = await extractScenes(ctx, script, (p, s) => {
    onProgress?.(33 + p * 0.33, s);
  });

  const props = await extractProps(ctx, script, (p, s) => {
    onProgress?.(66 + p * 0.34, s);
  });

  onProgress?.(100, '实体提取完成');

  return { characters, scenes, props };
}

export default {
  extractCharacters,
  extractScenes,
  extractProps,
  extractEntities,
  extractAllEntities,
};
