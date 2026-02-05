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
  saveEpisodeShots,
  loadEpisode,
} from '../store/projectStore';
import { createLogger } from '../store/logger';
import { extractErrorMessage } from '../utils/errorHandler';

const logger = createLogger('ShotAnalysis');

// 预选资产类型
export interface PresetAssets {
  characterIds: string[];
  propIds: string[];
}

// 分镜 JSON Schema（不含 description，后续手动生成提示词）
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
          characters: { type: 'array', items: { type: 'string' }, description: '涉及的角色名' },
          dialogue: { type: 'string', description: '台词' },
          emotion: { type: 'string', description: '情绪氛围' },
          props: { type: 'array', items: { type: 'string' }, description: '涉及的道具名' },
        },
        required: ['scriptContent', 'shotType'],
      },
    },
  },
  required: ['shots'],
};

export class ShotAnalysisService {
  private projectId: string;
  private llmConfig: LLMModelConfig | null = null;
  private presetAssets: PresetAssets | null = null;

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
   * @param presetAssets 预选资产，用于优先匹配
   */
  async startShotAnalysis(
    episodeId: string,
    episodeName: string,
    script: string,
    llmConfigId?: string,
    presetAssets?: PresetAssets
  ): Promise<Task> {
    this.presetAssets = presetAssets || null;

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

      const hasConfig = await this.setLLMConfig(llmConfigId);
      if (!hasConfig) {
        throw new Error('未配��� LLM 模型，请先在设置中添加');
      }

      TaskManager.updateTask(taskId, { progress: 10 });

      // 加载已有资产
      const characters = await loadCharacters(this.projectId);
      const scenes = await loadScenes(this.projectId);
      const props = await loadProps(this.projectId);


      TaskManager.updateTask(taskId, { progress: 20 });

      // 构建提示词
      const template = await getPromptTemplate('shot_breakdown');
      const prompt = fillTemplate(template.template, {
        script,
        characters: characters.map(c => `${c.name}（${c.description || ''}）`).join('\n'),
        scenes: scenes.map(s => `${s.name}（${s.description || ''}）`).join('\n'),
        props: props.map(p => `${p.name}（${p.description || ''}）`).join('\n'),
      });

      TaskManager.updateTask(taskId, { progress: 30 });

      // 调用 LLM (处理 openai-compatible 类型)
      const provider = createLLMProvider({
        provider: this.llmConfig!.provider === 'openai-compatible' ? 'openai' : this.llmConfig!.provider as any,
        apiKey: this.llmConfig!.apiKey,
        baseUrl: this.llmConfig!.baseUrl,
        modelName: this.llmConfig!.modelName,
      });
      // 获取系统提示词模板
      const systemPromptTemplate = await getPromptTemplate('shot_breakdown_system');
      const systemPrompt = systemPromptTemplate.template;

      const result = await provider.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ]);

      TaskManager.updateTask(taskId, { progress: 70 });

      // 解析结果
      const parsed = this.parseJSON<{ shots: any[] }>(result);

      // 将角色名/道具名映射到 ID
      // 优先使用预选资产的 Sora2 ID，其次使用已绑定的 Sora2 ID，最后使用自定义 ID
      const presetCharacterIds = new Set(this.presetAssets?.characterIds || []);
      const presetPropIds = new Set(this.presetAssets?.propIds || []);

      const charNameToId = new Map(characters.map(c => {
        // 如果角色有 Sora2 ID 且在预选列表中，优先使用
        if (c.sora2CharacterId && presetCharacterIds.has(c.sora2CharacterId)) {
          return [c.name, c.sora2CharacterId];
        }
        // 否则使用 Sora2 ID 或自定义 ID
        return [c.name, c.sora2CharacterId || c.id];
      }));

      const propNameToId = new Map(props.map(p => {
        // 如果道具有 Sora2 ID 且在预选列表中，优先使用
        if (p.sora2PropId && presetPropIds.has(p.sora2PropId)) {
          return [p.name, p.sora2PropId];
        }
        // 否则使用 Sora2 ID 或自定义 ID
        return [p.name, p.sora2PropId || p.id];
      }));

      // 分镜拆解时 description 为 undefined，后续手动生成
      const shots: Shot[] = parsed.shots.map((s, index) => ({
        id: `shot_${Date.now()}_${index}`,
        scriptContent: s.scriptContent || '',
        shotType: s.shotType || 'medium',
        cameraMovement: s.cameraMovement || 'static',
        duration: s.duration || 3,
        description: undefined,  // 后续手动生成提示词
        characters: (s.characters || []).map((name: string) => charNameToId.get(name) || name),
        dialogue: s.dialogue || '',
        emotion: s.emotion || '',
        props: (s.props || []).map((name: string) => propNameToId.get(name) || name),
        confirmed: false,
        episodeId,
      }));

      TaskManager.updateTask(taskId, { progress: 85 });

      // 保存分镜到剧集
      await saveEpisodeShots(this.projectId, episodeId, shots);

      TaskManager.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        result: { shotsCount: shots.length },
      });
    } catch (error: unknown) {
      logger.error('生成失败', error);
      TaskManager.updateTask(taskId, {
        status: 'failed',
        error: extractErrorMessage(error) || '生成失败',
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
  llmConfigId?: string,
  presetAssets?: PresetAssets
): Promise<Task> {
  const service = new ShotAnalysisService(projectId);
  return service.startShotAnalysis(episodeId, episodeName, script, llmConfigId, presetAssets);
}
