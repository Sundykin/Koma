/**
 * 分镜生成服务
 * 使用 LLM 基于剧本和已确认的角色/场景/道具生成分镜列表
 * 独立于剧本解析，作为单独的步骤执行
 */
import type { Shot } from '../types';
import { resolvePromptTemplate } from '../store/promptTemplates';
import { TaskManager, Task } from './TaskManager';
import { parseLLMJSON } from '../utils/llmJsonParser';
import { saveEpisodeShots } from '../store/projectStore';
import { createLogger } from '../store/logger';
import { extractErrorMessage } from '../utils/errorHandler';
import { appendStyleRequirement, type StyleSnapshotLike } from '../utils/promptNormalize';

const logger = createLogger('ShotAnalysis');

// 预选资产类型
export interface PresetAssets {
  characterIds: string[];
  propIds: string[];
}

// 分镜 JSON Schema（不含 description，后续手动生成提示词）
const _SHOTS_SCHEMA = {
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
          scenes: { type: 'array', items: { type: 'string' }, description: '涉及的场景名' },
        },
        required: ['scriptContent', 'shotType'],
      },
    },
  },
  required: ['shots'],
};

export class ShotAnalysisService {
  private ctx: import('./CreationContext').CreationContext;
  private presetAssets: PresetAssets | null = null;

  constructor(ctx: import('./CreationContext').CreationContext) {
    this.ctx = ctx;
  }

  /**
   * 启动分镜生成任务
   */
  async startShotAnalysis(
    episodeId: string,
    episodeName: string,
    script: string,
    presetAssets?: PresetAssets,
  ): Promise<Task> {
    this.presetAssets = presetAssets || null;

    const task = TaskManager.createTask({
      projectId: this.ctx.projectId,
      type: 'shot-analysis',
      targetType: 'episode',
      targetId: episodeId,
      targetName: episodeName,
    });

    TaskManager.updateTask(task.id, { status: 'running', progress: 0 });

    // 异步执行
    this.runShotAnalysis(task.id, episodeId, script);

    return task;
  }

  /**
   * 执行分镜生成
   */
  private async runShotAnalysis(
    taskId: string,
    episodeId: string,
    script: string,
  ): Promise<void> {
    try {
      TaskManager.updateTask(taskId, { progress: 10 });

      const { characters, scenes, props } = this.ctx;

      TaskManager.updateTask(taskId, { progress: 20 });

      // 构建提示词（只传名称，描述作为参考放在括号内，名称需精确匹配）
      const resolvedPrompt = await resolvePromptTemplate('shot_breakdown', {
        script,
        characters: characters.length > 0
          ? characters.map(c => c.description ? `${c.name}（${c.description}）` : c.name).join('\n')
          : '无',
        scenes: scenes.length > 0
          ? scenes.map(s => s.description ? `${s.name}（${s.description}）` : s.name).join('\n')
          : '无',
        props: props.length > 0
          ? props.map(p => p.description ? `${p.name}（${p.description}）` : p.name).join('\n')
          : '无',
      });
      const styledPrompt = this.appendStyleRequirement(resolvedPrompt.prompt);

      TaskManager.updateTask(taskId, { progress: 30 });

      // 调用 LLM
      // 获取系统提示词模板
      const resolvedSystemPrompt = await resolvePromptTemplate('shot_breakdown_system', {});
      const systemPrompt = resolvedSystemPrompt.prompt;

      const result = await this.ctx.llmProvider.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: styledPrompt },
      ]);

      TaskManager.updateTask(taskId, { progress: 70 });

      // 解析结果
      const parsed = this.parseJSON<{ shots: any[] }>(result);

      // 分镜里统一保存项目资产 ID。
      // 如果当前还匹配不到资产，则沿用旧实现先保留名称，后续在 Storyboard/资产面板中再做修复回填。
      const normalizeAssetRef = (name: string, matchedId?: string): string | undefined => {
        if (matchedId) {
          return matchedId;
        }
        const trimmed = name?.trim();
        return trimmed || undefined;
      };

      // 模糊匹配：支持 LLM 返回的名称包含描述后缀（如 "宁卓（侠客）"）或微小差异
      const fuzzyMatchAsset = <T extends { name: string }>(
        name: string,
        assets: T[]
      ): T | undefined => {
        if (!name) return undefined;
        const trimmed = name.trim();
        // 1. 精确匹配
        const exact = assets.find(a => a.name === trimmed);
        if (exact) return exact;
        // 2. LLM 返回的名称包含资产名（如 "宁卓（侠客）" 包含 "宁卓"）
        const containsAsset = assets.find(a => trimmed.includes(a.name));
        if (containsAsset) return containsAsset;
        // 3. 资产名包含 LLM 返回的名称（如资产名 "宁卓·天机" 包含 "宁卓"）
        const assetContains = assets.find(a => a.name.includes(trimmed));
        if (assetContains) return assetContains;
        return undefined;
      };

      // 分镜拆解时 description 为 undefined，后续手动生成
      const shots: Shot[] = parsed.shots.map((s, index) => ({
        id: `shot_${Date.now()}_${index}`,
        scriptContent: s.scriptContent || '',
        shotType: s.shotType || 'medium',
        cameraMovement: s.cameraMovement || 'static',
        duration: s.duration || 3,
        description: undefined,  // 后续手动生成提示词
        characters: (s.characters || [])
          .map((name: string) => {
            const match = fuzzyMatchAsset(name, characters);
            return normalizeAssetRef(name, match?.id);
          })
          .filter((id: string | undefined): id is string => id !== undefined),
        dialogue: s.dialogue || '',
        emotion: s.emotion || '',
        props: (s.props || [])
          .map((name: string) => {
            const match = fuzzyMatchAsset(name, props);
            return normalizeAssetRef(name, match?.id);
          })
          .filter((id: string | undefined): id is string => id !== undefined),
        scenes: (s.scenes || [])
          .map((name: string) => {
            const match = fuzzyMatchAsset(name, scenes);
            return normalizeAssetRef(name, match?.id);
          })
          .filter((id: string | undefined): id is string => id !== undefined),
        confirmed: false,
        episodeId,
      }));

      TaskManager.updateTask(taskId, { progress: 85 });

      // 保存分镜到剧集
      await saveEpisodeShots(this.ctx.projectId, episodeId, shots);

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
   * 解析 JSON 结果（委托给 parseLLMJSON 工具函数）
   */
  private parseJSON<T>(text: string): T {
    return parseLLMJSON<T>(text);
  }

  private appendStyleRequirement(prompt: string): string {
    return appendStyleRequirement(prompt, this.ctx.styleSnapshot);
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
  llmSelection?: string,
  presetAssets?: PresetAssets,
  styleSnapshot?: StyleSnapshotLike,
): Promise<Task> {
  const { createCreationContext } = await import('./CreationContext');
  const ctx = await createCreationContext(projectId, episodeId, {
    llmConfigId: llmSelection,
    styleSnapshot,
  });
  const service = new ShotAnalysisService(ctx);
  return service.startShotAnalysis(episodeId, episodeName, script, presetAssets);
}
