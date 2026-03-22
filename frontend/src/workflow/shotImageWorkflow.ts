/**
 * 分镜生图工作流
 *
 * OpenSpec: 统一通过 MediaGenerationService 编排 start/snapshot、落盘与回写。
 */
import type { Character, Scene, Shot, StoredMediaAsset } from '../types';
import { getMediaAssetDisplaySource } from '../types';
import { loadProps } from '../store/projectStore';
import { resolvePromptTemplate } from '../store/promptTemplates';
import { getThemeStylePrefix } from '../config/themePresets';
import { logTTICall } from '../store/aiCallLogger';
import { createLogger } from '../store/logger';
import { mediaGenerationService } from '../services/MediaGenerationService';
import {
  normalizeCharactersMediaState,
  normalizePropsMediaState,
  normalizeScenesMediaState,
  normalizeShotMediaState,
} from '../store/project/mediaState';
import { buildShotImageTemplateVariables } from './promptVariableBuilders';
import { buildShotAssetReferences } from './assetReferenceBuilder';

const logger = createLogger('ShotImageWorkflow');

interface StyleSnapshotLike {
  ttiStylePrefix?: string;
}

export async function shotImageWorkflow(params: {
  projectId: string;
  episodeId: string;
  shot: Shot;
  characters: Character[];
  scenes: Scene[];
  ttiConfigId?: string;
  styleSnapshot?: StyleSnapshotLike;
  theme?: string;
  stylePrompt?: string;
  project?: { styleSnapshot?: StyleSnapshotLike };
  onProgress?: (progress: number, step?: string) => void;
}): Promise<StoredMediaAsset> {
  const {
    projectId,
    episodeId,
    shot,
    characters,
    scenes,
    ttiConfigId,
    styleSnapshot,
    theme,
    stylePrompt,
    project,
    onProgress,
  } = params;

  const normalizedShot = normalizeShotMediaState(shot);
  const normalizedCharacters = normalizeCharactersMediaState(characters);
  const normalizedScenes = normalizeScenesMediaState(scenes);
  const props = normalizePropsMediaState(await loadProps(projectId).catch(() => []));

  onProgress?.(0, '准备生成分镜图片...');

  // Shot 自身的参考图
  const references: Array<string | StoredMediaAsset> = [];
  for (const ref of normalizedShot.media?.references || []) {
    references.push(ref);
  }

  // 关联资产参考图（角色/场景/道具）
  const { mediaReferences, compilationAssets: selectedAssetsForCompilation } = buildShotAssetReferences(
    normalizedShot,
    normalizedCharacters,
    normalizedScenes,
    props,
  );
  references.push(...mediaReferences);

  // 构建提示词：优先使用 imagePrompt
  let prompt: string;
  let templateId = 'shot.imagePrompt';
  let promptSource: 'default' | 'custom' | 'finalized' = 'finalized';

  if (normalizedShot.imagePrompt) {
    // 保留 @char/@scene/@prop（供渠道编译协议处理，例如 grok-image-index）。
    // 如果这里把 @ 引用替换成纯文字描述，会导致编译器无法提取 @ 资产并完成 @Image N 映射。
    prompt = normalizedShot.imagePrompt;
  } else {
    const stylePrefix = styleSnapshot?.ttiStylePrefix || project?.styleSnapshot?.ttiStylePrefix || getThemeStylePrefix(theme, stylePrompt);
    const resolved = await resolvePromptTemplate('tti_shot_image', buildShotImageTemplateVariables({
      shot: normalizedShot,
      characters: normalizedCharacters,
      scenes: normalizedScenes,
      props,
      stylePrefix,
    }));
    prompt = resolved.prompt;
    templateId = resolved.template.id;
    promptSource = resolved.source;
  }

  logger.info(`分镜 ${normalizedShot.id} prompt: ${prompt}`);

  // 日志记录（references 仅记录来源，实际传入 Provider 前会被 resolver 规范化）
  logTTICall(
    'TTI',
    prompt,
    {
      width: 1280,
      height: 720,
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
      prompt,
      references,
      options: { width: 1280, height: 720 },
    },
    promptCompilation: {
      selectedAssets: selectedAssetsForCompilation,
    },
    ttiConfigId,
    taskName: `分镜图片: ${normalizedShot.id}`,
  });

  onProgress?.(100, '完成');
  return asset;
}
