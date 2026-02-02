/**
 * Manju-DSL 协议定义
 * 用于视频编辑项目的导入导出格式
 */

// ========== 协议版本 ==========
export const MANJU_DSL_VERSION = '1.0.0';

// ========== 核心类型 ==========

export interface ManjuProject {
  version: string;
  meta: ManjuMeta;
  characters: ManjuCharacter[];
  scenes: ManjuScene[];
  shots: ManjuShot[];
  timeline?: ManjuTimeline;
}

export interface ManjuMeta {
  id: string;
  title: string;
  genre: string;
  mode: 'drama' | 'narration';
  createdAt: string;
  updatedAt: string;
  description?: string;
  author?: string;
}

export interface ManjuCharacter {
  id: string;
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting';
  description: string;
  appearance: string;
  voiceId?: string;
  avatar?: string;  // base64 或 URL
}

export interface ManjuScene {
  id: string;
  name: string;
  location: string;
  time: 'day' | 'night' | 'twilight';
  mood: string;
  description: string;
}

export interface ManjuShot {
  id: string;
  sceneId?: string;
  scriptContent: string;
  shotType: 'close-up' | 'medium' | 'wide' | 'extreme-wide';
  cameraMovement: 'static' | 'pan' | 'zoom-in' | 'tracking' | 'handheld';
  duration: number;
  prompt: string;
  characterIds: string[];
  dialogue?: string;
  emotion?: string;
  seed?: number;
  assets?: {
    image?: string;  // 相对路径或 base64
    video?: string;
    audio?: string;
  };
}

export interface ManjuTimeline {
  fps: number;
  resolution: {
    width: number;
    height: number;
  };
  tracks: ManjuTrack[];
}

export interface ManjuTrack {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'subtitle';
  clips: ManjuClip[];
}

export interface ManjuClip {
  id: string;
  shotId?: string;  // 关联分镜
  startTime: number;
  duration: number;
  source?: string;  // 相对路径
  transform?: {
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
    opacity?: number;
  };
  keyframes?: ManjuKeyframe[];
  text?: string;  // 字幕
}

export interface ManjuKeyframe {
  time: number;
  property: string;
  value: number;
  easing?: string;
}

// ========== 导出格式 ==========

export interface ManjuExportOptions {
  includeAssets: boolean;  // 是否打包资源文件
  format: 'json' | 'zip';  // 导出格式
  compress: boolean;       // 是否压缩
}

// ========== 验证 ==========

export function validateManjuProject(data: any): data is ManjuProject {
  if (!data || typeof data !== 'object') return false;
  if (!data.version || !data.meta) return false;
  if (!data.meta.id || !data.meta.title) return false;
  return true;
}

// ========== 导入导出 ==========

import type {
  ProjectMeta,
  Timeline,
  Track,
  Clip,
  Keyframe,
  Character,
  Scene,
  Shot,
} from '../types';

/**
 * 将内部项目数据转换为 Manju-DSL 格式
 */
export function exportToManjuDSL(
  project: ProjectMeta,
  characters: Character[],
  scenes: Scene[],
  shots: Shot[],
  timeline?: Timeline
): ManjuProject {
  // 转换元数据
  const meta: ManjuMeta = {
    id: project.id,
    title: project.title,
    genre: project.genre,
    mode: project.mode,
    createdAt: new Date(project.createdAt).toISOString(),
    updatedAt: new Date(project.updatedAt).toISOString(),
  };

  // 转换角色
  const manjuCharacters: ManjuCharacter[] = characters.map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    description: c.description,
    appearance: c.appearance,
    voiceId: c.voiceId,
    avatar: c.costumePhotoPath,
  }));

  // 转换场景
  const manjuScenes: ManjuScene[] = scenes.map((s) => ({
    id: s.id,
    name: s.name,
    location: s.location,
    time: s.time,
    mood: s.mood,
    description: s.description,
  }));

  // 转换分镜
  const manjuShots: ManjuShot[] = shots.map((s) => ({
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
  }));

  // 转换时间线
  let manjuTimeline: ManjuTimeline | undefined;
  if (timeline) {
    manjuTimeline = {
      fps: timeline.fps,
      resolution: timeline.resolution,
      tracks: timeline.tracks.map((track) => convertTrackToManju(track)),
    };
  }

  return {
    version: MANJU_DSL_VERSION,
    meta,
    characters: manjuCharacters,
    scenes: manjuScenes,
    shots: manjuShots,
    timeline: manjuTimeline,
  };
}

function convertTrackToManju(track: Track): ManjuTrack {
  return {
    id: track.id,
    name: track.name,
    type: track.type,
    clips: track.clips.map((clip) => convertClipToManju(clip)),
  };
}

function convertClipToManju(clip: Clip): ManjuClip {
  return {
    id: clip.id,
    startTime: clip.startTime,
    duration: clip.duration,
    source: clip.sourcePath,
    transform: {
      x: clip.position.x,
      y: clip.position.y,
      scale: clip.scale,
      rotation: clip.rotation,
      opacity: clip.opacity,
    },
    keyframes: clip.keyframes.map((kf) => ({
      time: kf.time,
      property: kf.property,
      value: kf.value,
      easing: kf.easing,
    })),
    text: clip.text,
  };
}

/**
 * 将 Manju-DSL 格式转换为内部项目数据
 */
export interface ImportedProjectData {
  project: ProjectMeta;
  characters: Character[];
  scenes: Scene[];
  shots: Shot[];
  timeline?: Timeline;
}

export function importFromManjuDSL(manju: ManjuProject): ImportedProjectData {
  // 转换元数据
  const project: ProjectMeta = {
    id: manju.meta.id,
    title: manju.meta.title,
    genre: manju.meta.genre,
    mode: manju.meta.mode,
    createdAt: new Date(manju.meta.createdAt).getTime(),
    updatedAt: new Date(manju.meta.updatedAt).getTime(),
  };

  // 转换角色
  const characters: Character[] = manju.characters.map((c) => {
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
  });

  // 转换场景
  const scenes: Scene[] = manju.scenes.map((s) => {
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
  });

  // 转换分镜
  const shots: Shot[] = manju.shots.map((s) => ({
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
  }));

  // 转换时间线
  let timeline: Timeline | undefined;
  if (manju.timeline) {
    timeline = {
      id: manju.meta.id + '-timeline',
      duration: calculateTimelineDuration(manju.timeline),
      fps: manju.timeline.fps,
      resolution: manju.timeline.resolution,
      tracks: manju.timeline.tracks.map((track) => convertManjuToTrack(track)),
    };
  }

  return { project, characters, scenes, shots, timeline };
}

function calculateTimelineDuration(timeline: ManjuTimeline): number {
  let maxEnd = 0;
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      const clipEnd = clip.startTime + clip.duration;
      if (clipEnd > maxEnd) maxEnd = clipEnd;
    }
  }
  return maxEnd;
}

function convertManjuToTrack(manjuTrack: ManjuTrack): Track {
  return {
    id: manjuTrack.id,
    name: manjuTrack.name,
    type: manjuTrack.type,
    muted: false,
    locked: false,
    visible: true,
    height: manjuTrack.type === 'video' ? 60 : manjuTrack.type === 'audio' ? 40 : 30,
    clips: manjuTrack.clips.map((clip) => convertManjuToClip(clip, manjuTrack.id, manjuTrack.type)),
  };
}

function convertManjuToClip(
  manjuClip: ManjuClip,
  trackId: string,
  trackType: 'video' | 'audio' | 'subtitle'
): Clip {
  const clipType = trackType === 'subtitle' ? 'subtitle' : trackType;
  return {
    id: manjuClip.id,
    trackId,
    type: clipType,
    name: manjuClip.source || manjuClip.text || 'Clip',
    startTime: manjuClip.startTime,
    duration: manjuClip.duration,
    sourcePath: manjuClip.source || '',
    position: {
      x: manjuClip.transform?.x ?? 0,
      y: manjuClip.transform?.y ?? 0,
    },
    scale: manjuClip.transform?.scale ?? 1,
    rotation: manjuClip.transform?.rotation ?? 0,
    opacity: manjuClip.transform?.opacity ?? 1,
    keyframes: (manjuClip.keyframes || []).map((kf, idx) => ({
      id: `${manjuClip.id}-kf-${idx}`,
      time: kf.time,
      property: kf.property,
      value: kf.value,
      easing: (kf.easing as any) || 'linear',
    })),
    text: manjuClip.text,
  };
}
