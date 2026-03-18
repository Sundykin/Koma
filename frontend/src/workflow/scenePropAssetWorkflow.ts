/**
 * 场景/道具资产生成工作流
 */
import type { Scene, Prop } from '../types';
import { getProjectTTIProvider, getProjectITVProvider } from '../providers';
import { createTask, markTaskCompleted, markTaskFailed } from '../store/taskQueueStore';
import { downloadRemoteAsset } from '../store/assetDownloadService';
import {
  saveSceneImage,
  savePropImage,
  saveScenes,
  saveProps,
  loadScenes,
  loadProps,
} from '../store/projectStore';
import { getStorageConfig, initStorageConfig } from '../store/storageConfig';
import { getThemeStylePrefix, getThemeStylePrefixAsync } from '../config/themePresets';
import { createLogger } from '../store/logger';
import { logTTICall, logITVCall } from '../store/aiCallLogger';
import { resolvePromptTemplate } from '../store/promptTemplates';
import { IMAGE_GENERATION_SIZES } from '../constants/dimensions';

const logger = createLogger('ScenePropAsset');

interface StyleSnapshotLike {
  ttiStylePrefix?: string;
  llmPromptSuffix?: string;
}

// ========== 提示词获取（供外部组件使用）==========

/**
 * 获取场景的自动生成提示词（用于预览显示）
 */
export function getScenePrompt(
  scene: Scene,
  theme?: string,
  stylePrompt?: string,
  styleSnapshot?: StyleSnapshotLike,
  project?: { styleSnapshot?: StyleSnapshotLike }
): string {
  const stylePrefix = resolveTTIStylePrefix(styleSnapshot || project?.styleSnapshot, theme, stylePrompt);
  if (scene.customPrompt) return scene.customPrompt;
  return buildScenePromptInternal(scene, stylePrefix);
}

/**
 * 获取道具的自动生成提示词（用于预览显示）
 */
export function getPropPrompt(
  prop: Prop,
  theme?: string,
  stylePrompt?: string,
  styleSnapshot?: StyleSnapshotLike,
  project?: { styleSnapshot?: StyleSnapshotLike }
): string {
  const stylePrefix = resolveTTIStylePrefix(styleSnapshot || project?.styleSnapshot, theme, stylePrompt);
  if (prop.customPrompt) return prop.customPrompt;
  return buildPropPromptInternal(prop, stylePrefix);
}

// 内部构建函数（同步版本）
function buildScenePromptInternal(scene: Scene, stylePrefix: string): string {
  const timeDescriptions: Record<string, string> = {
    day: 'daytime, bright natural lighting',
    night: 'nighttime, moonlight, artificial lights',
    twilight: 'twilight, golden hour, warm lighting',
  };
  const parts = [
    stylePrefix,
    'environment concept art',
    'wide shot',
    'establishing shot',
    scene.description,
    scene.location,
    scene.time ? timeDescriptions[scene.time] : '',
    scene.mood ? `${scene.mood} atmosphere` : '',
    'detailed background',
    'cinematic composition',
  ];
  return parts.filter(Boolean).join(', ');
}

function buildPropPromptInternal(prop: Prop, stylePrefix: string): string {
  const parts = [
    stylePrefix,
    'prop design',
    'item illustration',
    'centered composition',
    'white background',
    'studio lighting',
    prop.description,
    prop.type ? `${prop.type} item` : '',
    'detailed rendering',
    'clean presentation',
  ];
  return parts.filter(Boolean).join(', ');
}

interface GenerateOptions {
  projectId: string;
  theme?: string;
  stylePrompt?: string;
  styleSnapshot?: StyleSnapshotLike;
  project?: { styleSnapshot?: StyleSnapshotLike };
  ttiConfigId?: string;
  onProgress?: (progress: number, step: string) => void;
}

// ========== 场景图片生成 ==========

/**
 * 生成场景预览图
 */
export async function generateSceneImage(
  options: GenerateOptions & { scene: Scene }
): Promise<{ success: boolean; path?: string; url?: string; error?: string }> {
  const { projectId, scene, theme, stylePrompt, styleSnapshot, project, ttiConfigId, onProgress } = options;

  logger.info(`开始生成场景预览图: ${scene.name}`);
  onProgress?.(0, '准备生成场景图...');

  try {
    const ttiProvider = await getProjectTTIProvider(ttiConfigId);
    if (!ttiProvider) {
      throw new Error('未配置 TTI 服务');
    }

    // 构建提示词（从配置化模板读取）
    const stylePrefix = await getResolvedTTIStylePrefix(styleSnapshot || project?.styleSnapshot, theme, stylePrompt);
    const resolvedPrompt = await resolvePromptTemplate('tti_scene_preview', {
      stylePrefix: stylePrefix || '',
      description: scene.description || '',
      location: scene.location || '',
      time: scene.time || 'day',
      mood: scene.mood || '',
    });
    const prompt = resolvedPrompt.prompt;

    // 创建任务记录
    const task = await createTask(projectId, {
      projectId,
      type: 'tti',
      targetType: 'scene',
      targetId: scene.id,
      targetName: `场景: ${scene.name}`,
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
      IMAGE_GENERATION_SIZES.video_frame,
      {
        projectId,
        targetId: scene.id,
        targetName: `场景: ${scene.name}`,
        templateId: resolvedPrompt.template.id,
        promptSource: resolvedPrompt.source,
      }
    );

    const result = await ttiProvider.generateImage(prompt, {
      ...IMAGE_GENERATION_SIZES.video_frame, // 横版场景图
    });

    if (typeof result === 'string' && ttiProvider.checkProgress) {
      // 异步模式
      let progress = await ttiProvider.checkProgress(result);
      while (progress.status === 'queued' || progress.status === 'processing') {
        await sleep(3000);
        progress = await ttiProvider.checkProgress(result);
        onProgress?.(10 + progress.progress * 0.8, `生成中 ${progress.progress}%`);
      }

      if (progress.status === 'completed' && progress.resultUrl) {
        onProgress?.(90, '下载图片...');
        const config = getStorageConfig() || (await initStorageConfig());
        const localPath = `${config.rootPath}/projects/${projectId}/assets/scenes/${scene.id}/preview.png`;
        const downloadResult = await downloadRemoteAsset(progress.resultUrl, localPath);

        if (downloadResult.success && downloadResult.localPath) {
          await markTaskCompleted(projectId, task.id, progress.resultUrl, downloadResult.localPath);
          // 同时保存本地路径和远程URL
          await updateSceneAsset(projectId, scene.id, {
            imagePath: downloadResult.localPath,
            imageUrl: progress.resultUrl,
          });
          onProgress?.(100, '完成');
          return { success: true, path: downloadResult.localPath, url: progress.resultUrl };
        }
      }

      await markTaskFailed(projectId, task.id, progress.error || '生成失败');
      return { success: false, error: progress.error || '生成失败' };
    } else if (typeof result !== 'string') {
      // 同步模式 - result 可能包含 url 或本地路径
      onProgress?.(90, '保存场景图...');

      const resultPath = result.path || result.url;
      const isRemoteUrl = resultPath?.startsWith('http://') || resultPath?.startsWith('https://');

      let localPath: string;
      let remoteUrl: string | undefined;

      if (isRemoteUrl) {
        // 远程 URL，需要下载
        remoteUrl = resultPath;
        const config = getStorageConfig() || (await initStorageConfig());
        const targetPath = `${config.rootPath}/projects/${projectId}/assets/scenes/${scene.id}/preview.png`;
        const downloadResult = await downloadRemoteAsset(remoteUrl, targetPath);
        if (!downloadResult.success || !downloadResult.localPath) {
          throw new Error('下载图片失败');
        }
        localPath = downloadResult.localPath;
      } else {
        // 本地路径
        localPath = await saveSceneImage(projectId, scene.id, resultPath);
        remoteUrl = result.url;
      }

      await markTaskCompleted(projectId, task.id, resultPath, localPath);
      // 同时保存本地路径和远程URL
      await updateSceneAsset(projectId, scene.id, {
        imagePath: localPath,
        imageUrl: remoteUrl,
      });

      onProgress?.(100, '完成');
      return { success: true, path: localPath, url: remoteUrl };
    }

    return { success: false, error: '未知错误' };
  } catch (err: any) {
    logger.error(`生成场景图失败: ${scene.name}`, { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * 批量生成场景预览图
 */
export async function generateAllSceneImages(
  options: GenerateOptions & { scenes: Scene[] }
): Promise<{ success: number; failed: number; results: Array<{ sceneId: string; success: boolean; path?: string; error?: string }> }> {
  const { projectId, scenes, theme, stylePrompt, ttiConfigId, onProgress } = options;

  const results: Array<{ sceneId: string; success: boolean; path?: string; error?: string }> = [];
  let success = 0;
  let failed = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const baseProgress = (i / scenes.length) * 100;

    const result = await generateSceneImage({
      projectId,
      scene,
      theme,
      stylePrompt,
      ttiConfigId,
      onProgress: (p, step) => {
        const overall = baseProgress + (p / scenes.length);
        onProgress?.(overall, `${scene.name}: ${step}`);
      },
    });

    results.push({ sceneId: scene.id, ...result });
    if (result.success) {
      success++;
    } else {
      failed++;
    }
  }

  return { success, failed, results };
}

// ========== 道具图片生成 ==========

/**
 * 生成道具参考图
 */
export async function generatePropImage(
  options: GenerateOptions & { prop: Prop }
): Promise<{ success: boolean; path?: string; url?: string; error?: string }> {
  const { projectId, prop, theme, stylePrompt, styleSnapshot, project, ttiConfigId, onProgress } = options;

  logger.info(`开始生成道具参考图: ${prop.name}`);
  onProgress?.(0, '准备生成道具图...');

  try {
    const ttiProvider = await getProjectTTIProvider(ttiConfigId);
    if (!ttiProvider) {
      throw new Error('未配置 TTI 服务');
    }

    // 构建提示词（从配置化模板读取）
    const stylePrefix = await getResolvedTTIStylePrefix(styleSnapshot || project?.styleSnapshot, theme, stylePrompt);
    const resolvedPrompt = await resolvePromptTemplate('tti_prop_reference', {
      stylePrefix: stylePrefix || '',
      description: prop.description || '',
      type: prop.type || '',
    });
    const prompt = resolvedPrompt.prompt;

    // 创建任务记录
    const task = await createTask(projectId, {
      projectId,
      type: 'tti',
      targetType: 'prop',
      targetId: prop.id,
      targetName: `道具: ${prop.name}`,
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
      IMAGE_GENERATION_SIZES.square,
      {
        projectId,
        targetId: prop.id,
        targetName: `道具: ${prop.name}`,
        templateId: resolvedPrompt.template.id,
        promptSource: resolvedPrompt.source,
      }
    );

    const result = await ttiProvider.generateImage(prompt, {
      ...IMAGE_GENERATION_SIZES.square, // 正方形道具图
    });

    if (typeof result === 'string' && ttiProvider.checkProgress) {
      // 异步模式
      let progress = await ttiProvider.checkProgress(result);
      while (progress.status === 'queued' || progress.status === 'processing') {
        await sleep(3000);
        progress = await ttiProvider.checkProgress(result);
        onProgress?.(10 + progress.progress * 0.8, `生成中 ${progress.progress}%`);
      }

      if (progress.status === 'completed' && progress.resultUrl) {
        onProgress?.(90, '下载图片...');
        const config = getStorageConfig() || (await initStorageConfig());
        const localPath = `${config.rootPath}/projects/${projectId}/assets/props/${prop.id}/reference.png`;
        const downloadResult = await downloadRemoteAsset(progress.resultUrl, localPath);

        if (downloadResult.success && downloadResult.localPath) {
          await markTaskCompleted(projectId, task.id, progress.resultUrl, downloadResult.localPath);
          // 同时保存本地路径和远程URL
          await updatePropAsset(projectId, prop.id, {
            imagePath: downloadResult.localPath,
            imageUrl: progress.resultUrl,
          });
          onProgress?.(100, '完成');
          return { success: true, path: downloadResult.localPath, url: progress.resultUrl };
        }
      }

      await markTaskFailed(projectId, task.id, progress.error || '生成失败');
      return { success: false, error: progress.error || '生成失败' };
    } else if (typeof result !== 'string') {
      // 同步模式 - result 可能包含 url 或本地路径
      onProgress?.(90, '保存道具图...');

      const resultPath = result.path || result.url;
      const isRemoteUrl = resultPath?.startsWith('http://') || resultPath?.startsWith('https://');

      let localPath: string;
      let remoteUrl: string | undefined;

      if (isRemoteUrl) {
        // 远程 URL，需要下载
        remoteUrl = resultPath;
        const config = getStorageConfig() || (await initStorageConfig());
        const targetPath = `${config.rootPath}/projects/${projectId}/assets/props/${prop.id}/reference.png`;
        const downloadResult = await downloadRemoteAsset(remoteUrl, targetPath);
        if (!downloadResult.success || !downloadResult.localPath) {
          throw new Error('下载图片失败');
        }
        localPath = downloadResult.localPath;
      } else {
        // 本地路径
        localPath = await savePropImage(projectId, prop.id, resultPath);
        remoteUrl = result.url;
      }

      await markTaskCompleted(projectId, task.id, resultPath, localPath);
      // 同时保存本地路径和远程URL
      await updatePropAsset(projectId, prop.id, {
        imagePath: localPath,
        imageUrl: remoteUrl,
      });

      onProgress?.(100, '完成');
      return { success: true, path: localPath, url: remoteUrl };
    }

    return { success: false, error: '未知错误' };
  } catch (err: any) {
    logger.error(`生成道具图失败: ${prop.name}`, { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * 批量生成道具参考图
 */
export async function generateAllPropImages(
  options: GenerateOptions & { props: Prop[] }
): Promise<{ success: number; failed: number; results: Array<{ propId: string; success: boolean; path?: string; error?: string }> }> {
  const { projectId, props, theme, stylePrompt, ttiConfigId, onProgress } = options;

  const results: Array<{ propId: string; success: boolean; path?: string; error?: string }> = [];
  let success = 0;
  let failed = 0;

  for (let i = 0; i < props.length; i++) {
    const prop = props[i];
    const baseProgress = (i / props.length) * 100;

    const result = await generatePropImage({
      projectId,
      prop,
      theme,
      stylePrompt,
      ttiConfigId,
      onProgress: (p, step) => {
        const overall = baseProgress + (p / props.length);
        onProgress?.(overall, `${prop.name}: ${step}`);
      },
    });

    results.push({ propId: prop.id, ...result });
    if (result.success) {
      success++;
    } else {
      failed++;
    }
  }

  return { success, failed, results };
}

// ========== 道具预览视频生成 ==========

interface PropVideoOptions {
  projectId: string;
  prop: Prop;
  theme?: string;
  stylePrompt?: string;
  styleSnapshot?: StyleSnapshotLike;
  project?: { styleSnapshot?: StyleSnapshotLike };
  itvConfigId?: string;
  onProgress?: (progress: number, step: string) => void;
}

/**
 * 生成道具预览视频
 * 使用道具图片 + ITV 服务生成短视频
 */
export async function generatePropPreviewVideo(
  options: PropVideoOptions
): Promise<{ success: boolean; path?: string; taskId?: string; error?: string }> {
  const { projectId, prop, theme, stylePrompt, styleSnapshot, project, itvConfigId, onProgress } = options;

  logger.info(`开始生成道具预览视频: ${prop.name}`);
  onProgress?.(0, '准备生成预览视频...');

  // 优先使用远程 URL
  const imageSource = prop.imageUrl || prop.imagePath;
  if (!imageSource) {
    return { success: false, error: '请先生成道具参考图' };
  }

  if (!prop.imageUrl) {
    logger.warn(`道具 ${prop.name} 没有远程图片 URL，将使用本地路径。某些服务（如 Sora2）可能需要远程 URL。`);
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
      targetType: 'prop',
      targetId: prop.id,
      targetName: `${prop.name} 预览视频`,
      remoteTaskId: '',
      status: 'pending',
      progress: 0,
      maxRetries: 3,
    });

    onProgress?.(10, '调用 ITV 服务...');

    // 构建道具视频提示词
    const resolvedStylePrefix = await getResolvedTTIStylePrefix(styleSnapshot || project?.styleSnapshot, theme, stylePrompt);
    const resolvedPrompt = await resolvePromptTemplate('itv_prop_motion', {
      stylePrefix: resolvedStylePrefix,
      description: prop.customPrompt || prop.prompt || prop.description || prop.name,
      motion: 'prop showcase, rotating slowly, detailed view',
    });
    const prompt = resolvedPrompt.prompt;

    logITVCall(
      itvProvider.config?.name || 'ITV',
      imageSource,
      prompt,
      { duration: 4, aspectRatio: '1:1' },
      {
        projectId,
        targetId: prop.id,
        targetName: `${prop.name} 预览视频`,
        templateId: resolvedPrompt.template.id,
        promptSource: resolvedPrompt.source,
      }
    );

    // 调用 ITV Provider 生成视频
    const result = await itvProvider.generateVideo({
      imageUrl: imageSource,
      prompt,
      options: { duration: 4, aspectRatio: '1:1' },
    });

    if (result.url || (result as any).path) {
      const videoUrl = result.url || (result as any).path;
      const videoTaskId = (result as any).taskId;

      onProgress?.(90, '下载视频...');
      const config = getStorageConfig() || (await initStorageConfig());
      const localPath = `${config.rootPath}/projects/${projectId}/assets/props/${prop.id}/preview.mp4`;
      const downloadResult = await downloadRemoteAsset(videoUrl, localPath);

      if (downloadResult.success && downloadResult.localPath) {
        await markTaskCompleted(projectId, task.id, videoUrl, downloadResult.localPath);
        await updatePropAsset(projectId, prop.id, {
          previewVideoPath: downloadResult.localPath,
          previewVideoTaskId: videoTaskId,
        });
        onProgress?.(100, '完成');
        return { success: true, path: downloadResult.localPath, taskId: videoTaskId };
      }
      return { success: false, error: '下载视频失败' };
    }

    return { success: false, error: '视频生成失败：未返回有效结果' };
  } catch (err: any) {
    logger.error(`生成道具预览视频失败: ${prop.name}`, { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * 调用道具提取API绑定道具
 * 需要先生成预览视频并保存任务 ID
 */
export async function extractAndBindProp(
  projectId: string,
  prop: Prop,
  itvConfigId?: string
): Promise<{ success: boolean; propId?: string; error?: string }> {
  logger.info(`开始提取道具: ${prop.name}`);

  // 检查是否有视频生成任务 ID
  if (!prop.previewVideoTaskId) {
    if (prop.previewVideoPath) {
      return { success: false, error: '请重新生成预览视频（需要保存任务ID用于道具提取）' };
    }
    return { success: false, error: '请先生成预览视频' };
  }

  try {
    const itvProvider = await getProjectITVProvider(itvConfigId);
    if (!itvProvider) {
      throw new Error('未配置 ITV 服务');
    }

    // 检查是否支持道具提取
    if (!itvProvider.extractProp) {
      return { success: false, error: 'ITV Provider 不支持道具提取' };
    }

    // 使用任务 ID 调用道具提取 API
    const sora2PropId = await itvProvider.extractProp(prop.previewVideoTaskId);
    await updatePropAsset(projectId, prop.id, { sora2PropId });

    logger.info(`道具提取成功: ${prop.name} -> ${sora2PropId}`);
    return { success: true, propId: sora2PropId };
  } catch (err: any) {
    logger.error(`道具提取失败: ${prop.name}`, { error: err.message });
    return { success: false, error: err.message };
  }
}

// ========== 辅助函数（硬编码默认模板，作为 fallback）==========

/**
 * 构建场景提示词（硬编码默认模板）
 * 注意：实际生成时优先使用 promptTemplates 中的 tti_scene_preview 模板
 */
function buildScenePrompt(scene: Scene, stylePrefix: string): string {
  return buildScenePromptInternal(scene, stylePrefix);
}

/**
 * 构建道具提示词（硬编码默认模板）
 * 注意：实际生成时优先使用 promptTemplates 中的 tti_prop_reference 模板
 */
function buildPropPrompt(prop: Prop, stylePrefix: string): string {
  return buildPropPromptInternal(prop, stylePrefix);
}

async function updateSceneAsset(
  projectId: string,
  sceneId: string,
  updates: Partial<Scene>
): Promise<void> {
  const scenes = await loadScenes(projectId);
  const index = scenes.findIndex(s => s.id === sceneId);
  if (index !== -1) {
    scenes[index] = { ...scenes[index], ...updates };
    await saveScenes(projectId, scenes);
  }
}

async function updatePropAsset(
  projectId: string,
  propId: string,
  updates: Partial<Prop>
): Promise<void> {
  const props = await loadProps(projectId);
  const index = props.findIndex(p => p.id === propId);
  if (index !== -1) {
    props[index] = { ...props[index], ...updates };
    await saveProps(projectId, props);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function resolveTTIStylePrefix(
  styleSnapshot?: StyleSnapshotLike,
  theme?: string,
  stylePrompt?: string
): string {
  return styleSnapshot?.ttiStylePrefix || getThemeStylePrefix(theme, stylePrompt);
}

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

function applyStylePrefix(prompt: string, stylePrefix?: string): string {
  const basePrompt = prompt.trim();
  const prefix = (stylePrefix || '').trim();
  if (!prefix) {
    return basePrompt;
  }
  if (basePrompt.startsWith(prefix)) {
    return basePrompt;
  }
  const normalizedPrefix = prefix.endsWith(',') ? prefix : `${prefix},`;
  return `${normalizedPrefix} ${basePrompt}`;
}
