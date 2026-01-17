/**
 * 分镜图片生成服务
 * 使用 TTI 生成分镜预览图
 */
import { TaskManager, Task } from './TaskManager';
import { getActiveTTIConfig } from '../store/globalStore';
import { loadShots, saveShots } from '../store/projectStore';
import type { Shot, TTIModelConfig, Character, Scene } from '../types';
import { createTTIProvider, TTIProvider } from '../providers';
import { getStorageConfig, initStorageConfig } from '../store/storageConfig';
import { electronService } from './electronService';

const POLL_INTERVAL = 3000;
const MAX_POLL_TIME = 5 * 60 * 1000;

export class ShotGenerationService {
  private projectId: string;
  private ttiConfig: TTIModelConfig | null = null;

  constructor(projectId: string) {
    this.projectId = projectId;
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
    const shots = await loadShots(this.projectId);
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
      console.log('[ShotGen] 开始生成分镜图片:', shot.id);

      const hasConfig = await this.setTTIConfig(configId);
      if (!hasConfig) {
        throw new Error('未配置 TTI 模型，请先在设置中添加');
      }
      console.log('[ShotGen] TTI Config:', this.ttiConfig?.name);

      TaskManager.updateTask(taskId, { progress: 10 });

      // 构建提示词
      const prompt = this.buildShotPrompt(shot, characters, scenes);
      console.log('[ShotGen] Prompt:', prompt);

      TaskManager.updateTask(taskId, { progress: 20 });

      // 调用 TTI 生成
      console.log('[ShotGen] 调用 TTI API...');
      const imageUrl = await this.callTTI(prompt, (ttiProgress) => {
        const mappedProgress = 20 + Math.floor(ttiProgress * 0.5);
        TaskManager.updateTask(taskId, { progress: mappedProgress });
      });
      console.log('[ShotGen] TTI 返回图片 URL:', imageUrl);

      TaskManager.updateTask(taskId, { progress: 75 });

      // 保存图片到本地
      console.log('[ShotGen] 开始保存图片...');
      const imagePath = await this.saveImage(imageUrl, shot.id);
      console.log('[ShotGen] 图片已保存到:', imagePath);

      TaskManager.updateTask(taskId, { progress: 90 });

      // 更新分镜记录
      const shots = await loadShots(this.projectId);
      const updatedShots = shots.map(s =>
        s.id === shot.id ? { ...s, imagePath } : s
      );
      await saveShots(this.projectId, updatedShots);
      console.log('[ShotGen] 分镜记录已更新');

      TaskManager.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        result: { imagePath },
      });
      console.log('[ShotGen] 分镜图片生成完成');
    } catch (error: any) {
      console.error('[ShotGen] 生成失败:', error);
      TaskManager.updateTask(taskId, {
        status: 'failed',
        error: error.message || '生成失败',
      });
    }
  }

  /**
   * 构建分镜提示词
   */
  private buildShotPrompt(shot: Shot, characters: Character[], scenes: Scene[]): string {
    const parts: string[] = [];

    // 基础描述
    if (shot.description) {
      parts.push(shot.description);
    }

    // 添加角色外观信息
    if (shot.characters && shot.characters.length > 0) {
      const charDescriptions = shot.characters
        .map(charId => {
          const char = characters.find(c => c.id === charId);
          return char ? char.appearance || char.name : null;
        })
        .filter(Boolean);
      if (charDescriptions.length > 0) {
        parts.push(`featuring ${charDescriptions.join(' and ')}`);
      }
    }

    // 景别
    const shotTypeMap: Record<string, string> = {
      'close-up': 'close-up shot',
      'medium': 'medium shot',
      'wide': 'wide shot',
      'extreme-wide': 'extreme wide shot',
    };
    parts.push(shotTypeMap[shot.shotType] || 'medium shot');

    // 运镜
    const cameraMap: Record<string, string> = {
      'static': 'static camera',
      'pan': 'camera panning',
      'zoom-in': 'camera zooming in',
      'tracking': 'tracking shot',
      'handheld': 'handheld camera',
    };
    if (shot.cameraMovement && shot.cameraMovement !== 'static') {
      parts.push(cameraMap[shot.cameraMovement]);
    }

    // 情绪
    if (shot.emotion) {
      parts.push(`${shot.emotion} mood`);
    }

    // 添加通用质量词
    parts.push('cinematic lighting, high quality, 4k, detailed');

    return parts.join(', ');
  }

  private async callTTI(prompt: string, onProgress?: (progress: number) => void): Promise<string> {
    if (!this.ttiConfig) {
      throw new Error('TTI 配置未设置');
    }

    const provider = createTTIProvider(this.ttiConfig);
    const result = await provider.generateImage(prompt);

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
      console.log('[TTI Poll]', taskId, progressInfo);

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
    console.log('[ShotGen:saveImage] imageUrl:', imageUrl, 'shotId:', shotId);

    if (!electronService.isElectron()) {
      return imageUrl;
    }

    const config = getStorageConfig() || (await initStorageConfig());
    const assetDir = `${config.rootPath}/projects/${this.projectId}/assets/shots/${shotId}`;

    await electronService.fs.mkdir(assetDir);

    const filename = `${Date.now()}.png`;
    const filePath = `${assetDir}/${filename}`;

    const result = await electronService.fs.downloadFile(imageUrl, filePath);
    console.log('[ShotGen:saveImage] 下载结果:', result);

    return filePath;
  }
}

/**
 * 便捷函数：生成分镜图片
 */
export async function generateShotImage(
  projectId: string,
  shotId: string,
  characters: Character[],
  scenes: Scene[],
  configId?: string
): Promise<Task> {
  const service = new ShotGenerationService(projectId);
  return service.generateShotImage(shotId, characters, scenes, configId);
}

/**
 * 便捷函数：批量生成分镜图片
 */
export async function batchGenerateShotImages(
  projectId: string,
  shotIds: string[],
  characters: Character[],
  scenes: Scene[],
  configId?: string
): Promise<Task[]> {
  const service = new ShotGenerationService(projectId);
  return service.batchGenerateShotImages(shotIds, characters, scenes, configId);
}
