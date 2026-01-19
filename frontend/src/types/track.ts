/**
 * 轨道系统类型定义
 * 融合 capcut-ai-clone 和 CcClip-master 的设计
 */

// 轨道类型
export type TrackType = 'video' | 'audio' | 'image' | 'text' | 'subtitle';

// 缓动类型枚举
export enum EasingType {
  LINEAR = 'linear',
  EASE_IN = 'ease-in',
  EASE_OUT = 'ease-out',
  EASE_IN_OUT = 'ease-in-out',
  EASE_IN_CUBIC = 'ease-in-cubic',
  EASE_OUT_CUBIC = 'ease-out-cubic',
  EASE_IN_OUT_CUBIC = 'ease-in-out-cubic',
}

// 变换属性类型
export interface TransformProperties {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

// 默认变换属性
export const DEFAULT_TRANSFORM: TransformProperties = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
};

// 关键帧（完整属性快照模式）
export interface TrackKeyframe {
  id: string;
  time: number;           // 相对于片段起点的时间（帧）
  // 完整属性快照
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  volume?: number;        // 音频专用
  // 缓动（应用于到下一个关键帧的过渡）
  easing: EasingType;
}

// 基础轨道项目
export interface BaseTrackItem {
  id: string;
  type: TrackType;
  name: string;
  resourceId?: string;    // 关联的资源 ID
  start: number;          // 在时间线上的开始位置（帧）
  end: number;            // 在时间线上的结束位置（帧）
  frameCount: number;     // 源素材总帧数
  offsetL: number;        // 左侧裁切帧数（非破坏性）
  offsetR: number;        // 右侧裁切帧数（非破坏性）
}

// 视频轨道项目
export interface VideoTrackItem extends BaseTrackItem {
  type: 'video';
  fps: number;
  width: number;
  height: number;
  format: string;
  source: string;         // 源文件路径
  cover?: string;         // 封面帧路径
  // 变换属性
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  // 关键帧
  keyframes?: TrackKeyframe[];
}

// 音频轨道项目
export interface AudioTrackItem extends BaseTrackItem {
  type: 'audio';
  duration: number;       // 总时长(ms)
  format: string;
  source: string;
  waveform?: string;      // 波形图路径
  volume: number;         // 音量 0-1
  muted: boolean;
  // 关键帧
  keyframes?: TrackKeyframe[];
}

// 图片轨道项目
export interface ImageTrackItem extends BaseTrackItem {
  type: 'image';
  width: number;
  height: number;
  source: string;
  // 变换属性
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  // 关键帧
  keyframes?: TrackKeyframe[];
}

// 文本轨道项目
export interface TextTrackItem extends BaseTrackItem {
  type: 'text';
  content: string;
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  // 变换属性
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  // 关键帧
  keyframes?: TrackKeyframe[];
}

// 字幕轨道项目
export interface SubtitleTrackItem extends BaseTrackItem {
  type: 'subtitle';
  content: string;
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  backgroundColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  // 位置
  x: number;
  y: number;
  opacity: number;
}

// 联合类型
export type TrackItem =
  | VideoTrackItem
  | AudioTrackItem
  | ImageTrackItem
  | TextTrackItem
  | SubtitleTrackItem;

// 轨道线
export interface TrackLine {
  id: string;
  name: string;
  type: TrackType;
  order: number;          // 轨道顺序（正数=上层，负数=下层，0=主轨道）
  main?: boolean;         // 是否为主轨道
  locked: boolean;        // 锁定状态
  visible: boolean;       // 可见性
  muted: boolean;         // 静音（音频轨道）
  collapsed: boolean;     // 是否折叠
  height: number;         // 轨道高度（像素）
  items: TrackItem[];
}

// 时间线配置
export interface TimelineConfig {
  fps: number;            // 帧率
  width: number;          // 画布宽度
  height: number;         // 画布高度
  duration: number;       // 总时长（帧）
}

// 时间线状态
export interface TimelineState {
  config: TimelineConfig;
  tracks: TrackLine[];
  currentTime: number;    // 当前时间（帧）
  selectedTrackId?: string;
  selectedItemId?: string;
  selectedKeyframeId?: string;
  scale: number;          // 缩放比例（像素/帧）
  scrollLeft: number;     // 水平滚动位置
  isPlaying: boolean;
  playbackRate: number;   // 播放速率
}

// 轨道操作类型
export type TrackActionType =
  | 'addTrack'
  | 'removeTrack'
  | 'updateTrack'
  | 'addItem'
  | 'removeItem'
  | 'updateItem'
  | 'moveItem'
  | 'trimItem'
  | 'splitItem'
  | 'addKeyframe'
  | 'removeKeyframe'
  | 'updateKeyframe';

// 轨道操作记录（用于撤销/重做）
export interface TrackAction {
  type: TrackActionType;
  timestamp: number;
  data: any;
  undo: () => void;
}

// 吸附点
export interface SnapPoint {
  time: number;           // 时间位置（帧）
  type: 'playhead' | 'item-start' | 'item-end' | 'marker';
  itemId?: string;
}

// 碰撞检测结果
export interface CollisionResult {
  hasCollision: boolean;
  collidingItems: TrackItem[];
}

// 默认值
export const DEFAULT_TRACK_HEIGHT = 60;
export const DEFAULT_FPS = 30;
export const DEFAULT_CANVAS_WIDTH = 1920;
export const DEFAULT_CANVAS_HEIGHT = 1080;

// 辅助函数：帧转毫秒
export function frameToMs(frame: number, fps: number): number {
  return Math.round((frame / fps) * 1000);
}

// 辅助函数：毫秒转帧
export function msToFrame(ms: number, fps: number): number {
  return Math.round((ms / 1000) * fps);
}

// 辅助函数：获取轨道项的可见时长（考虑裁切）
export function getItemVisibleDuration(item: BaseTrackItem): number {
  return item.end - item.start;
}

// 辅助函数：获取轨道项的源素材范围
export function getItemSourceRange(item: BaseTrackItem): { start: number; end: number } {
  return {
    start: item.offsetL,
    end: item.frameCount - item.offsetR
  };
}

// 辅助函数：检查两个轨道项是否重叠
export function checkItemsOverlap(item1: BaseTrackItem, item2: BaseTrackItem): boolean {
  return item1.start < item2.end && item1.end > item2.start;
}

// 辅助函数：创建默认视频轨道项
export function createVideoTrackItem(
  id: string,
  source: string,
  frameCount: number,
  fps: number,
  width: number,
  height: number,
  start: number = 0
): VideoTrackItem {
  return {
    id,
    type: 'video',
    name: source.split('/').pop() || 'video',
    source,
    start,
    end: start + frameCount,
    frameCount,
    offsetL: 0,
    offsetR: 0,
    fps,
    width,
    height,
    format: 'mp4',
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1
  };
}

// 辅助函数：创建默认音频轨道项
export function createAudioTrackItem(
  id: string,
  source: string,
  duration: number,
  fps: number,
  start: number = 0
): AudioTrackItem {
  const frameCount = msToFrame(duration, fps);
  return {
    id,
    type: 'audio',
    name: source.split('/').pop() || 'audio',
    source,
    start,
    end: start + frameCount,
    frameCount,
    offsetL: 0,
    offsetR: 0,
    duration,
    format: 'mp3',
    volume: 1,
    muted: false
  };
}

// 辅助函数：创建默认图片轨道项
export function createImageTrackItem(
  id: string,
  source: string,
  width: number,
  height: number,
  fps: number,
  duration: number = 3000, // 默认 3 秒
  start: number = 0
): ImageTrackItem {
  const frameCount = msToFrame(duration, fps);
  return {
    id,
    type: 'image',
    name: source.split('/').pop() || 'image',
    source,
    start,
    end: start + frameCount,
    frameCount,
    offsetL: 0,
    offsetR: 0,
    width,
    height,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1
  };
}

// 辅助函数：创建默认文本轨道项
export function createTextTrackItem(
  id: string,
  content: string,
  fps: number,
  duration: number = 3000,
  start: number = 0
): TextTrackItem {
  const frameCount = msToFrame(duration, fps);
  return {
    id,
    type: 'text',
    name: content.slice(0, 20),
    content,
    start,
    end: start + frameCount,
    frameCount,
    offsetL: 0,
    offsetR: 0,
    fontFamily: 'Arial',
    fontSize: 48,
    fontColor: '#ffffff',
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1
  };
}

// 辅助函数：创建默认轨道
export function createTrackLine(
  id: string,
  type: TrackType,
  name: string,
  order: number = 0
): TrackLine {
  return {
    id,
    name,
    type,
    order,
    locked: false,
    visible: true,
    muted: false,
    collapsed: false,
    height: DEFAULT_TRACK_HEIGHT,
    items: []
  };
}
