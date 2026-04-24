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
const SHOT_ANALYSIS_LLM_TIMEOUT_MS = 300_000;

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
    const traceId = `shot-analysis-${taskId}`;
    try {
      TaskManager.updateTask(taskId, { progress: 10 });

      const { characters, scenes, props } = this.ctx;

      logger.info('开始分镜生成', {
        traceId,
        episodeId,
        scriptLength: script.length,
        charactersCount: characters.length,
        scenesCount: scenes.length,
        propsCount: props.length,
        hasPresetAssets: !!this.presetAssets,
      });

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

      logger.info('准备调用 LLM', {
        traceId,
        systemPromptLength: systemPrompt.length,
        userPromptLength: styledPrompt.length,
        userPromptHead: styledPrompt.slice(0, 200),
      });

      const llmStart = Date.now();
      const result = await this.ctx.llmProvider.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: styledPrompt },
        ],
        {
          traceId,
          source: 'shot-analysis',
          operation: 'breakdown',
          taskKind: 'structured',
          taskProfileId: 'shot-breakdown',
          stream: true,
          timeoutMs: SHOT_ANALYSIS_LLM_TIMEOUT_MS,
          // 强制 OpenAI 兼容服务以合法 JSON 返回，避免字符串内未转义引号导致解析失败
          responseFormat: 'json_object',
        },
      );

      logger.info('LLM 返回完成', {
        traceId,
        durationMs: Date.now() - llmStart,
        responseLength: result.length,
        responseHead: result.slice(0, 200),
        responseTail: result.length > 200 ? result.slice(-200) : '',
      });

      TaskManager.updateTask(taskId, { progress: 70 });

      // 解析结果
      let parsed: { shots: any[] };
      try {
        parsed = this.parseJSON<{ shots: any[] }>(result);
        logger.info('JSON 解析成功', { traceId, shotsCount: parsed.shots?.length ?? 0 });
      } catch (parseErr) {
        // 解析失败：把完整原始响应分块写入日志，便于人工排查
        const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        logger.error('分镜 JSON 解析失败', { traceId, error: errMsg, responseLength: result.length });
        const CHUNK = 1000;
        for (let i = 0; i < result.length; i += CHUNK) {
          logger.error('原始响应片段', {
            traceId,
            range: `${i}-${Math.min(i + CHUNK, result.length)}`,
            content: result.slice(i, i + CHUNK),
          });
        }
        throw parseErr;
      }

      // 将角色名/道具名映射到 ID
      // 优先使用预选资产的 Sora2 ID，其次使用已绑定的 Sora2 ID，最后使用自定义 ID
      const presetCharacterIds = new Set(this.presetAssets?.characterIds || []);
      const presetPropIds = new Set(this.presetAssets?.propIds || []);

      const getCharId = (c: typeof characters[0]) => {
        if (c.sora2CharacterId && presetCharacterIds.has(c.sora2CharacterId)) {
          return c.sora2CharacterId;
        }
        return c.sora2CharacterId || c.id;
      };

      const getPropId = (p: typeof props[0]) => {
        if (p.sora2PropId && presetPropIds.has(p.sora2PropId)) {
          return p.sora2PropId;
        }
        return p.sora2PropId || p.id;
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
            return match ? getCharId(match) : undefined;
          })
          .filter((id: string | undefined): id is string => id !== undefined),
        dialogue: s.dialogue || '',
        emotion: s.emotion || '',
        props: (s.props || [])
          .map((name: string) => {
            const match = fuzzyMatchAsset(name, props);
            return match ? getPropId(match) : undefined;
          })
          .filter((id: string | undefined): id is string => id !== undefined),
        scenes: (s.scenes || [])
          .map((name: string) => {
            const match = fuzzyMatchAsset(name, scenes);
            return match ? match.id : undefined;
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
