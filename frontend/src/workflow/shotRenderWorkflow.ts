/**
 * 分镜视频生成工作流
 * 纯 ITV 调用：使用已有参考图片（可选）生成视频
 */
import type { Shot, ShotVersion, Character, Prop } from '../types';
import { getProjectTTSProvider, getProjectITVProvider } from '../providers';
import { saveShotVersion, loadCharacters, loadProps } from '../store/projectStore';
import { createTask, markTaskCompleted } from '../store/taskQueueStore';
import { createLogger } from '../store/logger';
import { logITVCall, logTTSCall } from '../store/aiCallLogger';
import { resolvePromptTemplate } from '../store/promptTemplates';
import { resolveImageSourceForAPI } from '../store/assetDownloadService';
import { getThemeStylePrefixAsync } from '../config/themePresets';
import { parseMentions } from '../editor/mentionTypes';

const logger = createLogger('ShotRender');

interface StyleSnapshotLike {
  ttiStylePrefix?: string;
  llmPromptSuffix?: string;
}

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
  styleSnapshot?: StyleSnapshotLike;
  project?: { styleSnapshot?: StyleSnapshotLike };
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
  styleSnapshot?: StyleSnapshotLike;
  project?: { styleSnapshot?: StyleSnapshotLike };
  concurrency?: number;
}

interface BatchRenderResult {
  total: number;
  success: number;
  failed: number;
  results: ShotRenderResult[];
}

/**
 * 从 shot 中获取当前选中的参考图片，并确保可用于远程 API
 * 返回 http/https URL、data URI，或 undefined
 */
async function getSelectedImageUrl(shot: Shot): Promise<string | undefined> {
  // 优先使用 imagePaths 列表中当前选中的图片
  if (shot.imagePaths && shot.imagePaths.length > 0) {
    const idx = shot.currentImageIndex || 0;
    const selected = shot.imagePaths[idx];
    if (selected) {
      const resolved = await resolveImageSourceForAPI(selected);
      if (resolved) {
        logger.info(`使用 imagePaths[${idx}]: ${resolved.startsWith('data:') ? 'data:...(base64)' : resolved}`);
        return resolved;
      }
    }
  }
  // 兼容旧字段 imageUrl
  if (shot.imageUrl) {
    const resolved = await resolveImageSourceForAPI(shot.imageUrl);
    if (resolved) {
      logger.info(`使用 imageUrl: ${resolved.startsWith('data:') ? 'data:...(base64)' : resolved}`);
      return resolved;
    }
  }
  logger.info('没有可用的参考图片');
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
  const { projectId, shot, projectConfigIds, theme, stylePrompt, styleSnapshot, project } = params;

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
  const referenceImageUrl = await getSelectedImageUrl(shot);
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
            (ttsProvider.config as any)?.name || ttsProvider.type || 'TTS',
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
    const stylePrefix = await getResolvedTTIStylePrefix(styleSnapshot || project?.styleSnapshot, theme, stylePrompt);

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
    let templateId = 'shot.videoPrompt';
    let promptSource: 'default' | 'custom' | 'finalized' = 'finalized';

    if (shot.videoPrompt) {
      // 使用专用视频提示词
      videoPrompt = shot.videoPrompt;
      // 使用新的处理函数，支持 Sora2 角色和参考图收集
      const processed = processVideoPromptAssets(videoPrompt, shot, characters, projectProps);
      videoPrompt = processed.prompt;
      additionalReferenceImages = processed.referenceImages;
    } else {
      const resolvedPrompt = await resolvePromptTemplate('itv_shot_video', {
        stylePrefix: stylePrefix || '',
        description: shot.description || '',
        cameraMovement: getCameraMovementDesc(shot.cameraMovement),
      });
      videoPrompt = appendCharacterRefs(resolvedPrompt.prompt, shot, characters);
      templateId = resolvedPrompt.template.id;
      promptSource = resolvedPrompt.source;
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
      {
        projectId,
        targetId: shot.id,
        targetName: `分镜视频: ${shot.id}`,
        templateId,
        promptSource,
      }
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
      const _taskId = (result as any).taskId;
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

function _sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 批量生成视频
 */
export async function batchRenderShots(
  params: BatchRenderParams,
  onProgress: (overall: number, current: { shotId: string; progress: number; step?: string }) => void
): Promise<BatchRenderResult> {
  const {
    projectId,
    shots,
    projectConfigIds,
    theme,
    stylePrompt,
    styleSnapshot,
    project,
    concurrency: _concurrency = 1,
  } = params;

  logger.info(`开始批量生成 ${shots.length} 个分镜视频`);

  const results: ShotRenderResult[] = [];
  let completed = 0;

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];

    const result = await shotRenderWorkflow(
      { projectId, shot, projectConfigIds, theme, stylePrompt, styleSnapshot, project },
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

async function getResolvedTTIStylePrefix(
  styleSnapshot?: StyleSnapshotLike,
  theme?: string,
  stylePrompt?: string
): Promise<string> {
  if (styleSnapshot?.ttiStylePrefix) {
    return styleSnapshot.ttiStylePrefix;
  }
  return getThemeStylePrefixAsync(theme, stylePrompt);
}

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
 * - 有 sora2CharacterId 的角色：使用 @sora2CharacterId
 * - 无 sora2CharacterId 的角色：收集其图片 URL
 * - 道具/场景：收集其图片 URL
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
      const char = characters.find(
        c => c.id === mention.id || c.sora2CharacterId === mention.id
      );
      if (char) {
        if (char.sora2CharacterId) {
          // 有 Sora2 角色 ID：替换为 @sora2CharacterId
          const replacement = `@${char.sora2CharacterId}`;
          result = result.slice(0, mention.from) + replacement + result.slice(mention.to);
        } else if (char.costumePhotoUrl) {
          // 无 Sora2 ID：收集图片 URL，替换为角色描述
          referenceImages.push(char.costumePhotoUrl);
          const replacement = `[${char.name}: ${char.prompt || char.description || char.appearance || ''}]`;
          result = result.slice(0, mention.from) + replacement + result.slice(mention.to);
        }
      }
    } else if (mention.type === 'prop') {
      const prop = props?.find(
        p => p.id === mention.id || p.sora2PropId === mention.id
      );
      if (prop) {
        if (prop.sora2PropId) {
          // 有 Sora2 道具 ID
          const replacement = `@${prop.sora2PropId}`;
          result = result.slice(0, mention.from) + replacement + result.slice(mention.to);
        } else if (prop.imageUrl) {
          referenceImages.push(prop.imageUrl);
          const replacement = `[${prop.name}: ${prop.prompt || prop.description || ''}]`;
          result = result.slice(0, mention.from) + replacement + result.slice(mention.to);
        }
      }
    }
    // scene 直接替换为描述（场景没有 sora2 绑定）
    // 注意：scene 的处理可以在后续需要时添加
  }

  // 额外检查 shot.characters 中有 sora2CharacterId 但不在提示词中的角色
  for (const charId of shot.characters || []) {
    const char = characters.find(c => c.id === charId);
    if (char?.sora2CharacterId && !result.includes(`@${char.sora2CharacterId}`)) {
      // 追加到末尾
      result = `${result} @${char.sora2CharacterId}`;
    }
  }

  return { prompt: result, referenceImages };
}

function appendCharacterRefs(prompt: string, shot: Shot, characters: Character[]): string {
  let result = prompt;

  for (const char of characters) {
    if (char.sora2CharacterId && result.includes(char.name)) {
      result = result.replace(
        new RegExp(char.name, 'g'),
        `${char.name} @${char.sora2CharacterId}`
      );
    }
  }

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

  for (const char of characters) {
    if (char.sora2CharacterId && prompt.includes(char.name)) {
      prompt = prompt.replace(
        new RegExp(char.name, 'g'),
        `${char.name} @${char.sora2CharacterId}`
      );
    }
  }

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
