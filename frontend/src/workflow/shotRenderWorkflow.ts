/**
 * 分镜视频生成工作流
 * 纯 ITV 调用：使用已有参考图片（可选）生成视频
 */
import { runWithConcurrency } from '../utils/concurrency';
import {
  getMediaAssetDisplaySource,
  getShotScriptText,
  isImageToVideoRequest,
  isReferenceToVideoRequest,
  type AppSettings,
  type Character,
  type Prop,
  type Scene,
  type Shot,
  type ShotVersion,
} from '../types';
import { saveShotVersion, loadShotMeta, loadCharacters, loadProps, loadScenes, loadEpisodeShots } from '../store/projectStore';
import { createLogger } from '../store/logger';
import { logITVCall } from '../store/aiCallLogger';
import {
  normalizeCharactersMediaState,
  normalizePropsMediaState,
  normalizeScenesMediaState,
  normalizeShotMediaState,
} from '../store/project/mediaState';
import { mediaGenerationService } from '../services/MediaGenerationService';
import {
  ensureExplicitDialogueInVideoPrompt,
  sanitizeVideoPromptResult,
} from '../services/ShotPromptService';
import { normalizeProjectNarrativeMode } from '../services/narrativeMode';
import {
  collectShotVideoPlan,
  resolveShotVideoCapabilitySupport,
} from './shotVideoPlan';
import { compileShotVideoGenerationRequest } from './videoGenerationRequests';
import { buildShotVoiceReferencePlan } from './shotVoiceReferences';
import { resolveConfiguredChannelModel } from '../providers/channel/resolver';
import { getModelMaxReferenceImages } from '../providers/itv/modelCatalog';
import type { StyleSnapshotLike } from '../utils/promptNormalize';
import { normalizeVideoDurationSeconds } from '../utils/videoDuration';
import { clampDurationToSpec, getDurationSpecForITVSelection } from '../providers/itv/durationSpec';

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
  allShots?: Shot[];
  project?: { styleSnapshot?: StyleSnapshotLike; aspectRatio?: '16:9' | '9:16'; mode?: 'drama' | 'narration' };
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
  allShots?: Shot[];
  project?: { styleSnapshot?: StyleSnapshotLike; aspectRatio?: '16:9' | '9:16'; mode?: 'drama' | 'narration' };
  concurrency?: number;
  onShotComplete?: (result: ShotRenderResult) => void | Promise<void>;
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
  const { projectId, episodeId, shot, settings, mediaSelections } = params;
  const normalizedShot = normalizeShotMediaState(shot);
  // videoPrompt 是 LLM 推理出的视频版"优化提示词"，合并 / 拆分 / 编辑剧情后会过期。
  // 这里和 shotImageWorkflow 对齐：缓存为空时回落到 scriptLines（"剧情"原文），避免出现
  // "剧情已合并 6 个分镜、生成视频却只覆盖最后一段"的情况。
  const cachedVideoPrompt = (normalizedShot.videoPrompt || '').trim();
  const fallbackScriptText = getShotScriptText(normalizedShot).trim();
  const sourceVideoPrompt = cachedVideoPrompt || fallbackScriptText;
  if (!sourceVideoPrompt) {
    logger.warn('分镜视频生成被阻止：视频提示词与剧情均为空', { shotId: normalizedShot.id });
    return {
      shotId: normalizedShot.id,
      version: {} as ShotVersion,
      success: false,
      error: '请先填写剧情或视频提示词',
    };
  }
  if (!cachedVideoPrompt) {
    logger.info('分镜未推理 videoPrompt，使用 scriptLines 作为兜底', {
      shotId: normalizedShot.id,
      scriptLength: fallbackScriptText.length,
    });
  }
  const episodeShots = params.allShots
    ?? (episodeId ? await loadEpisodeShots(projectId, episodeId).catch(() => undefined) : undefined);

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
    allShots: episodeShots,
  });

  try {
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

    const initialVideoPlan = collectShotVideoPlan({
      shot: normalizedShot,
      characters,
      scenes: projectScenes,
      props: projectProps,
      allShots: episodeShots,
    });
    const selectedItvContext = settings
      ? resolveConfiguredChannelModel(settings, 'itv', mediaSelections?.itvSelection, initialVideoPlan.capability)
      : undefined;
    const selectedItvModelCapabilities = selectedItvContext?.model.capabilities;
    const selectedItvModelMaxRefs = getModelMaxReferenceImages(
      selectedItvContext?.model,
      selectedItvContext?.channelConfig.providerType,
    );
    const resolvedVideoPlan = collectShotVideoPlan({
      shot: normalizedShot,
      characters,
      scenes: projectScenes,
      props: projectProps,
      allShots: episodeShots,
      modelCapabilities: selectedItvModelCapabilities,
      modelMaxRefs: selectedItvModelMaxRefs,
    });
    const capabilitySupport = settings
      ? resolveShotVideoCapabilitySupport({
          settings,
          selectionKey: mediaSelections?.itvSelection,
          capability: resolvedVideoPlan.capability,
          visualInputCount: resolvedVideoPlan.visualReferenceInputs.length,
        })
      : undefined;
    logger.info('分镜视频模型选择解析', {
      shotId: normalizedShot.id,
      requestedSelection: mediaSelections?.itvSelection,
      requestedCapability: resolvedVideoPlan.capability,
      selectedModelCapabilities: selectedItvModelCapabilities,
      resolvedSelection: capabilitySupport?.effectiveSelectionKey,
      resolvedModelId: capabilitySupport?.resolvedContext?.model.id,
      resolvedCapabilities: capabilitySupport?.resolvedContext?.model.capabilities,
      disabledReason: capabilitySupport?.disabledReason,
    });
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

    // 视频生成只能使用用户在分镜编辑器中看到的 videoPrompt。
    // 空 prompt 在入口处已拒绝，不再隐式套用 itv_shot_video 默认模板，避免发送"看不见的提示词"。
    let videoPrompt = sanitizeVideoPromptResult(sourceVideoPrompt);
    logger.info('分镜视频生成 - 最终下发 ITV 的 prompt', {
      shotId: normalizedShot.id,
      cachedVideoPromptUsed: Boolean(cachedVideoPrompt),
      fellBackToScriptLines: !cachedVideoPrompt,
      rawScriptText: fallbackScriptText,
      sourceVideoPrompt,
      sanitizedVideoPrompt: videoPrompt,
    });
    let templateId = 'shot.videoPrompt';
    let promptSource: 'default' | 'custom' | 'finalized' = 'finalized';

    const shotCharacterNames = (normalizedShot.characters || [])
      .map(charId => characters.find(char => char.id === charId)?.name)
      .filter((name): name is string => Boolean(name));
    videoPrompt = shouldPatchShotDialogue(videoPrompt)
      ? ensureExplicitDialogueInVideoPrompt(
          videoPrompt,
          String(normalizedShot.dialogue || ''),
          shotCharacterNames,
          normalizeProjectNarrativeMode(params.project?.mode),
        )
      : videoPrompt;

    const providerType = capabilitySupport?.resolvedContext?.definition.runtimeProviderType
      || capabilitySupport?.resolvedContext?.channelConfig.providerType;
    const videoDuration = settings
      ? clampDurationToSpec(
          normalizedShot.duration,
          getDurationSpecForITVSelection(effectiveITVSelection, settings.channelConfigs || []),
        )
      : normalizeVideoDurationSeconds(normalizedShot.duration);
    const compiledVideoRequest = compileShotVideoGenerationRequest({
      plan: resolvedVideoPlan,
      prompt: videoPrompt,
      duration: videoDuration,
      motionPrompt: normalizedShot.cameraMovement,
      aspectRatio: params.aspectRatio || params.project?.aspectRatio || '16:9',
      capability: effectiveVideoCapability,
      providerType,
    });

    // 音色参考（音画同出模型）：绑定音色的角色把示例音频挂进请求，
    // 并在提示词末尾追加协议对应的占位行（<音频 N> / @Audio N，每类参考从 1 开始编号）
    const itvChannelPromptProtocol = (selectedItvContext?.channelConfig?.providerConfig as Record<string, unknown> | undefined)
      ?.promptProtocol as string | undefined;
    const fallbackProtocol = providerType === 'comfyui-itv' ? 'minimax-image-tag' : undefined;
    const voicePlan = await buildShotVoiceReferencePlan({
      shotCharacters: normalizedShot.characters || [],
      characters,
      promptProtocol: itvChannelPromptProtocol ?? fallbackProtocol,
    }).catch((err) => {
      logger.warn('音色参考构建失败，跳过', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { references: [], promptSuffix: '' };
    });
    if (voicePlan.references.length > 0) {
      const mergedPrompt = `${compiledVideoRequest.prompt}\n${voicePlan.promptSuffix}`;
      compiledVideoRequest.prompt = mergedPrompt;
      compiledVideoRequest.request = {
        ...compiledVideoRequest.request,
        prompt: mergedPrompt,
        metadata: {
          ...(compiledVideoRequest.request.metadata ?? {}),
          komaVoiceReferences: voicePlan.references.map(ref => ({
            characterId: ref.characterId,
            characterName: ref.characterName,
            transport: ref.asset.transport,
            value: ref.asset.value,
            mimeType: ref.asset.mimeType,
          })),
        },
      };
      logger.info('已附加音色参考', {
        shotId: normalizedShot.id,
        voiceReferences: voicePlan.references.map(r => r.characterName),
      });
    }
    const providerSideReferenceCount = isImageToVideoRequest(compiledVideoRequest.request)
      ? (compiledVideoRequest.request.additionalReferences || []).length
      : isReferenceToVideoRequest(compiledVideoRequest.request)
        ? Math.max(0, compiledVideoRequest.request.referenceImages.length - 1)
        : 0;

    logger.info(`视频 prompt: ${compiledVideoRequest.prompt}`);
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
      compiledVideoRequest.prompt,
      {
        duration: videoDuration,
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
      prompt: compiledVideoRequest.prompt,
      seed: normalizedShot.seed || Math.floor(Math.random() * 1000000),
      model: itvProviderName,
    });
    const versionId = `v${baseVersion.version}`;

    // 生成视频只负责 ITV，不触发 TTS。配音应由独立音频/配音流程处理。
    onProgress(30, `生成${effectiveCapabilityLabel}...`);

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
    allShots,
    project,
    concurrency: _concurrency = 1,
    onShotComplete,
  } = params;

  logger.info(`开始批量生成 ${shots.length} 个分镜视频`);

  // 并发提交（受 concurrency 控制）：准备阶段（提示词编译/上传/提交）可重叠，
  // GPU 渲染阶段由 ComfyUI 队列自动串行 —— 长批量显著缩短总等待。
  // results 保持输入顺序（runWithConcurrency 按序返回）。
  // completed 必须在并发回调前声明（回调里引用它，避免 TDZ）
  let completed = 0;
  const results = (await runWithConcurrency(
    shots.map((shot) => async () => {
      let result: ShotRenderResult;
      try {
        result = await shotRenderWorkflow(
          { projectId, episodeId, shot, settings, aspectRatio, mediaSelections, theme, stylePrompt, styleSnapshot, allShots, project },
          (progress, step) => {
            // completed 在单线程 JS 中按序递增；onProgress 只做展示，无需精确同步
            const overall = Math.round(((completed + progress / 100) / shots.length) * 100);
            onProgress(overall, { shotId: shot.id, progress, step });
          }
        );
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.error('批量分镜视频单项异常，继续后续分镜', {
          shotId: shot.id,
          error,
        });
        result = {
          shotId: shot.id,
          version: {} as ShotVersion,
          success: false,
          error,
        };
      }
      return result;
    }),
    Math.max(1, Math.min(_concurrency, shots.length)),
  )).map((settled, index) => {
    const shotId = shots[index]?.id ?? '';
    if (settled.status === 'rejected') {
      return {
        shotId,
        version: {} as ShotVersion,
        success: false,
        error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
      };
    }
    return settled.value;
  });

  // 逐项完成回调（顺序执行，避免 onShotComplete 里的 setState 竞态）
  for (const result of results) {
    completed++;
    const overall = Math.round((completed / shots.length) * 100);
    onProgress(overall, { shotId: result.shotId, progress: 100, step: result.success ? '完成' : '失败' });
    if (onShotComplete) {
      try {
        await onShotComplete(result);
      } catch (err) {
        logger.warn('批量分镜视频单项完成回调失败', {
          shotId: result.shotId,
          success: result.success,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
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

function shouldPatchShotDialogue(prompt: string): boolean {
  const dialogueLine = prompt
    .split(/\r?\n/)
    .find(line => /^\s*对白提示词\s*[:：]/.test(line));
  if (!dialogueLine) return true;
  const value = dialogueLine.replace(/^\s*对白提示词\s*[:：]\s*/, '').trim();
  return !value || value === '无';
}

export default {
  shotRenderWorkflow,
  batchRenderShots,
};
