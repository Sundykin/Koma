# Design: optimize-timeline-performance

## 1. 问题根因分析

### 1.1 electron-egg vs Koma 架构对比

```
┌─────────────────────────────────────────────────────────────────────┐
│                     electron-egg 架构                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  App.tsx (集中状态)                                                  │
│    ├── tracks: Track[]        ← 单一数据源                          │
│    ├── currentTime: number    ← 顶层时间状态                         │
│    └── selectedClipId         ← 顶层选中状态                         │
│                                                                     │
│  MediaEngine (单例)            ← 高精度时间引擎                       │
│    ├── performance.now()      ← 微秒级时间戳                         │
│    ├── delta 时间计算          ← 避免时间漂移                         │
│    └── 事件系统                ← 观察者模式解耦                        │
│                                                                     │
│  Timeline.tsx (DOM 渲染)                                             │
│    ├── 拖拽阈值: 5px          ← 避免误触发                           │
│    ├── elementsFromPoint      ← O(n) DOM 查询                       │
│    └── data-* 属性            ← 无需 CSS 选择器                       │
│                                                                     │
│  VideoRenderer (Canvas)                                              │
│    ├── getVisibleClips()      ← 可见性剪裁                           │
│    ├── save/restore           ← 状态栈管理                           │
│    └── 媒体缓存 Map           ← 避免重复加载                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       Koma 当前架构                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  trackStore (Zustand)         ← 分离状态管理                         │
│    ├── tracks, currentTime    ← 每次更新创建新对象                    │
│    └── 选择器未优化            ← 可能触发不必要重渲染                   │
│                                                                     │
│  PlaybackEngine               ← 简单 RAF 循环                        │
│    ├── getDuration() O(n×m)   ← 每帧遍历                             │
│    └── 无容差同步              ← 频繁 seek                            │
│                                                                     │
│  EnhancedTimeline.tsx                                               │
│    ├── updateSnapPoints       ← 依赖 tracks/currentTime              │
│    ├── useEffect 重复绑定     ← 事件监听泄漏                          │
│    └── 无拖拽阈值              ← 点击即触发拖拽                        │
│                                                                     │
│  ClipItem (memo 失效)                                               │
│    ├── 回调每次重建            ← memo 无效                            │
│    └── 无预览缓存              ← 频繁加载                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 关键代码对比

#### 拖拽阈值检测

**electron-egg (正确)**:
```typescript
const DRAG_THRESHOLD = 5;

const handleMouseMove = (e: MouseEvent) => {
  const distance = Math.sqrt(
    Math.pow(e.clientX - dragState.startX, 2) +
    Math.pow(e.clientY - dragState.startY, 2)
  );

  // 只有超过阈值才真正开始拖拽
  const shouldDrag = distance >= DRAG_THRESHOLD;

  if (shouldDrag && !dragState.isDragging) {
    setDragState(prev => ({ ...prev, isDragging: true }));
  }

  if (shouldDrag) {
    // 执行拖拽逻辑
  }
};
```

**Koma 当前 (问题)**:
```typescript
// EnhancedTimeline.tsx - 无阈值检测
const handleMouseMove = (e: MouseEvent) => {
  // 任何移动都会触发拖拽逻辑
  if (isDragging) {
    // ... 立即执行拖拽
  }
};
```

#### 事件监听器管理

**electron-egg (正确)**:
```typescript
// 单次绑定，正确清理
useEffect(() => {
  const handleMouseMove = (e: MouseEvent) => { ... };
  const handleMouseUp = () => { ... };

  if (dragState) {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  return () => {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  };
}, [dragState?.clipId]); // 只在 clipId 变化时重绑定
```

**Koma 当前 (问题)**:
```typescript
// EnhancedTimeline.tsx 第365-448行
useEffect(() => {
  // ...
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);

  return () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };
}, [isDragging, dragState]); // 依赖整个 dragState 对象！
```

#### getDuration 缓存

**electron-egg (正确)**:
```typescript
// 只在 tracks 变化时计算
const duration = useMemo(() => {
  let max = 0;
  tracks.forEach(track => {
    track.clips.forEach(clip => {
      const end = clip.start + clip.duration;
      if (end > max) max = end;
    });
  });
  return max;
}, [tracks]);
```

**Koma 当前 (问题)**:
```typescript
// PlaybackEngine.ts 第254-264行
getDuration(): number {
  let maxEnd = 0;
  for (const track of this.tracks) {
    for (const item of track.items) {
      if (item.end > maxEnd) {
        maxEnd = item.end;
      }
    }
  }
  return maxEnd; // 每帧都遍历！
}
```

## 2. 优化方案设计

### 2.1 拖拽系统重构

```typescript
// 新的 DragState 设计
interface DragState {
  // 初始状态
  clipId: string;
  trackId: string;
  startX: number;
  startY: number;
  originalStart: number;

  // 运行时状态
  currentX: number;
  currentY: number;
  isDragging: boolean;      // 超过阈值才为 true
  currentTrackId: string | null;

  // 缓存数据
  clip: TrackItem;          // 避免重复查找
}

// 拖拽处理流程
const DRAG_THRESHOLD = 5;

const handleMouseDown = (e: React.MouseEvent, item: TrackItem, trackId: string) => {
  e.stopPropagation();

  setDragState({
    clipId: item.id,
    trackId,
    startX: e.clientX,
    startY: e.clientY,
    originalStart: item.start,
    currentX: e.clientX,
    currentY: e.clientY,
    isDragging: false,  // 初始为 false
    currentTrackId: trackId,
    clip: item,
  });
};

// 单独的 effect 处理全局鼠标事件
useEffect(() => {
  if (!dragState) return;

  let rafId: number | null = null;
  let latestEvent: MouseEvent | null = null;

  const performDrag = () => {
    if (!latestEvent || !dragState) return;
    rafId = null;

    const e = latestEvent;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (!dragState.isDragging && distance >= DRAG_THRESHOLD) {
      setDragState(prev => prev ? { ...prev, isDragging: true } : null);
    }

    if (dragState.isDragging) {
      // 使用 elementsFromPoint 检测目标轨道
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      let targetTrackId: string | null = null;

      for (const el of elements) {
        if (el instanceof HTMLElement && el.dataset.trackId) {
          targetTrackId = el.dataset.trackId;
          break;
        }
      }

      // 计算新位置
      const deltaFrames = Math.round(dx / scale);
      const newStart = Math.max(0, dragState.originalStart + deltaFrames);

      // 更新状态（批量更新）
      setDragState(prev => prev ? {
        ...prev,
        currentX: e.clientX,
        currentY: e.clientY,
        currentTrackId: targetTrackId,
      } : null);

      // 实时更新片段位置（可选，取决于性能需求）
      if (targetTrackId) {
        updateItemPosition(dragState.trackId, dragState.clipId, newStart, targetTrackId);
      }
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    latestEvent = e;
    if (rafId === null) {
      rafId = requestAnimationFrame(performDrag);
    }
  };

  const handleMouseUp = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    setDragState(null);
  };

  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);

  return () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  };
}, [dragState?.clipId]); // 只依赖 clipId，不依赖整个对象
```

### 2.2 组件渲染优化

```typescript
// ClipItem.tsx - 改进的 memo 比较
const ClipItem = memo(function ClipItem(props: ClipItemProps) {
  // ...
}, (prevProps, nextProps) => {
  // 比较所有影响渲染的属性
  if (prevProps.item !== nextProps.item) return false;
  if (prevProps.scale !== nextProps.scale) return false;
  if (prevProps.selected !== nextProps.selected) return false;
  if (prevProps.selectedKeyframeId !== nextProps.selectedKeyframeId) return false;

  // 关键帧数组浅比较
  const prevKf = prevProps.item.keyframes;
  const nextKf = nextProps.item.keyframes;
  if (prevKf?.length !== nextKf?.length) return false;

  // 回调函数不比较（假设稳定）
  return true;
});

// 父组件使用 useCallback 稳定回调
const handleItemSelect = useCallback((itemId: string) => {
  setSelectedItemId(itemId);
}, []);

const handleItemDragStart = useCallback((
  trackId: string,
  itemId: string,
  type: DragType,
  e: React.MouseEvent
) => {
  // 使用 ref 获取最新状态，避免依赖
  const item = tracksRef.current
    .find(t => t.id === trackId)
    ?.items.find(i => i.id === itemId);

  if (item) {
    startDrag(item, trackId, type, e);
  }
}, []); // 空依赖，永不重建
```

### 2.3 播放引擎优化

```typescript
// PlaybackEngine.ts - 缓存优化
class PlaybackEngine {
  private _cachedDuration: number | null = null;
  private _durationDirty: boolean = true;

  setTracks(tracks: TrackLine[]) {
    this.tracks = tracks;
    this._durationDirty = true; // 标记需要重算
  }

  getDuration(): number {
    if (!this._durationDirty && this._cachedDuration !== null) {
      return this._cachedDuration;
    }

    let maxEnd = 0;
    for (const track of this.tracks) {
      for (const item of track.items) {
        if (item.end > maxEnd) {
          maxEnd = item.end;
        }
      }
    }

    this._cachedDuration = maxEnd;
    this._durationDirty = false;
    return maxEnd;
  }

  // 添加/删除/移动 item 时调用
  invalidateDuration() {
    this._durationDirty = true;
  }
}
```

### 2.4 MediaEngine 设计（参考 electron-egg）

```typescript
// engine/MediaEngine.ts - 新设计
export type EngineEventType =
  | 'play'
  | 'pause'
  | 'seek'
  | 'timeUpdate'
  | 'ended'
  | 'rateChange';

export class MediaEngine {
  private _time: number = 0;
  private _duration: number = 60;
  private _playRate: number = 1;
  private _isPlaying: boolean = false;
  private _animationFrameId: number | null = null;
  private _lastFrameTime: number = 0;
  private _listeners: Map<EngineEventType, Set<Function>> = new Map();

  get time() { return this._time; }
  get duration() { return this._duration; }
  get isPlaying() { return this._isPlaying; }
  get playRate() { return this._playRate; }

  play(): boolean {
    if (this._isPlaying) return false;
    if (this._time >= this._duration) {
      this._time = 0;
    }

    this._isPlaying = true;
    this._lastFrameTime = performance.now();
    this._tick();
    this.emit('play');
    return true;
  }

  pause(): boolean {
    if (!this._isPlaying) return false;
    this._isPlaying = false;

    if (this._animationFrameId !== null) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }

    this.emit('pause');
    return true;
  }

  seek(time: number): void {
    const clampedTime = Math.max(0, Math.min(time, this._duration));

    // 容差检测：小于 0.05s 的差异不触发 seek
    if (Math.abs(this._time - clampedTime) < 0.05) {
      return;
    }

    this._time = clampedTime;
    this.emit('seek');
    this.emit('timeUpdate');
  }

  private _tick = (): void => {
    if (!this._isPlaying) return;

    const now = performance.now();
    const delta = (now - this._lastFrameTime) / 1000; // 转为秒
    this._lastFrameTime = now;

    this._time += delta * this._playRate;

    if (this._time >= this._duration) {
      this._time = this._duration;
      this.pause();
      this.emit('ended');
      return;
    }

    this.emit('timeUpdate');
    this._animationFrameId = requestAnimationFrame(this._tick);
  };

  on(event: EngineEventType, callback: Function): void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(callback);
  }

  off(event: EngineEventType, callback: Function): void {
    this._listeners.get(event)?.delete(callback);
  }

  private emit(event: EngineEventType): void {
    this._listeners.get(event)?.forEach(cb => cb());
  }
}

// 单例
let engineInstance: MediaEngine | null = null;
export const getMediaEngine = (duration?: number): MediaEngine => {
  if (!engineInstance) {
    engineInstance = new MediaEngine();
    if (duration) engineInstance.setDuration(duration);
  }
  return engineInstance;
};
```

### 2.5 轨道高亮与间隙拖放

```typescript
// TrackRow.tsx - 添加高亮支持
interface TrackRowProps {
  // ...
  isDropTarget?: boolean;  // 是否为拖放目标
}

export const TrackRow = memo(function TrackRow({
  track,
  isDropTarget,
  // ...
}: TrackRowProps) {
  return (
    <div
      className={`trackRow ${isDropTarget ? 'dropTarget' : ''}`}
      data-track-id={track.id}
      // ...
    >
      {/* ... */}
    </div>
  );
});

// CSS
.trackRow.dropTarget {
  background: rgba(6, 182, 212, 0.1);
  box-shadow: inset 0 0 0 2px rgba(6, 182, 212, 0.5);
}
```

## 3. 实施顺序

```
阶段 1: 拖拽优化 (3-4小时)
  ├── 1.1 添加拖拽阈值检测
  ├── 1.2 修复事件监听器绑定
  ├── 1.3 修复 updateSnapPoints 依赖
  └── 1.4 添加 RAF 节流

阶段 2: 组件优化 (2-3小时)
  ├── 2.1 修复 ClipItem memo
  ├── 2.2 优化 TrackRow memo
  └── 2.3 缓存回调函数

阶段 3: 播放引擎 (3-4小时)
  ├── 3.1 添加 getDuration 缓存
  ├── 3.2 实现 MediaEngine
  ├── 3.3 添加时间同步容差
  └── 3.4 集成到 Player

阶段 4: 媒体加载 (2小时)
  ├── 4.1 FilmstripRenderer 缓存
  └── 4.2 WaveformRenderer 优化

阶段 5: 功能补全 (2小时)
  ├── 5.1 elementsFromPoint 查询
  ├── 5.2 轨道高亮反馈
  └── 5.3 间隙拖放（可选）
```

## 4. 验证方案

### 4.1 性能测试

```typescript
// 性能测试用例
describe('Timeline Performance', () => {
  it('should maintain 60fps during drag', async () => {
    // 创建 50 个片段
    // 模拟拖拽操作
    // 测量帧时间
    expect(avgFrameTime).toBeLessThan(16.67); // 60fps
  });

  it('should not leak memory during playback', async () => {
    const initialMemory = performance.memory.usedJSHeapSize;
    // 播放 10 秒
    const finalMemory = performance.memory.usedJSHeapSize;
    expect(finalMemory - initialMemory).toBeLessThan(10 * 1024 * 1024); // 10MB
  });
});
```

### 4.2 人工验证

- [ ] 拖拽 100 个片段无卡顿
- [ ] 播放时 CPU 占用 < 30%
- [ ] 快速缩放时间线无闪烁
- [ ] 关键帧拖拽流畅
- [ ] 跨轨道拖拽有正确高亮
