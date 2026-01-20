## Context

本设计文档描述 SimpleEditor 的全面增强方案，涵盖音频播放、预览交互、字幕、导出、时间线优化等功能。

## Goals / Non-Goals

### Goals
1. **统一编辑器**: 删除 VideoEditor，所有编辑功能集中到 SimpleEditor
2. **完整的媒体播放**: 支持视频画面和音频同步播放
3. **可视化编辑**: 在预览区域直接操作素材位置、缩放、旋转
4. **字幕支持**: 完整的字幕编辑和渲染功能
5. **视频导出**: 使用 FFmpeg 合成时间线为视频文件
6. **素材扩展**: 支持用户上传自定义素材
7. **状态持久化**: 编辑状态完整保存和恢复
8. **时间线增强**: 动态刻度、缩放、碰撞检测、吸附对齐

### Non-Goals
1. 不实现复杂的特效系统（如转场、滤镜）
2. 不实现多用户协作编辑
3. 不实现云端渲染导出
4. 不实现实时流媒体播放

## Decisions

### 1. 音频播放架构

**Decision**: 扩展现有 SimpleAudioController，使用 HTMLMediaElement 池管理音视频元素。

**Alternatives considered**:
- Web Audio API 解码音频 - 复杂度高，需要手动处理解码和同步
- 单一 video 元素切换 - 切换时有延迟，无法实现平滑过渡

**Rationale**: HTMLMediaElement 是最直接的方案，浏览器已处理好解码和缓冲，只需管理同步。

### 2. 预览区变换控制

**Decision**: 创建独立的 TransformControl 组件，overlay 在 Canvas 上方。

**Implementation**:
```
┌─────────────────────────────────────┐
│ Canvas (渲染层)                      │
│   ┌─────────────────────────┐       │
│   │ 视频/图片素材            │       │
│   └─────────────────────────┘       │
├─────────────────────────────────────┤
│ TransformControl (交互层)            │
│   ○───────────────────────○         │
│   │                       │         │
│   │   选中素材边框        │         │
│   │                       │         │
│   ○───────────────────────○         │
│           ↺ 旋转手柄                 │
└─────────────────────────────────────┘
```

### 3. 字幕数据结构

**Decision**: 扩展 Clip 接口，添加字幕专有属性。

```typescript
interface SubtitleClip extends Clip {
  type: MediaType.TEXT;
  text: string;
  fontSize: number;
  fontFamily: string;
  fontColor: string;
  backgroundColor?: string;
  position: 'top' | 'center' | 'bottom';
  customX?: number;
  customY?: number;
}
```

### 4. 视频导出流程

**Decision**: 采用「逐帧渲染 → 图片序列 → FFmpeg 合成」流程。

**Flow**:
```
用户点击导出
    ↓
显示配置对话框 (分辨率、帧率、格式)
    ↓
逐帧渲染到 Canvas
    ↓
Canvas.toDataURL() 导出为 PNG
    ↓
保存到临时目录 frames/
    ↓
提取/混合音轨 → audio.wav
    ↓
FFmpeg 命令合成
    ↓
清理临时文件
    ↓
显示完成提示
```

**FFmpeg 命令模板**:
```bash
ffmpeg -framerate 30 -i frames/%05d.png \
       -i audio.wav \
       -c:v libx264 -preset medium -crf 23 \
       -c:a aac -b:a 192k \
       -pix_fmt yuv420p \
       -shortest \
       output.mp4
```

### 5. 时间线缩放实现

**Decision**: 使用 `zoom` 状态变量，影响 PIXELS_PER_SECOND。

```typescript
const basePixelsPerSecond = 20;
const pixelsPerSecond = basePixelsPerSecond * zoom;
```

**缩放范围**: 0.1x ~ 5x，默认 1x

### 6. 吸附对齐算法

**Decision**: 维护吸附点数组，拖拽时实时查询最近吸附点。

```typescript
interface SnapPoint {
  time: number;
  type: 'playhead' | 'clip-start' | 'clip-end' | 'ruler-mark';
  label?: string;
}

function findSnapPoint(position: number, snapPoints: SnapPoint[], threshold: number): SnapPoint | null {
  for (const point of snapPoints) {
    if (Math.abs(position - point.time) * pixelsPerSecond <= threshold) {
      return point;
    }
  }
  return null;
}
```

### 7. 持久化存储格式

**Decision**: 升级版本号到 2，增加视图状态。

```typescript
interface TimelinePersistence {
  version: 2;
  tracks: Track[];
  duration: number;
  zoom: number;
  scrollLeft: number;
  selectedClipId?: string;
  updatedAt: number;
}
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| 音视频同步延迟 | 使用 requestAnimationFrame 精确控制，预缓冲音频 |
| FFmpeg 导出慢 | 显示进度条，支持取消，后台线程处理 |
| 删除 VideoEditor 遗漏引用 | 全局搜索验证，CI 编译检查 |
| 大量素材时性能下降 | 虚拟化渲染，按需加载 |
| 持久化数据损坏 | 版本检查，降级回退到 shots 初始化 |

## Migration Plan

### 删除 VideoEditor 迁移

1. 检查所有 VideoEditor 的使用点
2. 确认 SimpleEditor 已实现对应功能
3. 删除 VideoEditor 相关文件
4. 更新 index.ts 导出
5. 运行 CI 验证无编译错误

### 持久化格式升级

1. 版本 1 数据自动迁移到版本 2
2. 新增字段使用默认值 (zoom: 1, scrollLeft: 0)
3. 保持向后兼容读取

## Open Questions

1. **Q**: 字幕是否需要支持富文本（如部分加粗）？
   **A**: 初期只支持纯文本，后续可扩展

2. **Q**: 视频导出是否需要支持 WebM 格式？
   **A**: 作为可选项实现，默认 MP4

3. **Q**: 吸附阈值是否需要用户可配置？
   **A**: 初期固定 10px，后续可加入设置
