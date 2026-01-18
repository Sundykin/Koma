/**
 * 分镜渲染工作流
 * 完整的 Shot 渲染流程：图片 -> TTS -> 视频
 */
import type { Shot, ShotVersion, Character } from '../types';
import { getProjectTTIProvider, getProjectTTSProvider, getProjectITVProvider } from '../providers';
import { saveShotVersion, loadShotMeta, loadCharacters, loadProject } from '../store/projectStore';
import { createTask, updateTask, markTaskCompleted, markTaskFailed } from '../store/taskQueueStore';
import { getThemeStylePrefix } from '../config/themePresets';
import { createLogger } from '../store/logger';
import { logTTICall, logITVCall, logTTSCall } from '../store/aiCallLogger';
import { getPromptTemplate, fillTemplate } from '../store/promptTemplates';

const logger = createLogger('ShotRender');

interface ShotRenderParams {
  projectId: string;
  shot: Shot;
  projectConfigIds?: {
    ttiConfigId?: string;
    itvConfigId?: string;
    ttsConfigId?: string;
  };
  // 主题和风格
  theme?: string;
  stylePrompt?: string;
}

interface ShotRenderResult {
  shotId: string;
  version: ShotVersion;
  success: boolean;
  error?: string;
}

interface BatchRenderParams {
  projectId: string;
  shots: Shot[];
  projectConfigIds?: {
    ttiConfigId?: string;
    itvConfigId?: string;
    ttsConfigId?: string;
  };
  theme?: string;
  stylePrompt?: string;
  concurrency?: number;
}

interface BatchRenderResult {
  total: number;
  success: number;
  failed: number;
  results: ShotRenderResult[];
}

/**
 * 分镜渲染工作流处理器
 */
export async function shotRenderWorkflow(
  params: ShotRenderParams,
  onProgress: (progress: number, step?: string) => void
): Promise<ShotRenderResult> {
  const { projectId, shot, projectConfigIds, theme, stylePrompt } = params;

  logger.info(`开始渲染分镜 ${shot.id}`);

  let imagePath: string | undefined;
  let remoteImageUrl: string | undefined;  // 远程图片 URL，用于 ITV 调用
  let audioPath: string | undefined;
  let videoPath: string | undefined;
  let remoteVideoUrl: string | undefined;  // 远程视频 URL
  let itvProviderName = 'unknown';

  // 加载项目配置和角色数据（用于构建增强 prompt）
  let projectTheme = theme;
  let projectStyle = stylePrompt;
  let characters: Character[] = [];

  try {
    const project = await loadProject(projectId);
    if (project) {
      projectTheme = projectTheme || project.theme;
      projectStyle = projectStyle || project.stylePrompt;
    }
    characters = await loadCharacters(projectId);
  } catch {
    // 忽略加载失败
  }

  // 构建增强的 prompt（从配置化模板读取）
  const stylePrefix = getThemeStylePrefix(projectTheme, projectStyle);
  let enhancedPrompt: string;
  try {
    const template = await getPromptTemplate('tti_shot_image');
    enhancedPrompt = fillTemplate(template.template, {
      stylePrefix: stylePrefix || '',
      description: shot.description || '',
      shotType: shot.shotType || 'medium',
      emotion: shot.emotion || '',
    });
  } catch {
    // 回退到硬编码模板
    enhancedPrompt = buildEnhancedPrompt(shot, characters, projectTheme, projectStyle);
  }

  try {
    // 步骤1: 生成图片 (0-30%)
    onProgress(0, '生成图片...');
    try {
      const ttiProvider = await getProjectTTIProvider(projectConfigIds?.ttiConfigId);
      if (!ttiProvider) {
        throw new Error('未配置 TTI 服务');
      }

      // 创建 TTI 任务记录
      const ttiTask = await createTask(projectId, {
        projectId,
        type: 'tti',
        targetType: 'shot',
        targetId: shot.id,
        targetName: `分镜图: ${shot.id}`,
        remoteTaskId: '',
        status: 'pending',
        progress: 0,
        maxRetries: 3,
      });

      // 打印完整提示词日志
      logTTICall(
        ttiProvider.config?.name || 'TTI',
        enhancedPrompt,
        { width: 1280, height: 720 },
        { projectId, targetId: shot.id, targetName: `分镜图: ${shot.id}` }
      );

      const imageResult = await ttiProvider.generateImage(enhancedPrompt, {
        width: 1280,
        height: 720,
      });

      // 处理异步任务模式和同步模式
      if (typeof imageResult === 'string') {
        await updateTask(projectId, ttiTask.id, { remoteTaskId: imageResult, status: 'processing' });

        if (ttiProvider.checkProgress) {
          let progress = await ttiProvider.checkProgress(imageResult);
          while (progress.status === 'queued' || progress.status === 'processing') {
            await new Promise(r => setTimeout(r, 3000));
            progress = await ttiProvider.checkProgress(imageResult);
            onProgress(progress.progress * 0.3, `图片生成中 ${progress.progress}%`);
          }
          if (progress.status === 'completed' && progress.resultUrl) {
            // 保存远程 URL 用于 ITV 调用
            remoteImageUrl = progress.resultUrl;
            imagePath = progress.resultUrl;
            await markTaskCompleted(projectId, ttiTask.id, progress.resultUrl, imagePath);
          } else {
            await markTaskFailed(projectId, ttiTask.id, progress.error || '图片生成失败');
            throw new Error(progress.error || '图片生成失败');
          }
        }
      } else {
        // 同步返回的可能是本地路径，需要检查是否有远程 URL
        imagePath = imageResult.path;
        remoteImageUrl = imageResult.url || imageResult.path;  // 优先使用 url 字段
        await markTaskCompleted(projectId, ttiTask.id, imageResult.path, imagePath);
      }
      logger.info(`图片生成完成: ${imagePath}`);
      onProgress(30, '图片生成完成');
    } catch (err: any) {
      logger.warn('图片生成失败', { error: err.message });
      onProgress(30, '图片生成跳过');
    }

    // 步骤2: 生成语音 (30-50%)
    if (shot.dialogue) {
      onProgress(30, '生成语音...');
      try {
        const ttsProvider = await getProjectTTSProvider(projectConfigIds?.ttsConfigId);
        if (!ttsProvider) {
          throw new Error('未配置 TTS 服务');
        }
        const voices = await ttsProvider.listVoices();
        const voiceId = voices[0]?.id;

        // 打印 TTS 调用日志
        logTTSCall(
          ttsProvider.config?.name || 'TTS',
          shot.dialogue,
          voiceId!,
          { rate: 1.0, pitch: 1.0 },
          { projectId, targetId: shot.id, targetName: `分镜语音: ${shot.id}` }
        );

        const audioResult = await ttsProvider.synthesize(shot.dialogue, voiceId!, {
          rate: 1.0,
          pitch: 1.0,
        });
        audioPath = audioResult.path;
        logger.info(`语音生成完成: ${audioPath}`);
        onProgress(50, '语音生成完成');
      } catch (err: any) {
        logger.warn('语音生成失败', { error: err.message });
        onProgress(50, '语音生成跳过');
      }
    } else {
      onProgress(50, '无台词，跳过语音');
    }

    // 步骤3: 生成视频 (50-95%)
    if (remoteImageUrl) {
      onProgress(50, '生成视频...');
      try {
        const itvProvider = await getProjectITVProvider(projectConfigIds?.itvConfigId);
        if (!itvProvider) {
          throw new Error('未配置 ITV 服务');
        }
        itvProviderName = itvProvider.config?.provider || 'unknown';

        // 检查是否是远程 URL
        if (!remoteImageUrl.startsWith('http://') && !remoteImageUrl.startsWith('https://')) {
          logger.warn('图片不是远程 URL，跳过视频生成');
          throw new Error('视频生成需要远程图片 URL，当前图片是本地文件');
        }

        // 创建 ITV 任务记录
        const itvTask = await createTask(projectId, {
          projectId,
          type: 'itv',
          targetType: 'shot',
          targetId: shot.id,
          targetName: `分镜视频: ${shot.id}`,
          remoteTaskId: '',
          status: 'pending',
          progress: 0,
          maxRetries: 3,
        });

        // 构建视频生成的 prompt，优先使用模板
        let videoPrompt: string;
        try {
          const videoTemplate = await getPromptTemplate('itv_shot_video');
          videoPrompt = fillTemplate(videoTemplate.template, {
            description: shot.description || '',
            cameraMovement: getCameraMovementDesc(shot.cameraMovement),
          });
          // 添加角色 @引用
          videoPrompt = appendCharacterRefs(videoPrompt, shot, characters);
        } catch {
          // 回退到硬编码函数
          videoPrompt = buildVideoPrompt(shot, characters);
        }
        logger.info(`视频生成 prompt: ${videoPrompt}`);
        logger.info(`使用远程图片 URL: ${remoteImageUrl}`);

        // 打印 ITV 调用日志
        logITVCall(
          itvProvider.config?.name || 'ITV',
          remoteImageUrl,
          videoPrompt,
          { duration: shot.duration, motionPrompt: shot.cameraMovement },
          { projectId, targetId: shot.id, targetName: `分镜视频: ${shot.id}` }
        );

        const taskId = await itvProvider.generate(remoteImageUrl, videoPrompt, {
          duration: shot.duration,
          motionPrompt: shot.cameraMovement,
        });

        // 轮询进度
        if (typeof taskId === 'string' && itvProvider.checkProgress) {
          await updateTask(projectId, itvTask.id, { remoteTaskId: taskId, status: 'processing' });

          let videoProgress = await itvProvider.checkProgress(taskId);
          while (videoProgress.status === 'processing' || videoProgress.status === 'queued') {
            await sleep(2000);
            videoProgress = await itvProvider.checkProgress(taskId);
            const p = 50 + (videoProgress.progress || 0) * 0.45;
            onProgress(p, `视频生成中 ${Math.round(videoProgress.progress || 0)}%`);
          }

          if (videoProgress.status === 'completed' && videoProgress.resultUrl) {
            videoPath = videoProgress.resultUrl;
            remoteVideoUrl = videoProgress.resultUrl;  // 保存远程 URL
            await markTaskCompleted(projectId, itvTask.id, videoProgress.resultUrl, videoPath);
            logger.info(`视频生成完成: ${videoPath}`);
            onProgress(95, '视频生成完成');
          } else {
            await markTaskFailed(projectId, itvTask.id, videoProgress.error || '视频生成失败');
          }
        }
      } catch (err: any) {
        logger.warn('视频生成失败', { error: err.message });
        onProgress(95, '视频生成失败');
      }
    } else {
      onProgress(95, '无图片，跳过视频');
    }

    // 步骤4: 保存版本到 shots/{shotId}/versions/
    onProgress(95, '保存版本...');

    // 获取当前版本号
    const shotMeta = await loadShotMeta(projectId, shot.id);

    const version = await saveShotVersion(projectId, shot.id, {
      imagePath,
      videoPath,
      audioPath,
      remoteImageUrl,
      remoteVideoUrl,
      prompt: enhancedPrompt,
      seed: shot.seed || Math.floor(Math.random() * 1000000),
      model: itvProviderName,
    });

    logger.info(`分镜 ${shot.id} 渲染完成，版本 ${version.version}`);
    onProgress(100, '完成');

    return {
      shotId: shot.id,
      version,
      success: true,
    };
  } catch (err: any) {
    logger.error(`分镜 ${shot.id} 渲染失败`, { error: err.message });
    return {
      shotId: shot.id,
      version: {} as ShotVersion,
      success: false,
      error: err.message,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 批量渲染分镜
 */
export async function batchRenderShots(
  params: BatchRenderParams,
  onProgress: (overall: number, current: { shotId: string; progress: number; step?: string }) => void
): Promise<BatchRenderResult> {
  const { projectId, shots, projectConfigIds, theme, stylePrompt, concurrency = 1 } = params;

  logger.info(`开始批量渲染 ${shots.length} 个分镜，并发数 ${concurrency}`);

  const results: ShotRenderResult[] = [];
  let completed = 0;

  // 串行渲染
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];

    const result = await shotRenderWorkflow(
      { projectId, shot, projectConfigIds, theme, stylePrompt },
      (progress, step) => {
        const overall = Math.round(((completed + progress / 100) / shots.length) * 100);
        onProgress(overall, { shotId: shot.id, progress, step });
      }
    );

    results.push(result);
    completed++;

    const overall = Math.round((completed / shots.length) * 100);
    onProgress(overall, { shotId: shot.id, progress: 100, step: result.success ? '完成' : '失败' });
  }

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  logger.info(`批量渲染完成: ${successCount} 成功, ${failedCount} 失败`);

  return {
    total: shots.length,
    success: successCount,
    failed: failedCount,
    results,
  };
}

// ========== 辅助函数（硬编码默认模板，作为 fallback）==========

/**
 * 获取运镜描述
 */
function getCameraMovementDesc(movement?: string): string {
  if (!movement || movement === 'static') return 'static shot';
  const cameraDesc: Record<string, string> = {
    'pan': 'camera panning horizontally',
    'zoom-in': 'camera slowly zooming in',
    'tracking': 'camera tracking the subject',
    'handheld': 'handheld camera movement',
  };
  return cameraDesc[movement] || movement;
}

/**
 * 为 prompt 添加角色 @引用
 */
function appendCharacterRefs(prompt: string, shot: Shot, characters: Character[]): string {
  let result = prompt;

  // 查找 prompt 中的角色名称，替换为 @sora2CharacterId
  for (const char of characters) {
    if (char.sora2CharacterId && result.includes(char.name)) {
      result = result.replace(
        new RegExp(char.name, 'g'),
        `${char.name} @${char.sora2CharacterId}`
      );
    }
  }

  // 如果分镜有关联的角色列表，自动添加 @引用
  if (shot.characters && shot.characters.length > 0) {
    const charRefs: string[] = [];
    for (const charId of shot.characters) {
      const char = characters.find(c => c.id === charId || c.name === charId);
      if (char?.sora2CharacterId && !result.includes(`@${char.sora2CharacterId}`)) {
        charRefs.push(`@${char.sora2CharacterId}`);
      }
    }
    if (charRefs.length > 0) {
      result = `${result} ${charRefs.join(' ')}`;
    }
  }

  return result;
}

/**
 * 构建增强的图片生成 prompt（硬编码默认模板）
 * 注意：实际生成时优先使用 promptTemplates 中的 tti_shot_image 模板
 */
function buildEnhancedPrompt(
  shot: Shot,
  characters: Character[],
  theme?: string,
  stylePrompt?: string
): string {
  const stylePrefix = getThemeStylePrefix(theme, stylePrompt);
  const parts = [stylePrefix, shot.description].filter(Boolean);
  return parts.join(', ');
}

/**
 * 构建视频生成 prompt
 * 使用分镜描述，支持 @sora2CharacterId 引用
 */
function buildVideoPrompt(shot: Shot, characters: Character[]): string {
  // 使用 description 作为主要提示词
  let prompt = shot.description || '';

  // 添加运镜描述
  if (shot.cameraMovement && shot.cameraMovement !== 'static') {
    const cameraDesc: Record<string, string> = {
      'pan': 'camera panning horizontally',
      'zoom-in': 'camera slowly zooming in',
      'tracking': 'camera tracking the subject',
      'handheld': 'handheld camera movement',
    };
    if (cameraDesc[shot.cameraMovement]) {
      prompt = `${prompt}, ${cameraDesc[shot.cameraMovement]}`;
    }
  }

  // 查找 prompt 中的角色名称，替换为 @sora2CharacterId
  for (const char of characters) {
    if (char.sora2CharacterId && prompt.includes(char.name)) {
      // 在角色名称后添加 @sora2CharacterId 引用
      prompt = prompt.replace(
        new RegExp(char.name, 'g'),
        `${char.name} @${char.sora2CharacterId}`
      );
    }
  }

  // 如果分镜有关联的角色列表，自动添加 @引用
  if (shot.characters && shot.characters.length > 0) {
    const charRefs: string[] = [];
    for (const charId of shot.characters) {
      const char = characters.find(c => c.id === charId || c.name === charId);
      if (char?.sora2CharacterId && !prompt.includes(`@${char.sora2CharacterId}`)) {
        charRefs.push(`@${char.sora2CharacterId}`);
      }
    }
    if (charRefs.length > 0) {
      prompt = `${prompt} ${charRefs.join(' ')}`;
    }
  }

  return prompt;
}

export default {
  shotRenderWorkflow,
  batchRenderShots,
};
