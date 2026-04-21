/**
 * 分镜视频生成工作流
 * 纯 ITV 调用：使用已有参考图片（可选）生成视频
 */
import {
  getMediaAssetDisplaySource,
  isImageToVideoRequest,
  isReferenceToVideoRequest,
  type AppSettings,
  type Character,
  type Prop,
  type Scene,
  type Shot,
  type ShotVersion,
} from '../types';
import { getProjectTTSProvider } from '../providers';
import { saveShotVersion, loadShotMeta, loadCharacters, loadProps, loadScenes } from '../store/projectStore';
import { createLogger } from '../store/logger';
import { logITVCall, logTTSCall } from '../store/aiCallLogger';
import { resolvePromptTemplate } from '../store/promptTemplates';
import { getThemeStylePrefixAsync } from '../config/themePresets';
import {
  normalizeCharactersMediaState,
  normalizePropsMediaState,
  normalizeScenesMediaState,
  normalizeShotMediaState,
} from '../store/project/mediaState';
import { mediaGenerationService } from '../services/MediaGenerationService';
import { buildShotVideoTemplateVariables } from './promptVariableBuilders';
import {
  collectShotVideoPlan,
  resolveShotVideoCapabilitySupport,
} from './shotVideoPlan';
import { compileShotVideoGenerationRequest } from './videoGenerationRequests';
import { resolveConfiguredChannelModel } from '../providers/channel/resolver';
import type { StyleSnapshotLike } from '../utils/promptNormalize';

const logger = createLogger('ShotRender');

interface ShotRenderParams {
  projectId: string;
  episodeId?: string;
  shot: Shot;
  settings?: AppSettings;
  aspectRatio?: '16:9' | '9:16';
  mediaSelections?: {
    ttiSelection?: string;
    itvSelection?: string;
    ttsSelection?: string;
  };
  theme?: string;
  stylePrompt?: string;
  styleSnapshot?: StyleSnapshotLike;
  project?: { styleSnapshot?: StyleSnapshotLike; aspectRatio?: '16:9' | '9:16' };
}

interface ShotRenderResult {
  shotId: string;
  version: ShotVersion;
  success: boolean;
  error?: string;
}

interface BatchRenderParams {
  projectId: string;
  episodeId?: string;
  shots: Shot[];
  settings?: AppSettings;
  aspectRatio?: '16:9' | '9:16';
  mediaSelections?: {
    ttiSelection?: string;
    itvSelection?: string;
    ttsSelection?: string;
  };
  theme?: string;
  stylePrompt?: string;
  styleSnapshot?: StyleSnapshotLike;
  project?: { styleSnapshot?: StyleSnapshotLike; aspectRatio?: '16:9' | '9:16' };
  concurrency?: number;
}

interface BatchRenderResult {
  total: number;
  success: number;
  failed: number;
  results: ShotRenderResult[];
}

/**
 * 分镜视频生成工作流
 * 只调用 ITV，不生成图片
 */
export async function shotRenderWorkflow(
  params: ShotRenderParams,
  onProgress: (progress: number, step?: string) => void
): Promise<ShotRenderResult> {
  const { projectId, episodeId, shot, settings, mediaSelections, theme, stylePrompt, styleSnapshot, project } = params;
  const normalizedShot = normalizeShotMediaState(shot);

  logger.info(`开始生成分镜视频 ${normalizedShot.id}`);

  let itvProviderName = 'unknown';

  // 加载角色数据（用于构建 prompt）
  let characters: Character[] = [];
  try {
    characters = normalizeCharactersMediaState(await loadCharacters(projectId));
  } catch {
    // 忽略
  }

  const videoPlan = collectShotVideoPlan({
    shot: normalizedShot,
    characters,
    scenes: [],
    props: [],
  });

  try {
    // 获取视觉风格前缀（支持自定义预设）
    const stylePrefix = await getResolvedTTIStylePrefix(styleSnapshot || project?.styleSnapshot, theme, stylePrompt);

    // 加载道具
    let projectProps: Prop[] = [];
    try {
      projectProps = normalizePropsMediaState(await loadProps(projectId));
    } catch {
      // 忽略
    }

    let projectScenes: Scene[] = normalizeScenesMediaState([]);
    try {
      projectScenes = normalizeScenesMediaState(await loadScenes(projectId));
    } catch {
      // 忽略
    }

    const selectedItvModelCapabilities = settings
      ? resolveConfiguredChannelModel(settings, 'itv', mediaSelections?.itvSelection)?.model.capabilities
      : undefined;
    const resolvedVideoPlan = collectShotVideoPlan({
      shot: normalizedShot,
      characters,
      scenes: projectScenes,
      props: projectProps,
      modelCapabilities: selectedItvModelCapabilities,
    });
    const capabilitySupport = settings
      ? resolveShotVideoCapabilitySupport({
          settings,
          selectionKey: mediaSelections?.itvSelection,
          capability: resolvedVideoPlan.capability,
          visualInputCount: resolvedVideoPlan.visualReferenceInputs.length,
        })
      : undefined;
    if (capabilitySupport?.disabledReason) {
      throw new Error(capabilitySupport.disabledReason);
    }
    if (capabilitySupport?.resolvedContext) {
      itvProviderName = `${capabilitySupport.resolvedContext.definition.name} / ${capabilitySupport.resolvedContext.model.label}`;
    }
    const effectiveVideoCapability = capabilitySupport?.capability || resolvedVideoPlan.capability;
    const effectiveCapabilityLabel = capabilitySupport?.capabilityLabel || resolvedVideoPlan.capabilityLabel;
    const effectiveITVSelection = capabilitySupport?.effectiveSelectionKey || mediaSelections?.itvSelection;

    logger.info('分镜视频能力推断', {
      shotId: normalizedShot.id,
      requestedCapability: videoPlan.capability,
      effectiveCapability: effectiveVideoCapability,
      effectiveCapabilityLabel,
      selectedImage: Boolean(resolvedVideoPlan.selectedImageAsset),
      primaryImage: Boolean(resolvedVideoPlan.primaryImageInput),
      visualReferences: resolvedVideoPlan.visualReferenceInputs.length,
      additionalReferences: resolvedVideoPlan.additionalReferenceImages.length,
      itvSelection: effectiveITVSelection,
    });

    // 构建视频 prompt：优先使用 shot.videoPrompt
    let videoPrompt: string;
    let templateId = 'shot.videoPrompt';
    let promptSource: 'default' | 'custom' | 'finalized' = 'finalized';

    if (normalizedShot.videoPrompt) {
      videoPrompt = normalizedShot.videoPrompt;
    } else {
      const resolvedPrompt = await resolvePromptTemplate('itv_shot_video', buildShotVideoTemplateVariables({
        shot: normalizedShot,
        characters,
        scenes: projectScenes,
        props: projectProps,
        stylePrefix: stylePrefix || '',
        cameraMovement: getCameraMovementDesc(normalizedShot.cameraMovement),
      }));
      videoPrompt = resolvedPrompt.prompt;
      templateId = resolvedPrompt.template.id;
      promptSource = resolvedPrompt.source;
    }

    const providerType = capabilitySupport?.resolvedContext?.definition.runtimeProviderType
      || capabilitySupport?.resolvedContext?.channelConfig.providerType;
    const compiledVideoRequest = compileShotVideoGenerationRequest({
      plan: resolvedVideoPlan,
      prompt: videoPrompt,
      duration: normalizedShot.duration,
      motionPrompt: normalizedShot.cameraMovement,
      aspectRatio: params.aspectRatio || params.project?.aspectRatio || '16:9',
      capability: effectiveVideoCapability,
      providerType,
    });
    const providerSideReferenceCount = isImageToVideoRequest(compiledVideoRequest.request)
      ? (compiledVideoRequest.request.additionalReferences || []).length
      : isReferenceToVideoRequest(compiledVideoRequest.request)
        ? Math.max(0, compiledVideoRequest.request.referenceImages.length - 1)
        : 0;

    logger.info(`视频 prompt: ${videoPrompt}`);
    if (providerSideReferenceCount > 0) {
      logger.info('额外参考图', {
        count: providerSideReferenceCount,
        capability: effectiveVideoCapability,
        providerType: providerType || 'unknown',
      });
    }

    // 打印 ITV 调用日志（这里记录的是“原始来源”，实际传入 Provider 前会被 resolver 规范化）
    logITVCall(
      itvProviderName,
      resolvedVideoPlan.primaryImageSource
        || getMediaAssetDisplaySource(resolvedVideoPlan.additionalReferenceImages[0] as any)
        || String(resolvedVideoPlan.additionalReferenceImages[0] || ''),
      videoPrompt,
      {
        duration: normalizedShot.duration,
        motionPrompt: normalizedShot.cameraMovement,
        capability: effectiveVideoCapability,
      },
      {
        projectId,
        targetId: normalizedShot.id,
        targetName: `分镜视频: ${normalizedShot.id}`,
        templateId,
        promptSource,
      }
    );

    // 先创建版本（生成后续媒体时用 versionId 做落盘路径收口）
    onProgress(20, '创建分镜版本...');
    const baseVersion = await saveShotVersion(projectId, normalizedShot.id, {
      media: {
        image: resolvedVideoPlan.selectedImageAsset,
      },
      prompt: videoPrompt,
      seed: normalizedShot.seed || Math.floor(Math.random() * 1000000),
      model: itvProviderName,
    });
    const versionId = `v${baseVersion.version}`;

    // 步骤1: 生成语音 (20-45%)
    if (normalizedShot.dialogue) {
      onProgress(25, '生成语音...');
      try {
        const preferredVoiceId = getPreferredShotVoiceId(normalizedShot, characters);
        const voiceId = await resolveShotVoiceId(projectId, mediaSelections?.ttsSelection, preferredVoiceId);

        logTTSCall(
          'TTS',
          normalizedShot.dialogue,
          voiceId,
          { rate: 1.0, pitch: 1.0 },
          { projectId, targetId: normalizedShot.id, targetName: `分镜语音: ${normalizedShot.id}` }
        );

        await mediaGenerationService.generateAudio({
          projectId,
          ownerRef: {
            projectId,
            ownerType: 'shot-version',
            ownerId: normalizedShot.id,
            slot: 'audio',
            versionId,
          },
          request: {
            text: normalizedShot.dialogue,
            voiceId,
            options: { rate: 1.0, pitch: 1.0 },
          },
          ttsSelection: mediaSelections?.ttsSelection,
          taskName: `分镜语音: ${normalizedShot.id}`,
        });

        onProgress(45, '语音生成完成');
      } catch (err: any) {
        logger.warn('语音生成失败', { error: err.message });
        onProgress(45, '语音生成跳过');
      }
    } else {
      onProgress(45, '无台词，跳过语音');
    }

    // 步骤2: 生成视频 (45-95%)
    onProgress(45, `生成${effectiveCapabilityLabel}...`);

    await mediaGenerationService.generateVideo({
      projectId,
      ownerRef: {
        projectId,
        ownerType: 'shot-version',
        ownerId: normalizedShot.id,
        slot: 'video',
        episodeId,
        versionId,
      },
      request: compiledVideoRequest.request,
      promptCompilation: compiledVideoRequest.promptCompilation,
      itvSelection: effectiveITVSelection,
      taskName: `分镜视频: ${normalizedShot.id}`,
      allowCapabilityFallback: false,
    });
    onProgress(95, `${effectiveCapabilityLabel}完成`);

    // reload: MediaGenerationService 绑定会直接写 shot.json
    const meta = await loadShotMeta(projectId, normalizedShot.id);
    const version = meta?.versions?.find(v => v.version === baseVersion.version) || baseVersion;

    logger.info(`分镜 ${normalizedShot.id} 视频生成完成，版本 ${version.version}`);
    onProgress(100, '完成');

    return {
      shotId: normalizedShot.id,
      version,
      success: true,
    };
  } catch (err: any) {
    logger.error(`分镜 ${normalizedShot.id} 视频生成失败`, { error: err.message });
    return {
      shotId: normalizedShot.id,
      version: {} as ShotVersion,
      success: false,
      error: err.message,
    };
  }
}

async function resolveShotVoiceId(
  projectId: string,
  ttsSelection: string | undefined,
  preferredVoiceId: string | undefined
): Promise<string> {
  if (preferredVoiceId) return preferredVoiceId;

  const provider = await getProjectTTSProvider(ttsSelection);
  if (!provider) {
    throw new Error('未配置 TTS 服务');
  }

  if (provider.config?.defaultVoice) {
    return provider.config.defaultVoice;
  }

  const voices = await provider.listVoices();
  return voices[0]?.id || 'default';
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
    episodeId,
    shots,
    settings,
    aspectRatio,
    mediaSelections,
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
      { projectId, episodeId, shot, settings, aspectRatio, mediaSelections, theme, stylePrompt, styleSnapshot, project },
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

function getPreferredShotVoiceId(shot: Shot, characters: Character[]): string | undefined {
  for (const charId of shot.characters || []) {
    const character = characters.find(char => char.id === charId);
    if (character?.voiceId) {
      return character.voiceId;
    }
  }
  return undefined;
}

export default {
  shotRenderWorkflow,
  batchRenderShots,
};
