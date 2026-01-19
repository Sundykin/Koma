# Design: migrate-electron-egg-editor

## 架构对比

### electron-egg 架构（目标）

```
App.tsx (集中状态管理)
  ├─ tracks: Track[]
  ├─ currentTime: number
  ├─ selectedClipId: string
  ├─ isPlaying: boolean
  └─ duration: number
         ↓
    ├─ Timeline.tsx (编辑)
    ├─ Player.tsx (预览)
    └─ PropertiesPanel.tsx (属性)

Engine 层
  ├─ MediaEngine.ts (播放控制 + 事件系统)
  ├─ VideoRenderer.ts (Canvas 渲染)
  ├─ AudioController.ts (音频同步)
  └─ keyframe.ts (动画插值)
```

### Koma 现有架构（问题）

```
VideoEditor.tsx
  ├─ useTrackStore (Zustand) ← 状态分散
  └─ useResourceStore
         ↓
    ├─ EnhancedTimeline.tsx ← 重复订阅 store
    ├─ Player.tsx
    │   └─ MediaEngine.ts
    │       └─ 每次 loadTimeline 都重载媒体
    └─ Sidebar.tsx

问题：
1. timeline 对象每次 tracks 变化都重建
2. 组件订阅粒度过粗
3. 引擎与 store 同步逻辑复杂
```

## 迁移设计

### 1. 状态管理简化

**方案**：保留 Zustand store，但简化为单一数据源

```typescript
// store/editorStore.ts (新建，合并 trackStore 核心功能)
interface EditorState {
  // 核心状态
  tracks: Track[];
  currentTime: number;
  selectedClipId: string | null;
  isPlaying: boolean;
  duration: number;

  // 配置
  fps: number;
  resolution: { width: number; height: number };

  // Actions
  setTracks: (tracks: Track[]) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  setCurrentTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  // ...
}
```

### 2. 组件迁移映射

| electron-egg | Koma 目标 | 说明 |
|--------------|----------|------|
| Timeline.tsx | Timeline/Timeline.tsx | 核心时间轴，重写 |
| Player.tsx | Player.tsx | 播放器，重写 |
| PropertiesPanel.tsx | Sidebar/PropertiesPanel.tsx | 属性面板 |

### 3. 引擎迁移

直接复制 electron-egg 的引擎文件，微调接口：

```typescript
// engine/MediaEngine.ts - 保持原有实现
// engine/VideoRenderer.ts - 保持原有实现
// engine/AudioController.ts - 保持原有实现
// engine/keyframe.ts - 保持原有实现
```

### 4. 数据适配层

创建适配器将 Shot 数据转换为 Track/Clip：

```typescript
// utils/shotToTrack.ts
export function shotsToTracks(shots: Shot[], fps: number): Track[] {
  const videoTrack: Track = { id: 'video-main', type: 'video', clips: [], order: 0 };
  const audioTrack: Track = { id: 'audio-main', type: 'audio', clips: [], order: -1 };
  const textTrack: Track = { id: 'text-main', type: 'text', clips: [], order: 1 };

  let currentTime = 0;
  for (const shot of shots) {
    // 视频/图片 clip
    if (shot.imagePath || shot.videos?.[0]?.path) {
      videoTrack.clips.push({
        id: `clip-${shot.id}`,
        trackId: videoTrack.id,
        start: currentTime,
        duration: shot.duration * 1000,
        // ...
      });
    }
    // 字幕 clip
    if (shot.dialogue) {
      textTrack.clips.push({...});
    }
    currentTime += shot.duration * 1000;
  }

  return [videoTrack, audioTrack, textTrack];
}
```

## 文件结构（迁移后）

```
frontend/src/
├── components/
│   └── editor/
│       ├── Timeline.tsx          # 从 electron-egg 迁移
│       ├── Player.tsx            # 从 electron-egg 迁移
│       ├── Sidebar.tsx           # 保留，适配新接口
│       └── PropertiesPanel.tsx   # 从 electron-egg 迁移
│
├── engine/
│   ├── MediaEngine.ts            # 从 electron-egg 迁移
│   ├── VideoRenderer.ts          # 从 electron-egg 迁移
│   ├── AudioController.ts        # 从 electron-egg 迁移
│   └── keyframe.ts               # 从 electron-egg 迁移
│
├── store/
│   ├── editorStore.ts            # 新建，简化版
│   ├── resourceStore.ts          # 保留
│   └── projectStore.ts           # 保留
│
├── types/
│   └── editor.ts                 # 从 electron-egg types.ts 迁移
│
└── utils/
    └── shotAdapter.ts            # 新建，Shot <-> Track 转换
```

## 关键优化点保留

### 1. 性能优化

- **媒体缓存**：VideoRenderer 的 mediaCache 保留
- **可见性剪裁**：getVisibleClips 保留
- **关键帧查询**：二分查找保留

### 2. 拖拽优化

- **阈值检测**：DRAG_THRESHOLD = 5px
- **实时预览**：拖拽时直接更新状态
- **RAF 节流**：大量更新时使用 requestAnimationFrame

### 3. 渲染优化

- **轨道排序**：按 order 预排序
- **Canvas 复用**：save()/restore() 隔离变换

## 迁移顺序

1. **Phase 1**：类型定义迁移
2. **Phase 2**：引擎迁移
3. **Phase 3**：Timeline 组件迁移
4. **Phase 4**：Player 组件迁移
5. **Phase 5**：数据适配器
6. **Phase 6**：集成测试
