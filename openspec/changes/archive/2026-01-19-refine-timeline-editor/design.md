# Design: refine-timeline-editor

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VideoEditor 主容器                            │
│  ┌───────────────┬─────────────────────────┬───────────────────┐   │
│  │   Sidebar     │       Player            │ PropertiesPanel   │   │
│  │   (素材库)    │    (Canvas 预览)        │    (属性面板)     │   │
│  └───────────────┴─────────────────────────┴───────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    EnhancedTimeline                          │   │
│  │  ┌─────────────────────────────────────────────────────────┐│   │
│  │  │ TimelineRuler + KeyframeRow（关键帧可视化）             ││   │
│  │  ├─────────────────────────────────────────────────────────┤│   │
│  │  │ TrackRow (片段 + 关键帧菱形标记)                        ││   │
│  │  └─────────────────────────────────────────────────────────┘│   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## 核心数据结构

### 1. 重构后的关键帧结构

采用 electron-egg 的完整属性快照模式，替代现有的按属性分离模式：

```typescript
// 新的关键帧结构（完整属性快照）
interface Keyframe {
  id: string;
  time: number;           // 相对于片段起点的时间（帧）
  // 完整属性快照
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  // 缓动（应用于到下一个关键帧的过渡）
  easing: EasingType;
}

// 缓动类型
enum EasingType {
  LINEAR = 'linear',
  EASE_IN = 'ease-in',
  EASE_OUT = 'ease-out',
  EASE_IN_OUT = 'ease-in-out',
  EASE_IN_CUBIC = 'ease-in-cubic',
  EASE_OUT_CUBIC = 'ease-out-cubic',
  EASE_IN_OUT_CUBIC = 'ease-in-out-cubic',
}
```

### 2. 轨道项更新

```typescript
interface VideoTrackItem extends BaseTrackItem {
  type: 'video';
  source: string;
  cover?: string;
  fps: number;
  width: number;
  height: number;
  // 默认属性（无关键帧时使用）
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  // 关键帧列表
  keyframes: Keyframe[];
}
```

## 模块设计

### 1. 关键帧引擎 (engine/keyframe.ts)

```typescript
// 核心函数

/**
 * 获取指定时间点的动画属性值
 * @param keyframes 关键帧列表
 * @param time 当前时间（帧）
 * @param defaults 默认属性值
 * @returns 插值后的属性值
 */
function getAnimatedProperties(
  keyframes: Keyframe[],
  time: number,
  defaults: TransformProperties
): TransformProperties;

/**
 * 自动打帧：修改属性时自动创建或更新关键帧
 * @param keyframes 现有关键帧列表
 * @param time 当前时间
 * @param property 修改的属性名
 * @param value 新值
 * @returns 更新后的关键帧列表
 */
function autoKeyframe(
  keyframes: Keyframe[],
  time: number,
  property: keyof TransformProperties,
  value: number
): Keyframe[];

/**
 * 添加关键帧
 */
function addKeyframe(
  keyframes: Keyframe[],
  time: number,
  properties: TransformProperties,
  easing?: EasingType
): Keyframe[];

/**
 * 删除关键帧
 */
function removeKeyframe(keyframes: Keyframe[], keyframeId: string): Keyframe[];

/**
 * 更新关键帧缓动
 */
function updateKeyframeEasing(
  keyframes: Keyframe[],
  keyframeId: string,
  easing: EasingType
): Keyframe[];

// 缓动函数库
const easingFunctions: Record<EasingType, (t: number) => number> = {
  [EasingType.LINEAR]: (t) => t,
  [EasingType.EASE_IN]: (t) => t * t,
  [EasingType.EASE_OUT]: (t) => t * (2 - t),
  [EasingType.EASE_IN_OUT]: (t) => t < 0.5 ? 2*t*t : -1 + (4-2*t)*t,
  [EasingType.EASE_IN_CUBIC]: (t) => t*t*t,
  [EasingType.EASE_OUT_CUBIC]: (t) => (--t)*t*t + 1,
  [EasingType.EASE_IN_OUT_CUBIC]: (t) => t < 0.5 ? 4*t*t*t : (t-1)*(2*t-2)*(2*t-2)+1,
};
```

### 2. 属性面板 (components/editor/PropertiesPanel.tsx)

```typescript
interface PropertiesPanelProps {
  selectedItem: TrackItem | null;
  currentTime: number;
  onPropertyChange: (property: string, value: number) => void;
  onAddKeyframe: () => void;
  onRemoveKeyframe: (keyframeId: string) => void;
  onEasingChange: (keyframeId: string, easing: EasingType) => void;
}

// 属性配置
const TRANSFORM_PROPERTIES = [
  { key: 'x', label: '位置 X', min: -1000, max: 1000, step: 1 },
  { key: 'y', label: '位置 Y', min: -1000, max: 1000, step: 1 },
  { key: 'scale', label: '缩放', min: 0.1, max: 3, step: 0.01 },
  { key: 'rotation', label: '旋转', min: -180, max: 180, step: 1 },
  { key: 'opacity', label: '不透明度', min: 0, max: 1, step: 0.01 },
];
```

### 3. 关键帧可视化 (components/editor/Timeline/KeyframeMarker.tsx)

```typescript
interface KeyframeMarkerProps {
  keyframe: Keyframe;
  scale: number;           // 像素/帧
  itemStart: number;       // 片段起始帧
  selected: boolean;
  onSelect: () => void;
  onDrag: (newTime: number) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

// 渲染菱形标记，支持：
// - 点击选中
// - 拖拽调整时间
// - 右键菜单（删除、复制、设置缓动）
```

### 4. 拖拽交互优化

```typescript
// 拖拽状态增强
interface DragState {
  type: 'move' | 'trim-start' | 'trim-end' | 'keyframe';
  itemId: string;
  keyframeId?: string;     // 关键帧拖拽时使用
  startX: number;
  startY: number;
  isDragging: boolean;     // 是否超过拖拽阈值
  previewPosition?: number; // 预览位置
}

// 拖拽阈值
const DRAG_THRESHOLD = 5; // px

// 检测是否应该开始拖拽
function shouldStartDrag(startX: number, startY: number, currentX: number, currentY: number): boolean {
  const distance = Math.sqrt(
    Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2)
  );
  return distance >= DRAG_THRESHOLD;
}
```

### 5. VideoRenderer 更新

```typescript
// 渲染时集成关键帧插值
renderClip(clip: Clip, currentTime: number) {
  const clipLocalTime = currentTime - clip.start;

  // 获取当前时间的动画属性
  const props = getAnimatedProperties(
    clip.keyframes || [],
    clipLocalTime,
    { x: clip.x, y: clip.y, scale: clip.scale, rotation: clip.rotation, opacity: clip.opacity }
  );

  // 应用变换
  const centerX = this.width / 2 + props.x;
  const centerY = this.height / 2 + props.y;

  this.ctx.save();
  this.ctx.translate(centerX, centerY);
  this.ctx.rotate((props.rotation * Math.PI) / 180);
  this.ctx.scale(props.scale, props.scale);
  this.ctx.globalAlpha = props.opacity;

  // 绘制内容
  this.drawMedia(clip, clipLocalTime);

  this.ctx.restore();
}
```

## 文件结构变更

```
frontend/src/
├── engine/
│   ├── keyframe.ts           # 重写：完整属性快照模式
│   ├── VideoRenderer.ts      # 修改：集成关键帧插值
│   └── ...
├── components/editor/
│   ├── PropertiesPanel/      # 新增
│   │   ├── index.tsx
│   │   ├── PropertyRow.tsx   # 单个属性行
│   │   ├── EasingPicker.tsx  # 缓动选择器
│   │   └── styles.css
│   ├── Timeline/
│   │   ├── KeyframeMarker.tsx    # 新增：关键帧菱形标记
│   │   ├── KeyframeContextMenu.tsx # 新增：右键菜单
│   │   ├── ClipItem.tsx          # 修改：添加关键帧显示
│   │   ├── EnhancedTimeline.tsx  # 修改：关键帧拖拽
│   │   └── ...
│   └── VideoEditor.tsx       # 修改：集成属性面板
├── store/
│   └── trackStore.ts         # 修改：关键帧 CRUD
└── types/
    └── track.ts              # 修改：关键帧数据结构
```

## 交互流程

### 1. 添加关键帧

```
用户选中片段 → 移动播放头到目标位置 → 点击属性面板的关键帧按钮
                                     ↓
                      在当前时间创建关键帧（记录当前属性快照）
                                     ↓
                      时间线上显示菱形标记
```

### 2. 自动打帧

```
用户选中有关键帧的片段 → 修改某个属性值（如 scale）
                       ↓
        检测当前时间是否已有关键帧
                       ↓
      有 → 更新该关键帧的属性值
      无 → 创建新关键帧（保持其他属性的插值）
```

### 3. 关键帧拖拽

```
用户点击关键帧菱形 → 按住拖拽 → 超过阈值后开始拖拽
                              ↓
              实时更新关键帧时间 + 显示时间提示
                              ↓
                   释放 → 确认新位置
```

## 性能优化

### 1. 拖拽性能优化

参考 electron-egg 的实现，拖拽需要达到流畅的 60fps 体验：

```typescript
// 拖拽状态管理（参考 electron-egg Timeline.tsx）
interface DragState {
  clipId: string;
  clip: Clip;
  startX: number;
  startY: number;
  originalStart: number;
  originalTrackId: string;
  currentX: number;
  currentY: number;
  isDragging: boolean;      // 是否超过阈值开始真正拖拽
  currentTrackId: string | null;  // 实时检测所在轨道
}

// 核心优化点：
// 1. 使用 data-track-id 属性进行轨道检测，避免复杂的坐标计算
// 2. 使用 document.elementsFromPoint() 快速定位鼠标下的元素
// 3. 拖拽阈值检测避免误触

const handleMouseMove = (e: MouseEvent) => {
  const deltaX = e.clientX - dragState.startX;
  const deltaY = e.clientY - dragState.startY;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  // 阈值检测
  const shouldDrag = distance >= DRAG_THRESHOLD;

  // 使用 elementsFromPoint 快速检测轨道
  const elements = document.elementsFromPoint(e.clientX, e.clientY);
  let foundTrackId: string | null = null;

  for (const el of elements) {
    if (el instanceof HTMLElement && el.dataset.trackId) {
      foundTrackId = el.dataset.trackId;
      break;
    }
  }

  // 实时更新位置预览
  if (shouldDrag && foundTrackId) {
    const deltaSeconds = deltaX / PIXELS_PER_SECOND;
    const newStart = Math.max(0, dragState.originalStart + deltaSeconds);
    onMoveClip(dragState.clipId, newStart, foundTrackId);
  }
};
```

### 2. React 渲染优化

```typescript
// ClipItem 使用 memo + 精细化 props 比较
export const ClipItem = memo(function ClipItem(props: ClipItemProps) {
  // ...
}, (prevProps, nextProps) => {
  // 只比较影响渲染的关键属性
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.start === nextProps.item.start &&
    prevProps.item.end === nextProps.item.end &&
    prevProps.selected === nextProps.selected &&
    prevProps.scale === nextProps.scale
  );
});

// TrackRow 使用 memo
export const TrackRow = memo(function TrackRow(props: TrackRowProps) {
  // ...
});

// KeyframeMarker 使用 memo
export const KeyframeMarker = memo(function KeyframeMarker(props: KeyframeMarkerProps) {
  // ...
});
```

### 3. RAF 节流策略

```typescript
// 拖拽更新使用 RAF 节流，避免过度渲染
let rafId: number | null = null;
let latestMouseEvent: MouseEvent | null = null;

const handleMouseMove = (e: MouseEvent) => {
  latestMouseEvent = e;

  if (rafId === null) {
    rafId = requestAnimationFrame(() => {
      if (latestMouseEvent) {
        performDrag(latestMouseEvent);
      }
      rafId = null;
    });
  }
};

const cleanup = () => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
};
```

### 4. 状态更新批处理

```typescript
// 使用 unstable_batchedUpdates 批量更新
import { unstable_batchedUpdates } from 'react-dom';

const handleDragEnd = () => {
  unstable_batchedUpdates(() => {
    setDragState(null);
    setHighlightedTrackId(null);
    setHighlightedGap(null);
  });
};
```

### 5. 轨道高亮优化

```typescript
// 使用 CSS 类切换而非 inline style，利用 GPU 加速
<div
  data-track-id={track.id}
  className={`trackRow ${
    highlightedTrackId === track.id ? 'highlighted' : ''
  }`}
>

// CSS
.trackRow {
  transition: background-color 0.1s ease;
  will-change: background-color;
}

.trackRow.highlighted {
  background-color: rgba(34, 211, 238, 0.2);
  box-shadow: inset 0 0 0 1px rgba(34, 211, 238, 0.5);
}
```

### 6. 关键帧缓存

```typescript
// 缓存已排序的关键帧，避免重复排序
const sortedKeyframesCache = new WeakMap<Keyframe[], Keyframe[]>();

function getSortedKeyframes(keyframes: Keyframe[]): Keyframe[] {
  let sorted = sortedKeyframesCache.get(keyframes);
  if (!sorted) {
    sorted = [...keyframes].sort((a, b) => a.time - b.time);
    sortedKeyframesCache.set(keyframes, sorted);
  }
  return sorted;
}
```

### 7. Canvas 复用

```typescript
// 避免频繁创建/销毁 Canvas 上下文
class VideoRenderer {
  private ctx: CanvasRenderingContext2D;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    // 使用 OffscreenCanvas 进行复杂合成
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d')!;
  }
}

## 兼容性处理

### 数据迁移

```typescript
// 将旧格式关键帧转换为新格式
function migrateKeyframes(oldKeyframes: OldKeyframe[]): Keyframe[] {
  // 按时间分组
  const grouped = groupBy(oldKeyframes, 'time');

  // 合���为完整属性快照
  return Object.entries(grouped).map(([time, kfs]) => ({
    id: nanoid(),
    time: Number(time),
    x: kfs.find(k => k.property === 'x')?.value ?? 0,
    y: kfs.find(k => k.property === 'y')?.value ?? 0,
    scale: kfs.find(k => k.property === 'scale')?.value ?? 1,
    rotation: kfs.find(k => k.property === 'rotation')?.value ?? 0,
    opacity: kfs.find(k => k.property === 'opacity')?.value ?? 1,
    easing: kfs[0]?.easing ?? EasingType.LINEAR,
  }));
}
```
