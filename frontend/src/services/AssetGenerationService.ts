/**
 * 资产图片生成服务
 * 使用 TTI 生成角色定妆照、场景图、道具图
 */
import { TaskManager, Task } from './TaskManager';
import { getActiveTTIConfig } from '../store/globalStore';
import { saveCharacters, saveScenes, saveProps, loadCharacters, loadScenes, loadProps } from '../store/projectStore';
import type { Character, Scene, Prop, TTIModelConfig, ProgressInfo } from '../types';
import { createTTIProvider, TTIProvider } from '../providers';
import { getStorageConfig, initStorageConfig } from '../store/storageConfig';
import { electronService } from './electronService';

// 轮询配置
const POLL_INTERVAL = 3000; // 3秒
const MAX_POLL_TIME = 5 * 60 * 1000; // 最长5分钟

export class AssetGenerationService {
  private projectId: string;
  private ttiConfig: TTIModelConfig | null = null;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  /**
   * 设置 TTI 配置
   */
  async setTTIConfig(configId?: string): Promise<boolean> {
    this.ttiConfig = await getActiveTTIConfig(configId);
    return this.ttiConfig !== null;
  }

  /**
   * 生成角色定妆照
   */
  async generateCharacterImage(characterId: string, configId?: string): Promise<Task> {
    const characters = await loadCharacters(this.projectId);
    const character = characters.find(c => c.id === characterId);
    if (!character) {
      throw new Error('角色不存在');
    }

    const task = TaskManager.createTask({
      projectId: this.projectId,
      type: 'asset-generation',
      targetType: 'character',
      targetId: characterId,
      targetName: character.name,
    });

    TaskManager.updateTask(task.id, { status: 'running', progress: 0 });

    // 异步执行生成
    this.runCharacterGeneration(task.id, character, configId);

    return task;
  }

  /**
   * 生成场景参考图
   */
  async generateSceneImage(sceneId: string, configId?: string): Promise<Task> {
    const scenes = await loadScenes(this.projectId);
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) {
      throw new Error('场景不存在');
    }

    const task = TaskManager.createTask({
      projectId: this.projectId,
      type: 'asset-generation',
      targetType: 'scene',
      targetId: sceneId,
      targetName: scene.name,
    });

    TaskManager.updateTask(task.id, { status: 'running', progress: 0 });

    this.runSceneGeneration(task.id, scene, configId);

    return task;
  }

  /**
   * 生成道具参考图
   */
  async generatePropImage(propId: string, configId?: string): Promise<Task> {
    const props = await loadProps(this.projectId);
    const prop = props.find(p => p.id === propId);
    if (!prop) {
      throw new Error('道具不存在');
    }

    const task = TaskManager.createTask({
      projectId: this.projectId,
      type: 'asset-generation',
      targetType: 'prop',
      targetId: propId,
      targetName: prop.name,
    });

    TaskManager.updateTask(task.id, { status: 'running', progress: 0 });

    this.runPropGeneration(task.id, prop, configId);

    return task;
  }

  /**
   * 执行角色图片生成
   */
  private async runCharacterGeneration(taskId: string, character: Character, configId?: string): Promise<void> {
    try {
      console.log('[AssetGen] ========== 开始生成角色图片 ==========');
      console.log('[AssetGen] Character:', character.id, character.name);

      const hasConfig = await this.setTTIConfig(configId);
      if (!hasConfig) {
        throw new Error('未配置 TTI 模型，请先在设置中添加');
      }
      console.log('[AssetGen] TTI Config:', this.ttiConfig?.name, this.ttiConfig?.provider);

      TaskManager.updateTask(taskId, { progress: 10 });

      // 构建提示词
      const prompt = this.buildCharacterPrompt(character);
      console.log('[AssetGen] Prompt:', prompt);

      TaskManager.updateTask(taskId, { progress: 20 });

      // 调用 TTI 生成（带进度回调）
      console.log('[AssetGen] 调用 TTI API...');
      const imageUrl = await this.callTTI(prompt, (ttiProgress) => {
        // TTI 进度映射到 20-70 区间
        const mappedProgress = 20 + Math.floor(ttiProgress * 0.5);
        TaskManager.updateTask(taskId, { progress: mappedProgress });
      });
      console.log('[AssetGen] TTI 返回图片 URL:', imageUrl);

      TaskManager.updateTask(taskId, { progress: 75 });

      // 保存图片到本地
      console.log('[AssetGen] 开始保存图片...');
      const imagePath = await this.saveImage(imageUrl, 'characters', character.id);
      console.log('[AssetGen] 图片已保存到:', imagePath);

      TaskManager.updateTask(taskId, { progress: 90 });

      // 更新角色记录
      const characters = await loadCharacters(this.projectId);
      const updatedChars = characters.map(c =>
        c.id === character.id ? { ...c, costumePhotoPath: imagePath } : c
      );
      await saveCharacters(this.projectId, updatedChars);
      console.log('[AssetGen] 角色记录已更新');

      TaskManager.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        result: { imagePath },
      });
      console.log('[AssetGen] ========== 角色图片生成完成 ==========');
    } catch (error: any) {
      console.error('[AssetGen] 生成失败:', error);
      TaskManager.updateTask(taskId, {
        status: 'failed',
        error: error.message || '生成失败',
      });
    }
  }

  /**
   * 执行场景图片生成
   */
  private async runSceneGeneration(taskId: string, scene: Scene, configId?: string): Promise<void> {
    try {
      const hasConfig = await this.setTTIConfig(configId);
      if (!hasConfig) {
        throw new Error('未配置 TTI 模型，请先在设置中添加');
      }

      TaskManager.updateTask(taskId, { progress: 10 });

      const prompt = this.buildScenePrompt(scene);
      console.log('[AssetGen] Scene prompt:', prompt);

      TaskManager.updateTask(taskId, { progress: 20 });

      const imageUrl = await this.callTTI(prompt, (ttiProgress) => {
        const mappedProgress = 20 + Math.floor(ttiProgress * 0.5);
        TaskManager.updateTask(taskId, { progress: mappedProgress });
      });
      console.log('[AssetGen] Got image URL:', imageUrl);

      TaskManager.updateTask(taskId, { progress: 75 });

      const imagePath = await this.saveImage(imageUrl, 'scenes', scene.id);
      console.log('[AssetGen] Saved to:', imagePath);

      TaskManager.updateTask(taskId, { progress: 90 });

      const scenes = await loadScenes(this.projectId);
      const updatedScenes = scenes.map(s =>
        s.id === scene.id ? { ...s, imagePath } : s
      );
      await saveScenes(this.projectId, updatedScenes);

      TaskManager.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        result: { imagePath },
      });
    } catch (error: any) {
      console.error('[AssetGen] Error:', error);
      TaskManager.updateTask(taskId, {
        status: 'failed',
        error: error.message || '生成失败',
      });
    }
  }

  /**
   * 执行道具图片生成
   */
  private async runPropGeneration(taskId: string, prop: Prop, configId?: string): Promise<void> {
    try {
      const hasConfig = await this.setTTIConfig(configId);
      if (!hasConfig) {
        throw new Error('未配置 TTI 模型，请先在设置中添加');
      }

      TaskManager.updateTask(taskId, { progress: 10 });

      const prompt = this.buildPropPrompt(prop);
      console.log('[AssetGen] Prop prompt:', prompt);

      TaskManager.updateTask(taskId, { progress: 20 });

      const imageUrl = await this.callTTI(prompt, (ttiProgress) => {
        const mappedProgress = 20 + Math.floor(ttiProgress * 0.5);
        TaskManager.updateTask(taskId, { progress: mappedProgress });
      });
      console.log('[AssetGen] Got image URL:', imageUrl);

      TaskManager.updateTask(taskId, { progress: 75 });

      const imagePath = await this.saveImage(imageUrl, 'props', prop.id);
      console.log('[AssetGen] Saved to:', imagePath);

      TaskManager.updateTask(taskId, { progress: 90 });

      const props = await loadProps(this.projectId);
      const updatedProps = props.map(p =>
        p.id === prop.id ? { ...p, imagePath } : p
      );
      await saveProps(this.projectId, updatedProps);

      TaskManager.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        result: { imagePath },
      });
    } catch (error: any) {
      console.error('[AssetGen] Error:', error);
      TaskManager.updateTask(taskId, {
        status: 'failed',
        error: error.message || '生成失败',
      });
    }
  }

  /**
   * 构建角色提示词
   */
  private buildCharacterPrompt(character: Character): string {
    return `Portrait photo of ${character.appearance}, professional lighting, studio background, high quality, 4k, detailed face`;
  }

  /**
   * 构建场景提示词
   */
  private buildScenePrompt(scene: Scene): string {
    const timeOfDay = scene.time === 'day' ? 'daytime' : scene.time === 'night' ? 'nighttime' : 'dusk';
    return `${scene.description}, ${timeOfDay}, ${scene.mood} atmosphere, cinematic, wide shot, high quality, 4k`;
  }

  /**
   * 构建道具提示词
   */
  private buildPropPrompt(prop: Prop): string {
    return `${prop.description}, product photography, clean background, professional lighting, high quality, 4k`;
  }

  /**
   * 调用 TTI API
   * 处理同步和异步两种模式
   */
  private async callTTI(prompt: string, onProgress?: (progress: number) => void): Promise<string> {
    if (!this.ttiConfig) {
      throw new Error('TTI 配置未设置');
    }

    const provider = createTTIProvider(this.ttiConfig);
    const result = await provider.generateImage(prompt);

    // 如果返回的是 ImageResult 对象（同步模式）
    if (typeof result === 'object' && result.path) {
      return result.path;
    }

    // 如果返回的是 taskId（异步模式），需要轮询
    if (typeof result === 'string' && provider.checkProgress) {
      return await this.pollTaskProgress(provider, result, onProgress);
    }

    throw new Error('TTI Provider 返回了无效结果');
  }

  /**
   * 轮询异步任务进度
   */
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

      // 报告进度
      if (onProgress && progressInfo.progress) {
        onProgress(progressInfo.progress);
      }

      // 等待后继续轮询
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }

    throw new Error('图片生成超时');
  }

  /**
   * 保存图片到本地
   */
  private async saveImage(imageUrl: string, type: string, assetId: string): Promise<string> {
    console.log('[AssetGen:saveImage] ========== 开始保存图片 ==========');
    console.log('[AssetGen:saveImage] imageUrl:', imageUrl);
    console.log('[AssetGen:saveImage] type:', type, 'assetId:', assetId);

    if (!electronService.isElectron()) {
      console.log('[AssetGen:saveImage] 非 Electron 环境，直接返回 URL');
      return imageUrl;
    }

    const config = getStorageConfig() || (await initStorageConfig());
    console.log('[AssetGen:saveImage] Storage rootPath:', config.rootPath);

    const assetDir = `${config.rootPath}/projects/${this.projectId}/assets/${type}/${assetId}`;
    console.log('[AssetGen:saveImage] 目标目录:', assetDir);

    // 确保目录存在
    await electronService.fs.mkdir(assetDir);
    console.log('[AssetGen:saveImage] 目录已创建');

    // 保存到本地
    const filename = `${Date.now()}.png`;
    const filePath = `${assetDir}/${filename}`;
    console.log('[AssetGen:saveImage] 保存路径:', filePath);

    // 使用主进程下载（绕过 CORS）
    console.log('[AssetGen:saveImage] 调用主进程下载...');
    const result = await electronService.fs.downloadFile(imageUrl, filePath);
    console.log('[AssetGen:saveImage] 下载结果:', result);

    // 验证文件是否存在
    const exists = await electronService.fs.exists(filePath);
    console.log('[AssetGen:saveImage] 文件存在检查:', exists);

    console.log('[AssetGen:saveImage] ========== 保存完成 ==========');
    return filePath;
  }
}

/**
 * 便捷函数：生成角色定妆照
 */
export async function generateCharacterImage(
  projectId: string,
  characterId: string,
  configId?: string
): Promise<Task> {
  const service = new AssetGenerationService(projectId);
  return service.generateCharacterImage(characterId, configId);
}

/**
 * 便捷函数：生成场景参考图
 */
export async function generateSceneImage(
  projectId: string,
  sceneId: string,
  configId?: string
): Promise<Task> {
  const service = new AssetGenerationService(projectId);
  return service.generateSceneImage(sceneId, configId);
}

/**
 * 便捷函数：生成道具参考图
 */
export async function generatePropImage(
  projectId: string,
  propId: string,
  configId?: string
): Promise<Task> {
  const service = new AssetGenerationService(projectId);
  return service.generatePropImage(propId, configId);
}
