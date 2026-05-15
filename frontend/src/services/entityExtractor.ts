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
  /** 道具在原文中的全部代称，多个用英文逗号分隔；无则为 "" */
  aliases?: string;
}

// 提取结果接口
export interface ExtractionResult {
  characters?: Character[];
  scenes?: Scene[];
  props?: Prop[];
}

type EntityType = 'character' | 'scene' | 'prop';

/**
 * 提取阶段的可选辅助上下文：
 * - tweetScript：当前剧集的整集推文旁白脚本（项目级）
 * - plotSummary：剧情主线摘要（如果有）
 * - stylePrefix：项目视觉风格定向；未传时回退到 ctx.styleSnapshot.ttiStylePrefix
 */
export interface ExtractEntityOptions {
  tweetScript?: string;
  plotSummary?: string;
  stylePrefix?: string;
}

function resolveStylePrefix(ctx: CreationContext, options?: ExtractEntityOptions): string {
  return options?.stylePrefix
    ?? ctx.styleSnapshot?.ttiStylePrefix
    ?? '';
}

function buildExtractionVariables(
  script: string,
  ctx: CreationContext,
  options?: ExtractEntityOptions,
): Record<string, string> {
  return {
    script,
    tweetScript: options?.tweetScript ?? '',
    plotSummary: options?.plotSummary ?? '',
    stylePrefix: resolveStylePrefix(ctx, options),
  };
}

function normalizeAliases(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .join(',');
  }
  return '';
}

/**
 * 从剧本提取角色
 */
export async function extractCharacters(
  ctx: CreationContext,
  script: string,
  onProgress?: (progress: number, step?: string) => void,
  options?: ExtractEntityOptions,
): Promise<Character[]> {
  onProgress?.(5, '加载 Prompt 模板...');
  const resolvedPrompt = await resolvePromptTemplate(
    'character_extraction',
    buildExtractionVariables(script, ctx, options),
  );

  onProgress?.(10, '分析剧本角色...');
  const response = await ctx.llmProvider.chat([
    { role: 'user', content: resolvedPrompt.prompt },
  ]);

  onProgress?.(80, '解析角色数据...');

  const data = parseLLMJSON<any>(response);

  const characters: Character[] = (data.characters || []).map((c: any, idx: number) => {
    // LLM 抽出来的 appearance（视觉外观）和 description（非视觉小传）合并成 prompt 一份存。
    // 后续生成 / 列表 / 编辑都只看 prompt，避免多字段漂移导致 UI 改了不生效。
    const visualAppearance = sanitizeCharacterAppearance(c.appearance, c.name);
    const briefDescription = cleanText(c.description || '');
    const promptParts = [visualAppearance, briefDescription].filter(Boolean);
    return {
      id: `char_${Date.now()}_${idx}`,
      name: c.name,
      age: c.age || '未知',
      gender: ['male', 'female', 'neutral', 'unknown'].includes(c.gender) ? c.gender : 'unknown',
      prompt: promptParts.join('\n') || c.name,
      role: c.role || 'supporting',
      aliases: normalizeAliases(c.aliases),
    };
  });

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
  options?: ExtractEntityOptions,
): Promise<Scene[]> {
  onProgress?.(5, '加载 Prompt 模板...');
  const resolvedPrompt = await resolvePromptTemplate(
    'scene_extraction',
    buildExtractionVariables(script, ctx, options),
  );

  onProgress?.(10, '分析剧本场景...');
  const response = await ctx.llmProvider.chat([
    { role: 'user', content: resolvedPrompt.prompt },
  ]);

  onProgress?.(80, '解析场景数据...');

  const data = parseLLMJSON<any>(response);

  const scenes: Scene[] = (data.scenes || []).map((s: any, idx: number) => {
    const time: 'day' | 'night' | 'twilight' | undefined =
      s.time === 'day' || s.time === 'night' || s.time === 'twilight' ? s.time : undefined;
    return {
      id: `scene_${Date.now()}_${idx}`,
      name: s.name,
      // 同 Character：description 字段已删，LLM 抽出的描述直接写入 prompt。
      prompt: cleanText(s.description || '') || s.name || '',
      time,
      mood: s.mood,
      aliases: normalizeAliases(s.aliases),
    } as Scene;
  });

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
  options?: ExtractEntityOptions,
): Promise<Prop[]> {
  onProgress?.(5, '加载 Prompt 模板...');
  const resolvedPrompt = await resolvePromptTemplate(
    'prop_extraction',
    buildExtractionVariables(script, ctx, options),
  );

  onProgress?.(10, '分析剧本道具...');
  const propResponse = await ctx.llmProvider.chat([
    { role: 'user', content: resolvedPrompt.prompt },
  ]);

  onProgress?.(80, '解析道具数据...');

  const data = parseLLMJSON<any>(propResponse);

  // 这里返回的是文件内的本地 Prop interface（仅 LLM 抽取中间产物），
  // 不是 frontend/src/types 里的全局 Prop。下游 ScriptAnalysisService.extractProps
  // 会自己把字段映射成真正的 Prop（其中 description 字段已废弃，统一进 prompt）。
  const props: Prop[] = (data.props || []).map((p: any) => ({
    name: p.name,
    description: cleanText(p.description || ''),
    importance: p.importance || 'medium',
    scenes: Array.isArray(p.scenes) ? p.scenes : [],
    aliases: normalizeAliases(p.aliases),
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
  options?: ExtractEntityOptions,
): Promise<ExtractionResult> {
  switch (type) {
    case 'character':
      return { characters: await extractCharacters(ctx, script, onProgress, options) };
    case 'scene':
      return { scenes: await extractScenes(ctx, script, onProgress, options) };
    case 'prop':
      return { props: await extractProps(ctx, script, onProgress, options) };
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
  options?: ExtractEntityOptions,
): Promise<ExtractionResult> {
  onProgress?.(0, '开始提取实体...');

  const characters = await extractCharacters(ctx, script, (p, s) => {
    onProgress?.(p * 0.33, s);
  }, options);

  const scenes = await extractScenes(ctx, script, (p, s) => {
    onProgress?.(33 + p * 0.33, s);
  }, options);

  const props = await extractProps(ctx, script, (p, s) => {
    onProgress?.(66 + p * 0.34, s);
  }, options);

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
