/**
 * 分镜视频生成工作流
 * 纯 ITV 调用：使用已有参考图片（可选）生成视频
 */
import {
  getMediaAssetDisplaySource,
  getMediaAssetSource,
  getShotScriptText,
  isImageToVideoRequest,
  isReferenceToVideoRequest,
  type AppSettings,
  type Character,
  type Prop,
  type Scene,
  type Shot,
  type ShotVersion,
  type StoredMediaAsset,
} from '../types';
import {
  saveShotVersion,
  loadShotMeta,
  loadCharacters,
  loadProps,
  loadScenes,
  loadEpisodeShots,
  updateShot,
} from '../store/projectStore';
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
import { buildShotVoiceReferencePlan, compileShotVoiceMentions } from './shotVoiceReferences';
import { buildShotVideoExtendPlan, compileShotVideoExtendMentions } from './shotVideoExtendReference';
import { resolveConfiguredChannelModel } from '../providers/channel/resolver';
import { getModelMaxReferenceImages } from '../providers/itv/modelCatalog';
import type { StyleSnapshotLike } from '../utils/promptNormalize';
import type { ITVProvider } from '../providers/itv/types';
import type { ITVRequest } from '../types/media';
import { normalizeVideoDurationSeconds } from '../utils/videoDuration';
import { clampDurationToSpec, getDurationSpecForITVSelection } from '../providers/itv/durationSpec';
import { ffmpegManager } from '../services/ffmpegManager';
import {
  normalizeShotContinuity,
  usesPreviousTailFrame,
  usesPreviousVideoExtend,
} from '../services/shotContinuity';
import { supportsReferenceKind } from '../providers/itv/referenceCapabilities';

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

let tailReferencePersistenceQueue: Promise<void> = Promise.resolve();

function selectedShotVideo(shot: Shot): StoredMediaAsset | undefined {
  const videos = shot.media?.videos || [];
  if (!videos.length) return undefined;
  const index = shot.media?.currentVideoIndex ?? videos.length - 1;
  const selected = videos[index] || videos[videos.length - 1];
  return selected?.kind === 'video' && getMediaAssetSource(selected) ? selected : undefined;
}

function buildSourceVideoKey(shotId: string, asset: StoredMediaAsset, version?: number): string {
  return [
    shotId,
    version != null ? `v${version}` : undefined,
    asset.providerTaskId,
    asset.createdAt,
    asset.localPath,
    asset.remoteUrl,
  ].filter(Boolean).join(':');
}

async function resolvePredecessorVideo(
  projectId: string,
  predecessor: Shot,
): Promise<{ asset: StoredMediaAsset; sourceVideoKey: string }> {
  const meta = await loadShotMeta(projectId, predecessor.id);
  const version = meta?.versions?.find(candidate => candidate.version === meta.currentVersion)
    || meta?.versions?.at(-1);
  const versionVideo = version?.media?.video;
  if (versionVideo?.kind === 'video' && getMediaAssetSource(versionVideo)) {
    return {
      asset: versionVideo,
      sourceVideoKey: buildSourceVideoKey(predecessor.id, versionVideo, version.version),
    };
  }
  const inShot = selectedShotVideo(predecessor);
  if (inShot) {
    return {
      asset: inShot,
      sourceVideoKey: buildSourceVideoKey(predecessor.id, inShot, predecessor.currentVersion),
    };
  }
  throw new Error(`上一镜 ${predecessor.id} 没有已完成的真实视频，请先生成上一镜视频`);
}

async function persistTailReference(
  projectId: string,
  episodeId: string | undefined,
  shot: Shot,
): Promise<void> {
  if (!episodeId || !shot.videoReference) return;
  const write = tailReferencePersistenceQueue
    .catch(() => undefined)
    .then(async () => {
      await updateShot(projectId, episodeId, shot.id, { videoReference: shot.videoReference });
    });
  tailReferencePersistenceQueue = write;
  await write;
}

export async function resolveShotTailFrameReference(params: {
  projectId: string;
  episodeId?: string;
  shot: Shot;
  allShots?: Shot[];
  forceRefresh?: boolean;
}): Promise<Shot> {
  const sequence = (params.allShots?.length ? params.allShots : [params.shot])
    .map(candidate => candidate.id === params.shot.id ? params.shot : candidate);
  const normalizedSequence = normalizeShotContinuity(sequence);
  const currentIndex = normalizedSequence.findIndex(candidate => candidate.id === params.shot.id);
  const current = currentIndex >= 0 ? normalizedSequence[currentIndex] : params.shot;
  if (!usesPreviousTailFrame(current)) return current;

  const predecessor = currentIndex > 0
    ? normalizedSequence[currentIndex - 1]
    : normalizedSequence.find(candidate => candidate.id === current.videoReference?.sourceShotId);
  if (!predecessor) {
    throw new Error('当前分镜需要上一镜尾帧，但项目分镜顺序中找不到上一镜');
  }

  const reference = current.videoReference!;
  // 手动帧不随上一视频自动变化；只有用户明确“重新截取”才刷新。
  if (reference.mode === 'manual' && reference.referenceFrame && !params.forceRefresh) {
    return current;
  }

  const { asset: predecessorVideo, sourceVideoKey } = await resolvePredecessorVideo(
    params.projectId,
    predecessor,
  );
  if (reference.mode === 'auto'
    && reference.referenceFrame
    && reference.sourceVideoKey === sourceVideoKey
    && !params.forceRefresh) {
    return current;
  }

  const tailPath = await ffmpegManager.getTailFrame(predecessorVideo, current.id, {
    sourceVideoKey: params.forceRefresh ? `${sourceVideoKey}:refresh:${Date.now()}` : sourceVideoKey,
  });
  const resolved: Shot = {
    ...current,
    videoReference: {
      ...reference,
      sourceShotId: predecessor.id,
      referenceFrame: {
        kind: 'image',
        localPath: tailPath,
        mimeType: 'image/jpeg',
        createdAt: Date.now(),
        metadata: {
          previousVideoTail: true,
          sourceShotId: predecessor.id,
          sourceVideoKey,
        },
      },
      capturedAt: Date.now(),
      sourceVideoKey,
    },
  };
  await persistTailReference(params.projectId, params.episodeId, resolved);
  return resolved;
}

function addTailFrameContinuityDirective(prompt: string, shot: Shot): string {
  if (!shot.videoReference?.usePreviousTailFrame || !shot.videoReference.referenceFrame) return prompt;
  if (prompt.includes('@previous_tail_frame')) return prompt;
  return [
    '连续性主参考：@previous_tail_frame 是上一镜真实视频尾帧；从其中的人物站位、朝向、动作末态、视线、场景与光影自然继续，不要重置为新的起始状态。',
    prompt,
  ].join('\n');
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
  let normalizedShot = normalizeShotMediaState(shot);
  const episodeShots = params.allShots
    ?? (episodeId ? await loadEpisodeShots(projectId, episodeId).catch(() => undefined) : undefined);

  try {
    normalizedShot = await resolveShotTailFrameReference({
      projectId,
      episodeId,
      shot: normalizedShot,
      allShots: episodeShots,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error('分镜连续性尾帧准备失败', { shotId: normalizedShot.id, error });
    return {
      shotId: normalizedShot.id,
      version: {} as ShotVersion,
      success: false,
      error,
    };
  }

  // videoPrompt 是 LLM 推理出的视频版"优化提示词"，合并 / 拆分 / 编辑剧情后会过期。
  // 这里和 shotImageWorkflow 对齐：缓存为空时回落到 scriptLines（"剧情"原文），避免出现
  // "剧情已合并 6 个分镜、生成视频却只覆盖最后一段"的情况。
  const cachedVideoPrompt = (normalizedShot.videoPrompt || '').trim();
  const fallbackScriptText = getShotScriptText(normalizedShot).trim();
  const sourceVideoPrompt = addTailFrameContinuityDirective(
    cachedVideoPrompt || fallbackScriptText,
    normalizedShot,
  );
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
    // 音色参考（音画同出模型）：绑定音色的角色把示例音频挂进请求，
    // 并在提示词末尾追加协议对应的占位行（<音频 N> / @Audio N，每类参考从 1 开始编号）。
    // 必须排在 compileShotVideoGenerationRequest 之前：提示词里的 @char_<id>-音色 要先
    // 按这里的参考顺序编译成音频占位符，否则会被图像编译器啃成 `@Image N-音色`。
    const itvChannelPromptProtocol = (selectedItvContext?.channelConfig?.providerConfig as Record<string, unknown> | undefined)
      ?.promptProtocol as string | undefined;
    const fallbackProtocol = providerType === 'comfyui-itv' ? 'minimax-image-tag' : undefined;
    // 渠道提示词协议：图片 / 视频 / 音频三类占位符统一按它渲染
    const promptProtocol = itvChannelPromptProtocol ?? fallbackProtocol;
    // 渠道不支持音频参考时直接不构建：否则提示词里会出现 @Audio N，请求里却没有音频，
    // 模型会照着不存在的参考编。
    const channelSupportsAudioReference = supportsReferenceKind(providerType, 'audio');
    const voicePlan = channelSupportsAudioReference
      ? await buildShotVoiceReferencePlan({
        shotCharacters: normalizedShot.characters || [],
        characters,
        promptProtocol: promptProtocol,
      }).catch((err) => {
        logger.warn('音色参考构建失败，跳过', {
          error: err instanceof Error ? err.message : String(err),
        });
        return { references: [], promptSuffix: '' };
      })
      : { references: [], promptSuffix: '' };
    const voiceMentionCompilation = compileShotVoiceMentions({
      prompt: videoPrompt,
      plan: voicePlan,
      promptProtocol: promptProtocol,
    });
    videoPrompt = voiceMentionCompilation.prompt;
    if (voiceMentionCompilation.unresolvedMentions.length > 0) {
      logger.warn('视频提示词中的角色音色映射符没有对应音频参考，已剥离', {
        shotId: normalizedShot.id,
        mentions: voiceMentionCompilation.unresolvedMentions,
      });
    }

    // 上一镜视频延长承接：整段上一镜成片作为全能参考，提示词首部声明"将 @video_file_1 延长 N 秒"。
    // 同样必须排在图像编译之前——@previous_video_clip 不是图像 mention，留到那一步会被剥掉。
    const channelSupportsVideoReference = supportsReferenceKind(providerType, 'video');
    if (!channelSupportsVideoReference && usesPreviousVideoExtend(normalizedShot)) {
      logger.warn('当前视频渠道不支持视频参考，延长承接降级为普通生成', {
        shotId: normalizedShot.id,
        providerType,
      });
    }
    const videoExtendPlan = channelSupportsVideoReference
      ? await buildShotVideoExtendPlan({
        shot: normalizedShot,
        allShots: episodeShots,
        durationSeconds: videoDuration,
        promptProtocol: promptProtocol,
      })
      : { promptPrefix: '' };
    const extendCompilation = compileShotVideoExtendMentions({
      prompt: videoPrompt,
      plan: videoExtendPlan,
      promptProtocol: promptProtocol,
    });
    videoPrompt = extendCompilation.prompt;
    if (extendCompilation.stripped) {
      logger.warn('视频提示词声明了上一镜延长，但没有可用的上一镜成片，已降级为普通生成', {
        shotId: normalizedShot.id,
      });
    }
    if (videoExtendPlan.reference) {
      // 声明句放在最前面：Seedance 系模型对"将 @视频X 延长 N 秒"这类指令是按首句意图解析的
      videoPrompt = `${videoExtendPlan.promptPrefix}\n${videoPrompt}`;
    }

    const compiledVideoRequest = compileShotVideoGenerationRequest({
      plan: resolvedVideoPlan,
      prompt: videoPrompt,
      duration: videoDuration,
      motionPrompt: normalizedShot.cameraMovement,
      aspectRatio: params.aspectRatio || params.project?.aspectRatio || '16:9',
      capability: effectiveVideoCapability,
      providerType,
      promptProtocol: promptProtocol,
    });

    if (videoExtendPlan.reference) {
      compiledVideoRequest.request = {
        ...compiledVideoRequest.request,
        metadata: {
          ...(compiledVideoRequest.request.metadata ?? {}),
          komaVideoReferences: [{
            sourceShotId: videoExtendPlan.sourceShotId,
            transport: videoExtendPlan.reference.transport,
            value: videoExtendPlan.reference.value,
            mimeType: videoExtendPlan.reference.mimeType,
          }],
        },
      };
      logger.info('已附加上一镜视频延长参考', {
        shotId: normalizedShot.id,
        sourceShotId: videoExtendPlan.sourceShotId,
      });
    }

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

    // H3-Context-IR（可选，仅 MiniMax H3 官方渠道 + 模型开关开启时）：
    // 先让上游深度理解多模态上下文，生成结构化更丰富的增强提示词再出片。
    if (providerType === 'minimax-h3-itv') {
      const minimaxProvider = await mediaGenerationService.resolveITVProvider(effectiveITVSelection, effectiveVideoCapability) as
        | (ITVProvider & {
          useH3ContextIR?: boolean;
          enhancePromptWithContextIR?: (req: ITVRequest<unknown, unknown>, duration: number, ratio?: string) => Promise<string | undefined>;
        })
        | null;
      if (minimaxProvider?.useH3ContextIR && minimaxProvider.enhancePromptWithContextIR) {
        onProgress(25, 'H3-Context-IR 增强提示词...');
        const enhanced = await minimaxProvider.enhancePromptWithContextIR(
          compiledVideoRequest.request,
          videoDuration,
          params.aspectRatio || params.project?.aspectRatio || '16:9',
        );
        if (enhanced) {
          logger.info('H3-Context-IR 增强已应用', {
            shotId: normalizedShot.id,
            originalLength: compiledVideoRequest.prompt.length,
            enhancedLength: enhanced.length,
          });
          compiledVideoRequest.prompt = enhanced;
          compiledVideoRequest.request = {
            ...compiledVideoRequest.request,
            prompt: enhanced,
          };
        }
      }
    }

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

  // 先按项目最终顺序规范化一次，确保旧 Shot 也能推导出连续性依赖；传入的 shot
  // 可能是 UI 刚编辑过的版本，优先覆盖 allShots 中同 ID 的记录。
  const baseSequence = allShots?.length ? allShots : shots;
  const mergedSequence = baseSequence.map(candidate => {
    const incoming = shots.find(shot => shot.id === candidate.id);
    return incoming ? { ...candidate, ...incoming } : candidate;
  });
  const normalizedSequence = normalizeShotContinuity(mergedSequence);
  const sequenceIndex = new Map(normalizedSequence.map((shot, index) => [shot.id, index]));
  const targetIds = new Set(shots.map(shot => shot.id));
  const predecessorByTarget = new Map<string, string | undefined>();
  for (const shot of shots) {
    const index = sequenceIndex.get(shot.id);
    const normalized = index == null ? shot : normalizedSequence[index];
    const predecessor = index != null && index > 0
      ? normalizedSequence[index - 1]
      : normalized.videoReference?.sourceShotId
        ? normalizedSequence.find(candidate => candidate.id === normalized.videoReference?.sourceShotId)
        : undefined;
    predecessorByTarget.set(
      shot.id,
      usesPreviousTailFrame(normalized) ? predecessor?.id : undefined,
    );
  }

  const maxConcurrency = Math.max(1, Math.min(_concurrency, Math.max(shots.length, 1)));
  let running = 0;
  const waiters: Array<() => void> = [];
  const acquire = async (): Promise<void> => {
    if (running < maxConcurrency) {
      running += 1;
      return;
    }
    await new Promise<void>(resolve => waiters.push(resolve));
    running += 1;
  };
  const release = (): void => {
    running -= 1;
    waiters.shift()?.();
  };

  type Deferred = { promise: Promise<ShotRenderResult>; resolve: (value: ShotRenderResult) => void };
  const deferredById = new Map<string, Deferred>();
  for (const shot of shots) {
    let resolve!: (value: ShotRenderResult) => void;
    const promise = new Promise<ShotRenderResult>(nextResolve => { resolve = nextResolve; });
    deferredById.set(shot.id, { promise, resolve });
  }

  let completed = 0;
  const finalizeBatchResult = async (result: ShotRenderResult): Promise<ShotRenderResult> => {
    completed += 1;
    onProgress(
      Math.round((completed / Math.max(shots.length, 1)) * 100),
      { shotId: result.shotId, progress: 100, step: result.success ? '完成' : '失败' },
    );
    if (onShotComplete) {
      try {
        await onShotComplete(result);
      } catch (err) {
        logger.warn('批量分镜单项完成回调失败', {
          shotId: result.shotId,
          success: result.success,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return result;
  };

  const runOne = async (shot: Shot): Promise<ShotRenderResult> => {
    const predecessorId = predecessorByTarget.get(shot.id);
    if (predecessorId && targetIds.has(predecessorId)) {
      const predecessorResult = await deferredById.get(predecessorId)!.promise;
      if (!predecessorResult.success) {
        return finalizeBatchResult({
          shotId: shot.id,
          version: {} as ShotVersion,
          success: false,
          error: `依赖分镜 ${predecessorId} 失败，未生成上一镜尾帧：${predecessorResult.error || '未知错误'}`,
        });
      }
    }

    await acquire();
    let result: ShotRenderResult;
    try {
      result = await shotRenderWorkflow(
        {
          projectId,
          episodeId,
          shot,
          settings,
          aspectRatio,
          mediaSelections,
          theme,
          stylePrompt,
          styleSnapshot,
          allShots: normalizedSequence,
          project,
        },
        (progress, step) => {
          const overall = Math.round(((completed + progress / 100) / Math.max(shots.length, 1)) * 100);
          onProgress(overall, { shotId: shot.id, progress, step });
        },
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error('批量分镜视频单项异常，继续后续分镜', { shotId: shot.id, error });
      result = { shotId: shot.id, version: {} as ShotVersion, success: false, error };
    } finally {
      release();
    }

    return finalizeBatchResult(result);
  };

  // 所有任务同时注册，依赖任务通过 deferred 等待前置任务完成；独立分支继续竞争并发槽位。
  const resultPromises = shots.map(shot => runOne(shot).then(result => {
    deferredById.get(shot.id)!.resolve(result);
    return result;
  }).catch(error => {
    const result: ShotRenderResult = {
      shotId: shot.id,
      version: {} as ShotVersion,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    deferredById.get(shot.id)!.resolve(result);
    return result;
  }));

  const results = await Promise.all(resultPromises);

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
