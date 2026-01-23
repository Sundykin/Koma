/**
 * 角色资产生成工作流
 * 生成角色定妆照（内置三视图）、预览视频，以及调用角色提取API
 */
import type { Character, AsyncTask } from '../types';
import { getProjectTTIProvider, getProjectITVProvider } from '../providers';
import { createTask, updateTask, markTaskCompleted, markTaskFailed } from '../store/taskQueueStore';
import { pollTaskUntilComplete, registerProgressChecker } from '../store/taskRecoveryService';
import { downloadRemoteAsset } from '../store/assetDownloadService';
import {
  saveCharacterCostumePhoto,
  saveCharacterPreviewVideo,
  saveCharacters,
  loadCharacters,
} from '../store/projectStore';
import { getStorageConfig, initStorageConfig } from '../store/storageConfig';
import { getThemeStylePrefix, getThemeStylePrefixAsync } from '../config/themePresets';
import { createLogger } from '../store/logger';
import { logTTICall, logITVCall } from '../store/aiCallLogger';
import { getPromptTemplate, fillTemplate, getDefaultTemplate } from '../store/promptTemplates';

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
 * 提示词内置三视图规范，一次生成包含正面/侧面/背面的图片
 */
export async function generateCostumePhoto(
  options: GenerateOptions
): Promise<{ success: boolean; path?: string; url?: string; error?: string }> {
  const { projectId, character, theme, stylePrompt, ttiConfigId, onProgress } = options;

  logger.info(`开始生成角色定妆照: ${character.name}`);
  onProgress?.(0, '准备生成定妆照...');

  try {
    const ttiProvider = await getProjectTTIProvider(ttiConfigId);
    if (!ttiProvider) {
      throw new Error('未配置 TTI 服务');
    }

    // 构建提示词（从配置化模板读取）
    const stylePrefix = await getThemeStylePrefixAsync(theme, stylePrompt);
    let prompt: string;
    try {
      const template = await getPromptTemplate('tti_character_costume');
      prompt = fillTemplate(template.template, {
        stylePrefix: stylePrefix || '',
        appearance: character.appearance || '',
      });
    } catch {
      // 回退到硬编码模板
      prompt = buildCostumePhotoPrompt(character, stylePrefix);
    }

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

    // 打印完整提示词日志
    logTTICall(
      ttiProvider.config?.name || 'TTI',
      prompt,
      { width: 1536, height: 1024 },
      { projectId, targetId: character.id, targetName: `${character.name} 定妆照` }
    );

    // 调用 TTI Provider - 横版尺寸以容纳三视图
    const result = await ttiProvider.generateImage(prompt, {
      width: 1536,
      height: 1024, // 横版以容纳三视图排列
    });

    // 处理异步任务模式
    if (typeof result === 'string') {
      // 异步模式，更新任务ID并轮询
      await updateTask(projectId, task.id, { remoteTaskId: result, status: 'processing' });

      if (ttiProvider.checkProgress) {
        let remoteUrl: string | undefined;

        const success = await pollTaskUntilComplete(
          projectId,
          { ...task, remoteTaskId: result },
          ttiProvider.checkProgress.bind(ttiProvider),
          {
            onTaskProgress: (_, progress) => onProgress?.(10 + progress * 0.8, `生成中 ${progress}%`),
            onTaskCompleted: async (completedTask, localPath) => {
              // 从任务中获取远程 URL
              remoteUrl = completedTask.resultUrl;
              // 同时保存本地路径和远程 URL
              await updateCharacterAsset(projectId, character.id, {
                costumePhotoPath: localPath,
                costumePhotoUrl: remoteUrl,
              });
            },
          }
        );

        if (!success) {
          return { success: false, error: '生成失败' };
        }

        const updatedTask = await import('../store/taskQueueStore').then(m => m.getTask(projectId, task.id));
        return { success: true, path: updatedTask?.localPath, url: remoteUrl };
      }
    } else {
      // 同步模式，直接保存
      onProgress?.(90, '保存定妆照...');

      // 判断返回的是远程 URL 还是本地路径
      const isRemoteUrl = result.path.startsWith('http://') || result.path.startsWith('https://');
      let localPath: string;
      let remoteUrl: string | undefined;

      if (isRemoteUrl) {
        // 远程 URL，需要下载
        remoteUrl = result.path;
        const config = getStorageConfig() || (await initStorageConfig());
        localPath = `${config.rootPath}/projects/${projectId}/assets/characters/${character.id}/costume-photo.png`;
        const downloadResult = await downloadRemoteAsset(remoteUrl, localPath);
        if (!downloadResult.success) {
          throw new Error('下载图片失败');
        }
        localPath = downloadResult.localPath!;
      } else {
        // 本地路径
        localPath = await saveCharacterCostumePhoto(projectId, character.id, result.path);
      }

      await markTaskCompleted(projectId, task.id, result.path, localPath);
      await updateCharacterAsset(projectId, character.id, {
        costumePhotoPath: localPath,
        costumePhotoUrl: remoteUrl,
      });

      onProgress?.(100, '完成');
      return { success: true, path: localPath, url: remoteUrl };
    }

    return { success: false, error: '未知错误' };
  } catch (err: any) {
    logger.error(`生成定妆照失败: ${character.name}`, { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * 生成角色预览视频
 * 优先使用远程 URL（Sora2 等需要远程可访问的图片）
 */
export async function generateCharacterPreviewVideo(
  options: GenerateOptions
): Promise<{ success: boolean; path?: string; taskId?: string; error?: string }> {
  const { projectId, character, itvConfigId, onProgress } = options;

  logger.info(`开始生成角色预览视频: ${character.name}`);
  onProgress?.(0, '准备生成预览视频...');

  // 优先使用远程 URL，其次使用本地路径
  const imageSource = character.costumePhotoUrl || character.costumePhotoPath;
  if (!imageSource) {
    return { success: false, error: '请先生成定妆照' };
  }

  // 如果没有远程 URL，提示用户可能需要重新生成
  if (!character.costumePhotoUrl) {
    logger.warn(`角色 ${character.name} 没有远程图片 URL，将使用本地路径。某些服务（如 Sora2）可能需要远程 URL。`);
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

    // 调用 ITV Provider - 优先使用远程 URL
    const prompt = `${character.name} character introduction, gentle movement, looking at camera`;

    // 打印完整提示词日志
    logITVCall(
      itvProvider.config?.name || 'ITV',
      imageSource,
      prompt,
      { duration: 4, aspectRatio: '9:16' },
      { projectId, targetId: character.id, targetName: `${character.name} 预览视频` }
    );

    const taskId = await itvProvider.generate(imageSource, prompt, {
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
          // 同时保存视频路径和任务 ID（用于后续角色提取 API）
          await updateCharacterAsset(projectId, character.id, {
            previewVideoPath: downloadResult.localPath,
            previewVideoTaskId: taskId,
          });
          onProgress?.(100, '完成');
          return { success: true, path: downloadResult.localPath, taskId };
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
 * 需要先生成预览视频并保存任务 ID
 * 支持异步轮询模式
 */
export async function extractAndBindCharacter(
  projectId: string,
  character: Character,
  itvConfigId?: string,
  onProgress?: (progress: number, step: string) => void
): Promise<{ success: boolean; characterId?: string; error?: string }> {
  logger.info(`开始提取角色: ${character.name}`);
  onProgress?.(0, '准备角色提取...');

  // 检查是否有视频生成任务 ID（角色提取 API 需要使用 from_task 参数）
  if (!character.previewVideoTaskId) {
    // 兼容旧数据：如果有视频路径但没有任务 ID，提示用户重新生成
    if (character.previewVideoPath) {
      return { success: false, error: '请重新生成预览视频（需要保存任务ID用于角色提取）' };
    }
    return { success: false, error: '请先生成预览视频' };
  }

  try {
    const itvProvider = await getProjectITVProvider(itvConfigId);
    if (!itvProvider) {
      throw new Error('未配置 ITV 服务');
    }

    // 检查是否支持角色提取
    if (!itvProvider.extractCharacter) {
      return { success: false, error: 'ITV Provider 不支持角色提取' };
    }

    onProgress?.(10, '调用角色提取 API...');

    // 使用任务 ID 调用角色提取 API
    const extractTaskId = await itvProvider.extractCharacter({
      fromTask: character.previewVideoTaskId,
      timestamps: '1,3', // 默认取 1-3 秒的画面
    });

    // 检查是否支持角色提取状态轮询
    if (itvProvider.checkCharacterProgress) {
      onProgress?.(20, '等待角色提取完成...');

      // 轮询等待完成
      let progress = await itvProvider.checkCharacterProgress(extractTaskId);
      let pollCount = 0;
      const maxPolls = 60; // 最大轮询 60 次（约 3 分钟）

      while ((progress.status === 'queued' || progress.status === 'processing') && pollCount < maxPolls) {
        await sleep(3000);
        progress = await itvProvider.checkCharacterProgress(extractTaskId);
        pollCount++;
        const progressPercent = 20 + Math.min(progress.progress, 100) * 0.7;
        onProgress?.(progressPercent, `提取中 ${progress.progress}%`);
      }

      if (progress.status === 'completed' && progress.characters && progress.characters.length > 0) {
        // 取第一个提取的角色
        const extractedChar = progress.characters[0];
        const sora2CharacterId = extractedChar.id;

        await updateCharacterAsset(projectId, character.id, { sora2CharacterId });
        onProgress?.(100, '角色提取完成');

        logger.info(`角色提取成功: ${character.name} -> ${sora2CharacterId}`);
        return { success: true, characterId: sora2CharacterId };
      }

      if (progress.status === 'failed') {
        return { success: false, error: progress.error || '角色提取失败' };
      }

      if (pollCount >= maxPolls) {
        return { success: false, error: '角色提取超时' };
      }

      return { success: false, error: '未能提取到角色' };
    } else {
      // 不支持轮询，直接返回任务 ID 作为角色 ID（兼容旧模式）
      await updateCharacterAsset(projectId, character.id, { sora2CharacterId: extractTaskId });
      onProgress?.(100, '完成');

      logger.info(`角色提取成功: ${character.name} -> ${extractTaskId}`);
      return { success: true, characterId: extractTaskId };
    }
  } catch (err: any) {
    logger.error(`角色提取失败: ${character.name}`, { error: err.message });
    return { success: false, error: err.message };
  }
}

// ========== 提示词生成函数（导出供UI预览） ==========

/**
 * 构建定妆照提示词（硬编码默认模板）
 * 内置三视图规范：正面/侧面/背面排列在一张图中
 * 注意：实际生成时优先使用 promptTemplates 中的 tti_character_costume 模板
 */
export function buildCostumePhotoPrompt(character: Character, stylePrefix: string): string {
  // 固定模板部分（不可编辑）
  const templateParts = [
    stylePrefix,
    'character turnaround sheet',
    'white background',
    'front view | side view | back view',
    'three poses in one image',
    'character design reference sheet',
    'full body',
    'standing pose',
  ];
  // 可变部分：外貌描述
  const parts = [
    ...templateParts,
    character.appearance,
  ];
  return parts.filter(Boolean).join(', ');
}

/**
 * 获取角色的完整提示词（便捷函数）
 * 如果角色有自定义提示词则优先使用，否则自动生成
 */
export function getCharacterPrompt(
  character: Character,
  theme?: string,
  stylePrompt?: string
): string {
  // 优先使用自定义提示词
  if (character.customPrompt) {
    return character.customPrompt;
  }
  const stylePrefix = getThemeStylePrefix(theme, stylePrompt);
  return buildCostumePhotoPrompt(character, stylePrefix);
}

// ========== 辅助函数 ==========

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
