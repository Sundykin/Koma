# 任务清单

## Phase 1: 类型定义与存储层

### 1.1 扩展类型定义
- [x] `types/editor.ts` 添加 `TimelineData` 接口
- [x] `types/editor.ts` 添加 `AssetItem` 接口（素材面板用）
- [x] `types/editor.ts` 添加 `FrameCacheMeta` 接口（帧缓存元数据）

### 1.2 持久化函数
- [x] `projectStore.ts` 添加 `loadEpisodeTimeline(projectId, episodeId)`
- [x] `projectStore.ts` 添加 `saveEpisodeTimeline(projectId, episodeId, data)`
- [ ] 实现从 shots 初始化 timeline 的兼容逻辑

## Phase 2: 轨道碰撞检测

### 2.1 碰撞检测工具函数
- [x] 创建 `utils/trackCollision.ts`
- [x] `hasCollision(clip, otherClips)` - 检测是否有碰撞
- [x] `findNextAvailablePosition(track, duration, preferredStart)` - 找空位
- [x] `resolveCollisions(clips)` - 解决碰撞（推移后续素材）

### 2.2 集成到 SimpleTimeline
- [x] `handleAssetDrop` 中调用碰撞检测
- [x] `handleMoveClip` 中调用碰撞检测
- [ ] `handleResizeClip` 中限制扩展范围 (暂不实现)

## Phase 3: 轨道预览修复

### 3.1 文件协议转换
- [x] 创建 `toKomaLocalUrl(path)` 工具函数 (`utils/urlUtils.ts`)
- [x] `SimpleTimeline.tsx` 中 Filmstrip 组件使用转换后的 URL

### 3.2 帧提取服务
- [ ] `services/ffmpegService.ts` 添加 `extractFrames(videoPath, outputDir, count)` (未来迭代)
- [ ] Electron 端实现 ffmpeg 帧提取 IPC (未来迭代)
- [ ] 帧缓存管理（按视频 hash 存储）(未来迭代)

### 3.3 Filmstrip 组件重构
- [x] 视频素材：目前使用首帧/缩略图平铺
- [x] 图片素材：原图定高平铺
- [x] 音频素材：波形图（保持现有）
- [x] 文本素材：文字预览（保持现有）

## Phase 4: 素材面板组件

### 4.1 创建 SimpleAssetPanel
- [x] 组件结构：顶部 Tab + 素材网格
- [x] Tab 分类：全部、视频、图片、音频
- [x] 素材项：缩略图 + 名称 + 来源标签
- [x] 支持 `draggable` 属性，设置拖拽数据

### 4.2 素材数据聚合
- [x] 创建 `useAssets` hook
- [x] 从 shots 提取视频/图片
- [x] 从 characters 提取角色预览
- [x] 从 scenes 提取场景图
- [x] 从 props 提取道具图
- [x] 支持用户上传素材入口（预留）

## Phase 5: 编辑器集成

### 5.1 布局调整
- [x] SimpleEditor 添加左侧 AssetPanel
- [x] 调整 flex 布局：AssetPanel(280px) + Player(flex-1) + Properties(280px)

### 5.2 数据流重构
- [x] 传递 projectId/episodeId 到 SimpleEditor
- [ ] 加载时优先读取 timeline.json，无则从 shots 初始化 (未来迭代)
- [ ] 编辑操作后自动保存（防抖 1s）(未来迭代)
- [x] 添加 `onTracksChange` 回调接口

### 5.3 拖拽处理
- [x] AssetPanel 设置拖拽数据 (Asset JSON)
- [x] Timeline 接收拖拽，调用 `onAssetDrop`

## Phase 6: 播放时长优化

### 6.1 动态时长计算
- [x] `SimpleEditor` 中 duration 改为计算属性（基于 clips 最大结束时间）
- [x] 无 clip 时 duration = 1（最小值）
- [x] 播放头 seek 限制在有效范围

### 6.2 引擎适配
- [x] 播放到末尾自动停止

## Phase 7: 测试与优化

### 7.1 功能测试
- [x] 测试素材面板显示
- [x] 测试素材拖拽入轨
- [x] 测试播放时长限制
- [ ] 测试轨道数据持久化 (需后续验证)
- [x] 测试碰撞检测（拖入）
- [x] 测试图片平铺预览

### 7.2 性能优化
- [x] 保存操作防抖（预留接口）
- [ ] 素材缩略图懒加载（未来迭代）
- [ ] 帧图片懒加载（未来迭代）
- [ ] 大量素材时的虚拟滚动（未来迭代）

## 完成状态

| Phase | 状态 | 说明 |
|-------|------|------|
| 1     | ✅ 完成 | 类型定义和持久化函数已实现 |
| 2     | ✅ 基本完成 | 碰撞检测工具已实现，已集成到 handleAssetDrop |
| 3     | ✅ 基本完成 | 文件协议转换已实现，帧提取延后 |
| 4     | ✅ 完成 | 素材面板和 useAssets hook 已实现 |
| 5     | ✅ 基本完成 | 布局已调整，自动保存延后 |
| 6     | ✅ 完成 | 播放时长限制已实现 |
| 7     | 🔄 进行中 | 基本功能可用，部分优化延后 |

## 新增文件

- `utils/urlUtils.ts` - URL 工具函数
- `utils/trackCollision.ts` - 轨道碰撞检测
- `components/editor/SimpleAssetPanel.tsx` - 素材面板组件
- `components/editor/useAssets.ts` - 素材聚合 hook

## 修改文件

- `types/editor.ts` - 新增 TimelineData, AssetItem, FrameCacheMeta 类型
- `store/projectStore.ts` - 新增 loadEpisodeTimeline, saveEpisodeTimeline
- `components/editor/SimpleEditor.tsx` - 集成素材面板、传递 projectId/episodeId
- `components/editor/SimpleTimeline.tsx` - 使用 toKomaLocalUrl
- `components/editor/index.ts` - 导出新组件
- `App.tsx` - 传递 projectId/episodeId 给 SimpleEditor
