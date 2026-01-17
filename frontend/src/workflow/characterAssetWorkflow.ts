/**
 * 角色资产生成工作流
 * 生成角色定妆照、三视图、预览视频，以及调用角色提取API
 */
import type { Character, AsyncTask } from '../types';
import { getProjectTTIProvider, getProjectITVProvider } from '../providers';
import { createTask, updateTask, markTaskCompleted, markTaskFailed } from '../store/taskQueueStore';
import { pollTaskUntilComplete, registerProgressChecker } from '../store/taskRecoveryService';
import { downloadRemoteAsset } from '../store/assetDownloadService';
import {
  saveCharacterCostumePhoto,
  saveCharacterThreeView,
  saveCharacterPreviewVideo,
  saveCharacters,
  loadCharacters,
} from '../store/projectStore';
import { getStorageConfig, initStorageConfig } from '../store/storageConfig';
import { getThemeStylePrefix } from '../config/themePresets';
import { createLogger } from '../store/logger';

const logger = createLogger('CharacterAsset');

interface GenerateOptions {
  projectId: string;
  character: Character;
  theme?: string;
  stylePrompt?: string;
  ttiConfigId?: string;
  itvConfigId?: string;
  onProgress?: (progress: number, step: string) => void;
}

/**
 * 生成角色定妆照
 */
export async function generateCostumePhoto(
  options: GenerateOptions
): Promise<{ success: boolean; path?: string; error?: string }> {
  const { projectId, character, theme, stylePrompt, ttiConfigId, onProgress } = options;

  logger.info(`开始生成角色定妆照: ${character.name}`);
  onProgress?.(0, '准备生成定妆照...');

  try {
    const ttiProvider = await getProjectTTIProvider(ttiConfigId);
    if (!ttiProvider) {
      throw new Error('未配置 TTI 服务');
    }

    // 构建提示词
    const stylePrefix = getThemeStylePrefix(theme, stylePrompt);
    const prompt = buildCostumePhotoPrompt(character, stylePrefix);

    // 创建任务记录
    const task = await createTask(projectId, {
      projectId,
      type: 'tti',
      targetType: 'character',
      targetId: character.id,
      targetName: `${character.name} 定妆照`,
      remoteTaskId: '',
      status: 'pending',
      progress: 0,
      maxRetries: 3,
    });

    onProgress?.(10, '调用 TTI 服务...');

    // 调用 TTI Provider
    const result = await ttiProvider.generateImage(prompt, {
      width: 1024,
      height: 1536, // 竖版全身照
    });

    // 处理异步任务模式
    if (typeof result === 'string') {
      // 异步模式，更新任务ID并轮询
      await updateTask(projectId, task.id, { remoteTaskId: result, status: 'processing' });

      if (ttiProvider.checkProgress) {
        const success = await pollTaskUntilComplete(
          projectId,
          { ...task, remoteTaskId: result },
          ttiProvider.checkProgress.bind(ttiProvider),
          {
            onTaskProgress: (_, progress) => onProgress?.(10 + progress * 0.8, `生成中 ${progress}%`),
            onTaskCompleted: async (completedTask, localPath) => {
              await updateCharacterAsset(projectId, character.id, { costumePhotoPath: localPath });
            },
          }
        );

        if (!success) {
          return { success: false, error: '生成失败' };
        }

        const updatedTask = await import('../store/taskQueueStore').then(m => m.getTask(projectId, task.id));
        return { success: true, path: updatedTask?.localPath };
      }
    } else {
      // 同步模式，直接保存
      onProgress?.(90, '保存定妆照...');
      const localPath = await saveCharacterCostumePhoto(projectId, character.id, result.path);
      await markTaskCompleted(projectId, task.id, result.path, localPath);
      await updateCharacterAsset(projectId, character.id, { costumePhotoPath: localPath });

      onProgress?.(100, '完成');
      return { success: true, path: localPath };
    }

    return { success: false, error: '未知错误' };
  } catch (err: any) {
    logger.error(`生成定妆照失败: ${character.name}`, { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * 生成角色三视图
 */
export async function generateThreeView(
  options: GenerateOptions
): Promise<{ success: boolean; paths?: { front?: string; side?: string; back?: string }; error?: string }> {
  const { projectId, character, theme, stylePrompt, ttiConfigId, onProgress } = options;

  logger.info(`开始生成角色三视图: ${character.name}`);
  const paths: { front?: string; side?: string; back?: string } = {};

  const views: Array<{ view: 'front' | 'side' | 'back'; label: string }> = [
    { view: 'front', label: '正面' },
    { view: 'side', label: '侧面' },
    { view: 'back', label: '背面' },
  ];

  try {
    const ttiProvider = await getProjectTTIProvider(ttiConfigId);
    if (!ttiProvider) {
      throw new Error('未配置 TTI 服务');
    }

    const stylePrefix = getThemeStylePrefix(theme, stylePrompt);

    for (let i = 0; i < views.length; i++) {
      const { view, label } = views[i];
      const baseProgress = (i / views.length) * 100;

      onProgress?.(baseProgress, `生成${label}视图...`);

      const prompt = buildThreeViewPrompt(character, view, stylePrefix);

      const result = await ttiProvider.generateImage(prompt, {
        width: 1024,
        height: 1536,
      });

      if (typeof result === 'string' && ttiProvider.checkProgress) {
        // 异步模式，轮询等待
        let progress = await ttiProvider.checkProgress(result);
        while (progress.status === 'queued' || progress.status === 'processing') {
          await sleep(3000);
          progress = await ttiProvider.checkProgress(result);
          onProgress?.(baseProgress + (progress.progress / views.length), `${label}视图 ${progress.progress}%`);
        }

        if (progress.status === 'completed' && progress.resultUrl) {
          const config = getStorageConfig() || (await initStorageConfig());
          const localPath = `${config.rootPath}/projects/${projectId}/assets/characters/${character.id}/three-view/${view}.png`;
          const downloadResult = await downloadRemoteAsset(progress.resultUrl, localPath);
          if (downloadResult.success) {
            paths[view] = downloadResult.localPath;
          }
        }
      } else if (typeof result !== 'string') {
        // 同步模式
        const localPath = await saveCharacterThreeView(projectId, character.id, view, result.path);
        paths[view] = localPath;
      }
    }

    // 更新角色数据
    await updateCharacterAsset(projectId, character.id, { threeViewPaths: paths });

    onProgress?.(100, '完成');
    return { success: true, paths };
  } catch (err: any) {
    logger.error(`生成三视图失败: ${character.name}`, { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * 生成角色预览视频
 */
export async function generateCharacterPreviewVideo(
  options: GenerateOptions
): Promise<{ success: boolean; path?: string; error?: string }> {
  const { projectId, character, itvConfigId, onProgress } = options;

  logger.info(`开始生成角色预览视频: ${character.name}`);
  onProgress?.(0, '准备生成预览视频...');

  // 需要先有定妆照
  if (!character.costumePhotoPath) {
    return { success: false, error: '请先生成定妆照' };
  }

  try {
    const itvProvider = await getProjectITVProvider(itvConfigId);
    if (!itvProvider) {
      throw new Error('未配置 ITV 服务');
    }

    // 创建任务记录
    const task = await createTask(projectId, {
      projectId,
      type: 'itv',
      targetType: 'character',
      targetId: character.id,
      targetName: `${character.name} 预览视频`,
      remoteTaskId: '',
      status: 'pending',
      progress: 0,
      maxRetries: 3,
    });

    onProgress?.(10, '调用 ITV 服务...');

    // 调用 ITV Provider
    const prompt = `${character.name} character introduction, gentle movement, looking at camera`;
    const taskId = await itvProvider.generate(character.costumePhotoPath, prompt, {
      duration: 4,
      aspectRatio: '9:16',
    });

    if (typeof taskId === 'string' && itvProvider.checkProgress) {
      await updateTask(projectId, task.id, { remoteTaskId: taskId, status: 'processing' });

      // 轮询等待完成
      let progress = await itvProvider.checkProgress(taskId);
      while (progress.status === 'queued' || progress.status === 'processing') {
        await sleep(3000);
        progress = await itvProvider.checkProgress(taskId);
        onProgress?.(10 + progress.progress * 0.8, `生成中 ${progress.progress}%`);
      }

      if (progress.status === 'completed' && progress.resultUrl) {
        onProgress?.(90, '下载视频...');
        const config = getStorageConfig() || (await initStorageConfig());
        const localPath = `${config.rootPath}/projects/${projectId}/assets/characters/${character.id}/preview.mp4`;
        const downloadResult = await downloadRemoteAsset(progress.resultUrl, localPath);

        if (downloadResult.success && downloadResult.localPath) {
          await markTaskCompleted(projectId, task.id, progress.resultUrl, downloadResult.localPath);
          await updateCharacterAsset(projectId, character.id, { previewVideoPath: downloadResult.localPath });
          onProgress?.(100, '完成');
          return { success: true, path: downloadResult.localPath };
        }
      }

      await markTaskFailed(projectId, task.id, progress.error || '生成失败');
      return { success: false, error: progress.error || '生成失败' };
    }

    return { success: false, error: 'ITV Provider 不支持异步任务' };
  } catch (err: any) {
    logger.error(`生成预览视频失败: ${character.name}`, { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * 调用角色提取API绑定角色
 */
export async function extractAndBindCharacter(
  projectId: string,
  character: Character,
  itvConfigId?: string
): Promise<{ success: boolean; characterId?: string; error?: string }> {
  logger.info(`开始提取角色: ${character.name}`);

  if (!character.previewVideoPath) {
    return { success: false, error: '请先生成预览视频' };
  }

  try {
    const itvProvider = await getProjectITVProvider(itvConfigId);
    if (!itvProvider) {
      throw new Error('未配置 ITV 服务');
    }

    // 检查是否支持角色提取
    if (!(itvProvider as any).extractCharacter) {
      return { success: false, error: 'ITV Provider 不支持角色提取' };
    }

    const sora2CharacterId = await (itvProvider as any).extractCharacter(character.previewVideoPath);
    await updateCharacterAsset(projectId, character.id, { sora2CharacterId });

    logger.info(`角色提取成功: ${character.name} -> ${sora2CharacterId}`);
    return { success: true, characterId: sora2CharacterId };
  } catch (err: any) {
    logger.error(`角色提取失败: ${character.name}`, { error: err.message });
    return { success: false, error: err.message };
  }
}

// ========== 辅助函数 ==========

function buildCostumePhotoPrompt(character: Character, stylePrefix: string): string {
  const parts = [
    stylePrefix,
    'full body character portrait',
    'standing pose',
    'front view',
    'white background',
    character.appearance,
    `${character.name} character design`,
  ];
  return parts.filter(Boolean).join(', ');
}

function buildThreeViewPrompt(
  character: Character,
  view: 'front' | 'side' | 'back',
  stylePrefix: string
): string {
  const viewDescriptions = {
    front: 'front view, facing camera',
    side: 'side view, profile',
    back: 'back view, from behind',
  };

  const parts = [
    stylePrefix,
    'full body character portrait',
    'standing pose',
    viewDescriptions[view],
    'white background',
    'character turnaround sheet',
    character.appearance,
  ];
  return parts.filter(Boolean).join(', ');
}

async function updateCharacterAsset(
  projectId: string,
  characterId: string,
  updates: Partial<Character>
): Promise<void> {
  const characters = await loadCharacters(projectId);
  const index = characters.findIndex(c => c.id === characterId);
  if (index !== -1) {
    characters[index] = { ...characters[index], ...updates };
    await saveCharacters(projectId, characters);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
