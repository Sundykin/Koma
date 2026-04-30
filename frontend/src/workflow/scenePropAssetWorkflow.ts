/**
 * 场景/道具资产生成工作流
 */
import {
  getMediaAssetDisplaySource,
  getMediaAssetSource,
  type Scene,
  type Prop,
  type StoredMediaAsset,
  type VideoGenerationCapability,
} from '../types';
import { getProjectITVProvider } from '../providers';
import { serializeMediaSelection } from '../providers/channel/resolver';
import {
  saveScenes,
  saveProps,
  loadScenes,
  loadProps,
} from '../store/projectStore';
import { getThemeStylePrefix, getThemeStylePrefixAsync } from '../config/themePresets';
import { createLogger } from '../store/logger';
import { logTTICall, logITVCall } from '../store/aiCallLogger';
import { resolvePromptTemplate } from '../store/promptTemplates';
import { getActiveITVConfig } from '../store/settings/mediaConfig';
import { IMAGE_GENERATION_SIZES } from '../constants/dimensions';
import { mediaGenerationService } from '../services/MediaGenerationService';
import { runWithTask } from '../services/taskRunner';
import {
  buildPropReferenceTemplateVariables,
  buildScenePreviewTemplateVariables,
} from './promptVariableBuilders';
import { compilePropPreviewVideoRequest } from './videoGenerationRequests';
import type { StyleSnapshotLike } from '../utils/promptNormalize';
import { normalizeVideoDurationSeconds } from '../utils/videoDuration';

const logger = createLogger('ScenePropAsset');

function appendCandidateVariationPrompt(prompt: string, variationPrompt?: string): string {
  const trimmedVariation = variationPrompt?.trim();
  if (!trimmedVariation) {
    return prompt;
  }
  return `${prompt}\n\nCandidate variation instructions:\n${trimmedVariation}\nKeep the same asset identity and do not change the character/person/object/scene identity.`;
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
  return buildPropPromptInternal(prop, stylePrefix);
}

// 内部构建函数（同步版本）
function buildScenePromptInternal(scene: Scene, stylePrefix: string): string {
  const variables = buildScenePreviewTemplateVariables(scene, stylePrefix);
  const parts = [
    variables.stylePrefix,
    'environment concept art',
    'wide shot',
    'establishing shot',
    variables.description,
    variables.location,
    variables.time,
    variables.mood,
    'detailed background',
    'cinematic composition',
  ];
  return parts.filter(Boolean).join(', ');
}

function buildPropPromptInternal(prop: Prop, stylePrefix: string): string {
  const variables = buildPropReferenceTemplateVariables(prop, stylePrefix);
  const parts = [
    variables.stylePrefix,
    'prop design',
    'item illustration',
    'centered composition',
    'white background',
    'studio lighting',
    variables.description,
    variables.type ? `${variables.type} item` : '',
    'detailed rendering',
    'clean presentation',
  ];
  return parts.filter(Boolean).join(', ');
}

interface GenerateOptions {
  projectId: string;
  aspectRatio?: '16:9' | '9:16';
  theme?: string;
  stylePrompt?: string;
  styleSnapshot?: StyleSnapshotLike;
  project?: { styleSnapshot?: StyleSnapshotLike; aspectRatio?: '16:9' | '9:16' };
  ttiSelection?: string;
  seed?: number;
  variationPrompt?: string;
  destPath?: string;
  bindOwner?: boolean;
  normalizeRemoteUrl?: boolean;
  onProgress?: (progress: number, step: string) => void;
}

// ========== 场景图片生成 ==========

/**
 * 生成场景预览图
 */
export async function generateSceneImage(
  options: GenerateOptions & { scene: Scene; disableTask?: boolean }
): Promise<{ success: boolean; path?: string; url?: string; error?: string }> {
  const { projectId, scene, aspectRatio, theme, stylePrompt, styleSnapshot, project, ttiSelection, seed, variationPrompt, destPath, bindOwner, normalizeRemoteUrl, onProgress, disableTask } = options;
  const finalAspectRatio = aspectRatio || project?.aspectRatio || '16:9';

  logger.info(`开始生成场景预览图: ${scene.name}`);
  onProgress?.(0, '准备生成场景图...');

  try {
    // 构建提示词（从配置化模板读取）
    const stylePrefix = await getResolvedTTIStylePrefix(styleSnapshot || project?.styleSnapshot, theme, stylePrompt);
    const resolvedPrompt = await resolvePromptTemplate(
      'tti_scene_preview',
      buildScenePreviewTemplateVariables(scene, stylePrefix || '')
    );
    const prompt = appendCandidateVariationPrompt(resolvedPrompt.prompt, variationPrompt);

    onProgress?.(10, '调用 TTI 服务...');

    // 打印完整提示词日志
    logTTICall(
      'TTI',
      prompt,
      {
        aspectRatio: finalAspectRatio,
        ...(seed !== undefined ? { seed } : undefined),
      },
      {
        projectId,
        targetId: scene.id,
        targetName: `场景: ${scene.name}`,
        templateId: resolvedPrompt.template.id,
        promptSource: resolvedPrompt.source,
      }
    );

    const { result: asset } = await runWithTask({
      disabled: disableTask,
      projectId,
      category: 'asset',
      subType: 'asset-generation',
      targetType: 'scene',
      targetId: scene.id,
      targetName: `场景: ${scene.name}`,
      type: 'asset-generation',
      execute: async (ctx) => {
        ctx.progress(10, '调用 TTI 服务...');
        const a = await mediaGenerationService.generateImage({
          projectId,
          ownerRef: {
            projectId,
            ownerType: 'scene',
            ownerId: scene.id,
            slot: 'previewImage',
          },
          request: {
            prompt,
            references: [],
            options: {
              aspectRatio: finalAspectRatio,
              ...(seed !== undefined ? { seed } : undefined),
            },
          },
          ttiSelection,
          destPath,
          bindOwner,
          normalizeRemoteUrl,
          taskName: `场景: ${scene.name}`,
        });
        ctx.progress(100, '完成');
        return a;
      },
    });
    onProgress?.(100, '完成');
    return { success: true, path: asset.localPath, url: asset.remoteUrl };
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
  const { projectId, scenes, aspectRatio, theme, stylePrompt, project, ttiSelection, onProgress } = options;

  if (scenes.length === 0) return { success: 0, failed: 0, results: [] };

  const { result } = await runWithTask({
    projectId,
    category: 'asset',
    subType: 'asset-generation',
    targetType: 'scene',
    targetId: scenes[0].id,
    targetName: `批量场景图（${scenes.length} 个）`,
    type: 'asset-generation',
    metadata: { batchCount: scenes.length },
    execute: async (taskCtx) => {
      const out: Array<{ sceneId: string; success: boolean; path?: string; error?: string }> = [];
      let success = 0;
      let failed = 0;

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const baseProgress = (i / scenes.length) * 100;

        const r = await generateSceneImage({
          projectId,
          scene,
          aspectRatio,
          theme,
          stylePrompt,
          project,
          ttiSelection,
          disableTask: true, // 批量场景下子任务不再单独建 task，避免任务面板被刷屏
          onProgress: (p, step) => {
            const overall = baseProgress + (p / scenes.length);
            onProgress?.(overall, `${scene.name}: ${step}`);
            taskCtx.progress(overall, `${scene.name}: ${step}`);
          },
        });

        out.push({ sceneId: scene.id, ...r });
        if (r.success) success++; else failed++;
      }
      return { success, failed, results: out };
    },
  });
  return result;
}

// ========== 道具图片生成 ==========

/**
 * 生成道具参考图
 */
export async function generatePropImage(
  options: GenerateOptions & { prop: Prop; disableTask?: boolean }
): Promise<{ success: boolean; path?: string; url?: string; error?: string }> {
  const { projectId, prop, theme, stylePrompt, styleSnapshot, project, ttiSelection, seed, variationPrompt, destPath, bindOwner, normalizeRemoteUrl, onProgress, disableTask } = options;

  logger.info(`开始生成道具参考图: ${prop.name}`);
  onProgress?.(0, '准备生成道具图...');

  try {
    // 构建提示词（从配置化模板读取）
    const stylePrefix = await getResolvedTTIStylePrefix(styleSnapshot || project?.styleSnapshot, theme, stylePrompt);
    const resolvedPrompt = await resolvePromptTemplate(
      'tti_prop_reference',
      buildPropReferenceTemplateVariables(prop, stylePrefix || '')
    );
    const prompt = appendCandidateVariationPrompt(resolvedPrompt.prompt, variationPrompt);

    onProgress?.(10, '调用 TTI 服务...');

    // 打印完整提示词日志
    logTTICall(
      'TTI',
      prompt,
      {
        ...IMAGE_GENERATION_SIZES.square,
        ...(seed !== undefined ? { seed } : undefined),
      },
      {
        projectId,
        targetId: prop.id,
        targetName: `道具: ${prop.name}`,
        templateId: resolvedPrompt.template.id,
        promptSource: resolvedPrompt.source,
      }
    );

    const { result: asset } = await runWithTask({
      disabled: disableTask,
      projectId,
      category: 'asset',
      subType: 'asset-generation',
      targetType: 'prop',
      targetId: prop.id,
      targetName: `道具: ${prop.name}`,
      type: 'asset-generation',
      execute: async (ctx) => {
        ctx.progress(10, '调用 TTI 服务...');
        const a = await mediaGenerationService.generateImage({
          projectId,
          ownerRef: {
            projectId,
            ownerType: 'prop',
            ownerId: prop.id,
            slot: 'previewImage',
          },
          request: {
            prompt,
            references: [],
            options: {
              ...IMAGE_GENERATION_SIZES.square,
              ...(seed !== undefined ? { seed } : undefined),
            },
          },
          ttiSelection,
          destPath,
          bindOwner,
          normalizeRemoteUrl,
          taskName: `道具: ${prop.name}`,
        });
        ctx.progress(100, '完成');
        return a;
      },
    });
    onProgress?.(100, '完成');
    return { success: true, path: asset.localPath, url: asset.remoteUrl };
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
  const { projectId, props, theme, stylePrompt, ttiSelection, onProgress } = options;

  if (props.length === 0) return { success: 0, failed: 0, results: [] };

  const { result } = await runWithTask({
    projectId,
    category: 'asset',
    subType: 'asset-generation',
    targetType: 'prop',
    targetId: props[0].id,
    targetName: `批量道具图（${props.length} 个）`,
    type: 'asset-generation',
    metadata: { batchCount: props.length },
    execute: async (taskCtx) => {
      const out: Array<{ propId: string; success: boolean; path?: string; error?: string }> = [];
      let success = 0;
      let failed = 0;

      for (let i = 0; i < props.length; i++) {
        const prop = props[i];
        const baseProgress = (i / props.length) * 100;

        const r = await generatePropImage({
          projectId,
          prop,
          theme,
          stylePrompt,
          ttiSelection,
          disableTask: true, // 批量场景下子任务不单独建 task
          onProgress: (p, step) => {
            const overall = baseProgress + (p / props.length);
            onProgress?.(overall, `${prop.name}: ${step}`);
            taskCtx.progress(overall, `${prop.name}: ${step}`);
          },
        });

        out.push({ propId: prop.id, ...r });
        if (r.success) success++; else failed++;
      }
      return { success, failed, results: out };
    },
  });
  return result;
}

// ========== 道具预览视频生成 ==========

interface PropVideoOptions {
  projectId: string;
  prop: Prop;
  theme?: string;
  stylePrompt?: string;
  styleSnapshot?: StyleSnapshotLike;
  project?: { styleSnapshot?: StyleSnapshotLike };
  itvSelection?: string;
  onProgress?: (progress: number, step: string) => void;
  /** 批量场景下父 task 已包装，子调用传 true 跳过单独的 task 创建 */
  disableTask?: boolean;
}

/**
 * 生成道具预览视频
 * 使用道具图片 + ITV 服务生成短视频
 */
export async function generatePropPreviewVideo(
  options: PropVideoOptions
): Promise<{ success: boolean; path?: string; taskId?: string; error?: string }> {
  const { projectId, prop, theme, stylePrompt, styleSnapshot, project, itvSelection, onProgress, disableTask } = options;

  logger.info(`开始生成道具预览视频: ${prop.name}`);
  onProgress?.(0, '准备生成预览视频...');

  // 优先使用远程 URL
  const rawImageSource = getMediaAssetDisplaySource(prop.media?.previewImage);
  if (!rawImageSource) {
    return { success: false, error: '请先生成道具参考图' };
  }

  try {
    onProgress?.(10, '调用 ITV 服务...');

    // 获取渠道配置中的默认时长
    let previewDuration = 10;
    try {
      const itvConfig = await getActiveITVConfig(itvSelection);
      if (itvConfig && typeof itvConfig.defaultDuration === 'number' && Number.isFinite(itvConfig.defaultDuration) && itvConfig.defaultDuration > 0) {
        previewDuration = itvConfig.defaultDuration;
      }
    } catch (e) {
      logger.warn('获取 ITV 配置失败，使用默认时长 10s');
    }
    previewDuration = normalizeVideoDurationSeconds(previewDuration);

    // 构建道具视频提示词
    const resolvedStylePrefix = await getResolvedTTIStylePrefix(styleSnapshot || project?.styleSnapshot, theme, stylePrompt);
    const compiledRequest = await compilePropPreviewVideoRequest({
      prop,
      primaryImage: rawImageSource,
      stylePrefix: resolvedStylePrefix,
      duration: previewDuration,
    });

    logITVCall(
      'ITV',
      rawImageSource,
      compiledRequest.prompt,
      { duration: previewDuration, aspectRatio: '1:1' },
      {
        projectId,
        targetId: prop.id,
        targetName: `${prop.name} 预览视频`,
        templateId: compiledRequest.templateId,
        promptSource: compiledRequest.promptSource,
      }
    );

    const { result: asset } = await runWithTask({
      disabled: disableTask,
      projectId,
      category: 'asset',
      subType: 'asset-generation',
      targetType: 'prop',
      targetId: prop.id,
      targetName: `${prop.name} 预览视频`,
      type: 'asset-generation',
      execute: async (ctx) => {
        ctx.progress(10, '调用 ITV 服务...');
        const a = await mediaGenerationService.generateVideo({
          projectId,
          ownerRef: {
            projectId,
            ownerType: 'prop',
            ownerId: prop.id,
            slot: 'previewVideo',
          },
          request: compiledRequest.request,
          itvSelection,
          taskName: `${prop.name} 预览视频`,
        });
        ctx.progress(100, '完成');
        return a;
      },
    });

    onProgress?.(100, '完成');
    return { success: true, path: asset.localPath, taskId: asset.providerTaskId };
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
  itvSelection?: string
): Promise<{ success: boolean; propId?: string; error?: string }> {
  logger.info(`开始提取道具: ${prop.name}`);

  // 检查是否有视频生成任务 ID
  const previewVideoTaskId = prop.media?.previewVideo?.providerTaskId;
  const previewVideoPath = getMediaAssetSource(prop.media?.previewVideo);
  const previewVideoAsset = prop.media?.previewVideo;

  if (!previewVideoTaskId) {
    if (previewVideoPath) {
      return { success: false, error: '请重新生成预览视频（需要保存任务ID用于道具提取）' };
    }
    return { success: false, error: '请先生成预览视频' };
  }

  try {
    const itvProvider = await getProjectITVProvider(
      getMediaAssetSelectionKey(previewVideoAsset) || itvSelection,
      getPreviewVideoCapability(previewVideoAsset),
    );
    if (!itvProvider) {
      throw new Error('未配置 ITV 服务');
    }

    // 检查是否支持道具提取
    if (!itvProvider.extractProp) {
      return { success: false, error: 'ITV Provider 不支持道具提取' };
    }

    // 使用任务 ID 调用道具提取 API
    const sora2PropId = await itvProvider.extractProp(previewVideoTaskId);
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
    const existing = scenes[index];
    const mergedMedia = updates.media
      ? { ...(existing.media || {}), ...(updates.media || {}) }
      : existing.media;
    scenes[index] = { ...existing, ...updates, media: mergedMedia };
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
    const existing = props[index];
    const mergedMedia = updates.media
      ? { ...(existing.media || {}), ...(updates.media || {}) }
      : existing.media;
    props[index] = { ...existing, ...updates, media: mergedMedia };
    await saveProps(projectId, props);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getMediaAssetSelectionKey(asset?: StoredMediaAsset): string | undefined {
  if (!asset?.channelId || !asset?.modelId) {
    return undefined;
  }
  return serializeMediaSelection({
    channelId: asset.channelId,
    modelId: asset.modelId,
  });
}

function getPreviewVideoCapability(asset?: StoredMediaAsset): VideoGenerationCapability {
  switch (asset?.capability) {
    case 'video.text-to-video':
    case 'video.reference-to-video':
    case 'video.start-end-to-video':
    case 'video.image-to-video':
      return asset.capability;
    default:
      return 'video.image-to-video';
  }
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
