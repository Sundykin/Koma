/**
 * 分镜提示词生成服务
 * 独立于分镜拆解，支持单条和批量生成
 * v2: 支持 force 强制重新生成，分离 image/video 任务
 */
import type { Shot, Character, Scene, LLMModelConfig } from '../types';
import { createLLMProvider } from '../providers';
import { getActiveLLMConfig } from '../store/globalStore';
import { getPromptTemplate, fillTemplate } from '../store/promptTemplates';
import type { PromptTemplateType } from '../store/promptTemplates';
import { loadCharacters, loadScenes, updateShot } from '../store/projectStore';
import { TaskManager } from './TaskManager';

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

  constructor(projectId: string, episodeId: string) {
    this.projectId = projectId;
    this.episodeId = episodeId;
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
    stylePrefix: string = ''
  ): Promise<string> {
    const result = await this.generateDualShotPrompts(shot, characters, stylePrefix);
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
    options?: { force?: boolean }
  ): Promise<{ imagePrompt: string; videoPrompt: string }> {
    if (!this.llmConfig) {
      const hasConfig = await this.setLLMConfig();
      if (!hasConfig) {
        throw new Error('未配置 LLM 模型，请先在设置中添加');
      }
    }

    const force = options?.force ?? false;

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

    // 过滤出该分镜关联的角色
    const shotCharacters = characters.filter(c => shot.characters?.includes(c.id));

    // 构建角色引用列表
    const characterRefs = shotCharacters
      .map(c => `${c.name}: @${c.sora2CharacterId || c.id}`)
      .join('\n');

    // 按需并行生成
    const promises: Promise<string>[] = [];
    if (needImage) {
      promises.push(this.generatePromptByType('image', shot, shotCharacters, characterRefs, stylePrefix));
    }
    if (needVideo) {
      promises.push(this.generatePromptByType('video', shot, shotCharacters, characterRefs, stylePrefix));
    }

    const results = await Promise.all(promises);

    let resultIndex = 0;
    const imagePrompt = needImage ? results[resultIndex++] : (shot.imagePrompt || '');
    const videoPrompt = needVideo ? results[resultIndex++] : (shot.videoPrompt || '');

    return { imagePrompt, videoPrompt };
  }

  /**
   * 按类型生成提示词
   */
  private async generatePromptByType(
    type: 'image' | 'video',
    shot: Shot,
    shotCharacters: Character[],
    characterRefs: string,
    stylePrefix: string
  ): Promise<string> {
    // 根据类型选择专用模板，回退到通用模板
    const templateKey: PromptTemplateType = type === 'image' ? 'shot_image_prompt_generation' : 'shot_video_prompt_generation';
    let template = await getPromptTemplate(templateKey);
    if (!template) {
      // 回退到通用模板
      template = await getPromptTemplate('shot_prompt_generation');
    }
    if (!template) {
      throw new Error(`未找到分镜提示词模板 ${templateKey} 或 shot_prompt_generation`);
    }

    const prompt = fillTemplate(template.template, {
      scriptContent: shot.scriptContent,
      characters: shotCharacters.map(c => c.name).join(', ') || '无',
      emotion: shot.emotion || '中性',
      stylePrefix: stylePrefix || '',
      cameraOptions: CAMERA_OPTIONS.join(', '),
      shotTypeOptions: SHOT_TYPE_OPTIONS.join(', '),
      characterRefs: characterRefs || '无角色引用',
      promptType: type === 'image' ? '静态图片' : '动态视频',
    });

    const provider = createLLMProvider({
      provider: this.llmConfig!.provider === 'openai-compatible' ? 'openai' : this.llmConfig!.provider as any,
      apiKey: this.llmConfig!.apiKey,
      baseUrl: this.llmConfig!.baseUrl,
      modelName: this.llmConfig!.modelName,
    });

    const systemPromptTemplate = await getPromptTemplate('shot_prompt_system');
    const systemPrompt = systemPromptTemplate?.template || '你是一个专业的视频提示词生成专家。';

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
    onProgress?: (current: number, total: number, result: PromptGenerationResult) => void
  ): Promise<PromptGenerationResult[]> {
    const characters = await loadCharacters(this.projectId);
    const results: PromptGenerationResult[] = [];

    // 过滤出至少缺少一种提示词的分镜
    const shotsToGenerate = shots.filter(s => !s.imagePrompt?.trim() || !s.videoPrompt?.trim());

    for (let i = 0; i < shotsToGenerate.length; i++) {
      const shot = shotsToGenerate[i];
      try {
        // generateDualShotPrompts 会自动检测并只生成缺失的类型
        const { imagePrompt, videoPrompt } = await this.generateDualShotPrompts(shot, characters, stylePrefix);

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

      } catch (error: any) {
        const result: PromptGenerationResult = {
          shotId: shot.id,
          imagePrompt: '',
          videoPrompt: '',
          success: false,
          error: error.message,
        };
        results.push(result);
        onProgress?.(i + 1, shotsToGenerate.length, result);
        console.error(`[ShotPrompt] 生成失败:`, shot.id, error);
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
    options?: { force?: boolean }
  ): Promise<PromptGenerationResult> {
    try {
      const characters = await loadCharacters(this.projectId);
      const { imagePrompt, videoPrompt } = await this.generateDualShotPrompts(
        shot,
        characters,
        stylePrefix,
        generateFlags,
        options
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
    } catch (error: any) {
      return {
        shotId: shot.id,
        imagePrompt: '',
        videoPrompt: '',
        success: false,
        error: error.message,
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
  options?: { force?: boolean }
): Promise<PromptGenerationResult> {
  const service = new ShotPromptService(projectId, episodeId);
  if (llmConfigId) {
    await service.setLLMConfig(llmConfigId);
  }
  return service.generateAndSaveShotPrompt(shot, stylePrefix, generateFlags, options);
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
  llmConfigId?: string
): Promise<PromptGenerationResult[]> {
  const service = new ShotPromptService(projectId, episodeId);
  if (llmConfigId) {
    await service.setLLMConfig(llmConfigId);
  }
  return service.batchGenerateShotPrompts(shots, stylePrefix, onProgress);
}
