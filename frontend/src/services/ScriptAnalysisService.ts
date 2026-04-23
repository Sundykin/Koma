/**
 * 剧本解析服务
 * 使用 LLM 分析剧本，提取角色、场景、道具
 * 分镜生成由 ShotAnalysisService 单独处理
 */
import type { Character, Scene, Prop, Shot, ScriptAnalysisResult } from '../types';
import { resolvePromptTemplate } from '../store/promptTemplates';
import { logLLMCall } from '../store/aiCallLogger';
import { createLogger } from '../store/logger';
import { TaskManager, Task } from './TaskManager';
import { parseLLMJSON } from '../utils/llmJsonParser';
import { cleanText, splitVisualClauses, CHARACTER_STORY_TOKENS, sanitizeCharacterAppearance } from '../utils/textUtils';
import { runWithConcurrency } from '../utils/concurrency';
import { INJECTION_GUARD, wrapUserContent, appendStyleRequirement, type StyleSnapshotLike } from '../utils/promptNormalize';

const logger = createLogger('ScriptAnalysisService');

const CHUNK_MAX_RETRIES = 3;
const CHUNK_CONCURRENCY = 3;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
import { buildChunkContextPrompt, splitScriptIntoChunks } from './scriptAnalysisChunking';
import type { CreationPlan } from './CreationPlan';
import { generateCreationPlan, planToStylePrefix, planToRelationshipContext } from './CreationPlan';

import {
  saveCharacters,
  saveScenes,
  saveProps,
  saveEpisodeAnalysis,
  loadEpisodeAnalysis,
} from '../store/projectStore';
import {
  addCharacterEpisodeRef,
  addSceneEpisodeRef,
  addPropEpisodeRef,
} from '../store/projectStore';

// 解析阶段
export type AnalysisStage = 'characters' | 'scenes' | 'props' | 'shots';

// 剧集上下文
export interface EpisodeContext {
  episodeId: string;
  episodeName?: string;
  episodeScript: string;
}

// 解析进度回调
export interface AnalysisProgress {
  stage: AnalysisStage;
  status: 'pending' | 'running' | 'completed' | 'failed';
  message?: string;
}

// 分步解析结果
export interface StageResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  episodeId?: string; // 如果是剧集模式，标记所属剧集
}

// JSON Schema 定义
const CHARACTERS_SCHEMA = {
  type: 'object',
  properties: {
    characters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '角色名称' },
          age: { type: 'string', description: '年龄描述' },
          gender: { type: 'string', enum: ['male', 'female', 'neutral', 'unknown'], description: '角色性别' },
          role: { type: 'string', enum: ['protagonist', 'antagonist', 'supporting'], description: '角色定位' },
          description: { type: 'string', description: '人物小传' },
          appearance: { type: 'string', description: 'AI绘图用的外貌描述，中文' },
        },
        required: ['name', 'age', 'gender', 'role', 'description', 'appearance'],
      },
    },
  },
  required: ['characters'],
};

const SCENES_SCHEMA = {
  type: 'object',
  properties: {
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '场景名称' },
          location: { type: 'string', description: '地点' },
          time: { type: 'string', enum: ['day', 'night', 'twilight'], description: '时间' },
          mood: { type: 'string', description: '氛围情绪' },
          description: { type: 'string', description: 'AI绘图用的场景描述，中文' },
        },
        required: ['name', 'location', 'time', 'mood', 'description'],
      },
    },
  },
  required: ['scenes'],
};

const PROPS_SCHEMA = {
  type: 'object',
  properties: {
    props: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '道具名称' },
          type: { type: 'string', description: '道具类型' },
          description: { type: 'string', description: 'AI绘图用的道具描述，中文' },
        },
        required: ['name', 'type', 'description'],
      },
    },
  },
  required: ['props'],
};

const SHOTS_SCHEMA = {
  type: 'object',
  properties: {
    shots: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          scriptContent: { type: 'string', description: '对应的剧本原文片段' },
          shotType: { type: 'string', enum: ['close-up', 'medium', 'wide', 'extreme-wide'] },
          cameraMovement: { type: 'string', enum: ['static', 'pan', 'zoom-in', 'tracking'] },
          duration: { type: 'number', description: '建议时长秒数' },
          description: { type: 'string', description: '画面描述，用于生成图片的prompt，中文' },
          characters: { type: 'array', items: { type: 'string' }, description: '出场角色名称列表' },
          dialogue: { type: 'string', description: '台词' },
          emotion: { type: 'string', description: '情绪标签' },
          props: { type: 'array', items: { type: 'string' }, description: '出现的道具名称' },
        },
        required: ['scriptContent', 'shotType', 'duration', 'description'],
      },
    },
  },
  required: ['shots'],
};

export class ScriptAnalysisService {
  private ctx: import('./CreationContext').CreationContext;
  private onProgress?: (progress: AnalysisProgress) => void;
  private episodeContext?: EpisodeContext;
  private styleSnapshot?: StyleSnapshotLike;
  private creationPlan?: CreationPlan;

  constructor(
    ctx: import('./CreationContext').CreationContext,
    options?: {
      onProgress?: (progress: AnalysisProgress) => void;
      episodeContext?: EpisodeContext;
    },
  ) {
    this.ctx = ctx;
    this.onProgress = options?.onProgress;
    this.episodeContext = options?.episodeContext;
    this.styleSnapshot = ctx.styleSnapshot;
  }

  // 设置剧集上下文
  setEpisodeContext(context?: EpisodeContext) {
    this.episodeContext = context;
  }

  setStyleSnapshot(styleSnapshot?: StyleSnapshotLike) {
    this.styleSnapshot = styleSnapshot;
  }

  setCreationPlan(plan: CreationPlan) {
    this.creationPlan = plan;
  }

  // 获取当前使用的剧本（优先剧集剧本）
  private getScript(script: string): string {
    return this.episodeContext?.episodeScript || script;
  }

  // 报告进度
  private reportProgress(stage: AnalysisStage, status: AnalysisProgress['status'], message?: string) {
    this.onProgress?.({ stage, status, message });
  }

  // 调用 LLM
  private async callLLM(
    prompt: string,
    schema: any,
    templateMeta?: { templateId?: string; promptSource?: 'default' | 'custom' | 'finalized' }
  ): Promise<string> {
    // 获取系统提示词模板，追加注入防御指令
    const resolvedSystemPrompt = await resolvePromptTemplate('script_analysis_system', {});
    const systemPrompt = resolvedSystemPrompt.prompt + INJECTION_GUARD;

    // 构建带 JSON Schema 约束的 prompt
    const fullPrompt = `${prompt}\n\n请严格按以下 JSON Schema 格式输出：\n${JSON.stringify(schema, null, 2)}`;

    // 打印 LLM 调用日志
    logLLMCall(
      this.ctx.llmConfig.name || 'LLM',
      fullPrompt,
      systemPrompt,
      {
        targetName: '剧本解析',
        templateId: templateMeta?.templateId || resolvedSystemPrompt.template.id,
        promptSource: templateMeta?.promptSource || resolvedSystemPrompt.source,
      }
    );

    const result = await this.ctx.llmProvider.generateText(fullPrompt, systemPrompt, {
      source: 'ScriptAnalysisService.callLLM',
      operation: 'script_analysis',
      taskKind: 'analyze',
      taskProfileId: 'script-analysis',
      targetName: this.episodeContext?.episodeName || '剧本解析',
      stream: false,
    });
    return result;
  }

  // 解析 LLM 返回的 JSON（委托给 parseLLMJSON 工具函数）
  private parseJSON<T>(text: string): T {
    return parseLLMJSON<T>(text);
  }

  private async extractChunkedItems<T extends { name: string }>(
    stage: AnalysisStage,
    label: string,
    templateId: 'character_extraction' | 'scene_extraction' | 'prop_extraction',
    script: string,
    schema: any,
    parseItems: (text: string) => any[],
    mapItem: (item: any, index: number) => T
  ): Promise<T[]> {
    const chunks = splitScriptIntoChunks(script);
    const collected = new Map<string, T>();

    this.reportProgress(stage, 'running', `正在分析${label}...（共 ${chunks.length} 个分块，并发 ${CHUNK_CONCURRENCY}）`);

    // 预构建每个分块的 prompt（不依赖其他分块结果）
    // 如果有 CreationPlan，将全局规划信息注入每个 chunk 的 prompt
    const planPrefix = this.creationPlan
      ? `【全局创作规划】\n${planToStylePrefix(this.creationPlan)}\n${planToRelationshipContext(this.creationPlan)}\n\n`
      : '';

    const chunkPrompts = await Promise.all(
      chunks.map(async (chunk) => {
        const resolvedPrompt = await resolvePromptTemplate(templateId, {
          script: wrapUserContent(chunk.content),
        });
        const styledPrompt = this.appendStyleRequirement(resolvedPrompt.prompt);
        // 并行模式下无法实时共享已识别实体，去重由最终 Map 保证
        const chunkPrompt = buildChunkContextPrompt(
          planPrefix + styledPrompt, chunk.index, chunk.total, [],
        );
        return { chunk, chunkPrompt, resolvedPrompt };
      })
    );

    // 并发执行分块 LLM 调用（带重试）
    const tasks = chunkPrompts.map(({ chunk, chunkPrompt, resolvedPrompt }) => async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < CHUNK_MAX_RETRIES; attempt++) {
        try {
          const result = await this.callLLM(chunkPrompt, schema, {
            templateId: resolvedPrompt.template.id,
            promptSource: resolvedPrompt.source,
          });
          return { chunk, items: parseItems(result) };
        } catch (err: unknown) {
          lastError = err;
          if (attempt < CHUNK_MAX_RETRIES - 1) {
            await delay(1000 * (attempt + 1));
          }
        }
      }
      throw lastError;
    });

    const results = await runWithConcurrency(tasks, CHUNK_CONCURRENCY);

    let failedChunks = 0;
    for (const result of results) {
      if (result.status === 'rejected') {
        failedChunks++;
        logger.warn(`${label}分块解析失败（已重试 ${CHUNK_MAX_RETRIES} 次）`, {
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
        continue;
      }
      const { chunk, items } = result.value;
      this.reportProgress(stage, 'running', `正在分析${label}...（${chunk.index}/${chunk.total} 完成）`);
      for (const item of items) {
        if (!item?.name || collected.has(item.name)) continue;
        collected.set(item.name, mapItem(item, collected.size));
      }
    }

    if (collected.size === 0 && failedChunks > 0) {
      throw new Error(`所有分块均解析失败，共 ${failedChunks} 个分块`);
    }

    return Array.from(collected.values());
  }

  private getResolvedLLMStyleSuffix(): string {
    return this.styleSnapshot?.llmPromptSuffix?.trim() || '';
  }

  private appendStyleRequirement(prompt: string): string {
    let result = appendStyleRequirement(prompt, this.styleSnapshot);
    if (this.creationPlan) {
      const stylePrefix = planToStylePrefix(this.creationPlan);
      const relationshipCtx = planToRelationshipContext(this.creationPlan);
      const planContext = [stylePrefix, relationshipCtx].filter(Boolean).join('\n');
      if (planContext) {
        result = `${result}\n\n【创作规划】\n${planContext}`;
      }
    }
    return result;
  }

  // 提取角色
  async extractCharacters(script: string): Promise<StageResult<Character[]>> {
    const effectiveScript = this.getScript(script);
    const modeHint = this.episodeContext
      ? `（剧集模式：${this.episodeContext.episodeName || this.episodeContext.episodeId}）`
      : '';
    this.reportProgress('characters', 'running', `正在分析角色...${modeHint}`);

    try {
      const characters = await this.extractChunkedItems<Character>(
        'characters',
        '角色',
        'character_extraction',
        effectiveScript,
        CHARACTERS_SCHEMA,
        (text) => {
          const parsed = this.parseJSON<{ characters: any[] }>(text);
          if (!Array.isArray(parsed?.characters)) return [];
          return parsed.characters.filter((c: any) => c && typeof c.name === 'string' && c.name.trim());
        },
        (c, index) => ({
          // prompt 只承载纯视觉 appearance；description 保留为非视觉的人物小传
          // 即便 LLM 越线把剧情写进 appearance，也会在这里被过滤掉，避免污染后续生图链路。
          id: `char_${Date.now()}_${index}`,
          name: c.name,
          appearance: sanitizeCharacterAppearance(c.appearance, c.name),
          description: cleanText(c.description || ''),
          prompt: sanitizeCharacterAppearance(c.appearance, c.name) || c.name,
          age: c.age || '未知',
          gender: ['male', 'female', 'neutral', 'unknown'].includes(c.gender) ? c.gender : 'unknown',
          role: c.role || 'supporting',
          episodeId: this.episodeContext?.episodeId,
        })
      );

      this.reportProgress('characters', 'completed', `识别到 ${characters.length} 个角色`);
      return { success: true, data: characters, episodeId: this.episodeContext?.episodeId };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.reportProgress('characters', 'failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  // 提取场景
  async extractScenes(script: string): Promise<StageResult<Scene[]>> {
    const effectiveScript = this.getScript(script);
    const modeHint = this.episodeContext
      ? `（剧集模式：${this.episodeContext.episodeName || this.episodeContext.episodeId}）`
      : '';
    this.reportProgress('scenes', 'running', `正在分析场景...${modeHint}`);

    try {
      const scenes = await this.extractChunkedItems<Scene>(
        'scenes',
        '场景',
        'scene_extraction',
        effectiveScript,
        SCENES_SCHEMA,
        (text) => {
          const parsed = this.parseJSON<{ scenes: any[] }>(text);
          if (!Array.isArray(parsed?.scenes)) return [];
          return parsed.scenes.filter((s: any) => s && typeof s.name === 'string' && s.name.trim());
        },
        (s, index) => ({
          id: `scene_${Date.now()}_${index}`,
          name: s.name,
          prompt: s.description || s.name,
          location: s.location,
          time: s.time || 'day',
          mood: s.mood,
          episodeId: this.episodeContext?.episodeId,
        })
      );

      this.reportProgress('scenes', 'completed', `识别到 ${scenes.length} 个场景`);
      return { success: true, data: scenes, episodeId: this.episodeContext?.episodeId };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.reportProgress('scenes', 'failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  // 提取道具
  async extractProps(script: string): Promise<StageResult<Prop[]>> {
    const effectiveScript = this.getScript(script);
    const modeHint = this.episodeContext
      ? `（剧集模式：${this.episodeContext.episodeName || this.episodeContext.episodeId}）`
      : '';
    this.reportProgress('props', 'running', `正在分析道具...${modeHint}`);

    try {
      const props = await this.extractChunkedItems<Prop>(
        'props',
        '道具',
        'prop_extraction',
        effectiveScript,
        PROPS_SCHEMA,
        (text) => {
          const parsed = this.parseJSON<{ props: any[] }>(text);
          if (!Array.isArray(parsed?.props)) return [];
          return parsed.props.filter((p: any) => p && typeof p.name === 'string' && p.name.trim());
        },
        (p, index) => ({
          id: `prop_${Date.now()}_${index}`,
          name: p.name,
          prompt: p.description || p.name,
          type: p.type,
          episodeId: this.episodeContext?.episodeId,
        })
      );

      this.reportProgress('props', 'completed', `识别到 ${props.length} 个道具`);
      return { success: true, data: props, episodeId: this.episodeContext?.episodeId };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.reportProgress('props', 'failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  // 生成分镜
  async generateShots(
    script: string,
    characters: Character[],
    scenes: Scene[],
    props: Prop[]
  ): Promise<StageResult<Shot[]>> {
    const effectiveScript = this.getScript(script);
    const modeHint = this.episodeContext
      ? `（剧集模式：${this.episodeContext.episodeName || this.episodeContext.episodeId}）`
      : '';
    this.reportProgress('shots', 'running', `正在生成分镜...${modeHint}`);

    try {
      const resolvedPrompt = await resolvePromptTemplate('shot_breakdown', {
        script: wrapUserContent(effectiveScript),
        characters: characters.map(c => c.name).join(', '),
        scenes: scenes.map(s => s.name).join(', '),
        props: props.map(p => p.name).join(', '),
      });

      const styledPrompt = this.appendStyleRequirement(resolvedPrompt.prompt);
      const result = await this.callLLM(styledPrompt, SHOTS_SCHEMA, {
        templateId: resolvedPrompt.template.id,
        promptSource: resolvedPrompt.source,
      });
      const parsed = this.parseJSON<{ shots: any[] }>(result);

      // 将角色名映射到 ID
      const charNameToId = new Map(characters.map(c => [c.name, c.id]));
      const propNameToId = new Map(props.map(p => [p.name, p.id]));

      const shots: Shot[] = parsed.shots.map((s, index) => ({
        id: `shot_${Date.now()}_${index}`,
        scriptContent: s.scriptContent,
        shotType: s.shotType || 'medium',
        cameraMovement: s.cameraMovement || 'static',
        duration: s.duration || 3,
        characters: (s.characters || []).map((name: string) => charNameToId.get(name) || name),
        dialogue: s.dialogue || '',
        emotion: s.emotion || '',
        props: (s.props || []).map((name: string) => propNameToId.get(name) || name),
        confirmed: false,
        episodeId: this.episodeContext?.episodeId,
      }));

      this.reportProgress('shots', 'completed', `生成 ${shots.length} 个分镜`);
      return { success: true, data: shots, episodeId: this.episodeContext?.episodeId };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.reportProgress('shots', 'failed', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  // 完整解析流程
  async analyzeScript(script: string): Promise<ScriptAnalysisResult> {
    // 提取角色（必须先完成，分镜生成依赖角色列表）
    const charResult = await this.extractCharacters(script);
    if (!charResult.success || !charResult.data) {
      throw new Error(charResult.error || '角色提取失败');
    }

    // 场景和道具互不依赖，并行提取
    const [sceneResult, propsResult] = await Promise.all([
      this.extractScenes(script),
      this.extractProps(script),
    ]);

    const errors: string[] = [];
    if (!sceneResult.success || !sceneResult.data) {
      errors.push(sceneResult.error || '场景提取失败');
    }
    if (!propsResult.success || !propsResult.data) {
      errors.push(propsResult.error || '道具提取失败');
    }
    if (errors.length > 0) {
      throw new Error(errors.join('；'));
    }

    return {
      characters: charResult.data,
      scenes: sceneResult.data,
      props: propsResult.data,
      shots: [],
    };
  }
}

/**
 * 后台解析任务服务
 * 封装 ScriptAnalysisService，支持任务管理和持久化
 */
export class BackgroundAnalysisService {
  private projectId: string;
  private task: Task | null = null;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  /**
   * 启动后台解析任务
   */
  async startAnalysis(
    episodeId: string,
    episodeName: string,
    script: string,
    llmSelection?: string,
    styleSnapshot?: StyleSnapshotLike,
  ): Promise<Task> {
    const existingTask = TaskManager.getProjectTasks(this.projectId).find(task =>
      task.type === 'script-analysis'
      && task.targetId === episodeId
      && (task.status === 'pending' || task.status === 'running' || task.status === 'processing')
    );
    if (existingTask) {
      return {
        ...existingTask,
        metadata: {
          ...(existingTask.metadata || {}),
          deduped: true,
        },
      };
    }

    // 创建任务
    this.task = TaskManager.createTask({
      projectId: this.projectId,
      type: 'script-analysis',
      targetType: 'episode',
      targetId: episodeId,
      targetName: episodeName,
    });

    // 更新为运行中
    TaskManager.updateTask(this.task.id, { status: 'running', progress: 0 });

    // 异步执行解析
    this.runAnalysis(episodeId, episodeName, script, llmSelection, styleSnapshot);

    return this.task;
  }

  /**
   * 执行解析流程
   */
  private async persistStageResult(
    episodeId: string,
    episodeName: string,
    stage: AnalysisStage,
    payload: {
      mergedChars: Character[];
      mergedScenes: Scene[];
      mergedProps: Prop[];
      characterRefs: string[];
      sceneRefs: string[];
      propRefs: string[];
    }
  ): Promise<void> {
    const episodeRef = {
      episodeId,
      episodeName,
      firstAppearance: true,
    };

    if (stage === 'characters') {
      await saveCharacters(this.projectId, payload.mergedChars);
      for (const characterId of payload.characterRefs) {
        await addCharacterEpisodeRef(this.projectId, characterId, episodeRef);
      }
    }

    if (stage === 'scenes') {
      await saveScenes(this.projectId, payload.mergedScenes);
      for (const sceneId of payload.sceneRefs) {
        await addSceneEpisodeRef(this.projectId, sceneId, episodeRef);
      }
    }

    if (stage === 'props') {
      await saveProps(this.projectId, payload.mergedProps);
      for (const propId of payload.propRefs) {
        await addPropEpisodeRef(this.projectId, propId, episodeRef);
      }
    }

    await saveEpisodeAnalysis(this.projectId, episodeId, {
      characterRefs: stage === 'characters' ? payload.characterRefs : undefined,
      sceneRefs: stage === 'scenes' ? payload.sceneRefs : undefined,
      propRefs: stage === 'props' ? payload.propRefs : undefined,
      completedStages: [stage],
      shots: undefined,
    } as any);
  }

  private async runAnalysis(
    episodeId: string,
    episodeName: string,
    script: string,
    llmSelection?: string,
    styleSnapshot?: StyleSnapshotLike,
  ): Promise<void> {
    if (!this.task) return;

    const taskId = this.task.id;

    try {
      // 创建共享上下文
      const { createCreationContext } = await import('./CreationContext');
      const ctx = await createCreationContext(this.projectId, episodeId, {
        llmConfigId: llmSelection,
        styleSnapshot,
      });

      // 创建解析服务
      const service = new ScriptAnalysisService(ctx, {
        onProgress: (progress) => {
          const stageProgress: Record<AnalysisStage, number> = {
            characters: 30,
            scenes: 55,
            props: 100,
            shots: 100,
          };
          // plan 阶段占前 5%，后续阶段从 5% 开始
          const baseProgress = 5 + (stageProgress[progress.stage] - 33) * 0.95;
          const currentProgress = progress.status === 'completed'
            ? 5 + stageProgress[progress.stage] * 0.95
            : baseProgress + 15;

          TaskManager.updateTask(taskId, {
            progress: Math.round(currentProgress),
            result: {
              currentStage: progress.stage,
              stageStatus: progress.status,
              stageMessage: progress.message,
            },
          });
        },
        episodeContext: {
          episodeId,
          episodeName,
          episodeScript: script,
        },
      });

      // 在分块分析前生成全局创作规划，注入到后续所有 chunk prompt
      if (script.length > 3000) {
        try {
          TaskManager.updateTask(taskId, {
            progress: 2,
            result: { currentStage: 'plan', stageStatus: 'running', stageMessage: '正在生成全局创作规划...' },
          });
          const plan = await generateCreationPlan(ctx, script);
          service.setCreationPlan(plan);
          TaskManager.updateTask(taskId, {
            progress: 5,
            result: { currentStage: 'plan', stageStatus: 'completed', stageMessage: '全局规划完成' },
          });
          logger.info('CreationPlan 生成完成', { planId: plan.id, style: plan.style.visualStyle });
        } catch (planError) {
          // 规划生成失败不阻断主流程，降级继续
          logger.warn('CreationPlan 生成失败，跳过规划注入', planError);
        }
      }

      let mergedChars = ctx.characters;
      let mergedScenes = ctx.scenes;
      let mergedProps = ctx.props;
      let characterRefs: string[] = [];
      let sceneRefs: string[] = [];
      let propRefs: string[] = [];
      const existingAnalysis = await loadEpisodeAnalysis(this.projectId, episodeId);
      const completedStages = new Set(existingAnalysis?.completedStages || []);
      characterRefs = existingAnalysis?.characterRefs || [];
      sceneRefs = existingAnalysis?.sceneRefs || [];
      propRefs = existingAnalysis?.propRefs || [];

      if (!completedStages.has('characters')) {
        const charResult = await service.extractCharacters(script);
        if (!charResult.success || !charResult.data) {
          throw new Error(charResult.error || '角色提取失败');
        }
        mergedChars = this.mergeAssets(mergedChars, charResult.data, 'name');
        const charNameToId = new Map(mergedChars.map(c => [c.name, c.id]));
        characterRefs = charResult.data.map(c => charNameToId.get(c.name) || c.id);
        await this.persistStageResult(episodeId, episodeName, 'characters', {
          mergedChars,
          mergedScenes,
          mergedProps,
          characterRefs,
          sceneRefs,
          propRefs,
        });
        completedStages.add('characters');
      }

      if (!completedStages.has('scenes') || !completedStages.has('props')) {
        // 场景和道具互不依赖，并行提取
        const [sceneResult, propsResult] = await Promise.all([
          !completedStages.has('scenes') ? service.extractScenes(script) : null,
          !completedStages.has('props') ? service.extractProps(script) : null,
        ]);

        // 先检查错误，收集所有失败信息
        const errors: string[] = [];
        if (sceneResult && (!sceneResult.success || !sceneResult.data)) {
          errors.push(sceneResult.error || '场景提取失败');
        }
        if (propsResult && (!propsResult.success || !propsResult.data)) {
          errors.push(propsResult.error || '道具提取失败');
        }
        if (errors.length > 0) {
          throw new Error(errors.join('；'));
        }

        // 持久化成功的结果
        if (sceneResult?.data) {
          mergedScenes = this.mergeAssets(mergedScenes, sceneResult.data, 'name');
          const sceneNameToId = new Map(mergedScenes.map(s => [s.name, s.id]));
          sceneRefs = sceneResult.data.map(s => sceneNameToId.get(s.name) || s.id);
          await this.persistStageResult(episodeId, episodeName, 'scenes', {
            mergedChars,
            mergedScenes,
            mergedProps,
            characterRefs,
            sceneRefs,
            propRefs,
          });
          completedStages.add('scenes');
        }

        if (propsResult?.data) {
          mergedProps = this.mergeAssets(mergedProps, propsResult.data, 'name');
          const propNameToId = new Map(mergedProps.map(p => [p.name, p.id]));
          propRefs = propsResult.data.map(p => propNameToId.get(p.name) || p.id);
          await this.persistStageResult(episodeId, episodeName, 'props', {
            mergedChars,
            mergedScenes,
            mergedProps,
            characterRefs,
            sceneRefs,
            propRefs,
          });
          completedStages.add('props');
        }
      }

      // 更新任务完成
      TaskManager.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        result: {
          charactersCount: characterRefs.length,
          scenesCount: sceneRefs.length,
          propsCount: propRefs.length,
        },
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      TaskManager.updateTask(taskId, {
        status: 'failed',
        error: errorMessage || '解析失败',
      });
    }
  }

  /**
   * 合并资产，按名称去重
   * 同名资产采取 upsert 语义：用新提取的描述字段覆盖旧记录，但保留旧的 id / createdAt / 已生成的 media
   * 以避免 entity_episode_refs 外键引用失效与媒体资产丢失
   */
  private mergeAssets<T extends { id: string; name: string }>(
    existing: T[],
    newItems: T[],
    key: keyof T
  ): T[] {
    const existingMap = new Map(existing.map(item => [item[key], item]));

    for (const item of newItems) {
      const prev = existingMap.get(item[key]);
      if (prev) {
        const prevAny = prev as any;
        existingMap.set(item[key], {
          ...prev,
          ...item,
          id: prevAny.id,
          createdAt: prevAny.createdAt ?? (item as any).createdAt,
          media: prevAny.media ?? (item as any).media,
        } as T);
      } else {
        existingMap.set(item[key], item);
      }
    }

    return Array.from(existingMap.values());
  }
}

/**
 * 便捷函数：启动后台解析
 */
export async function startBackgroundAnalysis(
  projectId: string,
  episodeId: string,
  episodeName: string,
  script: string,
  llmSelection?: string,
  styleSnapshot?: StyleSnapshotLike,
): Promise<Task> {
  const service = new BackgroundAnalysisService(projectId);
  return service.startAnalysis(episodeId, episodeName, script, llmSelection, styleSnapshot);
}
