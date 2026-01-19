# Design Document

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                     SimpleEditor                             │
├───────────────┬─────────────────────────┬───────────────────┤
│   Sidebar     │      SimplePlayer       │  PropertiesPanel  │
│   (素材库)    │      (播放预览)         │   (属性编辑)      │
├───────────────┴─────────────────────────┴───────────────────┤
│                    SimpleTimeline                            │
│                    (时间线编辑)                              │
├─────────────────────────────────────────────────────────────┤
│  Engine Layer: MediaEngine + VideoRenderer + AudioController │
└─────────────────────────────────────────────────────────────┘
```

## 数据流

```
Koma Shot[]
    ↓ (shotsToTracks转换)
Track[] + Clip[]
    ↓ (状态管理)
SimpleEditor (React State)
    ↓ (props传递)
├── SimpleTimeline (轨道编辑)
├── SimplePlayer (播放预览)
├── PropertiesPanel (属性编辑)
└── Sidebar (素材拖放)
```

## 关键帧动画系统

### 数据结构
```typescript
interface Keyframe {
  id: string;
  time: number;        // 相对于 Clip 的时间
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  easing: EasingType;
}
```

### 插值算法
1. 找到当前时间前后的两个关键帧
2. 计算进度 t = (currentTime - kf1.time) / (kf2.time - kf1.time)
3. 应用缓动函数 easedT = easing(t)
4. 线性插值各属性 value = kf1.value + (kf2.value - kf1.value) * easedT

### 自动打帧
- 当 Clip 已有关键帧时，修改属性自动在当前时间创建新关键帧
- 无关键帧时，直接修改 Clip 默认属性

## 文件协议处理

### 问题
浏览器安全策略禁止加载 `file:///` 协议的本地资源

### 解决方案
Tauri 提供的自定义协议 `koma-local://`：

```typescript
// electronService.fs.toLocalUrl()
const toLocalUrl = (filePath: string): string => {
  if (!filePath) return '';
  if (!isElectron()) return filePath;
  if (filePath.startsWith('http://') ||
      filePath.startsWith('https://') ||
      filePath.startsWith('koma-local://')) {
    return filePath;
  }
  const normalizedPath = filePath.replace(/\\/g, '/');
  return `koma-local://${encodeURIComponent(normalizedPath)}`;
};
```

### 使用位置
- SimplePlayer: 图片/视频 src
- SimpleTimeline: Filmstrip 缩略图
- Sidebar: 素材预览图
- PropertiesPanel: 当前帧预览

## 碰撞检测算法

```typescript
function checkCollision(clip: Clip, targetStart: number, trackClips: Clip[]): boolean {
  const targetEnd = targetStart + clip.duration;
  return trackClips.some(other => {
    if (other.id === clip.id) return false;
    const otherEnd = other.start + other.duration;
    return !(targetEnd <= other.start || targetStart >= otherEnd);
  });
}
```

## 轨道间隙处理

当拖拽 Clip 到轨道间隙时：
1. 创建新轨道
2. 重新排序所有轨道的 order
3. 将 Clip 添加到新轨道

## 右键菜单

### Clip 右键菜单
- 添加关键帧（仅视频/图片）
- 复制片段 (Ctrl+D)
- 删除片段 (Del)

### Keyframe 右键菜单
- 缓动曲线选择（7 种）
- 删除关键帧

## 性能考虑

1. **媒体预加载**: 提前加载 Clip 的媒体资源
2. **RAF 循环**: 使用 requestAnimationFrame 保证流畅
3. **拖拽阈值**: 5px 阈值防止误触
4. **状态节流**: 时间更新节流避免过度渲染
