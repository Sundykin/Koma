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
import { parseMentions } from '../editor/mentionTypes';
import { logTTICall } from '../store/aiCallLogger';
import { createLogger } from '../store/logger';
import { mediaGenerationService } from '../services/MediaGenerationService';
import {
  normalizeCharactersMediaState,
  normalizePropsMediaState,
  normalizeScenesMediaState,
  normalizeShotMediaState,
} from '../store/project/mediaState';

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

  const references: Array<string | StoredMediaAsset> = [];

  // Shot 自身的参考图
  for (const ref of normalizedShot.media?.references || []) {
    references.push(ref);
  }

  // 关联资产参考图
  for (const charId of normalizedShot.characters || []) {
    const char = normalizedCharacters.find(c => c.id === charId);
    if (char?.media?.costumePhoto) references.push(char.media.costumePhoto);
  }
  for (const sceneId of normalizedShot.scenes || []) {
    const scene = normalizedScenes.find(s => s.id === sceneId);
    if (scene?.media?.previewImage) references.push(scene.media.previewImage);
  }
  for (const propId of normalizedShot.props || []) {
    const prop = props.find(p => p.id === propId);
    if (prop?.media?.previewImage) references.push(prop.media.previewImage);
  }

  // 构建提示词：优先使用 imagePrompt
  let prompt: string;
  let templateId = 'shot.imagePrompt';
  let promptSource: 'default' | 'custom' | 'finalized' = 'finalized';

  if (normalizedShot.imagePrompt) {
    prompt = replaceMentionsWithDescriptions(
      normalizedShot.imagePrompt,
      normalizedCharacters,
      normalizedScenes,
      props
    );
  } else {
    const stylePrefix = styleSnapshot?.ttiStylePrefix || project?.styleSnapshot?.ttiStylePrefix || getThemeStylePrefix(theme, stylePrompt);
    const resolved = await resolvePromptTemplate('tti_shot_image', {
      stylePrefix,
      description: normalizedShot.description || '',
      shotType: normalizedShot.shotType || 'medium',
      emotion: normalizedShot.emotion || 'neutral',
    });
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
    ttiConfigId,
    taskName: `分镜图片: ${normalizedShot.id}`,
  });

  onProgress?.(100, '完成');
  return asset;
}

function replaceMentionsWithDescriptions(
  prompt: string,
  characters: Character[],
  scenes: Scene[],
  props: Array<{ id: string; name: string; prompt?: string; description?: string; sora2PropId?: string; type?: string }>
): string {
  const mentions = parseMentions(prompt);
  let result = prompt;
  const sortedMentions = [...mentions].sort((a, b) => b.from - a.from);

  for (const mention of sortedMentions) {
    let replacement = '';

    if (mention.type === 'char') {
      const char = characters.find(c => c.id === mention.id || (c as any).sora2CharacterId === mention.id);
      if (char) {
        replacement = `[${char.name}: ${char.prompt || (char as any).description || (char as any).appearance || ''}]`;
      }
    } else if (mention.type === 'scene') {
      const scene = scenes.find(s => s.id === mention.id);
      if (scene) {
        replacement = `[${scene.name}: ${scene.prompt || (scene as any).description || ''}]`;
      }
    } else if (mention.type === 'prop') {
      const prop = props.find(p => p.id === mention.id || p.sora2PropId === mention.id);
      if (prop) {
        replacement = `[${prop.name}: ${prop.prompt || prop.description || prop.type || ''}]`;
      }
    }

    if (replacement) {
      result = result.slice(0, mention.from) + replacement + result.slice(mention.to);
    }
  }

  return result;
}
