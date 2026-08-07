import type {
  LinghuiImageMediaItem,
  LinghuiStoryboardFrame,
} from '../../../../types/linghui';
import { normalizeVideoDurationSeconds } from '../../../../utils/videoDuration';

export interface LinghuiScriptParseResult {
  shots: LinghuiStoryboardFrame[];
  formattedText: string;
  source: 'json' | 'plain';
}

function toDurationSec(value: unknown, fallback = 10): number {
  return normalizeVideoDurationSeconds(value, normalizeVideoDurationSeconds(fallback));
}

function normalizeMediaItem(value: unknown): LinghuiImageMediaItem | undefined {
  if (typeof value === 'string' && value.trim()) {
    return {
      kind: 'image',
      source: value.trim(),
    };
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const source = typeof record.source === 'string' ? record.source.trim() : '';
  if (!source) {
    return undefined;
  }

  return {
    kind: 'image',
    source,
    label: typeof record.label === 'string' ? record.label.trim() : undefined,
    mimeType: typeof record.mimeType === 'string' ? record.mimeType.trim() : undefined,
    width: Number.isFinite(Number(record.width)) ? Number(record.width) : undefined,
    height: Number.isFinite(Number(record.height)) ? Number(record.height) : undefined,
  };
}

function stripLeadingIndex(text: string): string {
  return text.replace(/^\s*(?:镜头|shot)?\s*[-#]?\s*\d+[\.\):：、-]?\s*/i, '').trim();
}

function readString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return undefined;
}

function normalizeStoryboardCharacters(value: unknown): LinghuiStoryboardFrame['characters'] {
  if (!Array.isArray(value)) return undefined;
  const characters = value
    .map(item => {
      if (typeof item === 'string') {
        const characterName = item.trim();
        return characterName ? { characterName } : null;
      }
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const characterName = readString(record, ['characterName', 'character_name', 'name']);
      const characterDescription = readString(record, ['characterDescription', 'character_description', 'description']);
      const characterImageUrl = readString(record, ['characterImageUrl', 'character_image_url', 'imageUrl', 'image_url', 'url']);
      if (!characterName && !characterDescription && !characterImageUrl) return null;
      return { characterName, characterDescription, characterImageUrl };
    })
    .filter(Boolean) as NonNullable<LinghuiStoryboardFrame['characters']>;
  return characters.length > 0 ? characters : undefined;
}

function normalizeVideoReference(value: unknown): LinghuiStoryboardFrame['videoReference'] {
  if (typeof value === 'string' && value.trim()) {
    return { referenceFrameImage: value.trim() };
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const referenceFrameImage = readString(record, ['referenceFrameImage', 'reference_frame_image', 'image', 'url']);
  const startTime = readNumber(record, ['startTime', 'start_time']);
  const endTime = readNumber(record, ['endTime', 'end_time']);
  if (!referenceFrameImage && startTime == null && endTime == null) return undefined;
  return { referenceFrameImage, startTime, endTime };
}

function normalizeStoryboardScenes(value: unknown): LinghuiStoryboardFrame['scenes'] {
  if (!Array.isArray(value)) return undefined;
  const scenes = value.map(item => {
    if (typeof item === 'string') {
      const sceneName = item.trim();
      return sceneName ? { sceneName } : null;
    }
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;
    const sceneName = readString(record, ['sceneName', 'scene_name', 'name', 'scene']);
    const sceneDescription = readString(record, ['sceneDescription', 'scene_description', 'description']);
    const sceneImageUrl = readString(record, ['sceneImageUrl', 'scene_image_url', 'imageUrl', 'image_url', 'url']);
    if (!sceneName && !sceneDescription && !sceneImageUrl) return null;
    return { sceneName, sceneDescription, sceneImageUrl };
  }).filter(Boolean) as NonNullable<LinghuiStoryboardFrame['scenes']>;
  return scenes.length > 0 ? scenes : undefined;
}

function normalizeStoryboardProps(value: unknown): LinghuiStoryboardFrame['props'] {
  if (!Array.isArray(value)) return undefined;
  const props = value.map(item => {
    if (typeof item === 'string') {
      const propName = item.trim();
      return propName ? { propName } : null;
    }
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;
    const propName = readString(record, ['propName', 'prop_name', 'name', 'prop']);
    const propDescription = readString(record, ['propDescription', 'prop_description', 'description']);
    const propImageUrl = readString(record, ['propImageUrl', 'prop_image_url', 'imageUrl', 'image_url', 'url']);
    if (!propName && !propDescription && !propImageUrl) return null;
    return { propName, propDescription, propImageUrl };
  }).filter(Boolean) as NonNullable<LinghuiStoryboardFrame['props']>;
  return props.length > 0 ? props : undefined;
}

function normalizeProductionAsset(value: unknown): LinghuiStoryboardFrame['productionAsset'] {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const id = readString(record, ['id']);
  const name = readString(record, ['name']);
  const kind = record.kind === 'character' || record.kind === 'scene' || record.kind === 'prop'
    ? record.kind
    : null;
  if (!id || !name || !kind) return undefined;
  return { id, name, kind };
}

function normalizeShotRecord(value: unknown, index: number): LinghuiStoryboardFrame | null {
  if (typeof value === 'string') {
    const description = value.trim();
    if (!description) return null;
    return {
      id: `shot-${index + 1}`,
      title: `镜头 ${index + 1}`,
      description,
      durationSec: toDurationSec(undefined),
    };
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const title = String(
    record.title ??
    record.name ??
    record.scene ??
    record.shot ??
    `镜头 ${index + 1}`,
  ).trim() || `镜头 ${index + 1}`;
  const plotDescription = readString(record, ['plotDescription', 'plot_description', 'storyDescription', 'story_description', 'description', 'summary', 'content']);
  const visualDescription = readString(record, ['visualDescription', 'visual_description', 'pictureDescription', 'picture_description', 'screenDescription', 'screen_description']);
  const imageGenerationPrompt = readString(record, ['imageGenerationPrompt', 'image_generation_prompt', 'imagePrompt', 'image_prompt', 'picturePrompt', 'picture_prompt']);
  const videoMotionPrompt = readString(record, ['videoMotionPrompt', 'video_motion_prompt', 'videoPrompt', 'video_prompt', 'motionPrompt', 'motion_prompt']);
  const characterAction = readString(record, ['characterAction', 'character_action', 'action']);
  const emotion = readString(record, ['emotion', 'mood']);
  const sceneTags = readString(record, ['sceneTags', 'scene_tags', 'sceneTag', 'scene_tag']);
  const lightingAndAtmosphere = readString(record, ['lightingAndAtmosphere', 'lighting_atmosphere', 'lighting', 'atmosphere']);
  const audioEffects = readString(record, ['audioEffects', 'audio_effects', 'sound', 'sfx']);
  const dialogue = readString(record, ['dialogue', 'dialog', 'line']);
  const shotSize = readString(record, ['shotSize', 'shot_size', 'shotType', 'shot_type', 'framing']);
  const description = plotDescription
    || visualDescription
    || readString(record, ['prompt', 'content'])
    || imageGenerationPrompt
    || videoMotionPrompt;

  if (!title && !description) {
    return null;
  }

  return {
    id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `shot-${index + 1}`,
    hiddenUuid: readString(record, ['hiddenUuid', 'hidden_uuid', 'uuid']) || undefined,
    shotNumber: readNumber(record, ['shotNumber', 'shot_number']),
    title,
    description: description || title,
    durationSec: toDurationSec(record.durationSec ?? record.duration ?? record.seconds),
    image: normalizeMediaItem(record.image ?? record.referenceImage ?? record.thumbnail),
    plotDescription: plotDescription || description || title,
    visualDescription,
    characters: normalizeStoryboardCharacters(record.characters),
    scenes: normalizeStoryboardScenes(record.scenes),
    props: normalizeStoryboardProps(record.props ?? record.objects),
    productionAsset: normalizeProductionAsset(record.productionAsset ?? record.production_asset),
    videoReference: normalizeVideoReference(record.videoReference ?? record.video_reference),
    shotSize,
    characterAction,
    emotion,
    sceneTags,
    lightingAndAtmosphere,
    audioEffects,
    dialogue,
    imageGenerationPrompt,
    videoMotionPrompt,
  };
}

function normalizeShots(payload: unknown): LinghuiStoryboardFrame[] {
  if (Array.isArray(payload)) {
    return payload
      .map((item, index) => normalizeShotRecord(item, index))
      .filter(Boolean) as LinghuiStoryboardFrame[];
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.shots)) {
      return record.shots
        .map((item, index) => normalizeShotRecord(item, index))
        .filter(Boolean) as LinghuiStoryboardFrame[];
    }
  }

  return [];
}

function extractJsonCandidate(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) {
    return fenced[1].trim();
  }

  const trimmed = text.trim();
  if (
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
  ) {
    return trimmed;
  }

  return null;
}

function parsePlainBlock(block: string, index: number): LinghuiStoryboardFrame | null {
  const normalizedBlock = block.trim();
  if (!normalizedBlock) return null;

  const pipeParts = normalizedBlock.split('|').map(part => part.trim()).filter(Boolean);
  if (pipeParts.length >= 2) {
    const [rawTitle, rawDescription, rawDuration] = pipeParts;
    return {
      id: `shot-${index + 1}`,
      title: stripLeadingIndex(rawTitle) || `镜头 ${index + 1}`,
      description: rawDescription || stripLeadingIndex(rawTitle) || `镜头 ${index + 1}`,
      durationSec: toDurationSec(rawDuration),
    };
  }

  const lines = normalizedBlock
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    return null;
  }

  const durationLineIndex = lines.findIndex(line => /^(?:时长|duration)\s*[:：]/i.test(line));
  const durationSec = durationLineIndex >= 0
    ? toDurationSec(lines[durationLineIndex].split(/[:：]/).slice(1).join(' '))
    : toDurationSec(undefined);
  const contentLines = durationLineIndex >= 0
    ? lines.filter((_, lineIndex) => lineIndex !== durationLineIndex)
    : lines;
  const firstLine = stripLeadingIndex(contentLines[0] ?? '');
  const remaining = contentLines.slice(1).join(' ').trim();

  if (remaining) {
    return {
      id: `shot-${index + 1}`,
      title: firstLine || `镜头 ${index + 1}`,
      description: remaining,
      durationSec,
    };
  }

  return {
    id: `shot-${index + 1}`,
    title: `镜头 ${index + 1}`,
    description: firstLine || normalizedBlock,
    durationSec,
  };
}

function isLikelyStandaloneShotLine(line: string): boolean {
  const normalized = line.trim();
  if (!normalized) return false;
  return normalized.includes('|') || /^\s*(?:镜头|shot)?\s*[-#]?\s*\d+[\.\):：、-]/i.test(normalized);
}

function parsePlainTextToShots(text: string): LinghuiStoryboardFrame[] {
  const blocks = text
    .split(/\n\s*\n+/)
    .map(block => block.trim())
    .filter(Boolean);

  if (blocks.length > 1) {
    return blocks
      .map((block, index) => parsePlainBlock(block, index))
      .filter(Boolean) as LinghuiStoryboardFrame[];
  }

  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length > 1 && lines.every(isLikelyStandaloneShotLine)) {
    return lines
      .map((line, index) => parsePlainBlock(line, index))
      .filter(Boolean) as LinghuiStoryboardFrame[];
  }

  const parsed = parsePlainBlock(text, 0);
  return parsed ? [parsed] : [];
}

export function formatLinghuiScriptShots(shots: LinghuiStoryboardFrame[]): string {
  return shots
    .map((shot, index) => {
      const title = shot.title?.trim() || `镜头 ${index + 1}`;
      const plot = shot.plotDescription?.trim() || shot.description?.trim() || title;
      const visual = shot.visualDescription?.trim();
      const imagePrompt = shot.imageGenerationPrompt?.trim();
      const videoPrompt = shot.videoMotionPrompt?.trim();
      return [
        `${index + 1}. ${title}`,
        `剧情：${plot}`,
        visual ? `画面：${visual}` : '',
        imagePrompt ? `生图：${imagePrompt}` : '',
        videoPrompt ? `视频：${videoPrompt}` : '',
        `时长：${toDurationSec(shot.durationSec)} 秒`,
      ].filter(Boolean).join('\n');
    })
    .join('\n\n');
}

export function serializeLinghuiScriptShots(shots: LinghuiStoryboardFrame[]): string {
  return JSON.stringify({
    shots: shots.map((shot, index) => ({
      id: shot.id || `shot-${index + 1}`,
      hiddenUuid: shot.hiddenUuid,
      shotNumber: shot.shotNumber || index + 1,
      title: shot.title || `镜头 ${index + 1}`,
      description: shot.description || shot.plotDescription || shot.visualDescription || '',
      durationSec: toDurationSec(shot.durationSec),
      image: shot.image,
      plotDescription: shot.plotDescription,
      visualDescription: shot.visualDescription,
      characters: shot.characters,
      scenes: shot.scenes,
      props: shot.props,
      productionAsset: shot.productionAsset,
      videoReference: shot.videoReference,
      shotSize: shot.shotSize,
      characterAction: shot.characterAction,
      emotion: shot.emotion,
      sceneTags: shot.sceneTags,
      lightingAndAtmosphere: shot.lightingAndAtmosphere,
      audioEffects: shot.audioEffects,
      dialogue: shot.dialogue,
      imageGenerationPrompt: shot.imageGenerationPrompt,
      videoMotionPrompt: shot.videoMotionPrompt,
    })),
  }, null, 2);
}

export function parseLinghuiScriptContent(rawContent: string): LinghuiScriptParseResult {
  const text = String(rawContent ?? '').trim();
  if (!text) {
    return {
      shots: [],
      formattedText: '',
      source: 'plain',
    };
  }

  const jsonCandidate = extractJsonCandidate(text);
  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate);
      const shots = normalizeShots(parsed);
      if (shots.length > 0) {
        return {
          shots,
          formattedText: formatLinghuiScriptShots(shots),
          source: 'json',
        };
      }
    } catch {
      // fall through to plain-text parsing
    }
  }

  const shots = parsePlainTextToShots(text);
  return {
    shots,
    formattedText: formatLinghuiScriptShots(shots),
    source: 'plain',
  };
}
