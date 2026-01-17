/**
 * 分镜生成服务
 * 使用 LLM 基于剧本和已确认的角色/场景/道具生成分镜列表
 * 独立于剧本解析，作为单独的步骤执行
 */
import type { Character, Scene, Prop, Shot, LLMModelConfig } from '../types';
import { createLLMProvider } from '../providers';
import { getActiveLLMConfig } from '../store/globalStore';
import { getPromptTemplate, fillTemplate } from '../store/promptTemplates';
import { TaskManager, Task } from './TaskManager';
import {
  loadCharacters,
  loadScenes,
  loadProps,
  saveShots,
  loadEpisode,
} from '../store/projectStore';

// 分镜 JSON Schema
const SHOTS_SCHEMA = {
  type: 'object',
  properties: {
    shots: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          scriptContent: { type: 'string', description: '对应剧本原文' },
          shotType: { type: 'string', enum: ['close-up', 'medium', 'wide', 'extreme-wide'] },
          cameraMovement: { type: 'string', enum: ['static', 'pan', 'zoom-in', 'tracking', 'handheld'] },
          duration: { type: 'number', description: '持续时长(秒)' },
          description: { type: 'string', description: '画面描述/提示词' },
          characters: { type: 'array', items: { type: 'string' }, description: '涉及的角色名' },
          dialogue: { type: 'string', description: '台词' },
          emotion: { type: 'string', description: '情绪氛围' },
          props: { type: 'array', items: { type: 'string' }, description: '涉及的道具名' },
        },
        required: ['scriptContent', 'shotType', 'description'],
      },
    },
  },
  required: ['shots'],
};

export class ShotAnalysisService {
  private projectId: string;
  private llmConfig: LLMModelConfig | null = null;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  /**
   * 设置 LLM 配置
   */
  async setLLMConfig(configId?: string): Promise<boolean> {
    this.llmConfig = await getActiveLLMConfig(configId);
    return this.llmConfig !== null;
  }

  /**
   * 启动分镜生成任务
   */
  async startShotAnalysis(
    episodeId: string,
    episodeName: string,
    script: string,
    llmConfigId?: string
  ): Promise<Task> {
    const task = TaskManager.createTask({
      projectId: this.projectId,
      type: 'shot-analysis',
      targetType: 'episode',
      targetId: episodeId,
      targetName: episodeName,
    });

    TaskManager.updateTask(task.id, { status: 'running', progress: 0 });

    // 异步执行
    this.runShotAnalysis(task.id, episodeId, script, llmConfigId);

    return task;
  }

  /**
   * 执行分镜生成
   */
  private async runShotAnalysis(
    taskId: string,
    episodeId: string,
    script: string,
    llmConfigId?: string
  ): Promise<void> {
    try {
      console.log('[ShotAnalysis] 开始生成分镜:', episodeId);

      const hasConfig = await this.setLLMConfig(llmConfigId);
      if (!hasConfig) {
        throw new Error('未配��� LLM 模型，请先在设置中添加');
      }
      console.log('[ShotAnalysis] LLM Config:', this.llmConfig?.name);

      TaskManager.updateTask(taskId, { progress: 10 });

      // 加载已有资产
      const characters = await loadCharacters(this.projectId);
      const scenes = await loadScenes(this.projectId);
      const props = await loadProps(this.projectId);

      console.log('[ShotAnalysis] 已加载资产:', {
        characters: characters.length,
        scenes: scenes.length,
        props: props.length,
      });

      TaskManager.updateTask(taskId, { progress: 20 });

      // 构建提示词
      const template = await getPromptTemplate('shot_breakdown');
      const prompt = fillTemplate(template.template, {
        script,
        characters: characters.map(c => `${c.name}（${c.description || ''}）`).join('\n'),
        scenes: scenes.map(s => `${s.name}（${s.description || ''}）`).join('\n'),
        props: props.map(p => `${p.name}（${p.description || ''}）`).join('\n'),
      });

      console.log('[ShotAnalysis] 调用 LLM...');
      TaskManager.updateTask(taskId, { progress: 30 });

      // 调用 LLM (处理 openai-compatible 类型)
      const provider = createLLMProvider({
        provider: this.llmConfig!.provider === 'openai-compatible' ? 'openai' : this.llmConfig!.provider as any,
        apiKey: this.llmConfig!.apiKey,
        baseUrl: this.llmConfig!.baseUrl,
        modelName: this.llmConfig!.modelName,
      });
      const systemPrompt = `你是一个专业的影视分镜师。你的任务是根据剧本内容，结合给定的角色、场景和道具，生成详细的分镜脚本。
每个分镜应该包含：
- scriptContent: 对应的剧本原文
- shotType: 景别（close-up特写/medium中景/wide全景/extreme-wide大全景）
- cameraMovement: 运镜方式（static固定/pan摇镜/zoom-in推镜/tracking跟随/handheld手持）
- duration: 预估时长（秒）
- description: 详细的画面描述，用于生成图片的提示词
- characters: 出现的角色名列表
- dialogue: 角色台词（如有）
- emotion: 画面情绪氛围
- props: 出现的道具名列表

请确保分镜覆盖剧本的所有重要内容，每个分镜的描述要详细具体。`;

      const result = await provider.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ], {
        responseFormat: { type: 'json_object', schema: SHOTS_SCHEMA },
      });

      TaskManager.updateTask(taskId, { progress: 70 });

      // 解析结果
      const parsed = this.parseJSON<{ shots: any[] }>(result);
      console.log('[ShotAnalysis] 解析结果:', parsed.shots?.length, '个分镜');

      // 将角色名/道具名映射到 ID
      const charNameToId = new Map(characters.map(c => [c.name, c.id]));
      const propNameToId = new Map(props.map(p => [p.name, p.id]));

      const shots: Shot[] = parsed.shots.map((s, index) => ({
        id: `shot_${Date.now()}_${index}`,
        scriptContent: s.scriptContent || '',
        shotType: s.shotType || 'medium',
        cameraMovement: s.cameraMovement || 'static',
        duration: s.duration || 3,
        description: s.description || '',
        characters: (s.characters || []).map((name: string) => charNameToId.get(name) || name),
        dialogue: s.dialogue || '',
        emotion: s.emotion || '',
        props: (s.props || []).map((name: string) => propNameToId.get(name) || name),
        confirmed: false,
        episodeId,
      }));

      TaskManager.updateTask(taskId, { progress: 85 });

      // 保存分镜
      await saveShots(this.projectId, shots);
      console.log('[ShotAnalysis] 分镜已保存:', shots.length);

      TaskManager.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        result: { shotsCount: shots.length },
      });
      console.log('[ShotAnalysis] 分镜生成完成');
    } catch (error: any) {
      console.error('[ShotAnalysis] 生成失败:', error);
      TaskManager.updateTask(taskId, {
        status: 'failed',
        error: error.message || '生成失败',
      });
    }
  }

  /**
   * 解析 JSON 结果
   */
  private parseJSON<T>(text: string): T {
    // 尝试直接解析
    try {
      return JSON.parse(text);
    } catch {
      // 尝试提取 JSON 块
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim());
      }
      // 尝试找到 { } 包围的内容
      const braceMatch = text.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        return JSON.parse(braceMatch[0]);
      }
      throw new Error('无法解析 LLM 返回的 JSON');
    }
  }
}

/**
 * 便捷函数：启动分镜生成
 */
export async function startShotAnalysis(
  projectId: string,
  episodeId: string,
  episodeName: string,
  script: string,
  llmConfigId?: string
): Promise<Task> {
  const service = new ShotAnalysisService(projectId);
  return service.startShotAnalysis(episodeId, episodeName, script, llmConfigId);
}
