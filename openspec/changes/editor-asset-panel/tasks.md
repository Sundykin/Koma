# 任务清单

## Phase 1: 类型定义与存储层

### 1.1 扩展类型定义
- [ ] `types/editor.ts` 添加 `TimelineData` 接口
- [ ] `types/editor.ts` 添加 `AssetItem` 接口（素材面板用）
- [ ] `types/editor.ts` 添加 `FrameCache` 接口（帧缓存元数据）

### 1.2 持久化函数
- [ ] `projectStore.ts` 添加 `loadTimeline(projectId, episodeId)`
- [ ] `projectStore.ts` 添加 `saveTimeline(projectId, episodeId, data)`
- [ ] 实现从 shots 初始化 timeline 的兼容逻辑

## Phase 2: 轨道碰撞检测

### 2.1 碰撞检测工具函数
- [ ] 创建 `utils/trackCollision.ts`
- [ ] `hasCollision(clip, otherClips)` - 检测是否有碰撞
- [ ] `findNextAvailablePosition(track, duration, preferredStart)` - 找空位
- [ ] `resolveCollisions(clips)` - 解决碰撞（推移后续素材）

### 2.2 集成到 SimpleTimeline
- [ ] `handleAssetDrop` 中调用碰撞检测
- [ ] `handleMoveClip` 中调用碰撞检测
- [ ] `handleResizeClip` 中限制扩展范围

## Phase 3: 轨道预览修复

### 3.1 文件协议转换
- [ ] 创建 `toKomaLocalUrl(path)` 工具函数
- [ ] `SimpleTimeline.tsx` 中 Filmstrip 组件使用转换后的 URL

### 3.2 帧提取服务
- [ ] `services/ffmpegService.ts` 添加 `extractFrames(videoPath, outputDir, count)`
- [ ] Electron 端实现 ffmpeg 帧提取 IPC
- [ ] 帧缓存管理（按视频 hash 存储）

### 3.3 Filmstrip 组件重构
- [ ] 提取为独立组件 `components/editor/Filmstrip.tsx`
- [ ] 视频素材：加载帧图片平铺
- [ ] 图片素材：原图定高平铺
- [ ] 音频素材：波形图（保持现有）
- [ ] 文本素材：文字预览（保持现有）

## Phase 4: 素材面板组件

### 4.1 创建 SimpleAssetPanel
- [ ] 组件结构：顶部 Tab + 素材网格
- [ ] Tab 分类：视频、图片、音频、文本
- [ ] 素材项：缩略图 + 名称 + 时长
- [ ] 支持 `draggable` 属性，设置拖拽数据

### 4.2 素材数据聚合
- [ ] 从 shots 提取视频/图片
- [ ] 从 characters 提取角色立绘
- [ ] 从 scenes 提取场景图
- [ ] 从 props 提取道具图
- [ ] 支持用户上传素材入口

## Phase 5: 编辑器集成

### 5.1 布局调整
- [ ] SimpleEditor 添加左侧 AssetPanel
- [ ] 调整 flex 布局：AssetPanel(280px) + Player(flex-1) + Properties(280px)

### 5.2 数据流重构
- [ ] 加载时优先读取 timeline.json，无则从 shots 初始化
- [ ] 编辑操作后自动保存（防抖 1s）
- [ ] 添加 `onTracksChange` 回调

### 5.3 拖拽处理
- [ ] AssetPanel 设置拖拽数据 (Asset JSON)
- [ ] Timeline 接收拖拽，调用 `onAssetDrop`（含碰撞检测）

## Phase 6: 播放时长优化

### 6.1 动态时长计算
- [ ] `SimpleEditor` 中 duration 改为计算属性
- [ ] 无 clip 时 duration = 0，禁用播放按钮
- [ ] 播放头 seek 限制在有效范围

### 6.2 引擎适配
- [ ] `SimpleMediaEngine.duration` 支持动态更新
- [ ] 播放到末尾自动停止

## Phase 7: 测试与优化

### 7.1 功能测试
- [ ] 测试素材拖拽入轨
- [ ] 测试轨道数据持久化
- [ ] 测试播放时长限制
- [ ] 测试刷新后数据恢复
- [ ] 测试碰撞检测（拖入/移动/缩放）
- [ ] 测试视频帧预览
- [ ] 测试图片平铺预览

### 7.2 性能优化
- [ ] 素材缩略图懒加载
- [ ] 保存操作防抖
- [ ] 帧图片懒加载
- [ ] 大量素材时的虚拟滚动（可选）

## 依赖关系

```
Phase 1 (类型+存储)
    ↓
Phase 2 (碰撞检测) → Phase 3 (轨道预览)
    ↓                    ↓
Phase 4 (素材面板) ←→ Phase 5 (编辑器集成)
    ↓
Phase 6 (播放优化)
    ↓
Phase 7 (测试)
```

## 预估工作量

| Phase | 复杂度 | 文件数 |
|-------|-------|-------|
| 1     | 低    | 2     |
| 2     | 中    | 2     |
| 3     | 高    | 3     |
| 4     | 中    | 1     |
| 5     | 中    | 2     |
| 6     | 低    | 2     |
| 7     | -     | -     |

**总计**: 修改 6-8 个文件，新增 2-3 个文件/组件
