/**
 * 分镜生图工作流
 *
 * OpenSpec: 统一通过 MediaGenerationService 编排 start/snapshot、落盘与回写。
 */
import type { Character, Scene, Shot, StoredMediaAsset } from '../types';
import { getMediaAssetDisplaySource, getShotScriptText } from '../types';
import { getProjectPath, loadEpisodeShots, loadProps } from '../store/projectStore';
import { resolvePromptTemplate } from '../store/promptTemplates';
import { getThemeStylePrefix } from '../config/themePresets';
import { logTTICall } from '../store/aiCallLogger';
import { createLogger } from '../store/logger';
import { mediaGenerationService } from '../services/MediaGenerationService';
import { buildShotReferenceBundle } from '../services/shotReference/builder';
import { compileShotPromptToBundle } from '../services/shotReference/compile';
import { summarizeBundle } from '../services/shotReference/render';
import {
  normalizeCharactersMediaState,
  normalizePropsMediaState,
  normalizeScenesMediaState,
  normalizeShotMediaState,
} from '../store/project/mediaState';
import type { StyleSnapshotLike } from '../utils/promptNormalize';

const logger = createLogger('ShotImageWorkflow');

function buildShotImageVersionId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function shotImageWorkflow(params: {
  projectId: string;
  episodeId: string;
  shot: Shot;
  characters: Character[];
  scenes: Scene[];
  ttiSelection?: string;
  aspectRatio?: '16:9' | '9:16';
  styleSnapshot?: StyleSnapshotLike;
  theme?: string;
  stylePrompt?: string;
  allShots?: Shot[];
  project?: { styleSnapshot?: StyleSnapshotLike; aspectRatio?: '16:9' | '9:16' };
  onProgress?: (progress: number, step?: string) => void;
}): Promise<StoredMediaAsset> {
  const {
    projectId,
    episodeId,
    shot,
    characters,
    scenes,
    ttiSelection,
    aspectRatio,
    styleSnapshot,
    theme,
    stylePrompt,
    allShots: allShotsSnapshot,
    project,
    onProgress,
  } = params;

  const normalizedShot = normalizeShotMediaState(shot);
  const normalizedCharacters = normalizeCharactersMediaState(characters);
  const normalizedScenes = normalizeScenesMediaState(scenes);
  const props = normalizePropsMediaState(await loadProps(projectId).catch(() => []));
  const finalAspectRatio = aspectRatio || project?.aspectRatio || '16:9';
  const allShots = allShotsSnapshot ?? await loadEpisodeShots(projectId, episodeId).catch(() => undefined);
  // imagePrompt 是 AI 推理出来的"优化版"画面描述。合并分镜 / 拆分 / 编辑后这块缓存会失效，
  // 此时回落到 scriptLines（用户在 UI 上看到的"剧情"）作为兜底，避免出现"用户看到的剧情完整、
  // AI 推理只剩末尾一句"的脱节。两种字段都没有时再报错。
  const cachedImagePrompt = (normalizedShot.imagePrompt || '').trim();
  const fallbackScriptText = getShotScriptText(normalizedShot).trim();
  const sourceImagePrompt = cachedImagePrompt || fallbackScriptText;
  if (!sourceImagePrompt) {
    logger.warn('分镜图片生成被阻止：图片提示词与剧情均为空', { shotId: normalizedShot.id });
    throw new Error('请先填写剧情或图片提示词');
  }
  if (!cachedImagePrompt) {
    logger.info('分镜未推理 imagePrompt，使用 scriptLines 作为兜底', {
      shotId: normalizedShot.id,
      scriptLength: fallbackScriptText.length,
    });
  }

  onProgress?.(0, '准备生成分镜图片...');

  // 构建提示词：统一走同一条生图 workflow。
  // 九宫格模式仅在最终提交给 TTI 前套用九宫格终稿模板，不影响存储与工作流分支。
  let prompt: string;
  let templateId = 'shot.imagePrompt';
  let promptSource: 'default' | 'custom' | 'finalized' = 'finalized';
  const stylePrefix = styleSnapshot?.ttiStylePrefix || project?.styleSnapshot?.ttiStylePrefix || getThemeStylePrefix(theme, stylePrompt);

  const gridMode = normalizedShot.imageMode === 'grid-4'
    ? 'grid-4'
    : (normalizedShot.imageMode === 'grid' || normalizedShot.imageMode === 'grid-9')
      ? 'grid-9'
      : null;
  const isStoryboardMode = normalizedShot.imageMode === 'storyboard';
  if (gridMode || isStoryboardMode) {
    const templateKey = isStoryboardMode
      ? 'tti_storyboard_shot_image'
      : gridMode === 'grid-4'
        ? 'tti_grid_4_shot_image'
        : 'tti_grid_shot_image';
    const resolved = await resolvePromptTemplate(templateKey, {
      stylePrefix: stylePrefix || '',
      shotDescription: getShotScriptText(normalizedShot),
      gridPrompt: sourceImagePrompt,
      storyboardPrompt: sourceImagePrompt,
      resolution: '8K',
      aspectRatio: finalAspectRatio,
    });
    prompt = resolved.prompt;
    templateId = resolved.template.id;
    promptSource = resolved.source;
  } else {
    // 保留 @char/@scene/@prop（供渠道编译协议处理，例如 grok-image-index）。
    // 将项目风格前缀拼接到已有 imagePrompt 前，确保 TTI 模型遵循风格设定。
    prompt = stylePrefix
      ? `${stylePrefix}, ${sourceImagePrompt}`
      : sourceImagePrompt;
  }

  const referenceBundle = buildShotReferenceBundle({
    shot: normalizedShot,
    characters: normalizedCharacters,
    scenes: normalizedScenes,
    props,
    allShots,
    // 生图同样消费上一镜尾帧（@previous_tail_frame）：首帧/参考图要从尾帧继续
    options: { includePreviousVideoTail: true },
  });
  const compiledPromptResult = compileShotPromptToBundle({
    prompt,
    bundle: referenceBundle,
  });
  const compiledPrompt = compiledPromptResult.compiledPrompt;
  const references = [...compiledPromptResult.references];

  if (compiledPromptResult.debug.unmappedTokens.length > 0
    || compiledPromptResult.debug.overflowImageNumbers.length > 0) {
    logger.warn('分镜生图 prompt 编译存在未匹配 / 越界 token', {
      shotId: normalizedShot.id,
      unmappedTokens: compiledPromptResult.debug.unmappedTokens,
      overflowImageNumbers: compiledPromptResult.debug.overflowImageNumbers,
      bundleSize: referenceBundle.items.length,
      bundle: summarizeBundle(referenceBundle),
    });
  }

  logger.info(`分镜 ${normalizedShot.id} prompt: ${compiledPrompt}`);

  // 日志记录（references 仅记录来源，实际传入 Provider 前会被 resolver 规范化）
  logTTICall(
    'TTI',
    compiledPrompt,
    {
      aspectRatio: finalAspectRatio,
      references: references.map(r => (typeof r === 'string' ? r : getMediaAssetDisplaySource(r) || '')).filter(Boolean),
    },
    {
      projectId,
      targetId: normalizedShot.id,
      targetName: `分镜: ${normalizedShot.id}`,
      templateId,
      promptSource,
    }
  );

  onProgress?.(10, '调用 TTI 服务...');

  logger.info('分镜图片生成 - 最终下发 TTI 的 prompt', {
    shotId: normalizedShot.id,
    cachedImagePromptUsed: Boolean(cachedImagePrompt),
    fellBackToScriptLines: !cachedImagePrompt,
    rawScriptText: fallbackScriptText,
    sourceImagePrompt,
    compiledPrompt,
  });

  const projectPath = await getProjectPath(projectId);
  const imageVersionId = buildShotImageVersionId();
  const asset = await mediaGenerationService.generateImage({
    projectId,
    ownerRef: {
      projectId,
      ownerType: 'shot',
      ownerId: normalizedShot.id,
      slot: 'image',
      episodeId,
    },
    request: {
      prompt: compiledPrompt,
      references,
      options: { aspectRatio: finalAspectRatio },
    },
    ttiSelection,
    taskName: `分镜图片: ${normalizedShot.id}`,
    destPath: `${projectPath}/assets/shots/${normalizedShot.id}/images/${imageVersionId}.png`,
  });

  onProgress?.(100, '完成');
  return asset;
}
