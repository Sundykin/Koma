# 设计文档

## 1. 素材面板 UI 设计

### 1.1 整体布局

```
┌─────────────────────────┐
│  📁 素材库              │  ← 标题
├─────────────────────────┤
│ [视频] [图片] [音频] [文本] │  ← Tab 切换
├─────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐ │
│ │ 🎬  │ │ 🎬  │ │ 🎬  │ │  ← 素材网格
│ │ 3s  │ │ 4s  │ │ 2s  │ │
│ └─────┘ └─────┘ └─────┘ │
│ ┌─────┐ ┌─────┐ ┌─────┐ │
│ │ 🎬  │ │ 🎬  │ │ 🎬  │ │
│ │ 5s  │ │ 3s  │ │ 4s  │ │
│ └─────┘ └─────┘ └─────┘ │
├─────────────────────────┤
│  [+ 导入素材]           │  ← 底部操作
└─────────────────────────┘
```

### 1.2 素材卡片

```
┌───────────────────┐
│  ┌─────────────┐  │
│  │  缩略图     │  │  72x72px
│  │  + 时长标签 │  │
│  └─────────────┘  │
│  素材名称         │  单行截断
│  来源标签         │  AI生成/用户上传
└───────────────────┘
```

### 1.3 样式规范

- 面板宽度: 280px
- 网格: 3列，gap 8px
- 卡片: 圆角 8px，hover 边框高亮
- 拖拽中: 降低透明度 + 虚线边框

## 2. 数据结构设计

### 2.1 AssetItem (素材面板用)

```typescript
interface AssetItem {
  id: string;
  name: string;
  type: 'video' | 'image' | 'audio' | 'text';
  src: string;              // 文件路径
  thumbnailSrc?: string;    // 缩略图路径
  duration: number;         // 时长(秒)，图片默认3s
  source: 'shot' | 'character' | 'scene' | 'prop' | 'upload';
  metadata?: {
    shotId?: string;        // 关联的分镜ID
    characterId?: string;   // 关联的角色ID
    sceneId?: string;       // 关联的场景ID
    propId?: string;        // 关联的道具ID
  };
}
```

### 2.2 TimelineData (持久化用)

```typescript
interface TimelineData {
  version: 1;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}
```

### 2.3 素材聚合逻辑

```typescript
function aggregateAssets(
  shots: Shot[],
  characters: Character[],
  scenes: Scene[],
  props: Prop[]
): AssetItem[] {
  const assets: AssetItem[] = [];

  // 1. 从 shots 提取视频/图片
  shots.forEach(shot => {
    // 视频
    shot.videos?.forEach(video => {
      assets.push({
        id: `shot-video-${shot.id}-${video.path}`,
        name: shot.scriptContent?.slice(0, 15) || `镜头 ${shot.id}`,
        type: 'video',
        src: video.path,
        thumbnailSrc: video.thumbnailPath || shot.imagePath,
        duration: shot.duration || 3,
        source: 'shot',
        metadata: { shotId: shot.id }
      });
    });

    // 图片
    if (shot.imagePath) {
      assets.push({
        id: `shot-image-${shot.id}`,
        name: shot.scriptContent?.slice(0, 15) || `镜头 ${shot.id}`,
        type: 'image',
        src: shot.imagePath,
        duration: shot.duration || 3,
        source: 'shot',
        metadata: { shotId: shot.id }
      });
    }
  });

  // 2. 从 characters 提取立绘
  characters.forEach(char => {
    if (char.imagePath) {
      assets.push({
        id: `char-${char.id}`,
        name: char.name,
        type: 'image',
        src: char.imagePath,
        duration: 3,
        source: 'character',
        metadata: { characterId: char.id }
      });
    }
  });

  // 3. 从 scenes 提取场景图
  // 4. 从 props 提取道具图
  // ... 类似逻辑

  return assets;
}
```

## 3. 持久化流程

### 3.1 加载流程

```
进入编辑器
    ↓
检查 timeline.json 是否存在
    ├─ 存在 → 加载 TimelineData
    └─ 不存在 → 从 shots 初始化 tracks
    ↓
设置 tracks 状态
```

### 3.2 保存流程

```
用户编辑操作
    ↓
触发 onTracksChange
    ↓
防抖 1秒
    ↓
调用 saveTimeline()
    ↓
写入 timeline.json
```

### 3.3 冲突处理

当 shots 变化时：
- 如果 timeline.json 存在且有用户编辑，提示用户选择：
  - 保留当前轨道
  - 从分镜重新生成
- 如果 timeline.json 不存在，自动从 shots 生成

## 4. 拖拽交互

### 4.1 拖拽数据格式

```typescript
// 设置拖拽数据
const handleDragStart = (e: DragEvent, asset: AssetItem) => {
  const dragData: Asset = {
    id: asset.id,
    name: asset.name,
    type: assetTypeToMediaType(asset.type),
    src: asset.src,
    duration: asset.duration,
  };
  e.dataTransfer.setData('application/json', JSON.stringify(dragData));
  e.dataTransfer.effectAllowed = 'copy';
};
```

### 4.2 拖拽视觉反馈

- 拖拽开始: 素材卡片降低透明度
- 拖拽中: 鼠标跟随预览
- 拖拽进入轨道: 轨道高亮
- 拖拽释放: 创建 clip

## 5. 播放时长计算

```typescript
// SimpleEditor 中
const actualDuration = useMemo(() => {
  let maxEnd = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      maxEnd = Math.max(maxEnd, clip.start + clip.duration);
    }
  }
  return maxEnd;
}, [tracks]);

// 传递给 Player 和 Timeline
<SimplePlayer duration={actualDuration} ... />
<SimpleTimeline duration={actualDuration} ... />
```

## 6. 文件存储结构

```
projects/{projectId}/
  └── episodes/{episodeId}/
      ├── analysis.json      (原有，含 shots)
      ├── timeline.json      (新增，编辑器轨道数据)
      └── meta.json
```

## 7. 轨道碰撞检测

### 7.1 碰撞检测算法

```typescript
// utils/trackCollision.ts

/**
 * 检测两个时间区间是否重叠
 */
function intervalsOverlap(
  start1: number, end1: number,
  start2: number, end2: number
): boolean {
  return start1 < end2 && end1 > start2;
}

/**
 * 检测 clip 是否与其他 clips 碰撞
 */
export function hasCollision(
  clip: { id: string; start: number; duration: number },
  otherClips: { id: string; start: number; duration: number }[]
): boolean {
  const clipEnd = clip.start + clip.duration;
  return otherClips.some(other => {
    if (other.id === clip.id) return false;
    const otherEnd = other.start + other.duration;
    return intervalsOverlap(clip.start, clipEnd, other.start, otherEnd);
  });
}

/**
 * 找到指定时间点之后第一个可用位置
 */
export function findNextAvailablePosition(
  clips: Clip[],
  duration: number,
  preferredStart: number
): number {
  // 按 start 排序
  const sorted = [...clips].sort((a, b) => a.start - b.start);

  // 检查 preferredStart 是否可用
  let candidateStart = preferredStart;
  let candidateEnd = candidateStart + duration;

  for (const clip of sorted) {
    const clipEnd = clip.start + clip.duration;

    // 如果候选区间与当前 clip 不冲突，继续检查下一个
    if (candidateEnd <= clip.start || candidateStart >= clipEnd) {
      continue;
    }

    // 有冲突，将候选起点移到当前 clip 之后
    candidateStart = clipEnd;
    candidateEnd = candidateStart + duration;
  }

  return candidateStart;
}

/**
 * 解决碰撞：将被挤占的素材向后推移
 */
export function resolveCollisions(
  clips: Clip[],
  movedClipId: string
): Clip[] {
  const result = [...clips];
  const movedClip = result.find(c => c.id === movedClipId);
  if (!movedClip) return result;

  // 按 start 排序
  result.sort((a, b) => a.start - b.start);

  // 从移动的 clip 开始，检查后续 clip 是否需要推移
  const movedIndex = result.findIndex(c => c.id === movedClipId);
  let prevEnd = movedClip.start + movedClip.duration;

  for (let i = movedIndex + 1; i < result.length; i++) {
    const clip = result[i];
    if (clip.start < prevEnd) {
      // 需要推移
      clip.start = prevEnd;
    }
    prevEnd = clip.start + clip.duration;
  }

  return result;
}
```

### 7.2 使用场景

**拖入新素材**:
```typescript
const handleAssetDrop = (asset: Asset, time: number, trackId: string) => {
  const track = tracks.find(t => t.id === trackId);
  if (!track) return;

  // 找到不冲突的位置
  const safeStart = findNextAvailablePosition(track.clips, asset.duration, time);

  const newClip = {
    id: generateId(),
    start: safeStart,
    duration: asset.duration,
    // ...
  };

  // 添加到轨道
};
```

**移动现有素材**:
```typescript
const handleMoveClip = (clipId: string, newStart: number, newTrackId: string) => {
  setTracks(prev => {
    // 1. 先移动到目标位置
    // 2. 调用 resolveCollisions 处理后续碰撞
    // 3. 返回更新后的 tracks
  });
};
```

## 8. 轨道预览渲染

### 8.1 文件协议转换

```typescript
// utils/urlUtils.ts

/**
 * 将本地路径转换为 koma-local:// 协议 URL
 */
export function toKomaLocalUrl(path: string): string {
  if (!path) return '';

  // 已经是 URL，直接返回
  if (path.startsWith('http://') ||
      path.startsWith('https://') ||
      path.startsWith('koma-local://')) {
    return path;
  }

  // 转换本地路径
  return `koma-local:///${path.replace(/\\/g, '/')}`;
}
```

### 8.2 视频帧提取

**Electron 端 (main process)**:
```typescript
// electron/src/services/ffmpeg.ts

async function extractVideoFrames(
  videoPath: string,
  outputDir: string,
  frameCount: number = 10
): Promise<string[]> {
  const ffmpeg = require('fluent-ffmpeg');

  // 获取视频时长
  const metadata = await getVideoMetadata(videoPath);
  const duration = metadata.format.duration;
  const interval = duration / frameCount;

  const framePaths: string[] = [];

  for (let i = 0; i < frameCount; i++) {
    const time = i * interval;
    const outputPath = path.join(outputDir, `frame_${i.toString().padStart(3, '0')}.jpg`);

    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: [time],
          filename: `frame_${i.toString().padStart(3, '0')}.jpg`,
          folder: outputDir,
          size: '?x64'  // 高度 64px，宽度自适应
        })
        .on('end', resolve)
        .on('error', reject);
    });

    framePaths.push(outputPath);
  }

  return framePaths;
}
```

**帧缓存结构**:
```
.koma/cache/frames/
  └── {videoHash}/
      ├── meta.json         # { videoPath, frameCount, createdAt }
      ├── frame_000.jpg
      ├── frame_001.jpg
      └── ...
```

### 8.3 Filmstrip 组件

```typescript
// components/editor/Filmstrip.tsx

interface FilmstripProps {
  clip: Clip;
  width: number;      // 轨道上的像素宽度
  height: number;     // 轨道高度 (64px)
}

const Filmstrip: React.FC<FilmstripProps> = ({ clip, width, height }) => {
  const [frames, setFrames] = useState<string[]>([]);

  // 计算需要多少个预览格子
  const cellWidth = height * (16 / 9);  // 假设 16:9 宽高比
  const cellCount = Math.ceil(width / cellWidth);

  useEffect(() => {
    if (clip.type === MediaType.VIDEO) {
      // 加载帧图片
      loadVideoFrames(clip.src, cellCount).then(setFrames);
    }
  }, [clip.src, cellCount]);

  // 视频: 帧图片平铺
  if (clip.type === MediaType.VIDEO) {
    return (
      <div className="flex h-full overflow-hidden">
        {frames.map((frameSrc, i) => (
          <img
            key={i}
            src={toKomaLocalUrl(frameSrc)}
            className="h-full object-cover flex-shrink-0"
            style={{ width: cellWidth }}
            alt=""
          />
        ))}
      </div>
    );
  }

  // 图片: 原图平铺
  if (clip.type === MediaType.IMAGE) {
    const imgUrl = toKomaLocalUrl(clip.src);
    return (
      <div className="flex h-full overflow-hidden">
        {Array.from({ length: cellCount }).map((_, i) => (
          <img
            key={i}
            src={imgUrl}
            className="h-full object-cover flex-shrink-0"
            style={{ width: cellWidth }}
            alt=""
          />
        ))}
      </div>
    );
  }

  // 音频: 波形图 (保持现有)
  // 文本: 文字预览 (保持现有)
  // ...
};
```

### 8.4 预览效果

**视频 Clip**:
```
┌────────────────────────────────────────────────┐
│  素材名称                                       │
│ ┌──────┬──────┬──────┬──────┬──────┬──────┐   │
│ │  F1  │  F2  │  F3  │  F4  │  F5  │  F6  │   │ ← 帧图片
│ │ 0.0s │ 0.5s │ 1.0s │ 1.5s │ 2.0s │ 2.5s │   │
│ └──────┴──────┴──────┴──────┴──────┴──────┘   │
└────────────────────────────────────────────────┘
```

**图片 Clip**:
```
┌────────────────────────────────────────────────┐
│  素材名称                                       │
│ ┌──────┬──────┬──────┬──────┬──────┬──────┐   │
│ │  Img │  Img │  Img │  Img │  Img │  Img │   │ ← 同一图片重复
│ │      │      │      │      │      │      │   │
│ └──────┴──────┴──────┴──────┴──────┴──────┘   │
└────────────────────────────────────────────────┘
```

## 9. 帧缓存管理

### 9.1 缓存策略

- **缓存键**: 视频文件的 MD5 hash
- **缓存位置**: `.koma/cache/frames/{hash}/`
- **缓存有效期**: 7天（可配置）
- **清理时机**: 应用启动时清理过期缓存

### 9.2 清理逻辑

```typescript
async function cleanExpiredFrameCache(maxAge: number = 7 * 24 * 60 * 60 * 1000) {
  const cacheDir = path.join(getStoragePath(), 'cache', 'frames');
  const entries = await fs.readdir(cacheDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const metaPath = path.join(cacheDir, entry.name, 'meta.json');
    try {
      const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
      if (Date.now() - meta.createdAt > maxAge) {
        await fs.rm(path.join(cacheDir, entry.name), { recursive: true });
      }
    } catch {
      // meta.json 不存在或损坏，删除整个目录
      await fs.rm(path.join(cacheDir, entry.name), { recursive: true });
    }
  }
}
```
