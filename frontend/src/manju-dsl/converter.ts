/**
 * Manju-DSL 导入导出服务
 */
import type {
  ManjuProject,
  ManjuExportOptions,
  ManjuCharacter,
  ManjuScene,
  ManjuShot,
  ManjuTimeline,
  ManjuTrack,
  ManjuClip,
} from './protocol';
import { MANJU_DSL_VERSION, validateManjuProject } from './protocol';
import type {
  Project,
  Character,
  Scene,
  Shot,
  Timeline,
  Track,
  Clip,
} from '../types';

// ========== 导出 ==========

/**
 * 将项目转换为 Manju-DSL 格式
 */
export function toManjuProject(
  project: Project,
  characters: Character[],
  scenes: Scene[],
  shots: Shot[],
  timeline?: Timeline
): ManjuProject {
  return {
    version: MANJU_DSL_VERSION,
    meta: {
      id: project.id,
      title: project.title,
      genre: project.genre,
      mode: project.mode || 'drama',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    characters: characters.map(toManjuCharacter),
    scenes: scenes.map(toManjuScene),
    shots: shots.map(toManjuShot),
    timeline: timeline ? toManjuTimeline(timeline) : undefined,
  };
}

function toManjuCharacter(c: Character): ManjuCharacter {
  return {
    id: c.id,
    name: c.name,
    role: c.role,
    description: c.description,
    appearance: c.appearance,
    voiceId: c.voiceId,
    avatar: c.costumePhotoPath,
  };
}

function toManjuScene(s: Scene): ManjuScene {
  return {
    id: s.id,
    name: s.name,
    location: s.location,
    time: s.time,
    mood: s.mood,
    description: s.description,
  };
}

function toManjuShot(s: Shot): ManjuShot {
  return {
    id: s.id,
    scriptContent: s.scriptContent,
    shotType: s.shotType,
    cameraMovement: s.cameraMovement,
    duration: s.duration,
    prompt: s.description,
    characterIds: s.characters,
    dialogue: s.dialogue,
    emotion: s.emotion,
    seed: s.seed,
    assets: s.imageUrl ? { image: s.imageUrl } : undefined,
  };
}

function toManjuTimeline(t: Timeline): ManjuTimeline {
  return {
    fps: t.fps,
    resolution: t.resolution,
    tracks: t.tracks.map(toManjuTrack),
  };
}

function toManjuTrack(t: Track): ManjuTrack {
  return {
    id: t.id,
    name: t.name,
    type: t.type,
    clips: t.clips.map(toManjuClip),
  };
}

function toManjuClip(c: Clip): ManjuClip {
  return {
    id: c.id,
    startTime: c.startTime,
    duration: c.duration,
    source: c.sourcePath,
    transform: {
      x: c.position.x,
      y: c.position.y,
      scale: c.scale,
      rotation: c.rotation,
      opacity: c.opacity,
    },
    text: c.text,
    keyframes: c.keyframes.map((kf) => ({
      time: kf.time,
      property: kf.property,
      value: kf.value,
      easing: kf.easing,
    })),
  };
}

// ========== 导入 ==========

export interface ImportResult {
  project: Partial<Project>;
  characters: Character[];
  scenes: Scene[];
  shots: Shot[];
  timeline?: Timeline;
}

/**
 * 从 Manju-DSL 格式导入
 */
export function fromManjuProject(data: ManjuProject): ImportResult {
  if (!validateManjuProject(data)) {
    throw new Error('Invalid Manju-DSL format');
  }

  return {
    project: {
      id: data.meta.id,
      title: data.meta.title,
      genre: data.meta.genre,
      mode: data.meta.mode,
    },
    characters: data.characters.map(fromManjuCharacter),
    scenes: data.scenes.map(fromManjuScene),
    shots: data.shots.map(fromManjuShot),
    timeline: data.timeline ? fromManjuTimeline(data.timeline) : undefined,
  };
}

function fromManjuCharacter(c: ManjuCharacter): Character {
  // 从旧字段构建 prompt
  const promptParts: string[] = [];
  if (c.appearance) promptParts.push(c.appearance);
  if (c.description) promptParts.push(c.description);

  return {
    id: c.id,
    name: c.name,
    role: c.role,
    prompt: promptParts.join('\n') || '',
    voiceId: c.voiceId,
    costumePhotoPath: c.avatar,
    // 保留旧字段用于兼容
    age: '',
    description: c.description,
    appearance: c.appearance,
  };
}

function fromManjuScene(s: ManjuScene): Scene {
  // 从旧字段构建 prompt
  const promptParts: string[] = [];
  if (s.location) promptParts.push(`Location: ${s.location}`);
  if (s.time) promptParts.push(`Time: ${s.time}`);
  if (s.mood) promptParts.push(`Mood: ${s.mood}`);
  if (s.description) promptParts.push(s.description);

  return {
    id: s.id,
    name: s.name,
    prompt: promptParts.join('\n') || '',
    // 保留旧字段用于兼容
    location: s.location,
    time: s.time,
    mood: s.mood,
    description: s.description,
  };
}

function fromManjuShot(s: ManjuShot): Shot {
  return {
    id: s.id,
    scriptContent: s.scriptContent,
    shotType: s.shotType,
    cameraMovement: s.cameraMovement,
    duration: s.duration,
    description: s.prompt,
    characters: s.characterIds,
    dialogue: s.dialogue,
    emotion: s.emotion,
    seed: s.seed,
    imageUrl: s.assets?.image,
  };
}

function fromManjuTimeline(t: ManjuTimeline): Timeline {
  return {
    id: `timeline-${Date.now()}`,
    fps: t.fps,
    resolution: t.resolution,
    duration: calculateDuration(t.tracks),
    tracks: t.tracks.map(fromManjuTrack),
  };
}

function fromManjuTrack(t: ManjuTrack): Track {
  return {
    id: t.id,
    name: t.name,
    type: t.type,
    muted: false,
    locked: false,
    visible: true,
    height: 60,
    clips: t.clips.map(fromManjuClip),
  };
}

function fromManjuClip(c: ManjuClip): Clip {
  return {
    id: c.id,
    trackId: '',  // 需要在导入后设置
    type: 'video',
    name: c.text || `Clip ${c.id}`,
    startTime: c.startTime,
    duration: c.duration,
    sourcePath: c.source || '',
    position: {
      x: c.transform?.x || 0,
      y: c.transform?.y || 0,
    },
    scale: c.transform?.scale || 1,
    rotation: c.transform?.rotation || 0,
    opacity: c.transform?.opacity || 1,
    text: c.text,
    keyframes: (c.keyframes || []).map((kf) => ({
      id: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      time: kf.time,
      property: kf.property,
      value: kf.value,
      easing: (kf.easing as any) || 'linear',
    })),
  };
}

function calculateDuration(tracks: ManjuTrack[]): number {
  let maxEnd = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      const end = clip.startTime + clip.duration;
      if (end > maxEnd) maxEnd = end;
    }
  }
  return maxEnd;
}

// ========== 序列化 ==========

/**
 * 导出为 JSON 字符串
 */
export function exportToJSON(project: ManjuProject, pretty = true): string {
  return JSON.stringify(project, null, pretty ? 2 : 0);
}

/**
 * 从 JSON 字符串导入
 */
export function importFromJSON(json: string): ImportResult {
  const data = JSON.parse(json) as ManjuProject;
  return fromManjuProject(data);
}
