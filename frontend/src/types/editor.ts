/**
 * 编辑器核心类型定义
 * 迁移自 electron-egg
 */

export enum MediaType {
  VIDEO = 'VIDEO',
  IMAGE = 'IMAGE',
  TEXT = 'TEXT',
  AUDIO = 'AUDIO'
}

// 缓动类型
export enum EasingType {
  LINEAR = 'linear',
  EASE_IN = 'easeIn',
  EASE_OUT = 'easeOut',
  EASE_IN_OUT = 'easeInOut',
  EASE_IN_CUBIC = 'easeInCubic',
  EASE_OUT_CUBIC = 'easeOutCubic',
  EASE_IN_OUT_CUBIC = 'easeInOutCubic'
}

// 关键帧 - 存储完整属性快照
export interface Keyframe {
  id: string;
  time: number; // 相对于片段开始的时间（秒）
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  easing: EasingType;
}

// 可动画属性
export type AnimatableProperty = 'x' | 'y' | 'scale' | 'rotation' | 'opacity';

export interface Asset {
  id: string;
  type: MediaType;
  src: string;
  thumbnail?: string;
  name: string;
  duration: number; // in seconds
  width?: number;   // 素材宽度（像素）
  height?: number;  // 素材高度（像素）
}

export interface Clip {
  id: string;
  assetId: string;
  trackId: string;
  start: number;    // 时间轴上的起始时间（秒）
  duration: number; // 片段时长（秒）
  offset: number;   // 媒体内部偏移（从源素材第几秒开始）
  sourceDuration?: number; // 源素材总时长（秒），用于限制 trim 范围
  sourceWidth?: number;    // 源素材宽度（像素）
  sourceHeight?: number;   // 源素材高度（像素）
  name: string;
  type: MediaType;
  src: string;
  // 基础属性
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  // 关键帧列表
  keyframes?: Keyframe[];
  // 字幕专有属性
  text?: string;            // 字幕文本内容
  fontSize?: number;        // 字号 (默认 48)
  fontFamily?: string;      // 字体 (默认 'Arial')
  fontColor?: string;       // 字体颜色 (默认 '#FFFFFF')
  backgroundColor?: string; // 背景色 (可选)
  textPosition?: 'top' | 'center' | 'bottom'; // 预设位置
  textAlign?: 'left' | 'center' | 'right';    // 文本对齐
}

export interface Track {
  id: string;
  type: 'video' | 'audio' | 'text';
  clips: Clip[];
  isMainTrack?: boolean;
  order: number; // 轨道顺序，主轨道为 0，上方为正数，下方为负数
  name?: string;   // 轨道名称（可重命名）
  muted?: boolean; // 是否静音
  hidden?: boolean; // 是否隐藏（不渲染）
}

export interface ProjectState {
  tracks: Track[];
  currentTime: number;
  duration: number;
  selectedClipId: string | null;
  isPlaying: boolean;
}

// 插入位置信息
export interface InsertPosition {
  referenceOrder: number;
  position: 'above' | 'below';
}

// 时间线持久化数据
export interface TimelineData {
  version: number;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}

// 素材来源类型
export type AssetSource = 'shot' | 'character' | 'scene' | 'prop' | 'upload';

// 素材面板用的素材项
export interface AssetItem {
  id: string;
  name: string;
  type: 'video' | 'image' | 'audio' | 'text';
  src: string;
  thumbnailSrc?: string;
  duration: number;
  width?: number;   // 素材宽度（像素）
  height?: number;  // 素材高度（像素）
  source: AssetSource;
  metadata?: {
    shotId?: string;
    characterId?: string;
    sceneId?: string;
    propId?: string;
  };
}

// 帧缓存元数据
export interface FrameCacheMeta {
  videoPath: string;
  videoHash: string;
  frameCount: number;
  framePaths: string[];
  createdAt: number;
}
