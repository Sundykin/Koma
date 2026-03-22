/**
 * 分镜提示词生成服务
 * 独立于分镜拆解，支持单条和批量生成
 * v2: 支持 force 强制重新生成，分离 image/video 任务
 */
import type { Shot, Character, Scene, LLMModelConfig } from '../types';
import { createLLMProvider } from '../providers';
import { getActiveLLMConfig } from '../store/globalStore';
import { resolvePromptTemplate } from '../store/promptTemplates';
import type { PromptTemplateType } from '../store/promptTemplates';
import { loadCharacters, loadScenes, loadProps, updateShot } from '../store/projectStore';
import { createLogger } from '../store/logger';
import { createMentionString } from '../editor/mentionTypes';

const logger = createLogger('ShotPrompt');

// 运镜关键字
export const CAMERA_OPTIONS = [
  'static shot',
  'pan left',
  'pan right',
  'tilt up',
  'tilt down',
  'zoom in',
  'zoom out',
  'tracking shot',
  'dolly shot',
  'crane shot',
  'handheld',
  'push in',
  'pull out',
];

// 景别关键字
export const SHOT_TYPE_OPTIONS = [
  'extreme close-up',
  'close-up',
  'medium close-up',
  'medium shot',
  'medium wide shot',
  'wide shot',
  'extreme wide shot',
  'establishing shot',
  'full shot',
  'over-the-shoulder shot',
];

export interface PromptGenerationContext {
  shot: Shot;
  characters: Character[];
  scenes: Scene[];
  stylePrefix: string;
}

interface StyleSnapshotLike {
  ttiStylePrefix?: string;
  llmPromptSuffix?: string;
}

export interface PromptGenerationResult {
  shotId: string;
  imagePrompt: string;
  videoPrompt: string;
  success: boolean;
  error?: string;
}

export class ShotPromptService {
  private projectId: string;
  private episodeId: string;
  private llmConfig: LLMModelConfig | null = null;
  private styleSnapshot?: StyleSnapshotLike;

  constructor(
    projectId: string,
    episodeId: string,
    options?: { styleSnapshot?: StyleSnapshotLike; project?: { styleSnapshot?: StyleSnapshotLike } }
  ) {
    this.projectId = projectId;
    this.episodeId = episodeId;
    this.styleSnapshot = options?.styleSnapshot || options?.project?.styleSnapshot;
  }

  /**
   * 设置 LLM 配置
   */
  async setLLMConfig(configId?: string): Promise<boolean> {
    this.llmConfig = await getActiveLLMConfig(configId);
    return this.llmConfig !== null;
  }

  /**
   * 生成单条分镜提示词（返回单一提示词，用于兼容）
   */
  async generateShotPrompt(
    shot: Shot,
    characters: Character[],
    stylePrefix: string = '',
    styleSnapshot?: StyleSnapshotLike
  ): Promise<string> {
    const result = await this.generateDualShotPrompts(shot, characters, stylePrefix, undefined, undefined, styleSnapshot);
    return result.imagePrompt; // 兼容旧接口，返回图片提示词
  }

  /**
   * 生成双提示词（图片 + 视频），支持按需生成
   * @param generateFlags 指定生成哪些类型，默认生成缺失的
   * @param options.force 强制重新生成（用于"优化"功能）
   */
  async generateDualShotPrompts(
    shot: Shot,
    characters: Character[],
    stylePrefix: string = '',
    generateFlags?: { image?: boolean; video?: boolean },
    options?: { force?: boolean },
    styleSnapshot?: StyleSnapshotLike
  ): Promise<{ imagePrompt: string; videoPrompt: string }> {
    if (!this.llmConfig) {
      const hasConfig = await this.setLLMConfig();
      if (!hasConfig) {
        throw new Error('未配置 LLM 模型，请先在设置中添加');
      }
    }

    const force = options?.force ?? false;
    const resolvedStylePrefix = this.resolveTTIStylePrefix(stylePrefix, styleSnapshot);

    // 确定需要生成哪些类型
    // force 模式下，按 generateFlags 指定的类型强制生成
    const needImage = force
      ? (generateFlags?.image ?? true)
      : (generateFlags?.image ?? !shot.imagePrompt?.trim());
    const needVideo = force
      ? (generateFlags?.video ?? true)
      : (generateFlags?.video ?? !shot.videoPrompt?.trim());

    // 如果都不需要生成，直接返回现有值
    if (!needImage && !needVideo) {
      return {
        imagePrompt: shot.imagePrompt || '',
        videoPrompt: shot.videoPrompt || '',
      };
    }

    // 过滤出该分镜关联的资产（角色/场景/道具）
    const shotCharacters = characters.filter(c => shot.characters?.includes(c.id));

    // 场景与道具由服务内部加载，避免在调用点扩散参数/兼容代码
    const [allScenes, allProps] = await Promise.all([
      loadScenes(this.projectId).catch(() => []),
      loadProps(this.projectId).catch(() => []),
    ]);
    const shotScenes = (allScenes || []).filter(s => (shot.scenes || []).includes(s.id));
    const shotProps = (allProps || []).filter(p => (shot.props || []).includes(p.id));

    // 构建角色引用列表
    const characterRefs = shotCharacters
      .map(c => `${c.name}: ${createMentionString('char', c.id)}`)
      .join('\n');

    // 场景引用列表（场景不需要 Sora2 绑定）
    const sceneRefs = shotScenes
      .map(s => `${s.name}: ${createMentionString('scene', s.id)}`)
      .join('\n');

    // 道具引用列表（道具可用 sora2PropId 或内部 ID）
    const propRefs = shotProps
      .map(p => `${p.name}: ${createMentionString('prop', p.id)}`)
      .join('\n');

    // 按需并行生成
    const promises: Promise<string>[] = [];
    if (needImage) {
      promises.push(this.generatePromptByType('image', shot, shotCharacters, shotScenes, shotProps as any, characterRefs, sceneRefs, propRefs, resolvedStylePrefix));
    }
    if (needVideo) {
      promises.push(this.generatePromptByType('video', shot, shotCharacters, shotScenes, shotProps as any, characterRefs, sceneRefs, propRefs, resolvedStylePrefix));
    }

    const results = await Promise.all(promises);

    let resultIndex = 0;
    const imagePrompt = needImage ? results[resultIndex++] : (shot.imagePrompt || '');
    const videoPrompt = needVideo ? results[resultIndex++] : (shot.videoPrompt || '');

    return { imagePrompt, videoPrompt };
  }

  private resolveTTIStylePrefix(legacyStylePrefix?: string, styleSnapshot?: StyleSnapshotLike): string {
    return styleSnapshot?.ttiStylePrefix || this.styleSnapshot?.ttiStylePrefix || legacyStylePrefix || '';
  }

  /**
   * 按类型生成提示词
   */
  private async generatePromptByType(
    type: 'image' | 'video',
    shot: Shot,
    shotCharacters: Character[],
    shotScenes: Scene[],
    shotProps: Array<{ id: string; name: string; prompt: string; sora2PropId?: string }>,
    characterRefs: string,
    sceneRefs: string,
    propRefs: string,
    stylePrefix: string
  ): Promise<string> {
    // 根据类型选择专用模板，回退到通用模板
    const templateKey: PromptTemplateType = type === 'image' ? 'shot_image_prompt_generation' : 'shot_video_prompt_generation';
    // 图片模板不包含 cameraOptions 变量，仅视频模板使用
    const templateVariables: Record<string, string> = {
      scriptContent: shot.scriptContent,
      characters: shotCharacters.map(c => c.name).join(', ') || '无',
      scenes: shotScenes.map(s => s.name).join(', ') || '无',
      props: shotProps.map(p => p.name).join(', ') || '无',
      emotion: shot.emotion || '中性',
      stylePrefix: stylePrefix || '',
      shotTypeHint: shot.shotType || 'medium',
      shotTypeOptions: SHOT_TYPE_OPTIONS.join(', '),
      characterRefs: characterRefs || '无角色引用',
      sceneRefs: sceneRefs || '无场景引用',
      propRefs: propRefs || '无道具引用',
    };
    if (type === 'video') {
      templateVariables.cameraOptions = CAMERA_OPTIONS.join(', ');
      templateVariables.cameraMovementHint = shot.cameraMovement || 'static';
      templateVariables.durationSeconds = String(Math.max(1, Math.round(shot.duration || 4)));
    } else {
      templateVariables.cameraMovementHint = shot.cameraMovement || 'static';
    }
    const resolvedPrompt = await resolvePromptTemplate(templateKey, templateVariables);
    const prompt = resolvedPrompt.prompt;

    const provider = createLLMProvider({
      provider: this.llmConfig!.provider === 'openai-compatible' ? 'openai' : this.llmConfig!.provider as any,
      apiKey: this.llmConfig!.apiKey,
      baseUrl: this.llmConfig!.baseUrl,
      modelName: this.llmConfig!.modelName,
    });

    const resolvedSystemPrompt = await resolvePromptTemplate('shot_prompt_system', {});
    const systemPrompt = resolvedSystemPrompt.prompt;

    const result = await provider.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ]);

    // 清理结果
    let cleanedResult = result.trim();
    if (cleanedResult.startsWith('"') && cleanedResult.endsWith('"')) {
      cleanedResult = cleanedResult.slice(1, -1);
    }

    return cleanedResult;
  }

  /**
   * 批量生成分镜提示词（双提示词版本）
   * 支持按需生成：只生成缺失的提示词类型
   */
  async batchGenerateShotPrompts(
    shots: Shot[],
    stylePrefix: string = '',
    onProgress?: (current: number, total: number, result: PromptGenerationResult) => void,
    styleSnapshot?: StyleSnapshotLike
  ): Promise<PromptGenerationResult[]> {
    const characters = await loadCharacters(this.projectId);
    const results: PromptGenerationResult[] = [];

    // 过滤出至少缺少一种提示词的分镜
    const shotsToGenerate = shots.filter(s => !s.imagePrompt?.trim() || !s.videoPrompt?.trim());

    for (let i = 0; i < shotsToGenerate.length; i++) {
      const shot = shotsToGenerate[i];
      try {
        // generateDualShotPrompts 会自动检测并只生成缺失的类型
        const { imagePrompt, videoPrompt } = await this.generateDualShotPrompts(
          shot,
          characters,
          stylePrefix,
          undefined,
          undefined,
          styleSnapshot
        );

        // 保存双提示词到数据库
        await updateShot(this.projectId, this.episodeId, shot.id, { imagePrompt, videoPrompt });

        const result: PromptGenerationResult = {
          shotId: shot.id,
          imagePrompt,
          videoPrompt,
          success: true,
        };
        results.push(result);
        onProgress?.(i + 1, shotsToGenerate.length, result);

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const result: PromptGenerationResult = {
          shotId: shot.id,
          imagePrompt: '',
          videoPrompt: '',
          success: false,
          error: errorMessage,
        };
        results.push(result);
        onProgress?.(i + 1, shotsToGenerate.length, result);
        logger.error(`生成失败: ${shot.id}`, error);
      }
    }

    return results;
  }

  /**
   * 生成单条分镜提示词并保存（双提示词版本）
   * @param generateFlags 指定生成哪些类型
   * @param options.force 强制重新生成
   */
  async generateAndSaveShotPrompt(
    shot: Shot,
    stylePrefix: string = '',
    generateFlags?: { image?: boolean; video?: boolean },
    options?: { force?: boolean },
    styleSnapshot?: StyleSnapshotLike
  ): Promise<PromptGenerationResult> {
    try {
      const characters = await loadCharacters(this.projectId);
      const { imagePrompt, videoPrompt } = await this.generateDualShotPrompts(
        shot,
        characters,
        stylePrefix,
        generateFlags,
        options,
        styleSnapshot
      );

      // 只更新实际生成的字段
      const updates: Partial<Shot> = {};
      if (generateFlags?.image !== false && (options?.force || !shot.imagePrompt?.trim())) {
        updates.imagePrompt = imagePrompt;
      }
      if (generateFlags?.video !== false && (options?.force || !shot.videoPrompt?.trim())) {
        updates.videoPrompt = videoPrompt;
      }

      if (Object.keys(updates).length > 0) {
        await updateShot(this.projectId, this.episodeId, shot.id, updates);
      }

      return {
        shotId: shot.id,
        imagePrompt,
        videoPrompt,
        success: true,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        shotId: shot.id,
        imagePrompt: '',
        videoPrompt: '',
        success: false,
        error: errorMessage,
      };
    }
  }
}

/**
 * 便捷函数：为单个分镜生成提示词
 * @param generateFlags 指定生成哪些类型 { image?: boolean; video?: boolean }
 * @param options.force 强制重新生成（用于"优化"功能）
 */
export async function generateShotPrompt(
  projectId: string,
  episodeId: string,
  shot: Shot,
  stylePrefix?: string,
  llmConfigId?: string,
  generateFlags?: { image?: boolean; video?: boolean },
  options?: { force?: boolean },
  styleSnapshot?: StyleSnapshotLike,
  project?: { styleSnapshot?: StyleSnapshotLike }
): Promise<PromptGenerationResult> {
  const service = new ShotPromptService(projectId, episodeId, { styleSnapshot, project });
  if (llmConfigId) {
    await service.setLLMConfig(llmConfigId);
  }
  return service.generateAndSaveShotPrompt(shot, stylePrefix, generateFlags, options, styleSnapshot);
}

/**
 * 便捷函数：批量生成分镜提示词
 */
export async function batchGenerateShotPrompts(
  projectId: string,
  episodeId: string,
  shots: Shot[],
  stylePrefix?: string,
  onProgress?: (current: number, total: number, result: PromptGenerationResult) => void,
  llmConfigId?: string,
  styleSnapshot?: StyleSnapshotLike,
  project?: { styleSnapshot?: StyleSnapshotLike }
): Promise<PromptGenerationResult[]> {
  const service = new ShotPromptService(projectId, episodeId, { styleSnapshot, project });
  if (llmConfigId) {
    await service.setLLMConfig(llmConfigId);
  }
  return service.batchGenerateShotPrompts(shots, stylePrefix, onProgress, styleSnapshot);
}
