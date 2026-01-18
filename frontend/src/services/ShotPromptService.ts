/**
 * 分镜提示词生成服务
 * 独立于分镜拆解，支持单条和批量生成
 */
import type { Shot, Character, Scene, LLMModelConfig } from '../types';
import { createLLMProvider } from '../providers';
import { getActiveLLMConfig } from '../store/globalStore';
import { getPromptTemplate, fillTemplate } from '../store/promptTemplates';
import { loadCharacters, loadScenes, updateShot } from '../store/projectStore';

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
  prompt: string;
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
   * 生成单条分镜提示词
   */
  async generateShotPrompt(
    shot: Shot,
    characters: Character[],
    stylePrefix: string = ''
  ): Promise<string> {
    if (!this.llmConfig) {
      const hasConfig = await this.setLLMConfig();
      if (!hasConfig) {
        throw new Error('未配置 LLM 模型，请先在设置中添加');
      }
    }

    // 过滤出该分镜关联的角色
    const shotCharacters = characters.filter(c => shot.characters?.includes(c.id));

    // 构建角色引用列表
    const characterRefs = shotCharacters
      .map(c => `${c.name}: @${c.sora2CharacterId || c.id}`)
      .join('\n');

    // 获取模板
    const template = await getPromptTemplate('shot_prompt_generation');
    const prompt = fillTemplate(template.template, {
      scriptContent: shot.scriptContent,
      characters: shotCharacters.map(c => c.name).join(', ') || '无',
      emotion: shot.emotion || '中性',
      stylePrefix: stylePrefix || '',
      cameraOptions: CAMERA_OPTIONS.join(', '),
      shotTypeOptions: SHOT_TYPE_OPTIONS.join(', '),
      characterRefs: characterRefs || '无角色引用',
    });

    // 调用 LLM
    const provider = createLLMProvider({
      provider: this.llmConfig!.provider === 'openai-compatible' ? 'openai' : this.llmConfig!.provider as any,
      apiKey: this.llmConfig!.apiKey,
      baseUrl: this.llmConfig!.baseUrl,
      modelName: this.llmConfig!.modelName,
    });

    const systemPrompt = `你是一个专业的视频提示词生成专家。你的任务是为视频生成模型编写高质量的英文提示词。
要求：
1. 提示词必须是英文
2. 如果有角色引用，使用 @角色ID 格式（如 @abc123）
3. 包含运镜描述和景别描述
4. 描述要具体、生动，包含动作、光影、氛围
5. 直接输出提示词，不要有任何前缀或解释`;

    const result = await provider.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ]);

    // 清理结果（移除可能的引号包围）
    let cleanedResult = result.trim();
    if (cleanedResult.startsWith('"') && cleanedResult.endsWith('"')) {
      cleanedResult = cleanedResult.slice(1, -1);
    }

    return cleanedResult;
  }

  /**
   * 批量生成分镜提示词
   */
  async batchGenerateShotPrompts(
    shots: Shot[],
    stylePrefix: string = '',
    onProgress?: (current: number, total: number, result: PromptGenerationResult) => void
  ): Promise<PromptGenerationResult[]> {
    // 加载角色数据
    const characters = await loadCharacters(this.projectId);
    const results: PromptGenerationResult[] = [];

    // 过滤出没有提示词的分镜
    const shotsToGenerate = shots.filter(s => !s.description);

    for (let i = 0; i < shotsToGenerate.length; i++) {
      const shot = shotsToGenerate[i];
      try {
        const prompt = await this.generateShotPrompt(shot, characters, stylePrefix);

        // 保存到数据库
        await updateShot(this.projectId, this.episodeId, shot.id, { description: prompt });

        const result: PromptGenerationResult = {
          shotId: shot.id,
          prompt,
          success: true,
        };
        results.push(result);
        onProgress?.(i + 1, shotsToGenerate.length, result);

        console.log(`[ShotPrompt] 生成提示词 ${i + 1}/${shotsToGenerate.length}:`, shot.id);
      } catch (error: any) {
        const result: PromptGenerationResult = {
          shotId: shot.id,
          prompt: '',
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
   * 生成单条分镜提示词并保存
   */
  async generateAndSaveShotPrompt(
    shot: Shot,
    stylePrefix: string = ''
  ): Promise<PromptGenerationResult> {
    try {
      const characters = await loadCharacters(this.projectId);
      const prompt = await this.generateShotPrompt(shot, characters, stylePrefix);

      // 保存到数据库
      await updateShot(this.projectId, this.episodeId, shot.id, { description: prompt });

      return {
        shotId: shot.id,
        prompt,
        success: true,
      };
    } catch (error: any) {
      return {
        shotId: shot.id,
        prompt: '',
        success: false,
        error: error.message,
      };
    }
  }
}

/**
 * 便捷函数：为单个分镜生成提示词
 */
export async function generateShotPrompt(
  projectId: string,
  episodeId: string,
  shot: Shot,
  stylePrefix?: string,
  llmConfigId?: string
): Promise<PromptGenerationResult> {
  const service = new ShotPromptService(projectId, episodeId);
  if (llmConfigId) {
    await service.setLLMConfig(llmConfigId);
  }
  return service.generateAndSaveShotPrompt(shot, stylePrefix);
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
