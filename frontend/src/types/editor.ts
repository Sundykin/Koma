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
}

export interface Clip {
  id: string;
  assetId: string;
  trackId: string;
  start: number;    // 时间轴上的起始时间（秒）
  duration: number; // 片段时长（秒）
  offset: number;   // 媒体内部偏移
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
}

export interface Track {
  id: string;
  type: 'video' | 'audio' | 'text';
  clips: Clip[];
  isMainTrack?: boolean;
  order: number; // 轨道顺序，主轨道为 0，上方为正数，下方为负数
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
