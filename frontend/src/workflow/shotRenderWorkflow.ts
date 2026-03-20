/**
 * 分镜视频生成工作流
 * 纯 ITV 调用：使用已有参考图片（可选）生成视频
 */
import { getMediaAssetSource, type Shot, type ShotVersion, type Character, type Prop } from '../types';
import { getProjectITVProvider, getProjectTTSProvider } from '../providers';
import { saveShotVersion, loadShotMeta, loadCharacters, loadProps } from '../store/projectStore';
import { createLogger } from '../store/logger';
import { logITVCall, logTTSCall } from '../store/aiCallLogger';
import { resolvePromptTemplate } from '../store/promptTemplates';
import { getThemeStylePrefixAsync } from '../config/themePresets';
import { parseMentions } from '../editor/mentionTypes';
import {
  normalizeCharactersMediaState,
  normalizePropsMediaState,
  normalizeShotMediaState,
} from '../store/project/mediaState';
import { mediaGenerationService } from '../services/MediaGenerationService';

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
  const selectedSource = getMediaAssetSource(selectedAsset);
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

    // 构建视频 prompt：优先使用 shot.videoPrompt
    let videoPrompt: string;
    let additionalReferenceImages: string[] = [];
    let templateId = 'shot.videoPrompt';
    let promptSource: 'default' | 'custom' | 'finalized' = 'finalized';

    if (normalizedShot.videoPrompt) {
      // 使用专用视频提示词
      videoPrompt = normalizedShot.videoPrompt;
      // 使用新的处理函数，支持 Sora2 角色和参考图收集
      const processed = processVideoPromptAssets(videoPrompt, normalizedShot, characters, projectProps);
      videoPrompt = processed.prompt;
      additionalReferenceImages = processed.referenceImages;
    } else {
      const resolvedPrompt = await resolvePromptTemplate('itv_shot_video', {
        stylePrefix: stylePrefix || '',
        description: normalizedShot.description || '',
        cameraMovement: getCameraMovementDesc(normalizedShot.cameraMovement),
      });
      videoPrompt = appendCharacterRefs(resolvedPrompt.prompt, normalizedShot, characters);
      templateId = resolvedPrompt.template.id;
      promptSource = resolvedPrompt.source;
    }

    logger.info(`视频 prompt: ${videoPrompt}`);
    if (additionalReferenceImages.length > 0) {
      logger.info(`额外参考图: ${additionalReferenceImages.join(', ')}`);
    }

    // 打印 ITV 调用日志（这里记录的是“原始来源”，实际传入 Provider 前会被 resolver 规范化）
    logITVCall(
      itvProvider.config?.name || 'ITV',
      getMediaAssetSource(selectedImageAsset) || referenceImageUrl || '',
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
        } else {
          const referenceSource = getCharacterReferenceSource(char);
          if (!referenceSource) {
            continue;
          }
          // 无 Sora2 ID：收集图片 URL，替换为角色描述
          referenceImages.push(referenceSource);
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
        } else {
          const referenceSource = getPropReferenceSource(prop);
          if (!referenceSource) {
            continue;
          }
          referenceImages.push(referenceSource);
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

function getPreferredShotVoiceId(shot: Shot, characters: Character[]): string | undefined {
  for (const charId of shot.characters || []) {
    const character = characters.find(char => char.id === charId);
    if (character?.voiceId) {
      return character.voiceId;
    }
  }
  return undefined;
}

function getCharacterReferenceSource(character?: Character): string | undefined {
  return getMediaAssetSource(character?.media?.costumePhoto);
}

function getPropReferenceSource(prop?: Prop): string | undefined {
  return getMediaAssetSource(prop?.media?.previewImage);
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
