/**
 * 分镜图片生成服务
 * 使用 TTI 生成分镜预览图
 */
import { TaskManager, Task } from './TaskManager';
import { getActiveTTIConfig } from '../store/globalStore';
import { loadEpisodeShots, saveEpisodeShots, loadProps } from '../store/projectStore';
import type { Shot, TTIModelConfig, Character, Scene, Prop } from '../types';
import { createTTIProvider, TTIProvider } from '../providers';
import { getStorageConfig, initStorageConfig } from '../store/storageConfig';
import { electronService } from './electronService';
import { getThemeStylePrefix } from '../config/themePresets';
import { logTTICall } from '../store/aiCallLogger';
import { parseMentions } from '../editor/mentionTypes';
import { createLogger } from '../store/logger';
import { extractErrorMessage } from '../utils/errorHandler';
import { resolvePromptTemplate } from '../store/promptTemplates';

const logger = createLogger('ShotGen');

const POLL_INTERVAL = 3000;
const MAX_POLL_TIME = 5 * 60 * 1000;

interface StyleSnapshotLike {
  ttiStylePrefix?: string;
  llmPromptSuffix?: string;
}

export class ShotGenerationService {
  private projectId: string;
  private episodeId: string;
  private ttiConfig: TTIModelConfig | null = null;
  private theme?: string;
  private stylePrompt?: string;
  private styleSnapshot?: StyleSnapshotLike;

  constructor(
    projectId: string,
    episodeId: string,
    options?: {
      theme?: string;
      stylePrompt?: string;
      styleSnapshot?: StyleSnapshotLike;
      project?: { styleSnapshot?: StyleSnapshotLike };
    }
  ) {
    this.projectId = projectId;
    this.episodeId = episodeId;
    this.theme = options?.theme;
    this.stylePrompt = options?.stylePrompt;
    this.styleSnapshot = options?.styleSnapshot || options?.project?.styleSnapshot;
  }

  async setTTIConfig(configId?: string): Promise<boolean> {
    this.ttiConfig = await getActiveTTIConfig(configId);
    return this.ttiConfig !== null;
  }

  /**
   * 生成分镜预览图
   */
  async generateShotImage(
    shotId: string,
    characters: Character[],
    scenes: Scene[],
    configId?: string
  ): Promise<Task> {
    const shots = await loadEpisodeShots(this.projectId, this.episodeId);
    const shot = shots.find(s => s.id === shotId);
    if (!shot) {
      throw new Error('分镜不存在');
    }

    const task = TaskManager.createTask({
      projectId: this.projectId,
      type: 'shot-generation',
      targetType: 'shot',
      targetId: shotId,
      targetName: `分镜 ${shot.scriptContent?.slice(0, 20)}...`,
    });

    TaskManager.updateTask(task.id, { status: 'running', progress: 0 });

    this.runShotGeneration(task.id, shot, characters, scenes, configId);

    return task;
  }

  /**
   * 批量生成分镜图片
   */
  async batchGenerateShotImages(
    shotIds: string[],
    characters: Character[],
    scenes: Scene[],
    configId?: string
  ): Promise<Task[]> {
    const tasks: Task[] = [];
    for (const shotId of shotIds) {
      const task = await this.generateShotImage(shotId, characters, scenes, configId);
      tasks.push(task);
    }
    return tasks;
  }

  private async runShotGeneration(
    taskId: string,
    shot: Shot,
    characters: Character[],
    scenes: Scene[],
    configId?: string
  ): Promise<void> {
    try {

      const hasConfig = await this.setTTIConfig(configId);
      if (!hasConfig) {
        throw new Error('未配置 TTI 模型，请先在设置中添加');
      }

      TaskManager.updateTask(taskId, { progress: 10 });

      // 加载道具列表
      const props = await loadProps(this.projectId);

      // 构建提示词，收集参考图 URL
      const { prompt, referenceImages, templateId, promptSource } = await this.buildShotPrompt(shot, characters, scenes, props);

      // 打印完整提示词日志
      logTTICall(
        this.ttiConfig?.name || 'TTI',
        prompt,
        { width: 1280, height: 720, referenceImages },
        {
          projectId: this.projectId,
          targetId: shot.id,
          targetName: `分镜: ${shot.id}`,
          templateId,
          promptSource,
        }
      );

      TaskManager.updateTask(taskId, { progress: 20 });

      // 调用 TTI 生成（传递参考图）
      const imageUrl = await this.callTTI(prompt, referenceImages, (ttiProgress) => {
        const mappedProgress = 20 + Math.floor(ttiProgress * 0.5);
        TaskManager.updateTask(taskId, { progress: mappedProgress });
      });

      TaskManager.updateTask(taskId, { progress: 75 });

      // 保存图片到本地
      const imagePath = await this.saveImage(imageUrl, shot.id);

      TaskManager.updateTask(taskId, { progress: 90 });

      // 更新分镜记录（同时保存远程URL和本地路径）
      const shots = await loadEpisodeShots(this.projectId, this.episodeId);
      const updatedShots = shots.map(s => {
        if (s.id !== shot.id) return s;
        // 将新图片添加到 imagePaths 列表（使用本地路径），同时保存远程 URL
        const existingPaths = s.imagePaths || [];
        const newImagePaths = [...existingPaths, imagePath]; // 使用本地路径
        return {
          ...s,
          imagePath,
          imageUrl, // 保存远程URL
          imagePaths: newImagePaths,
          currentImageIndex: newImagePaths.length - 1, // 选中新生成的图片
        };
      });
      await saveEpisodeShots(this.projectId, this.episodeId, updatedShots);

      TaskManager.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        result: { imagePath },
      });
    } catch (error: unknown) {
      logger.error('生成失败', error);
      TaskManager.updateTask(taskId, {
        status: 'failed',
        error: extractErrorMessage(error),
      });
    }
  }

  /**
   * 构建分镜提示词
   * 优先使用 imagePrompt，回退到 description
   * 收集资源 URL 并替换 @mentions 为资源描述
   */
  private async buildShotPrompt(
    shot: Shot,
    characters: Character[],
    scenes: Scene[],
    props?: Prop[]
  ): Promise<{
    prompt: string;
    referenceImages: string[];
    templateId: string;
    promptSource: 'default' | 'custom' | 'finalized';
  }> {
    const referenceImages: string[] = [];

    // 收集关联资产的远程 URL
    for (const charId of shot.characters || []) {
      const char = characters.find(c => c.id === charId);
      if (char?.costumePhotoUrl) {
        referenceImages.push(char.costumePhotoUrl);
      }
    }
    for (const sceneId of shot.scenes || []) {
      const scene = scenes.find(s => s.id === sceneId);
      if (scene?.imageUrl) {
        referenceImages.push(scene.imageUrl);
      }
    }
    for (const propId of shot.props || []) {
      const prop = props?.find(p => p.id === propId);
      if (prop?.imageUrl) {
        referenceImages.push(prop.imageUrl);
      }
    }

    // 优先使用专用图片提示词
    if (shot.imagePrompt) {
      let prompt = shot.imagePrompt;

      // 替换 @mentions 为资源描述
      prompt = this.replaceMentionsWithDescriptions(prompt, characters, scenes, props);
      return {
        prompt,
        referenceImages,
        templateId: 'shot.imagePrompt',
        promptSource: 'finalized',
      };
    }

    const stylePrefix = this.getResolvedTTIStylePrefix();
    const descriptionParts: string[] = [];
    if (shot.description) {
      descriptionParts.push(shot.description);
    }
    if (shot.characters && shot.characters.length > 0) {
      const charDescriptions = shot.characters
        .map(charId => {
          const char = characters.find(c => c.id === charId);
          return char ? char.appearance || char.name : null;
        })
        .filter(Boolean);
      if (charDescriptions.length > 0) {
        descriptionParts.push(`featuring ${charDescriptions.join(' and ')}`);
      }
    }

    const shotTypeMap: Record<string, string> = {
      'close-up': 'close-up shot',
      'medium': 'medium shot',
      'wide': 'wide shot',
      'extreme-wide': 'extreme wide shot',
    };
    const cameraMap: Record<string, string> = {
      'static': 'static camera',
      'pan': 'camera panning',
      'zoom-in': 'camera zooming in',
      'tracking': 'tracking shot',
      'handheld': 'handheld camera',
    };
    if (shot.cameraMovement && shot.cameraMovement !== 'static') {
      descriptionParts.push(cameraMap[shot.cameraMovement]);
    }
    if (shot.emotion) {
      descriptionParts.push(`${shot.emotion} mood`);
    }

    const resolved = await resolvePromptTemplate('tti_shot_image', {
      stylePrefix,
      description: descriptionParts.join(', '),
      shotType: shotTypeMap[shot.shotType] || 'medium shot',
      emotion: shot.emotion || 'neutral',
    });

    return {
      prompt: resolved.prompt,
      referenceImages,
      templateId: resolved.template.id,
      promptSource: resolved.source,
    };
  }

  private getResolvedTTIStylePrefix(): string {
    return this.styleSnapshot?.ttiStylePrefix || getThemeStylePrefix(this.theme, this.stylePrompt);
  }

  /**
   * 替换提示词中的 @mentions 为资源描述
   * 格式: @char_xxx -> [角色名: 角色描述]
   */
  private replaceMentionsWithDescriptions(
    prompt: string,
    characters: Character[],
    scenes: Scene[],
    props?: Prop[]
  ): string {
    const mentions = parseMentions(prompt);
    let result = prompt;

    // 按位置倒序替换，避免位置偏移
    const sortedMentions = [...mentions].sort((a, b) => b.from - a.from);

    for (const mention of sortedMentions) {
      let replacement = '';

      if (mention.type === 'char') {
        const char = characters.find(
          c => c.id === mention.id || c.sora2CharacterId === mention.id
        );
        if (char) {
          replacement = `[${char.name}: ${char.prompt || char.description || char.appearance || ''}]`;
        }
      } else if (mention.type === 'scene') {
        const scene = scenes.find(s => s.id === mention.id);
        if (scene) {
          replacement = `[${scene.name}: ${scene.prompt || scene.description || ''}]`;
        }
      } else if (mention.type === 'prop') {
        const prop = props?.find(
          p => p.id === mention.id || p.sora2PropId === mention.id
        );
        if (prop) {
          replacement = `[${prop.name}: ${prop.prompt || prop.description || ''}]`;
        }
      }

      if (replacement) {
        result = result.slice(0, mention.from) + replacement + result.slice(mention.to);
      }
    }

    return result;
  }

  private async callTTI(
    prompt: string,
    referenceImages?: string[],
    onProgress?: (progress: number) => void
  ): Promise<string> {
    if (!this.ttiConfig) {
      throw new Error('TTI 配置未设置');
    }

    const provider = createTTIProvider(this.ttiConfig);

    // 构建生成选项，包含参考图
    const options = referenceImages?.length ? { referenceImages } : undefined;
    const result = await provider.generateImage(prompt, options);

    if (typeof result === 'object' && result.path) {
      return result.path;
    }

    if (typeof result === 'string' && provider.checkProgress) {
      return await this.pollTaskProgress(provider, result, onProgress);
    }

    throw new Error('TTI Provider 返回了无效结果');
  }

  private async pollTaskProgress(
    provider: TTIProvider,
    taskId: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_POLL_TIME) {
      const progressInfo = await provider.checkProgress!(taskId);

      if (progressInfo.status === 'completed' && progressInfo.resultUrl) {
        return progressInfo.resultUrl;
      }

      if (progressInfo.status === 'failed') {
        throw new Error(progressInfo.error || '图片生成失败');
      }

      if (onProgress && progressInfo.progress) {
        onProgress(progressInfo.progress);
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }

    throw new Error('图片生成超时');
  }

  private async saveImage(imageUrl: string, shotId: string): Promise<string> {

    if (!electronService.isElectron()) {
      return imageUrl;
    }

    const config = getStorageConfig() || (await initStorageConfig());
    const assetDir = `${config.rootPath}/projects/${this.projectId}/assets/shots/${shotId}`;

    await electronService.fs.mkdir(assetDir);

    const filename = `${Date.now()}.png`;
    const filePath = `${assetDir}/${filename}`;

    if (imageUrl.startsWith('data:')) {
      // data URL 模式（base64）：直接写入文件
      const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');
      await electronService.fs.writeFile(filePath, base64Data, true);
    } else {
      await electronService.fs.downloadFile(imageUrl, filePath);
    }

    return filePath;
  }
}

/**
 * 便捷函数：生成分镜图片
 */
export async function generateShotImage(
  projectId: string,
  episodeId: string,
  shotId: string,
  characters: Character[],
  scenes: Scene[],
  configId?: string,
  styleOptions?: {
    theme?: string;
    stylePrompt?: string;
    styleSnapshot?: StyleSnapshotLike;
    project?: { styleSnapshot?: StyleSnapshotLike };
  }
): Promise<Task> {
  const service = new ShotGenerationService(projectId, episodeId, styleOptions);
  return service.generateShotImage(shotId, characters, scenes, configId);
}

/**
 * 便捷函数：批量生成分镜图片
 */
export async function batchGenerateShotImages(
  projectId: string,
  episodeId: string,
  shotIds: string[],
  characters: Character[],
  scenes: Scene[],
  configId?: string,
  styleOptions?: {
    theme?: string;
    stylePrompt?: string;
    styleSnapshot?: StyleSnapshotLike;
    project?: { styleSnapshot?: StyleSnapshotLike };
  }
): Promise<Task[]> {
  const service = new ShotGenerationService(projectId, episodeId, styleOptions);
  return service.batchGenerateShotImages(shotIds, characters, scenes, configId);
}
