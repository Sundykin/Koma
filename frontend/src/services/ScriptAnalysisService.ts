/**
 * 剧本解析服务
 * 使用 LLM 分析剧本，提取角色、场景、道具
 * 分镜生成由 ShotAnalysisService 单独处理
 */
import type { Character, Scene, Prop, Shot, LLMModelConfig, ScriptAnalysisResult } from '../types';
import { createLLMProvider } from '../providers';
import { getActiveLLMConfig } from '../store/globalStore';
import { getPromptTemplate, fillTemplate } from '../store/promptTemplates';
import { TaskManager, Task } from './TaskManager';
import {
  saveCharacters,
  saveScenes,
  saveProps,
  saveEpisodeAnalysis,
  loadCharacters,
  loadScenes,
  loadProps,
} from '../store/projectStore';

// 解析阶段
export type AnalysisStage = 'characters' | 'scenes' | 'props' | 'shots';

// 分集上下文
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
  episodeId?: string; // 如果是分集模式，标记所属分集
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
          role: { type: 'string', enum: ['protagonist', 'antagonist', 'supporting'], description: '角色定位' },
          description: { type: 'string', description: '人物小传' },
          appearance: { type: 'string', description: 'AI绘图用的外貌描述，英文' },
        },
        required: ['name', 'role', 'description', 'appearance'],
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
          description: { type: 'string', description: 'AI绘图用的场景描述，英文' },
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
          description: { type: 'string', description: 'AI绘图用的道具描述，英文' },
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
          description: { type: 'string', description: '画面描述，用于生成图片的prompt，英文' },
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

// System Prompt 基础指令
const SYSTEM_PROMPT_BASE = `你是一个专业的影视编剧和分镜师。你的任务是分析用户提供的剧本，提取关键信息。
请严格按照要求的 JSON 格式输出，不要输出任何其他内容。`;

export class ScriptAnalysisService {
  private llmConfig: LLMModelConfig | null = null;
  private onProgress?: (progress: AnalysisProgress) => void;
  private episodeContext?: EpisodeContext;

  constructor(options?: {
    onProgress?: (progress: AnalysisProgress) => void;
    episodeContext?: EpisodeContext;
  }) {
    this.onProgress = options?.onProgress;
    this.episodeContext = options?.episodeContext;
  }

  // 设置分集上下文
  setEpisodeContext(context?: EpisodeContext) {
    this.episodeContext = context;
  }

  // 获取当前使用的剧本（优先分集剧本）
  private getScript(script: string): string {
    return this.episodeContext?.episodeScript || script;
  }

  // 设置 LLM 配置
  async setLLMConfig(configId?: string): Promise<boolean> {
    this.llmConfig = await getActiveLLMConfig(configId);
    return this.llmConfig !== null;
  }

  // 报告进度
  private reportProgress(stage: AnalysisStage, status: AnalysisProgress['status'], message?: string) {
    this.onProgress?.({ stage, status, message });
  }

  // 调用 LLM
  private async callLLM(prompt: string, schema: any): Promise<string> {
    if (!this.llmConfig) {
      throw new Error('LLM 配置未设置');
    }

    const provider = createLLMProvider({
      provider: this.llmConfig.provider === 'openai-compatible' ? 'openai' : this.llmConfig.provider as any,
      apiKey: this.llmConfig.apiKey,
      baseUrl: this.llmConfig.baseUrl,
      modelName: this.llmConfig.modelName,
    });

    // 构建带 JSON Schema 约束的 prompt
    const fullPrompt = `${prompt}\n\n请严格按以下 JSON Schema 格式输出：\n${JSON.stringify(schema, null, 2)}`;

    const result = await provider.generateText(fullPrompt, SYSTEM_PROMPT_BASE);
    return result;
  }

  // 解析 LLM 返回的 JSON
  private parseJSON<T>(text: string): T {
    // 尝试提取 JSON 块
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ||
                      text.match(/```\s*([\s\S]*?)\s*```/) ||
                      [null, text];
    const jsonStr = jsonMatch[1] || text;

    // 清理可能的前后缀
    const cleaned = jsonStr.trim().replace(/^[^{[]*/, '').replace(/[^}\]]*$/, '');

    return JSON.parse(cleaned);
  }

  // 提取角色
  async extractCharacters(script: string): Promise<StageResult<Character[]>> {
    const effectiveScript = this.getScript(script);
    const modeHint = this.episodeContext
      ? `（分集模式：${this.episodeContext.episodeName || this.episodeContext.episodeId}）`
      : '';
    this.reportProgress('characters', 'running', `正在分析角色...${modeHint}`);

    try {
      const template = await getPromptTemplate('character_extraction');
      const prompt = fillTemplate(template.template, { script: effectiveScript });
      const result = await this.callLLM(prompt, CHARACTERS_SCHEMA);
      const parsed = this.parseJSON<{ characters: any[] }>(result);

      const characters: Character[] = parsed.characters.map((c, index) => ({
        id: `char_${Date.now()}_${index}`,
        name: c.name,
        age: c.age || '',
        role: c.role || 'supporting',
        description: c.description,
        appearance: c.appearance,
        episodeId: this.episodeContext?.episodeId,
      }));

      this.reportProgress('characters', 'completed', `识别到 ${characters.length} 个角色`);
      return { success: true, data: characters, episodeId: this.episodeContext?.episodeId };
    } catch (error: any) {
      this.reportProgress('characters', 'failed', error.message);
      return { success: false, error: error.message };
    }
  }

  // 提取场景
  async extractScenes(script: string): Promise<StageResult<Scene[]>> {
    const effectiveScript = this.getScript(script);
    const modeHint = this.episodeContext
      ? `（分集模式：${this.episodeContext.episodeName || this.episodeContext.episodeId}）`
      : '';
    this.reportProgress('scenes', 'running', `正在分析场景...${modeHint}`);

    try {
      const template = await getPromptTemplate('scene_extraction');
      const prompt = fillTemplate(template.template, { script: effectiveScript });
      const result = await this.callLLM(prompt, SCENES_SCHEMA);
      const parsed = this.parseJSON<{ scenes: any[] }>(result);

      const scenes: Scene[] = parsed.scenes.map((s, index) => ({
        id: `scene_${Date.now()}_${index}`,
        name: s.name,
        location: s.location,
        time: s.time || 'day',
        mood: s.mood,
        description: s.description,
        episodeId: this.episodeContext?.episodeId,
      }));

      this.reportProgress('scenes', 'completed', `识别到 ${scenes.length} 个场景`);
      return { success: true, data: scenes, episodeId: this.episodeContext?.episodeId };
    } catch (error: any) {
      this.reportProgress('scenes', 'failed', error.message);
      return { success: false, error: error.message };
    }
  }

  // 提取道具
  async extractProps(script: string): Promise<StageResult<Prop[]>> {
    const effectiveScript = this.getScript(script);
    const modeHint = this.episodeContext
      ? `（分集模式：${this.episodeContext.episodeName || this.episodeContext.episodeId}）`
      : '';
    this.reportProgress('props', 'running', `正在分析道具...${modeHint}`);

    try {
      const template = await getPromptTemplate('prop_extraction');
      const prompt = fillTemplate(template.template, { script: effectiveScript });
      const result = await this.callLLM(prompt, PROPS_SCHEMA);
      const parsed = this.parseJSON<{ props: any[] }>(result);

      const props: Prop[] = parsed.props.map((p, index) => ({
        id: `prop_${Date.now()}_${index}`,
        name: p.name,
        type: p.type,
        description: p.description,
        episodeId: this.episodeContext?.episodeId,
      }));

      this.reportProgress('props', 'completed', `识别到 ${props.length} 个道具`);
      return { success: true, data: props, episodeId: this.episodeContext?.episodeId };
    } catch (error: any) {
      this.reportProgress('props', 'failed', error.message);
      return { success: false, error: error.message };
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
      ? `（分集模式：${this.episodeContext.episodeName || this.episodeContext.episodeId}）`
      : '';
    this.reportProgress('shots', 'running', `正在生成分镜...${modeHint}`);

    try {
      const template = await getPromptTemplate('shot_breakdown');
      const prompt = fillTemplate(template.template, {
        script: effectiveScript,
        characters: characters.map(c => c.name).join(', '),
        scenes: scenes.map(s => s.name).join(', '),
        props: props.map(p => p.name).join(', '),
      });

      const result = await this.callLLM(prompt, SHOTS_SCHEMA);
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
        description: s.description,
        characters: (s.characters || []).map((name: string) => charNameToId.get(name) || name),
        dialogue: s.dialogue || '',
        emotion: s.emotion || '',
        props: (s.props || []).map((name: string) => propNameToId.get(name) || name),
        confirmed: false,
        episodeId: this.episodeContext?.episodeId,
      }));

      this.reportProgress('shots', 'completed', `生成 ${shots.length} 个分镜`);
      return { success: true, data: shots, episodeId: this.episodeContext?.episodeId };
    } catch (error: any) {
      this.reportProgress('shots', 'failed', error.message);
      return { success: false, error: error.message };
    }
  }

  // 完整解析流程
  async analyzeScript(script: string): Promise<ScriptAnalysisResult | null> {
    // 提取角色
    const charResult = await this.extractCharacters(script);
    if (!charResult.success || !charResult.data) {
      return null;
    }

    // 提取场景
    const sceneResult = await this.extractScenes(script);
    if (!sceneResult.success || !sceneResult.data) {
      return null;
    }

    // 提取道具
    const propsResult = await this.extractProps(script);
    if (!propsResult.success || !propsResult.data) {
      return null;
    }

    // 注意：分镜生成已独立为单独步骤，不在此处执行
    return {
      characters: charResult.data,
      scenes: sceneResult.data,
      props: propsResult.data,
      shots: [], // 分镜由 ShotAnalysisService 单独生成
    };
  }
}

// 便捷函数：创建服务实例
export function createScriptAnalysisService(
  onProgress?: (progress: AnalysisProgress) => void,
  episodeContext?: EpisodeContext
): ScriptAnalysisService {
  return new ScriptAnalysisService({ onProgress, episodeContext });
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
    llmConfigId?: string
  ): Promise<Task> {
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
    this.runAnalysis(episodeId, episodeName, script, llmConfigId);

    return this.task;
  }

  /**
   * 执行解析流程
   */
  private async runAnalysis(
    episodeId: string,
    episodeName: string,
    script: string,
    llmConfigId?: string
  ): Promise<void> {
    if (!this.task) return;

    const taskId = this.task.id;

    try {
      // 创建解析服务
      const service = new ScriptAnalysisService({
        onProgress: (progress) => {
          // 映射阶段到进度百分比
          const stageProgress: Record<AnalysisStage, number> = {
            characters: 25,
            scenes: 50,
            props: 100,
          };
          const baseProgress = stageProgress[progress.stage] - 33;
          const currentProgress = progress.status === 'completed'
            ? stageProgress[progress.stage]
            : baseProgress + 15;

          TaskManager.updateTask(taskId, { progress: currentProgress });
        },
        episodeContext: {
          episodeId,
          episodeName,
          episodeScript: script,
        },
      });

      // 设置 LLM 配置
      const hasConfig = await service.setLLMConfig(llmConfigId);
      if (!hasConfig) {
        throw new Error('未配置 LLM 模型，请先在设置中添加');
      }

      // 加载已有资产用于匹配
      const existingChars = await loadCharacters(this.projectId);
      const existingScenes = await loadScenes(this.projectId);
      const existingProps = await loadProps(this.projectId);

      // 执行解析
      const result = await service.analyzeScript(script);

      if (!result) {
        throw new Error('解析失败，请检查剧本内容');
      }

      // 合并去重角色
      const mergedChars = this.mergeAssets(existingChars, result.characters, 'name');
      const mergedScenes = this.mergeAssets(existingScenes, result.scenes, 'name');
      const mergedProps = this.mergeAssets(existingProps, result.props, 'name');

      // 保存资产到项目存储（分镜由独立步骤生成）
      await saveCharacters(this.projectId, mergedChars);
      await saveScenes(this.projectId, mergedScenes);
      await saveProps(this.projectId, mergedProps);

      // 保存分集解析结果（不含分镜）
      await saveEpisodeAnalysis(this.projectId, episodeId, {
        characterRefs: result.characters.map(c => c.id),
        sceneRefs: result.scenes.map(s => s.id),
        propRefs: result.props.map(p => p.id),
        shots: [], // 分镜由 ShotAnalysisService 单独生成
      });

      // 更新任务完成
      TaskManager.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        result: {
          charactersCount: result.characters.length,
          scenesCount: result.scenes.length,
          propsCount: result.props.length,
        },
      });
    } catch (error: any) {
      TaskManager.updateTask(taskId, {
        status: 'failed',
        error: error.message || '解析失败',
      });
    }
  }

  /**
   * 合并资产，按名称去重
   */
  private mergeAssets<T extends { id: string; name: string }>(
    existing: T[],
    newItems: T[],
    key: keyof T
  ): T[] {
    const existingMap = new Map(existing.map(item => [item[key], item]));

    for (const item of newItems) {
      if (!existingMap.has(item[key])) {
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
  llmConfigId?: string
): Promise<Task> {
  const service = new BackgroundAnalysisService(projectId);
  return service.startAnalysis(episodeId, episodeName, script, llmConfigId);
}
