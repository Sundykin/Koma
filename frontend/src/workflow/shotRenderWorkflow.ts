/**
 * 分镜视频生成工作流
 * 纯 ITV 调用：使用已有参考图片（可选）生成视频
 */
import { getMediaAssetDisplaySource, type Shot, type ShotVersion, type Character, type Prop, type Scene } from '../types';
import { getProjectITVProvider, getProjectTTSProvider } from '../providers';
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
import { buildShotAssetReferences } from './assetReferenceBuilder';

const logger = createLogger('ShotRender');

interface StyleSnapshotLike {
  ttiStylePrefix?: string;
  llmPromptSuffix?: string;
}

interface ShotRenderParams {
  projectId: string;
  episodeId?: string;
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
  const normalizedShot = normalizeShotMediaState(shot);
  const idx = normalizedShot.media?.currentImageIndex ?? 0;
  const selectedAsset = normalizedShot.media?.images?.[idx];
  const selectedSource = getMediaAssetDisplaySource(selectedAsset);
  if (selectedSource) {
    logger.info(`使用当前分镜图片: ${selectedSource.startsWith('data:') ? 'data:...(base64)' : selectedSource}`);
    return selectedSource;
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
  const { projectId, episodeId, shot, projectConfigIds, theme, stylePrompt, styleSnapshot, project } = params;
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

  // 获取当前选中的参考图片
  const referenceImageUrl = await getSelectedImageUrl(normalizedShot);
  logger.info(`参考图片: ${referenceImageUrl || '无'}`);
  const selectedImageIndex = normalizedShot.media?.currentImageIndex ?? 0;
  const selectedImageAsset = normalizedShot.media?.images?.[selectedImageIndex];

  try {
    if (!selectedImageAsset) {
      throw new Error('没有可用的分镜图片，请先生成分镜图片');
    }

    // 获取 ITV provider 仅用于展示/日志（真正生成由 MediaGenerationService 统一编排）
    const itvProvider = await getProjectITVProvider(projectConfigIds?.itvConfigId);
    if (!itvProvider) {
      throw new Error('未配置 ITV 服务');
    }
    itvProviderName = itvProvider.config?.provider || 'unknown';

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

    // 统一从”分镜已选择资产”构建参考图（角色/场景/道具），保证链路不割裂
    const {
      displaySourceUrls: additionalReferenceImages,
      compilationAssets: selectedAssetsForCompilation,
    } = buildShotAssetReferences(normalizedShot, characters, projectScenes, projectProps);

    // Shot 自身的参考图（手动添加），排在最后，避免影响 Grok @Image N 索引
    for (const ref of normalizedShot.media?.references || []) {
      const src = getMediaAssetDisplaySource(ref);
      if (src) additionalReferenceImages.push(src);
    }

    logger.info(`视频 prompt: ${videoPrompt}`);
    if (additionalReferenceImages.length > 0) {
      logger.info(`额外参考图: ${additionalReferenceImages.join(', ')}`);
    }

    // 打印 ITV 调用日志（这里记录的是“原始来源”，实际传入 Provider 前会被 resolver 规范化）
    logITVCall(
      itvProvider.config?.name || 'ITV',
      getMediaAssetDisplaySource(selectedImageAsset) || referenceImageUrl || '',
      videoPrompt,
      { duration: normalizedShot.duration, motionPrompt: normalizedShot.cameraMovement },
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
        image: selectedImageAsset,
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
        const voiceId = await resolveShotVoiceId(projectId, projectConfigIds?.ttsConfigId, preferredVoiceId);

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
          ttsConfigId: projectConfigIds?.ttsConfigId,
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
    onProgress(45, '生成视频...');
    await mediaGenerationService.generateVideo({
      projectId,
      ownerRef: {
        projectId,
        ownerType: 'shot-version',
        ownerId: normalizedShot.id,
        slot: 'video',
        versionId,
      },
      request: {
        prompt: videoPrompt,
        primaryImage: selectedImageAsset,
        additionalReferences: additionalReferenceImages,
        options: {
          duration: normalizedShot.duration,
          motionPrompt: normalizedShot.cameraMovement,
        },
      },
      promptCompilation: {
        selectedAssets: selectedAssetsForCompilation,
      },
      itvConfigId: projectConfigIds?.itvConfigId,
      taskName: `分镜视频: ${normalizedShot.id}`,
    });
    onProgress(95, '视频生成完成');

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
  ttsConfigId: string | undefined,
  preferredVoiceId: string | undefined
): Promise<string> {
  if (preferredVoiceId) return preferredVoiceId;

  const provider = await getProjectTTSProvider(ttsConfigId);
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
