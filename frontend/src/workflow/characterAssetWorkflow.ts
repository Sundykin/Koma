/**
 * 角色资产生成工作流
 * 生成角色定妆照（内置三视图）、预览视频，以及调用角色提取API
 */
import {
  getMediaAssetDisplaySource,
  getMediaAssetSource,
  type Character,
  type StoredMediaAsset,
  type VideoGenerationCapability,
} from '../types';
import { getProjectITVProvider } from '../providers';
import { serializeMediaSelection } from '../providers/channel/resolver';
import {
  saveCharacters,
  loadCharacters,
} from '../store/projectStore';
import { getThemeStylePrefix, getThemeStylePrefixAsync } from '../config/themePresets';
import { createLogger } from '../store/logger';
import { logTTICall, logITVCall } from '../store/aiCallLogger';
import { resolvePromptTemplate } from '../store/promptTemplates';
import { getActiveITVConfig } from '../store/settings/mediaConfig';
import { mediaGenerationService } from '../services/MediaGenerationService';
import { runWithTask } from '../services/taskRunner';
import { buildCharacterCostumeTemplateVariables } from './promptVariableBuilders';
import { compileCharacterPreviewVideoRequest } from './videoGenerationRequests';
import type { StyleSnapshotLike } from '../utils/promptNormalize';
import { normalizeVideoDurationSeconds } from '../utils/videoDuration';
import {
  appendStyleAnchorGuard,
  resolveActiveStyleReferenceAsset,
} from '../services/styleReferenceResolver';
import type { ProjectStyleSnapshot } from '../types';

const logger = createLogger('CharacterAsset');

const COSTUME_VARIATION_ROLE_LOCK = 'Keep the same role brief, occupation, costume direction, three-view model-sheet structure and project style; do not turn this into a different character role or asset type.';

function appendCandidateVariationPrompt(prompt: string, variationPrompt?: string): string {
  const trimmedVariation = variationPrompt?.trim();
  if (!trimmedVariation) {
    return prompt;
  }
  return [
    prompt,
    '',
    'Candidate variation instructions:',
    trimmedVariation,
    COSTUME_VARIATION_ROLE_LOCK,
  ].join('\n');
}

interface GenerateOptions {
  projectId: string;
  character: Character;
  /**
   * 项目全局画面比例。角色定妆照/人脸候选作为分镜的参考图，必须与项目比例一致；
   * 否则下游分镜走 image-to-image 时输出比例会跟着参考图，不会跟项目走。
   */
  aspectRatio?: '16:9' | '9:16';
  theme?: string;
  stylePrompt?: string;
  styleSnapshot?: StyleSnapshotLike;
  project?: { styleSnapshot?: StyleSnapshotLike; aspectRatio?: '16:9' | '9:16' };
  ttiSelection?: string;
  itvSelection?: string;
  seed?: number;
  variationPrompt?: string;
  destPath?: string;
  bindOwner?: boolean;
  normalizeRemoteUrl?: boolean;
  onProgress?: (progress: number, step: string) => void;
  /** 批量场景下父 task 已包装，子调用传 true 跳过单独的 task 创建 */
  disableTask?: boolean;
}

/**
 * 生成角色定妆照
 * 提示词内置三视图规范，一次生成包含正面/侧面/背面的图片
 */
export async function generateCostumePhoto(
  options: GenerateOptions
): Promise<{ success: boolean; path?: string; url?: string; error?: string }> {
  const { projectId, character, aspectRatio, theme, stylePrompt, styleSnapshot, project, ttiSelection, seed, variationPrompt, destPath, bindOwner, normalizeRemoteUrl, onProgress, disableTask } = options;
  const finalAspectRatio = aspectRatio || project?.aspectRatio || '16:9';

  logger.info(`开始生成角色定妆照: ${character.name}`, { aspectRatio: finalAspectRatio });
  onProgress?.(0, '准备生成定妆照...');

  try {
    // 构建提示词（从配置化模板读取）
    const stylePrefix = await getResolvedTTIStylePrefix(styleSnapshot || project?.styleSnapshot, theme, stylePrompt);
    const resolvedPrompt = await resolvePromptTemplate(
      'tti_character_costume',
      buildCharacterCostumeTemplateVariables(character, stylePrefix || '')
    );
    const basePrompt = appendCandidateVariationPrompt(resolvedPrompt.prompt, variationPrompt);

    // 风格锚定参考图（references[0]）：让模型严格继承画风但不继承内容。
    // 项目级 styleSnapshot.styleReferenceImage 优先，回退到预设默认图。
    const styleAnchorAsset = await resolveActiveStyleReferenceAsset({
      project: { styleSnapshot: (styleSnapshot || project?.styleSnapshot) as ProjectStyleSnapshot | undefined },
      themeId: theme,
    });
    const prompt = appendStyleAnchorGuard(basePrompt, Boolean(styleAnchorAsset));
    const references = styleAnchorAsset ? [styleAnchorAsset] : [];

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
        targetId: character.id,
        targetName: `${character.name} 定妆照`,
        templateId: resolvedPrompt.template.id,
        promptSource: resolvedPrompt.source,
      }
    );

    // 用 runWithTask 包"用户级"生成动作：同步 provider 也能在任务面板可见。
    // 异步 provider 内部走 submitTask({type:'tti'/'itv'/...})，主进程 TaskRunner 主导轮询。
    const { result: asset } = await runWithTask({
      disabled: disableTask,
      projectId,
      category: 'asset',
      subType: 'asset-generation',
      targetType: 'character',
      targetId: character.id,
      targetName: `${character.name} 定妆照`,
      type: 'asset-generation',
      execute: async (ctx) => {
        ctx.progress(10, '调用 TTI 服务...');
        const a = await mediaGenerationService.generateImage({
          projectId,
          ownerRef: {
            projectId,
            ownerType: 'character',
            ownerId: character.id,
            slot: 'costumePhoto',
          },
          request: {
            prompt,
            references,
            options: {
              aspectRatio: finalAspectRatio,
              ...(seed !== undefined ? { seed } : undefined),
            },
          },
          ttiSelection,
          destPath,
          bindOwner,
          normalizeRemoteUrl,
          taskName: `${character.name} 定妆照`,
        });
        ctx.progress(100, '完成');
        return a;
      },
    });

    onProgress?.(100, '完成');
    return { success: true, path: asset.localPath, url: asset.remoteUrl };
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
  const { projectId, character, theme, stylePrompt, styleSnapshot, project, itvSelection, onProgress, disableTask } = options;

  logger.info(`开始生成角色预览视频: ${character.name}`);
  onProgress?.(0, '准备生成预览视频...');

  // 优先使用远程 URL，其次使用本地路径
  const rawImageSource = getMediaAssetDisplaySource(character.media?.costumePhoto);
  if (!rawImageSource) {
    return { success: false, error: '请先生成定妆照' };
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
    } catch {
      logger.warn('获取 ITV 配置失败，使用默认时长 10s');
    }
    previewDuration = normalizeVideoDurationSeconds(previewDuration);

    const resolvedStylePrefix = await getResolvedTTIStylePrefix(styleSnapshot || project?.styleSnapshot, theme, stylePrompt);
    const compiledRequest = await compileCharacterPreviewVideoRequest({
      character,
      primaryImage: rawImageSource,
      stylePrefix: resolvedStylePrefix,
      duration: previewDuration,
    });

    // 打印完整提示词日志
    logITVCall(
      'ITV',
      rawImageSource,
      compiledRequest.prompt,
      { duration: previewDuration, aspectRatio: '9:16' },
      {
        projectId,
        targetId: character.id,
        targetName: `${character.name} 预览视频`,
        templateId: compiledRequest.templateId,
        promptSource: compiledRequest.promptSource,
      }
    );

    const { result: asset } = await runWithTask({
      disabled: disableTask,
      projectId,
      category: 'asset',
      subType: 'asset-generation',
      targetType: 'character',
      targetId: character.id,
      targetName: `${character.name} 预览视频`,
      type: 'asset-generation',
      execute: async (ctx) => {
        ctx.progress(10, '调用 ITV 服务...');
        const a = await mediaGenerationService.generateVideo({
          projectId,
          ownerRef: {
            projectId,
            ownerType: 'character',
            ownerId: character.id,
            slot: 'previewVideo',
          },
          request: compiledRequest.request,
          itvSelection,
          taskName: `${character.name} 预览视频`,
        });
        ctx.progress(100, '完成');
        return a;
      },
    });

    onProgress?.(100, '完成');
    return { success: true, path: asset.localPath, taskId: asset.providerTaskId };
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
  itvSelection?: string,
  onProgress?: (progress: number, step: string) => void
): Promise<{ success: boolean; characterId?: string; error?: string }> {
  logger.info(`开始提取角色: ${character.name}`);
  onProgress?.(0, '准备角色提取...');

  // 检查是否有视频生成任务 ID（角色提取 API 需要使用 from_task 参数）
  const previewVideoTaskId = character.media?.previewVideo?.providerTaskId;
  const previewVideoPath = getMediaAssetSource(character.media?.previewVideo);
  const previewVideoAsset = character.media?.previewVideo;

  if (!previewVideoTaskId) {
    // 兼容旧数据：如果有视频路径但没有任务 ID，提示用户重新生成
    if (previewVideoPath) {
      return { success: false, error: '请重新生成预览视频（需要保存任务ID用于角色提取）' };
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

    // 检查是否支持角色提取
    if (!itvProvider.extractCharacter) {
      return { success: false, error: 'ITV Provider 不支持角色提取' };
    }

    onProgress?.(10, '调用角色提取 API...');

    // 获取用户设置的时间范围，默认 1-3 秒
    let timestamps = '1,3';
    if (character.timestampRange) {
      const { start, end } = character.timestampRange;
      // 验证时间范围不超过 3 秒
      if (end - start > 3) {
        return { success: false, error: '提取时间范围不能超过3秒' };
      }
      timestamps = `${start},${end}`;
    }

    // 使用任务 ID 调用角色提取 API
    const extractResult = await itvProvider.extractCharacter({
      fromTask: previewVideoTaskId,
      timestamps,
    });

    // Handle case where extractResult is CharacterProgressInfo (already completed)
    const extractTaskId = typeof extractResult === 'string' ? extractResult : '';

    // 检查是否支持角色提取状态轮询
    if (itvProvider.checkCharacterProgress && extractTaskId) {
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
    buildCharacterCostumeTemplateVariables(character, stylePrefix).appearance,
  ];
  return parts.filter(Boolean).join(', ');
}

/**
 * 获取角色的完整提示词（便捷函数）
 */
export function getCharacterPrompt(
  character: Character,
  theme?: string,
  stylePrompt?: string,
  styleSnapshot?: StyleSnapshotLike,
  project?: { styleSnapshot?: StyleSnapshotLike }
): string {
  const stylePrefix = resolveTTIStylePrefix(styleSnapshot || project?.styleSnapshot, theme, stylePrompt);
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
    const existing = characters[index];
    const mergedMedia = updates.media
      ? { ...(existing.media || {}), ...(updates.media || {}) }
      : existing.media;
    characters[index] = { ...existing, ...updates, media: mergedMedia };
    await saveCharacters(projectId, characters);
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

