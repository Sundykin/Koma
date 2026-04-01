/**
 * CreationContext — 共享运行时上下文
 *
 * 解决各 workflow 服务重复加载数据、上下文断裂的问题。
 * 一次性加载所有实体数据和 LLM 配置，全链路共享。
 */
import type { Character, Scene, Prop, ProjectStyleSnapshot, LLMModelConfig } from '../types';
import type { LLMProvider } from '../providers/llm/types';
import { createLLMProvider } from '../providers';
import { getActiveLLMConfig } from '../store/globalStore';
import { loadCharacters, loadScenes, loadProps } from '../store/projectStore';

/** 实体摘要（用于 chunk 间上下文传递） */
export interface EntitySummary {
  name: string;
  type: 'character' | 'scene' | 'prop';
  brief: string;  // 最多 30 字的简短描述
}

/** 剧本洞察（由 ScriptAnalysisService 填充，下游消费） */
export interface ScriptInsights {
  themes: string[];
  tone: string;
  narrativeArc: string;
  entityRelationships: Array<{ from: string; to: string; relation: string }>;
}

export interface CreationContext {
  projectId: string;
  episodeId: string;

  /** 预加载的实体数据（一次加载，全链路共享） */
  characters: Character[];
  scenes: Scene[];
  props: Prop[];

  /** 风格配置 */
  styleSnapshot?: Partial<ProjectStyleSnapshot>;

  /** LLM 配置（避免每个服务各自 setLLMConfig） */
  llmConfig: LLMModelConfig;
  llmProvider: LLMProvider;

  /** 剧本洞察（由 ScriptAnalysisService 填充，下游消费） */
  scriptInsights?: ScriptInsights;

  /** 进度回调 */
  onProgress?: (phase: string, progress: number, detail?: string) => void;
}

export interface CreateContextOptions {
  llmConfigId?: string;
  styleSnapshot?: Partial<ProjectStyleSnapshot>;
  onProgress?: (phase: string, progress: number, detail?: string) => void;
}

/**
 * 工厂函数：一次性加载所有共享数据，创建 CreationContext
 */
export async function createCreationContext(
  projectId: string,
  episodeId: string,
  options?: CreateContextOptions,
): Promise<CreationContext> {
  // 并行加载所有实体数据
  const [characters, scenes, props, llmConfig] = await Promise.all([
    loadCharacters(projectId),
    loadScenes(projectId),
    loadProps(projectId),
    getActiveLLMConfig(options?.llmConfigId),
  ]);

  if (!llmConfig) {
    throw new Error('未配置 LLM 模型，请先在设置中添加');
  }

  const llmProvider = createLLMProvider({
    provider: llmConfig.provider as any,
    apiKey: llmConfig.apiKey,
    baseUrl: llmConfig.baseUrl,
    modelName: llmConfig.modelName,
  });

  return {
    projectId,
    episodeId,
    characters,
    scenes,
    props,
    styleSnapshot: options?.styleSnapshot,
    llmConfig,
    llmProvider,
    onProgress: options?.onProgress,
  };
}

/**
 * 更新 scriptInsights（由 ScriptAnalysisService 在分析完成后调用）
 */
export function updateScriptInsights(ctx: CreationContext, insights: ScriptInsights): void {
  ctx.scriptInsights = insights;
}

/**
 * 从实体列表生成 EntitySummary（用于 chunk 上下文传递）
 */
export function buildEntitySummaries(ctx: CreationContext): EntitySummary[] {
  const summaries: EntitySummary[] = [];

  for (const c of ctx.characters) {
    summaries.push({
      name: c.name,
      type: 'character',
      brief: truncate(c.description || c.appearance || c.role || '', 30),
    });
  }
  for (const s of ctx.scenes) {
    summaries.push({
      name: s.name,
      type: 'scene',
      brief: truncate(s.description || s.mood || '', 30),
    });
  }
  for (const p of ctx.props) {
    summaries.push({
      name: p.name,
      type: 'prop',
      brief: truncate(p.description || '', 30),
    });
  }

  return summaries;
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}
