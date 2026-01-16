# Design: enhance-video-editor

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        React UI Layer                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ Sidebar  │ │  Player  │ │ Timeline │ │ PropertiesPanel   │  │
│  │(资源库)  │ │ (预览)   │ │ (轨道)   │ │ (属性)            │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────────┬─────────┘  │
└───────┼────────────┼────────────┼─────────────────┼────────────┘
        │            │            │                 │
┌───────┴────────────┴────────────┴─────────────────┴────────────┐
│                      State Management                           │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ trackState  │ │ playerState  │ │ resourceState            │ │
│  │ (轨道数据)  │ │ (播放状态)   │ │ (资源管理)               │ │
│  └──────┬──────┘ └──────┬───────┘ └────────────┬─────────────┘ │
└─────────┼───────────────┼──────────────────────┼───────────────┘
          │               │                      │
┌─────────┴───────────────┴──────────────────────┴───────────────┐
│                      Engine Layer                               │
│  ┌──────────────┐ ┌───────────────┐ ┌────────────────────────┐ │
│  │ MediaEngine  │ │ VideoRenderer │ │ AudioController        │ │
│  │ (播放控制)   │ │ (Canvas渲染) │ │ (音频同步)             │ │
│  └──────────────┘ └───────────────┘ └────────────────────────┘ │
│  ┌──────────────┐ ┌───────────────┐                            │
│  │ KeyframeEngine│ │ SnapEngine   │                            │
│  │ (关键帧插值) │ │ (吸附计算)   │                            │
│  └──────────────┘ └───────────────┘                            │
└────────────────────────────┬───────────────────────────────────┘
                             │ IPC
┌────────────────────────────┴───────────────────────────────────┐
│                   Electron Main Process                         │
│  ┌──────────────────┐ ┌─────────────────┐ ┌──────────────────┐ │
│  │ FFmpegService    │ │ FileService     │ │ ExportService    │ │
│  │ - 抽帧           │ │ - 文件读写     │ │ - 渲染导出       │ │
│  │ - 波形生成       │ │ - 目录管理     │ │ - 进度回调       │ │
│  │ - 音视频分离     │ │ - 临时文件     │ │ - 格式转换       │ │
│  │ - 格式转换       │ │                 │ │                  │ │
│  └──────────────────┘ └─────────────────┘ └──────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

## 核心数据结构

### 轨道数据模型 (融合两项目优点)

```typescript
// 基础轨道项目 (from CcClip)
interface BaseTrackItem {
  id: string;
  type: TrackType;
  name: string;
  start: number;          // 开始帧
  end: number;            // 结束帧
  frameCount: number;     // 总帧数
  offsetL: number;        // 左侧裁切（帧数）- 非破坏性
  offsetR: number;        // 右侧裁切（帧数）- 非破坏性
}

// 视频轨道项目
interface VideoTrackItem extends BaseTrackItem {
  type: 'video';
  fps: number;
  width: number;
  height: number;
  format: string;
  source: string;         // 源文件路径
  cover: string;          // 封面帧路径
  // 变换属性 (from capcut-ai-clone)
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  // 关键帧
  keyframes?: Keyframe[];
}

// 音频轨道项目
interface AudioTrackItem extends BaseTrackItem {
  type: 'audio';
  duration: number;       // 总时长(ms)
  format: string;
  source: string;
  waveform?: string;      // 波形图路径
  volume: number;         // 音量 0-1
  muted: boolean;
}

// 图片轨道项目
interface ImageTrackItem extends BaseTrackItem {
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
  keyframes?: Keyframe[];
}

// 文本轨道项目
interface TextTrackItem extends BaseTrackItem {
  type: 'text';
  content: string;
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  backgroundColor?: string;
  x: number;
  y: number;
  keyframes?: Keyframe[];
}

// 轨道线结构 (from CcClip)
interface TrackLine {
  id: string;
  type: TrackType;
  order: number;          // 轨道顺序（负数=下层，正数=上层）
  main?: boolean;         // 是否为主轨道
  locked: boolean;        // 锁定状态
  visible: boolean;       // 可见性
  muted: boolean;         // 静音（音频轨道）
  items: TrackItem[];
}
```

### 关键帧系统 (from capcut-ai-clone)

```typescript
interface Keyframe {
  id: string;
  time: number;           // 相对于片段起点的时间(ms)
  // 可动画属性
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  // 缓动
  easing: EasingType;
}

type EasingType =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'ease-in-cubic'
  | 'ease-out-cubic'
  | 'ease-in-out-cubic';
```

### 资源管理 (新增)

```typescript
interface Resource {
  id: string;
  type: 'video' | 'audio' | 'image';
  name: string;
  path: string;           // 原始文件路径
  localPath?: string;     // 复制到项目目录的路径
  // 元数据
  width?: number;
  height?: number;
  duration?: number;      // ms
  fps?: number;
  format?: string;
  size: number;           // bytes
  // 缓存
  thumbnailPath?: string;
  waveformPath?: string;
  framesPath?: string;    // 抽帧目录
  // 状态
  status: 'pending' | 'processing' | 'ready' | 'error';
  error?: string;
}
```

## 模块设计

### 1. FFmpeg 服务层

参考 CcClip 的设计，但使用 TypeScript 重写：

```typescript
// electron/service/FFmpegService.ts
class FFmpegService {
  // 路径配置
  private workDir: string;
  private ffmpegPath: string;

  // 核心方法
  async extractFrames(input: string, options: ExtractOptions): Promise<string[]>;
  async generateWaveform(input: string, output: string): Promise<void>;
  async splitAudio(input: string, output: string): Promise<void>;
  async mergeAudio(inputs: AudioMergeInput[], output: string): Promise<void>;
  async getMediaInfo(input: string): Promise<MediaInfo>;
  async exportVideo(config: ExportConfig, onProgress: ProgressCallback): Promise<void>;

  // 任务管理
  private taskQueue: Task[];
  private runningTask: Task | null;
  async queueTask(task: Task): Promise<TaskResult>;
  cancelTask(taskId: string): void;
}
```

### 2. 前端 FFmpeg 管理器

```typescript
// frontend/src/services/ffmpegManager.ts
class FFmpegManager {
  // 缓存管理
  private frameCache: Map<string, string[]>;
  private waveformCache: Map<string, string>;

  // 对外接口
  async importResource(filePath: string): Promise<Resource>;
  async getFrames(resourceId: string, timeRange?: [number, number]): Promise<string[]>;
  async getWaveform(resourceId: string): Promise<string>;
  async exportTimeline(timeline: Timeline, config: ExportConfig): Promise<void>;

  // IPC 封装
  private invoke(channel: string, ...args: any[]): Promise<any>;
}
```

### 3. 增强的 Timeline 组件

融合两个项目的交互能力：

```typescript
// 核心交互功能
interface TimelineFeatures {
  // 拖拽 (from capcut-ai-clone)
  dragClip: boolean;              // 片段拖拽移动
  dragToTrack: boolean;           // 跨轨道拖拽
  dragFromSidebar: boolean;       // 从资源库拖入

  // 裁剪 (from CcClip)
  trimStart: boolean;             // 左侧裁剪手柄
  trimEnd: boolean;               // 右侧裁剪手柄
  splitClip: boolean;             // 分割片段

  // 吸附
  snapToPlayhead: boolean;        // 吸附到播放头
  snapToClipEdge: boolean;        // 吸附到其他片段边缘
  snapToGrid: boolean;            // 吸附到时间网格

  // 选择
  multiSelect: boolean;           // 多选（Ctrl+点击）
  rangeSelect: boolean;           // 范围选择（Shift+点击）

  // 缩放
  zoomWheel: boolean;             // 滚轮缩放
  zoomPinch: boolean;             // 触控板缩放
}
```

### 4. 增强的 Player 组件

```typescript
// 真实媒体播放能力
interface PlayerFeatures {
  // 渲染
  canvasRender: boolean;          // Canvas 合成渲染
  videoPreload: boolean;          // 视频预加载
  frameSeek: boolean;             // 帧级跳转

  // 音频
  audioSync: boolean;             // 音频同步播放
  multiTrackAudio: boolean;       // 多轨道音频混合
  volumeControl: boolean;         // 音量控制

  // 播放控制
  playbackRate: number[];         // 支持的播放速率
  loop: boolean;                  // 循环播放
  scrubbing: boolean;             // 拖拽预览
}
```

### 5. 增强的 Sidebar 资源库

```typescript
// 资源管理能力
interface SidebarFeatures {
  // 导入
  fileImport: boolean;            // 文件选择导入
  dragImport: boolean;            // 拖拽文件导入
  folderImport: boolean;          // 文件夹批量导入

  // 展示
  gridView: boolean;              // 网格视图
  listView: boolean;              // 列表视图
  thumbnailPreview: boolean;      // 缩略图预览
  mediaInfo: boolean;             // 媒体信息显示

  // 管理
  search: boolean;                // 搜索过滤
  sort: boolean;                  // 排序
  delete: boolean;                // 删除资源
  rename: boolean;                // 重命名
}
```

### 6. PropertiesPanel 属性面板

参考 CcClip 的配置化设计：

```typescript
// 属性配置系统
interface PropertyConfig {
  key: string;
  label: string;
  type: 'number' | 'slider' | 'color' | 'select' | 'boolean' | 'text';
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: any }[];
  group?: string;         // 分组
  keyframeable?: boolean; // 是否支持关键帧
}

// 不同类型的属性配置
const VIDEO_PROPERTIES: PropertyConfig[] = [
  { key: 'x', label: '位置 X', type: 'number', keyframeable: true },
  { key: 'y', label: '位置 Y', type: 'number', keyframeable: true },
  { key: 'scale', label: '缩放', type: 'slider', min: 0.1, max: 3, keyframeable: true },
  { key: 'rotation', label: '旋转', type: 'slider', min: -180, max: 180, keyframeable: true },
  { key: 'opacity', label: '不透明度', type: 'slider', min: 0, max: 1, keyframeable: true },
];
```

## 状态管理设计

采用 React useState + Context 或考虑引入 Zustand：

```typescript
// 编辑器状态
interface EditorState {
  // 项目
  projectId: string | null;

  // 轨道
  tracks: TrackLine[];
  selectedTrackId: string | null;
  selectedItemId: string | null;
  selectedKeyframeId: string | null;

  // 资源
  resources: Resource[];

  // 播放
  currentTime: number;    // ms
  duration: number;       // ms
  isPlaying: boolean;
  playbackRate: number;

  // 视图
  timelineScale: number;  // px per second
  scrollLeft: number;
  timelineHeight: number;

  // 操作历史
  history: EditorAction[];
  historyIndex: number;
}
```

## 文件结构规划

```
frontend/src/
├── components/
│   └── editor/
│       ├── index.ts
│       ├── VideoEditor.tsx       # 主编辑器容器
│       ├── Timeline/
│       │   ├── Timeline.tsx      # 时间轴主组件
│       │   ├── TimelineRuler.tsx # 时间刻度
│       │   ├── TrackHeader.tsx   # 轨道头部
│       │   ├── TrackRow.tsx      # 轨道行
│       │   ├── ClipItem.tsx      # 片段渲染
│       │   ├── Playhead.tsx      # 播放头
│       │   ├── DragPreview.tsx   # 拖拽预览
│       │   └── styles.css
│       ├── Player/
│       │   ├── Player.tsx        # 播放器主组件
│       │   ├── CanvasRenderer.tsx# Canvas 渲染
│       │   ├── PlaybackControls.tsx
│       │   └── VolumeControl.tsx
│       ├── Sidebar/
│       │   ├── Sidebar.tsx       # 资源库主组件
│       │   ├── ResourceGrid.tsx  # 资源网格
│       │   ├── ResourceItem.tsx  # 资源项
│       │   ├── ImportButton.tsx  # 导入按钮
│       │   └── AIPanel.tsx       # AI 功能面板
│       └── Properties/
│           ├── PropertiesPanel.tsx
│           ├── TransformEditor.tsx
│           ├── KeyframeEditor.tsx
│           └── PropertyInput.tsx
├── engine/
│   ├── MediaEngine.ts            # 播放引擎
│   ├── VideoRenderer.ts          # 视频渲染
│   ├── AudioController.ts        # 音频控制
│   ├── KeyframeEngine.ts         # 关键帧插值
│   ├── SnapEngine.ts             # 吸附计算
│   └── index.ts
├── services/
│   ├── ffmpegManager.ts          # FFmpeg 管理
│   ├── resourceManager.ts        # 资源管理
│   └── exportService.ts          # 导出服务
├── stores/
│   ├── editorStore.ts            # 编辑器状态
│   ├── trackStore.ts             # 轨道状态
│   ├── resourceStore.ts          # 资源状态
│   └── playerStore.ts            # 播放状态
└── types/
    ├── track.ts                  # 轨道类型
    ├── resource.ts               # 资源类型
    └── editor.ts                 # 编辑器类型

electron/
├── service/
│   ├── FFmpegService.ts          # FFmpeg 服务
│   ├── FileService.ts            # 文件服务
│   └── ExportService.ts          # 导出服务
├── controller/
│   ├── ffmpeg.ts                 # FFmpeg IPC 控制器
│   ├── file.ts                   # 文件 IPC 控制器
│   └── export.ts                 # 导出 IPC 控制器
└── preload/
    └── ffmpeg.ts                 # FFmpeg IPC 预加载
```

## 性能优化策略

1. **帧缓存**: 预加载当前播放位置附近的帧
2. **波形缓存**: 音频波形只生成一次，存储到缓存目录
3. **虚拟滚动**: Timeline 只渲染可视区域的片段
4. **Canvas 离屏渲染**: 使用 OffscreenCanvas 在 Worker 中渲染
5. **防抖/节流**: 拖拽和属性变化使用防抖
6. **任务队列**: FFmpeg 任务排队执行，避免并发冲突
