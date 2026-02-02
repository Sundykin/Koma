/**
 * 轨道状态管理
 * 管理时间线上的轨道和轨道项
 */
import { create } from 'zustand';
import { nanoid } from 'nanoid';
import {
  TrackType,
  TrackLine,
  TrackItem,
  VideoTrackItem,
  AudioTrackItem,
  ImageTrackItem,
  TextTrackItem,
  TrackKeyframe,
  TransformProperties,
  EasingType,
  TimelineConfig,
  TrackAction,
  TrackActionType,
  CollisionResult,
  SnapPoint,
  createTrackLine,
  createVideoTrackItem,
  createAudioTrackItem,
  createImageTrackItem,
  createTextTrackItem,
  checkItemsOverlap,
  DEFAULT_FPS,
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_TRACK_HEIGHT,
  DEFAULT_TRANSFORM,
  msToFrame,
  frameToMs,
} from '../types/track';
import {
  addKeyframe as addKf,
  removeKeyframe as removeKf,
  updateKeyframeTime,
  updateKeyframeEasing,
  updateKeyframeProperties,
  autoKeyframe,
  getAnimatedProperties,
} from '../engine/keyframe';

// Store 状态
interface TrackState {
  // 配置
  config: TimelineConfig;

  // 轨道数据
  tracks: TrackLine[];

  // 选中状态
  selectedTrackId: string | null;
  selectedItemId: string | null;
  selectedKeyframeId: string | null;

  // 播放状态
  currentTime: number;      // 当前时间（帧）
  isPlaying: boolean;
  playbackRate: number;

  // 视图状态
  scale: number;            // 缩放比例（像素/帧）
  scrollLeft: number;
  scrollTop: number;

  // 操作历史
  history: TrackAction[];
  historyIndex: number;
  maxHistorySize: number;

  // 吸附点
  snapPoints: SnapPoint[];
  snapEnabled: boolean;
  snapThreshold: number;    // 吸附阈值（像素）
}

// Store 操作
interface TrackActions {
  // 初始化
  init: (config?: Partial<TimelineConfig>) => void;
  reset: () => void;

  // 轨道 CRUD
  addTrack: (type: TrackType, name?: string, order?: number) => TrackLine;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<TrackLine>) => void;
  getTrack: (trackId: string) => TrackLine | undefined;
  reorderTracks: (trackIds: string[]) => void;

  // 轨道项 CRUD
  addItem: (trackId: string, item: TrackItem) => void;
  removeItem: (trackId: string, itemId: string) => void;
  updateItem: (trackId: string, itemId: string, updates: Partial<TrackItem>) => void;
  getItem: (trackId: string, itemId: string) => TrackItem | undefined;

  // 从资源创建轨道项
  addItemFromResource: (
    trackId: string,
    resource: {
      id: string;
      type: string;
      name: string;
      path: string;
      duration?: number;
      width?: number;
      height?: number;
      thumbnailPath?: string;
      waveformPath?: string;
    },
    startFrame: number
  ) => TrackItem | null;

  // 轨道项移动
  moveItem: (trackId: string, itemId: string, newStart: number) => void;
  moveItemToTrack: (fromTrackId: string, toTrackId: string, itemId: string, newStart?: number) => void;

  // 轨道项裁剪
  trimItemStart: (trackId: string, itemId: string, newStart: number) => void;
  trimItemEnd: (trackId: string, itemId: string, newEnd: number) => void;
  splitItem: (trackId: string, itemId: string, splitTime: number) => [TrackItem, TrackItem] | null;

  // 选中
  selectTrack: (trackId: string | null) => void;
  selectItem: (trackId: string | null, itemId: string | null) => void;
  selectKeyframe: (keyframeId: string | null) => void;

  // 播放控制
  setCurrentTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  setPlaybackRate: (rate: number) => void;

  // 视图控制
  setScale: (scale: number) => void;
  setScrollLeft: (scrollLeft: number) => void;
  setScrollTop: (scrollTop: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitToView: (containerWidth: number) => void;

  // 碰撞检测
  checkCollision: (trackId: string, item: Partial<TrackItem>, excludeItemId?: string) => CollisionResult;
  findAvailablePosition: (trackId: string, item: Partial<TrackItem>, preferredStart: number) => number;

  // 吸附
  updateSnapPoints: () => void;
  findSnapPosition: (position: number) => number | null;
  setSnapEnabled: (enabled: boolean) => void;

  // 关键帧操作
  addKeyframe: (trackId: string, itemId: string, keyframe: TrackKeyframe) => void;
  removeKeyframe: (trackId: string, itemId: string, keyframeId: string) => void;
  updateKeyframe: (trackId: string, itemId: string, keyframeId: string, updates: Partial<TrackKeyframe>) => void;

  // 新增：增强的关键帧操作
  addKeyframeToItem: (trackId: string, itemId: string, time: number, properties?: TransformProperties) => TrackKeyframe | null;
  removeKeyframeFromItem: (trackId: string, itemId: string, keyframeId: string) => void;
  updateKeyframeInItem: (trackId: string, itemId: string, keyframeId: string, updates: Partial<TrackKeyframe>) => void;
  updateItemTransform: (trackId: string, itemId: string, property: keyof TransformProperties, value: number, autoKey?: boolean) => void;
  updateKeyframeTimeInItem: (trackId: string, itemId: string, keyframeId: string, newTime: number) => void;
  updateKeyframeEasingInItem: (trackId: string, itemId: string, keyframeId: string, easing: EasingType) => void;
  getAnimatedPropertiesAtTime: (trackId: string, itemId: string, time: number) => TransformProperties | null;

  // 撤销/重做
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  pushHistory: (action: TrackAction) => void;

  // 持久化
  loadFromProject: (data: any) => void;
  saveToProject: () => any;

  // 计算属性
  getDuration: () => number;
  getTracksSorted: () => TrackLine[];
}

// 初始状态
const initialState: TrackState = {
  config: {
    fps: DEFAULT_FPS,
    width: DEFAULT_CANVAS_WIDTH,
    height: DEFAULT_CANVAS_HEIGHT,
    duration: 0,
  },
  tracks: [],
  selectedTrackId: null,
  selectedItemId: null,
  selectedKeyframeId: null,
  currentTime: 0,
  isPlaying: false,
  playbackRate: 1,
  scale: 1,
  scrollLeft: 0,
  scrollTop: 0,
  history: [],
  historyIndex: -1,
  maxHistorySize: 50,
  snapPoints: [],
  snapEnabled: true,
  snapThreshold: 10,
};

// 创建 Store
export const useTrackStore = create<TrackState & TrackActions>((set, get) => ({
  ...initialState,

  // 初始化
  init: (config) => {
    set({
      ...initialState,
      config: {
        ...initialState.config,
        ...config,
      },
    });
  },

  reset: () => {
    set(initialState);
  },

  // 添加轨道
  addTrack: (type, name, order) => {
    const id = nanoid();
    const trackName = name || `${type === 'video' ? '视频' : type === 'audio' ? '音频' : type === 'text' ? '文本' : '图片'}轨道`;
    const trackOrder = order ?? get().tracks.length;

    const track = createTrackLine(id, type, trackName, trackOrder);

    set((state) => ({
      tracks: [...state.tracks, track],
    }));

    get().updateSnapPoints();
    return track;
  },

  // 删除轨道
  removeTrack: (trackId) => {
    set((state) => ({
      tracks: state.tracks.filter((t) => t.id !== trackId),
      selectedTrackId: state.selectedTrackId === trackId ? null : state.selectedTrackId,
      selectedItemId: state.tracks.find(t => t.id === trackId)?.items.some(i => i.id === state.selectedItemId)
        ? null : state.selectedItemId,
    }));
    get().updateSnapPoints();
  },

  // 更新轨道
  updateTrack: (trackId, updates) => {
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, ...updates } : t
      ),
    }));
  },

  // 获取轨道
  getTrack: (trackId) => {
    return get().tracks.find((t) => t.id === trackId);
  },

  // 重新排序轨道
  reorderTracks: (trackIds) => {
    set((state) => ({
      tracks: trackIds
        .map((id, index) => {
          const track = state.tracks.find((t) => t.id === id);
          return track ? { ...track, order: index } : null;
        })
        .filter(Boolean) as TrackLine[],
    }));
  },

  // 添加轨道项
  addItem: (trackId, item) => {
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId
          ? { ...t, items: [...t.items, item] }
          : t
      ),
    }));
    get().updateSnapPoints();
  },

  // 删除轨道项
  removeItem: (trackId, itemId) => {
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId
          ? { ...t, items: t.items.filter((i) => i.id !== itemId) }
          : t
      ),
      selectedItemId: state.selectedItemId === itemId ? null : state.selectedItemId,
    }));
    get().updateSnapPoints();
  },

  // 更新轨道项
  updateItem: (trackId, itemId, updates) => {
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              items: t.items.map((i) =>
                i.id === itemId ? ({ ...i, ...updates } as TrackItem) : i
              ),
            }
          : t
      ),
    }));
    get().updateSnapPoints();
  },

  // 获取轨道项
  getItem: (trackId, itemId) => {
    const track = get().getTrack(trackId);
    return track?.items.find((i) => i.id === itemId);
  },

  // 从资源创建轨道项
  addItemFromResource: (trackId, resource, startFrame) => {
    const track = get().getTrack(trackId);
    if (!track) return null;

    const { config } = get();
    const fps = config.fps;

    // 计算帧数
    let frameCount = fps * 5; // 默认 5 秒
    if (resource.duration) {
      frameCount = msToFrame(resource.duration, fps);
    }

    const endFrame = startFrame + frameCount;

    // 检查碰撞
    const collision = get().checkCollision(trackId, {
      start: startFrame,
      end: endFrame,
    } as TrackItem);

    // 如果有碰撞，找到可用位置
    const actualStart = collision.hasCollision
      ? get().findAvailablePosition(trackId, { start: startFrame, end: endFrame } as TrackItem, startFrame)
      : startFrame;
    const actualEnd = actualStart + frameCount;

    let item: TrackItem;

    switch (resource.type) {
      case 'video':
        item = createVideoTrackItem(
          nanoid(),
          resource.path,  // source: 视频文件路径
          frameCount,
          fps,
          resource.width || 1920,
          resource.height || 1080,
          actualStart
        );
        // 设置名称和封面
        (item as VideoTrackItem).name = resource.name;
        (item as VideoTrackItem).resourceId = resource.id;
        if (resource.thumbnailPath) {
          (item as VideoTrackItem).cover = resource.thumbnailPath;
        }
        break;

      case 'audio':
        item = createAudioTrackItem(
          nanoid(),
          resource.path,  // source: 音频文件路径
          resource.duration || 5000,  // 毫秒
          fps,
          actualStart
        );
        // 设置名称
        (item as AudioTrackItem).name = resource.name;
        (item as AudioTrackItem).resourceId = resource.id;
        if (resource.waveformPath) {
          (item as AudioTrackItem).waveform = resource.waveformPath;
        }
        break;

      case 'image':
        item = createImageTrackItem(
          nanoid(),
          resource.path,  // source: 图片文件路径
          resource.width || 1920,
          resource.height || 1080,
          fps,
          resource.duration || 3000,  // 毫秒
          actualStart
        );
        // 设置名称
        (item as ImageTrackItem).name = resource.name;
        (item as ImageTrackItem).resourceId = resource.id;
        break;

      default:
        return null;
    }

    get().addItem(trackId, item);
    return item;
  },

  // 移动轨道项
  moveItem: (trackId, itemId, newStart) => {
    const item = get().getItem(trackId, itemId);
    if (!item) return;

    const duration = item.end - item.start;
    const collision = get().checkCollision(trackId, { ...item, start: newStart, end: newStart + duration }, itemId);

    if (!collision.hasCollision) {
      get().updateItem(trackId, itemId, {
        start: newStart,
        end: newStart + duration,
      });
    }
  },

  // 跨轨道移动
  moveItemToTrack: (fromTrackId, toTrackId, itemId, newStart) => {
    const item = get().getItem(fromTrackId, itemId);
    if (!item) return;

    const targetStart = newStart ?? item.start;
    const duration = item.end - item.start;
    const collision = get().checkCollision(toTrackId, { ...item, start: targetStart, end: targetStart + duration });

    if (!collision.hasCollision) {
      get().removeItem(fromTrackId, itemId);
      get().addItem(toTrackId, { ...item, start: targetStart, end: targetStart + duration });
    }
  },

  // 裁剪开始（向右缩短或向左恢复）
  trimItemStart: (trackId, itemId, newStart) => {
    const item = get().getItem(trackId, itemId);
    if (!item) return;

    // 计算新的 offsetL
    const startDiff = newStart - item.start;
    const newOffsetL = item.offsetL + startDiff;

    // 边界检查：
    // 1. newOffsetL >= 0：不能向左拉超出源素材开头
    // 2. newStart < item.end：至少保留 1 帧
    // 3. 对于视频/音频：newOffsetL + offsetR < frameCount，确保不超出源素材总长度
    if (newOffsetL < 0 || newStart >= item.end) return;

    // 视频/音频额外检查：确保显示的部分不超过源素材长度
    if ((item.type === 'video' || item.type === 'audio') &&
        newOffsetL + item.offsetR >= item.frameCount) {
      return;
    }

    get().updateItem(trackId, itemId, {
      start: newStart,
      offsetL: newOffsetL,
    });
  },

  // 裁剪结束（向左缩短或向右恢复）
  trimItemEnd: (trackId, itemId, newEnd) => {
    const item = get().getItem(trackId, itemId);
    if (!item) return;

    // 基本检查：至少保留 1 帧
    if (newEnd <= item.start) return;

    // 图片类型可以无限拉长
    if (item.type === 'image') {
      const newDuration = newEnd - item.start;
      get().updateItem(trackId, itemId, {
        end: newEnd,
        frameCount: newDuration,
        offsetR: 0,
      });
      return;
    }

    // 视频/音频类型需要检查边界
    const endDiff = item.end - newEnd;
    const newOffsetR = item.offsetR + endDiff;

    // 边界检查：
    // 1. newOffsetR >= 0：不能向右拉超出源素材结尾
    // 2. offsetL + newOffsetR < frameCount：确保显示的部分不超过源素材长度
    if (newOffsetR < 0) return;
    if (item.offsetL + newOffsetR >= item.frameCount) return;

    get().updateItem(trackId, itemId, {
      end: newEnd,
      offsetR: newOffsetR,
    });
  },

  // 分割轨道项
  splitItem: (trackId, itemId, splitTime) => {
    const item = get().getItem(trackId, itemId);
    if (!item) return null;

    // 检查分割点是否在轨道项范围内
    if (splitTime <= item.start || splitTime >= item.end) return null;

    const splitFrame = splitTime - item.start;

    // 创建两个新轨道项
    const item1: TrackItem = {
      ...item,
      id: nanoid(),
      end: splitTime,
      offsetR: item.offsetR + (item.end - splitTime),
    };

    const item2: TrackItem = {
      ...item,
      id: nanoid(),
      start: splitTime,
      offsetL: item.offsetL + splitFrame,
    };

    // 删除原轨道项，添加两个新轨道项
    get().removeItem(trackId, itemId);
    get().addItem(trackId, item1);
    get().addItem(trackId, item2);

    return [item1, item2];
  },

  // 选中轨道
  selectTrack: (trackId) => {
    set({ selectedTrackId: trackId });
  },

  // 选中轨道项
  selectItem: (trackId, itemId) => {
    set({
      selectedTrackId: trackId,
      selectedItemId: itemId,
    });
  },

  // 选中关键帧
  selectKeyframe: (keyframeId) => {
    set({ selectedKeyframeId: keyframeId });
  },

  // 设置当前时间
  setCurrentTime: (time) => {
    set({ currentTime: Math.max(0, time) });
  },

  // 设置播放状态
  setPlaying: (playing) => {
    set({ isPlaying: playing });
  },

  // 设置播放速率
  setPlaybackRate: (rate) => {
    set({ playbackRate: Math.max(0.25, Math.min(4, rate)) });
  },

  // 设置缩放
  setScale: (scale) => {
    set({ scale: Math.max(0.1, Math.min(10, scale)) });
  },

  // 设置水平滚动
  setScrollLeft: (scrollLeft) => {
    set({ scrollLeft: Math.max(0, scrollLeft) });
  },

  // 设置垂直滚动
  setScrollTop: (scrollTop) => {
    set({ scrollTop: Math.max(0, scrollTop) });
  },

  // 放大
  zoomIn: () => {
    set((state) => ({ scale: Math.min(10, state.scale * 1.2) }));
  },

  // 缩小
  zoomOut: () => {
    set((state) => ({ scale: Math.max(0.1, state.scale / 1.2) }));
  },

  // 适应视图
  fitToView: (containerWidth) => {
    const duration = get().getDuration();
    if (duration > 0) {
      const newScale = containerWidth / duration;
      set({ scale: newScale, scrollLeft: 0 });
    }
  },

  // 检测碰撞
  checkCollision: (trackId, item, excludeItemId) => {
    const track = get().getTrack(trackId);
    if (!track) return { hasCollision: false, collidingItems: [] };

    const collidingItems = track.items.filter((i) => {
      if (excludeItemId && i.id === excludeItemId) return false;
      return checkItemsOverlap(item as TrackItem, i);
    });

    return {
      hasCollision: collidingItems.length > 0,
      collidingItems,
    };
  },

  // 查找可用位置
  findAvailablePosition: (trackId, item, preferredStart) => {
    const track = get().getTrack(trackId);
    if (!track) return preferredStart;

    const duration = (item.end ?? 0) - (item.start ?? 0);
    let position = preferredStart;

    // 简单策略：如果有碰撞，放到最后
    const collision = get().checkCollision(trackId, { ...item, start: position, end: position + duration });
    if (collision.hasCollision) {
      // 找到轨道上最后一个 item 的结束位置
      const maxEnd = Math.max(...track.items.map((i) => i.end), 0);
      position = maxEnd;
    }

    return position;
  },

  // 更新吸附点
  updateSnapPoints: () => {
    const { tracks, currentTime } = get();
    const points: SnapPoint[] = [];

    // 播放头
    points.push({ time: currentTime, type: 'playhead' });

    // 所有轨道项的开始和结束位置
    for (const track of tracks) {
      for (const item of track.items) {
        points.push({ time: item.start, type: 'item-start', itemId: item.id });
        points.push({ time: item.end, type: 'item-end', itemId: item.id });
      }
    }

    set({ snapPoints: points });
  },

  // 查找吸附位置
  findSnapPosition: (position) => {
    const { snapPoints, snapEnabled, snapThreshold, scale } = get();
    if (!snapEnabled) return null;

    const threshold = snapThreshold / scale;

    for (const point of snapPoints) {
      if (Math.abs(point.time - position) <= threshold) {
        return point.time;
      }
    }

    return null;
  },

  // 设置吸附启用
  setSnapEnabled: (enabled) => {
    set({ snapEnabled: enabled });
  },

  // 添加关键帧（原有方法，保留兼容性）
  addKeyframe: (trackId, itemId, keyframe) => {
    const item = get().getItem(trackId, itemId) as any;
    if (!item) return;

    const keyframes = item.keyframes || [];
    get().updateItem(trackId, itemId, {
      keyframes: [...keyframes, keyframe],
    });
  },

  // 删除关键帧（原有方法，保留兼容性）
  removeKeyframe: (trackId, itemId, keyframeId) => {
    const item = get().getItem(trackId, itemId) as any;
    if (!item?.keyframes) return;

    get().updateItem(trackId, itemId, {
      keyframes: item.keyframes.filter((k: TrackKeyframe) => k.id !== keyframeId),
    });

    // 如果删除的是选中的关键帧，清除选中状态
    if (get().selectedKeyframeId === keyframeId) {
      set({ selectedKeyframeId: null });
    }
  },

  // 更新关键帧（原有方法，保留兼容性）
  updateKeyframe: (trackId, itemId, keyframeId, updates) => {
    const item = get().getItem(trackId, itemId) as any;
    if (!item?.keyframes) return;

    get().updateItem(trackId, itemId, {
      keyframes: item.keyframes.map((k: TrackKeyframe) =>
        k.id === keyframeId ? { ...k, ...updates } : k
      ),
    });
  },

  // 新增：在指定时间添加关键帧
  addKeyframeToItem: (trackId, itemId, time, properties) => {
    const item = get().getItem(trackId, itemId) as any;
    if (!item) return null;

    // 获取默认属性或使用传入的属性
    const defaults: TransformProperties = {
      x: item.x ?? 0,
      y: item.y ?? 0,
      scale: item.scale ?? 1,
      rotation: item.rotation ?? 0,
      opacity: item.opacity ?? 1,
    };

    const props = properties || getAnimatedProperties(item.keyframes, time, defaults);
    const newKeyframes = addKf(item.keyframes, time, props);

    get().updateItem(trackId, itemId, { keyframes: newKeyframes });

    // 返回新添加的关键帧
    return newKeyframes.find(kf => kf.time === time) || null;
  },

  // 新增：删除关键帧
  removeKeyframeFromItem: (trackId, itemId, keyframeId) => {
    const item = get().getItem(trackId, itemId) as any;
    if (!item?.keyframes) return;

    const newKeyframes = removeKf(item.keyframes, keyframeId);
    get().updateItem(trackId, itemId, { keyframes: newKeyframes });

    if (get().selectedKeyframeId === keyframeId) {
      set({ selectedKeyframeId: null });
    }
  },

  // 新增：更新关键帧属性
  updateKeyframeInItem: (trackId, itemId, keyframeId, updates) => {
    const item = get().getItem(trackId, itemId) as any;
    if (!item?.keyframes) return;

    const newKeyframes = updateKeyframeProperties(
      item.keyframes,
      keyframeId,
      updates as Partial<TransformProperties>
    );
    get().updateItem(trackId, itemId, { keyframes: newKeyframes });
  },

  // 新增：更新轨道项变换属性（支持自动打帧）
  updateItemTransform: (trackId, itemId, property, value, autoKey = false) => {
    const item = get().getItem(trackId, itemId) as any;
    if (!item) return;

    // 更新基础属性
    get().updateItem(trackId, itemId, { [property]: value });

    // 如果启用自动打帧且已有关键帧
    if (autoKey && item.keyframes && item.keyframes.length > 0) {
      const currentTime = get().currentTime;
      const localTime = currentTime - item.start;

      // 只在片段范围内自动打帧
      if (localTime >= 0 && localTime <= item.end - item.start) {
        const defaults: TransformProperties = {
          x: item.x ?? 0,
          y: item.y ?? 0,
          scale: item.scale ?? 1,
          rotation: item.rotation ?? 0,
          opacity: item.opacity ?? 1,
        };

        const newKeyframes = autoKeyframe(item.keyframes, localTime, property, value, defaults);
        get().updateItem(trackId, itemId, { keyframes: newKeyframes });
      }
    }
  },

  // 新增：更新关键帧时间
  updateKeyframeTimeInItem: (trackId, itemId, keyframeId, newTime) => {
    const item = get().getItem(trackId, itemId) as any;
    if (!item?.keyframes) return;

    // 边界检测
    const clampedTime = Math.max(0, Math.min(item.end - item.start, newTime));
    const newKeyframes = updateKeyframeTime(item.keyframes, keyframeId, clampedTime);
    get().updateItem(trackId, itemId, { keyframes: newKeyframes });
  },

  // 新增：更新关键帧缓动
  updateKeyframeEasingInItem: (trackId, itemId, keyframeId, easing) => {
    const item = get().getItem(trackId, itemId) as any;
    if (!item?.keyframes) return;

    const newKeyframes = updateKeyframeEasing(item.keyframes, keyframeId, easing);
    get().updateItem(trackId, itemId, { keyframes: newKeyframes });
  },

  // 新增：获取指定时间的动画属性
  getAnimatedPropertiesAtTime: (trackId, itemId, time) => {
    const item = get().getItem(trackId, itemId) as any;
    if (!item) return null;

    const localTime = time - item.start;
    const defaults: TransformProperties = {
      x: item.x ?? 0,
      y: item.y ?? 0,
      scale: item.scale ?? 1,
      rotation: item.rotation ?? 0,
      opacity: item.opacity ?? 1,
    };

    return getAnimatedProperties(item.keyframes, localTime, defaults);
  },

  // 撤销
  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < 0) return;

    const action = history[historyIndex];
    action.undo();
    set({ historyIndex: historyIndex - 1 });
  },

  // 重做
  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;

    // 重做需要重新执行操作，这里简化处理
    set({ historyIndex: historyIndex + 1 });
  },

  // 是否可以撤销
  canUndo: () => {
    return get().historyIndex >= 0;
  },

  // 是否可以重做
  canRedo: () => {
    const { history, historyIndex } = get();
    return historyIndex < history.length - 1;
  },

  // 添加历史记录
  pushHistory: (action) => {
    set((state) => {
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push(action);

      // 限制历史记录大小
      if (newHistory.length > state.maxHistorySize) {
        newHistory.shift();
      }

      return {
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    });
  },

  // 从项目加载
  loadFromProject: (data) => {
    if (!data) return;

    set({
      config: data.config || initialState.config,
      tracks: data.tracks || [],
    });
    get().updateSnapPoints();
  },

  // 保存到项目
  saveToProject: () => {
    const { config, tracks } = get();
    return { config, tracks };
  },

  // 获取总时长
  getDuration: () => {
    const { tracks } = get();
    let maxEnd = 0;
    for (const track of tracks) {
      for (const item of track.items) {
        if (item.end > maxEnd) {
          maxEnd = item.end;
        }
      }
    }
    return maxEnd;
  },

  // 获取排序后的轨道
  getTracksSorted: () => {
    return [...get().tracks].sort((a, b) => b.order - a.order);
  },
}));

// 导出单例访问
export const trackStore = {
  getState: () => useTrackStore.getState(),
  subscribe: useTrackStore.subscribe,
};

export default useTrackStore;
