/**
 * 分镜视频生成工作流
 * 纯 ITV 调用：使用已有参考图片（可选）生成视频
 */
import type { Shot, ShotVersion, Character, Prop } from '../types';
import { getProjectTTSProvider, getProjectITVProvider } from '../providers';
import { saveShotVersion, loadCharacters, loadProps } from '../store/projectStore';
import { createTask, updateTask, markTaskCompleted, markTaskFailed } from '../store/taskQueueStore';
import { createLogger } from '../store/logger';
import { logITVCall, logTTSCall } from '../store/aiCallLogger';
import { getPromptTemplate, fillTemplate } from '../store/promptTemplates';
import { getThemeStylePrefixAsync } from '../config/themePresets';
import { parseMentions, type MentionType } from '../editor/mentionTypes';

const logger = createLogger('ShotRender');

interface ShotRenderParams {
  projectId: string;
  shot: Shot;
  projectConfigIds?: {
    ttiConfigId?: string;
    itvConfigId?: string;
    ttsConfigId?: string;
  };
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
 * 从 shot 中获取当前选中的参考图片远程URL
 * 只返回 http/https 开头的远程地址
 */
function getSelectedImageUrl(shot: Shot): string | undefined {
  // 检查是否是远程URL
  const isRemoteUrl = (url: string) => url.startsWith('http://') || url.startsWith('https://');

  // 优先使用 imagePaths 列表中当前选中的图片
  if (shot.imagePaths && shot.imagePaths.length > 0) {
    const idx = shot.currentImageIndex || 0;
    const selected = shot.imagePaths[idx];
    if (selected && isRemoteUrl(selected)) {
      logger.info(`使用 imagePaths[${idx}] 远程URL: ${selected}`);
      return selected;
    }
  }
  // 兼容旧字段 imageUrl
  if (shot.imageUrl && isRemoteUrl(shot.imageUrl)) {
    logger.info(`使用 imageUrl 远程URL: ${shot.imageUrl}`);
    return shot.imageUrl;
  }
  // 不使用本地路径
  logger.info('没有可用的远程图片URL');
  return undefined;
}

/**
 * 分镜视频生成工作流
 * 只调用 ITV，不生成图片
 */
export async function shotRenderWorkflow(
  params: ShotRenderParams,
  onProgress: (progress: number, step?: string) => void
): Promise<ShotRenderResult> {
  const { projectId, shot, projectConfigIds, theme, stylePrompt } = params;

  logger.info(`开始生成分镜视频 ${shot.id}`);

  let audioPath: string | undefined;
  let videoPath: string | undefined;
  let remoteVideoUrl: string | undefined;
  let itvProviderName = 'unknown';

  // 加载角色数据（用于构建 prompt）
  let characters: Character[] = [];
  try {
    characters = await loadCharacters(projectId);
  } catch {
    // 忽略
  }

  // 获取当前选中的参考图片
  const referenceImageUrl = getSelectedImageUrl(shot);
  logger.info(`参考图片: ${referenceImageUrl || '无'}`);

  try {
    // 步骤1: 生成语音 (0-20%)
    if (shot.dialogue) {
      onProgress(0, '生成语音...');
      try {
        const ttsProvider = await getProjectTTSProvider(projectConfigIds?.ttsConfigId);
        if (ttsProvider) {
          const voices = await ttsProvider.listVoices();
          const voiceId = voices[0]?.id;

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
        }
        onProgress(20, '语音生成完成');
      } catch (err: any) {
        logger.warn('语音生成失败', { error: err.message });
        onProgress(20, '语音生成跳过');
      }
    } else {
      onProgress(20, '无台词，跳过语音');
    }

    // 步骤2: 生成视频 (20-95%)
    onProgress(20, '生成视频...');

    const itvProvider = await getProjectITVProvider(projectConfigIds?.itvConfigId);
    if (!itvProvider) {
      throw new Error('未配置 ITV 服务');
    }
    itvProviderName = itvProvider.config?.provider || 'unknown';

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

    // 获取视觉风格前缀（支持自定义预设）
    const stylePrefix = await getThemeStylePrefixAsync(theme, stylePrompt);

    // 加载道具
    let projectProps: Prop[] = [];
    try {
      projectProps = await loadProps(projectId);
    } catch {
      // 忽略
    }

    // 构建视频 prompt：优先使用 shot.videoPrompt
    let videoPrompt: string;
    let additionalReferenceImages: string[] = [];

    if (shot.videoPrompt) {
      // 使用专用视频提示词
      videoPrompt = stylePrefix ? `${stylePrefix}${shot.videoPrompt}` : shot.videoPrompt;
      // 处理提示词中的资产引用，收集参考图
      const processed = processVideoPromptAssets(videoPrompt, shot, characters, projectProps);
      videoPrompt = processed.prompt;
      additionalReferenceImages = processed.referenceImages;
    } else {
      // 回退到旧逻辑
      try {
        const videoTemplate = await getPromptTemplate('itv_shot_video');
        videoPrompt = fillTemplate(videoTemplate.template, {
          stylePrefix: stylePrefix || '',
          description: shot.description || '',
          cameraMovement: getCameraMovementDesc(shot.cameraMovement),
        });
        videoPrompt = appendCharacterRefs(videoPrompt, shot, characters);
      } catch {
        videoPrompt = buildVideoPrompt(shot, characters, stylePrefix);
      }
    }

    logger.info(`视频 prompt: ${videoPrompt}`);
    if (additionalReferenceImages.length > 0) {
      logger.info(`额外参考图: ${additionalReferenceImages.join(', ')}`);
    }

    // 打印 ITV 调用日志
    logITVCall(
      itvProvider.config?.name || 'ITV',
      referenceImageUrl || '',
      videoPrompt,
      { duration: shot.duration, motionPrompt: shot.cameraMovement },
      { projectId, targetId: shot.id, targetName: `分镜视频: ${shot.id}` }
    );

    // 调用 ITV Provider 生成视频
    const result = await itvProvider.generateVideo({
      imageUrl: referenceImageUrl || '',
      prompt: videoPrompt,
      options: { duration: shot.duration, motionPrompt: shot.cameraMovement },
    });

    if (result.url || (result as any).path) {
      videoPath = result.url || (result as any).path;
      remoteVideoUrl = videoPath;
      const taskId = (result as any).taskId;
      await markTaskCompleted(projectId, itvTask.id, videoPath!, videoPath!);
      logger.info(`视频生成完成: ${videoPath}`);
      onProgress(95, '视频生成完成');
    } else {
      throw new Error('视频生成失败：未返回有效结果');
    }

    // 步骤3: 保存版本
    onProgress(95, '保存版本...');

    const version = await saveShotVersion(projectId, shot.id, {
      imagePath: referenceImageUrl,
      videoPath,
      audioPath,
      remoteImageUrl: referenceImageUrl,
      remoteVideoUrl,
      prompt: videoPrompt,
      seed: shot.seed || Math.floor(Math.random() * 1000000),
      model: itvProviderName,
    });

    logger.info(`分镜 ${shot.id} 视频生成完成，版本 ${version.version}`);
    onProgress(100, '完成');

    return {
      shotId: shot.id,
      version,
      success: true,
    };
  } catch (err: any) {
    logger.error(`分镜 ${shot.id} 视频生成失败`, { error: err.message });
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
 * 批量生成视频
 */
export async function batchRenderShots(
  params: BatchRenderParams,
  onProgress: (overall: number, current: { shotId: string; progress: number; step?: string }) => void
): Promise<BatchRenderResult> {
  const { projectId, shots, projectConfigIds, theme, stylePrompt, concurrency = 1 } = params;

  logger.info(`开始批量生成 ${shots.length} 个分镜视频`);

  const results: ShotRenderResult[] = [];
  let completed = 0;

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

  logger.info(`批量生成完成: ${successCount} 成功, ${failedCount} 失败`);

  return {
    total: shots.length,
    success: successCount,
    failed: failedCount,
    results,
  };
}

// ========== 辅助函数 ==========

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
 * 处理视频提示词中的资产引用
 * - 角色：收集其图片 URL，替换为描述
 * - 道具：收集其图片 URL，替换为描述
 *
 * @returns { prompt, referenceImages }
 */
function processVideoPromptAssets(
  prompt: string,
  shot: Shot,
  characters: Character[],
  props?: Prop[]
): { prompt: string; referenceImages: string[] } {
  let result = prompt;
  const referenceImages: string[] = [];

  // 解析提示词中的 @mentions
  const mentions = parseMentions(prompt);

  // 按位置倒序处理，避免替换时位置偏移
  const sortedMentions = [...mentions].sort((a, b) => b.from - a.from);

  for (const mention of sortedMentions) {
    if (mention.type === 'char') {
      const char = characters.find(c => c.id === mention.id);
      if (char?.costumePhotoUrl) {
        referenceImages.push(char.costumePhotoUrl);
        const replacement = `[${char.name}: ${char.prompt || char.description || char.appearance || ''}]`;
        result = result.slice(0, mention.from) + replacement + result.slice(mention.to);
      }
    } else if (mention.type === 'prop') {
      const prop = props?.find(p => p.id === mention.id);
      if (prop?.imageUrl) {
        referenceImages.push(prop.imageUrl);
        const replacement = `[${prop.name}: ${prop.prompt || prop.description || ''}]`;
        result = result.slice(0, mention.from) + replacement + result.slice(mention.to);
      }
    }
    // scene 直接替换为描述（场景没有特殊绑定）
  }

  return { prompt: result, referenceImages };
}

function appendCharacterRefs(prompt: string, shot: Shot, characters: Character[]): string {
  return prompt;
}

function buildVideoPrompt(shot: Shot, characters: Character[], stylePrefix?: string): string {
  let prompt = stylePrefix ? `${stylePrefix}${shot.description || ''}` : (shot.description || '');

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

  return prompt;
}

export default {
  shotRenderWorkflow,
  batchRenderShots,
};
