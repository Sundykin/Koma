# 提案: 编辑器素材面板与轨道持久化

## 变更 ID
`editor-asset-panel`

## 概述
为 SimpleEditor 添加仿 CapCut 风格的素材面板，支持素材拖拽入轨，并修复轨道数据未持久化的问题。

## 背景与问题

### 当前问题
1. **无素材面板**: 用户无法浏览和添加素材到时间线
2. **轨道数据未持久化**: 编辑器修改只存在内存中，刷新即丢失
3. **依赖上游数据**: 必须从 AI 分镜步骤导航才能加载数据
4. **播放头越界**: 即使没有素材，播放头也能移动到任意位置
5. **轨道碰撞检测缺失**: 同一轨道上的素材可以重叠，应该自动避让或禁止
6. **轨道预览协议错误**: 轨道上素材预览使用 file:// 协议无法加载，需使用 koma-local://
7. **轨道预览不完善**: 视频素材需要帧预览，图片素材需要平铺预览

### 目标
1. 添加素材面板（播放器左侧），展示项目素材
2. 支持拖拽素材到轨道
3. 实现轨道数据持久化
4. 播放时长限制到最后一个素材的结束时间
5. 实现轨道碰撞检测，防止素材重叠
6. 修复轨道预览的文件协议问题
7. 实现视频帧提取预览和图片平铺预览

## 设计方案

### 1. 素材面板 (AssetPanel)

**位置**: 播放器左侧，宽度 280px

**素材分类** (参考 CapCut):
- 视频 (来自 AI 生成的分镜视频)
- 图片 (分镜图、角色立绘、场景图、道具图)
- 音频 (配音、背景音乐)
- 文本 (对白、字幕模板)

**数据来源**:
1. 上游生成数据:
   - `analysisData.shots` → 分镜视频/图片
   - `analysisData.characters` → 角色立绘
   - `analysisData.scenes` → 场景图
   - `analysisData.props` → 道具图
2. 用户上传:
   - 通过 `projectStore.importAsset()` 导入

### 2. 轨道持久化

**存储位置**: `episodes/{episodeId}/timeline.json`

**存储结构**:
```typescript
interface TimelineData {
  version: number;
  tracks: Track[];
  duration: number;
  updatedAt: number;
}
```

**触发时机**:
- 片段移动/缩放后
- 添加/删除片段后
- 添加/删除轨道后
- 节流保存 (1秒防抖)

### 3. 布局调整

```
┌─────────────────────────────────────────────────────────┐
│                    SimpleEditor                          │
├──────────┬────────────────────────┬─────────────────────┤
│          │                        │                      │
│  Asset   │       Player           │   Properties         │
│  Panel   │       (Canvas)         │   Panel              │
│  280px   │       flex-1           │   280px              │
│          │                        │                      │
├──────────┴────────────────────────┴─────────────────────┤
│                      Timeline                            │
│                      (300px)                             │
└─────────────────────────────────────────────────────────┘
```

### 4. 播放时长限制

- `duration` = 最后一个 clip 的 `(start + duration)`
- 如果无 clip，`duration` = 0，禁用播放
- 播放头 seek 限制在 `[0, duration]` 范围

### 5. 轨道碰撞检测

**检测时机**:
- 拖拽素材入轨时
- 移动/缩放已有 clip 时

**碰撞处理策略**:
1. **拖入新素材**: 自动定位到不冲突的位置（找到最近的空闲位置）
2. **移动现有素材**: 如果目标位置有冲突，自动将被挤占的素材向后推移
3. **缩放素材**: 如果扩展方向有冲突，限制最大缩放范围

**碰撞检测算法**:
```typescript
function hasCollision(clip: Clip, otherClips: Clip[]): boolean {
  return otherClips.some(other =>
    other.id !== clip.id &&
    clip.start < other.start + other.duration &&
    clip.start + clip.duration > other.start
  );
}

function findNextAvailablePosition(track: Track, duration: number, preferredStart: number): number {
  // 找到 preferredStart 之后第一个能容纳 duration 的空闲位置
}
```

### 6. 轨道预览渲染

**文件协议转换**:
- 所有 `clip.src` 路径需转换为 `koma-local://` 协议
- 与 SimplePlayer 使用相同的转换逻辑

**视频素材预览**:
- 使用 ffmpeg 提取关键帧作为预览图
- 帧提取规则: 每 N 秒提取一帧，N = clip.duration / 预览格子数
- 帧图片缓存到 `.koma/cache/frames/{videoHash}/` 目录
- 轨道上按时间线位置平铺帧图片

**图片素材预览**:
- 使用原图，定高 (64px) 等比缩放
- 按素材时长在轨道上水平平铺复制

**预览组件改造**:
```
┌──────────────────────────────────────┐
│ Video Clip (视频)                     │
│ ┌─────┬─────┬─────┬─────┬─────┐     │
│ │ F1  │ F2  │ F3  │ F4  │ F5  │ ... │  ← 帧预览平铺
│ └─────┴─────┴─────┴─────┴─────┘     │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ Image Clip (图片)                     │
│ ┌─────┬─────┬─────┬─────┐           │
│ │ Img │ Img │ Img │ Img │           │  ← 原图平铺
│ └─────┴─────┴─────┴─────┘           │
└──────────────────────────────────────┘
```

## 涉及文件

| 文件 | 变更类型 |
|------|---------|
| `components/editor/SimpleEditor.tsx` | 修改 - 添加 AssetPanel，持久化逻辑 |
| `components/editor/SimpleAssetPanel.tsx` | 新增 - 素材面板组件 |
| `components/editor/SimpleTimeline.tsx` | 修改 - 碰撞检测，预览协议修复 |
| `components/editor/Filmstrip.tsx` | 新增 - 轨道预览组件（视频帧/图片平铺）|
| `store/projectStore.ts` | 修改 - 添加 timeline 存储函数 |
| `engine/simpleEngine.ts` | 修改 - duration 动态计算 |
| `types/editor.ts` | 修改 - 添加 TimelineData 类型 |
| `services/ffmpegService.ts` | 修改 - 添加视频帧提取函数 |

## 风险与考量

1. **性能**: 素材面板需要懒加载缩略图
2. **兼容性**: 旧项目没有 timeline.json，需要从 shots 初始化
3. **冲突**: 如果 shots 变化，需要决定是否覆盖 timeline
4. **ffmpeg 依赖**: 视频帧提取需要 ffmpeg，需确保 Electron 端已集成
5. **帧缓存管理**: 需要清理过期的帧缓存，避免磁盘占用过大

## 验收标准

1. 素材面板显示所有可用素材（按类型分组）
2. 拖拽素材到轨道能正确添加 clip
3. 刷新页面后轨道数据保留
4. 播放头不能超过最后一个素材的结束时间
5. 同一轨道上的素材不能重叠，拖入时自动找空位
6. 轨道上视频素材显示帧预览（平铺）
7. 轨道上图片素材显示原图预览（平铺）
8. 轨道预览图片能正确加载（使用 koma-local:// 协议）
