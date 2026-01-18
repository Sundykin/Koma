/**
 * 场景/道具资产生成工作流
 */
import type { Scene, Prop } from '../types';
import { getProjectTTIProvider } from '../providers';
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
import { getThemeStylePrefix } from '../config/themePresets';
import { createLogger } from '../store/logger';
import { logTTICall } from '../store/aiCallLogger';
import { getPromptTemplate, fillTemplate } from '../store/promptTemplates';

const logger = createLogger('ScenePropAsset');

interface GenerateOptions {
  projectId: string;
  theme?: string;
  stylePrompt?: string;
  ttiConfigId?: string;
  onProgress?: (progress: number, step: string) => void;
}

// ========== 场景图片生成 ==========

/**
 * 生成场景预览图
 */
export async function generateSceneImage(
  options: GenerateOptions & { scene: Scene }
): Promise<{ success: boolean; path?: string; error?: string }> {
  const { projectId, scene, theme, stylePrompt, ttiConfigId, onProgress } = options;

  logger.info(`开始生成场景预览图: ${scene.name}`);
  onProgress?.(0, '准备生成场景图...');

  try {
    const ttiProvider = await getProjectTTIProvider(ttiConfigId);
    if (!ttiProvider) {
      throw new Error('未配置 TTI 服务');
    }

    // 构建提示词（从配置化模板读取）
    const stylePrefix = getThemeStylePrefix(theme, stylePrompt);
    let prompt: string;
    try {
      const template = await getPromptTemplate('tti_scene_preview');
      prompt = fillTemplate(template.template, {
        stylePrefix: stylePrefix || '',
        description: scene.description || '',
        location: scene.location || '',
        time: scene.time || 'day',
        mood: scene.mood || '',
      });
    } catch {
      // 回退到硬编码模板
      prompt = buildScenePrompt(scene, stylePrefix);
    }

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
      { width: 1920, height: 1080 },
      { projectId, targetId: scene.id, targetName: `场景: ${scene.name}` }
    );

    const result = await ttiProvider.generateImage(prompt, {
      width: 1920,
      height: 1080, // 横版场景图
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
          await updateSceneAsset(projectId, scene.id, { imagePath: downloadResult.localPath });
          onProgress?.(100, '完成');
          return { success: true, path: downloadResult.localPath };
        }
      }

      await markTaskFailed(projectId, task.id, progress.error || '生成失败');
      return { success: false, error: progress.error || '生成失败' };
    } else if (typeof result !== 'string') {
      // 同步模式
      onProgress?.(90, '保存场景图...');
      const localPath = await saveSceneImage(projectId, scene.id, result.path);
      await markTaskCompleted(projectId, task.id, result.path, localPath);
      await updateSceneAsset(projectId, scene.id, { imagePath: localPath });

      onProgress?.(100, '完成');
      return { success: true, path: localPath };
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
): Promise<{ success: boolean; path?: string; error?: string }> {
  const { projectId, prop, theme, stylePrompt, ttiConfigId, onProgress } = options;

  logger.info(`开始生成道具参考图: ${prop.name}`);
  onProgress?.(0, '准备生成道具图...');

  try {
    const ttiProvider = await getProjectTTIProvider(ttiConfigId);
    if (!ttiProvider) {
      throw new Error('未配置 TTI 服务');
    }

    // 构建提示词（从配置化模板读取）
    const stylePrefix = getThemeStylePrefix(theme, stylePrompt);
    let prompt: string;
    try {
      const template = await getPromptTemplate('tti_prop_reference');
      prompt = fillTemplate(template.template, {
        stylePrefix: stylePrefix || '',
        description: prop.description || '',
        type: prop.type || '',
      });
    } catch {
      // 回退到硬编码模板
      prompt = buildPropPrompt(prop, stylePrefix);
    }

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
      { width: 1024, height: 1024 },
      { projectId, targetId: prop.id, targetName: `道具: ${prop.name}` }
    );

    const result = await ttiProvider.generateImage(prompt, {
      width: 1024,
      height: 1024, // 正方形道具图
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
          await updatePropAsset(projectId, prop.id, { imagePath: downloadResult.localPath });
          onProgress?.(100, '完成');
          return { success: true, path: downloadResult.localPath };
        }
      }

      await markTaskFailed(projectId, task.id, progress.error || '生成失败');
      return { success: false, error: progress.error || '生成失败' };
    } else if (typeof result !== 'string') {
      // 同步模式
      onProgress?.(90, '保存道具图...');
      const localPath = await savePropImage(projectId, prop.id, result.path);
      await markTaskCompleted(projectId, task.id, result.path, localPath);
      await updatePropAsset(projectId, prop.id, { imagePath: localPath });

      onProgress?.(100, '完成');
      return { success: true, path: localPath };
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

// ========== 辅助函数（硬编码默认模板，作为 fallback）==========

/**
 * 构建场景提示词（硬编码默认模板）
 * 注意：实际生成时优先使用 promptTemplates 中的 tti_scene_preview 模板
 */
function buildScenePrompt(scene: Scene, stylePrefix: string): string {
  const timeDescriptions = {
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
    timeDescriptions[scene.time],
    scene.mood ? `${scene.mood} atmosphere` : '',
    'detailed background',
    'cinematic composition',
  ];
  return parts.filter(Boolean).join(', ');
}

/**
 * 构建道具提示词（硬编码默认模板）
 * 注意：实际生成时优先使用 promptTemplates 中的 tti_prop_reference 模板
 */
function buildPropPrompt(prop: Prop, stylePrefix: string): string {
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
