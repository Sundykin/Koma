## 阶段 1：基础设施层

### 1.1 FFmpeg 服务层 (Electron)
- [x] 1.1.1 创建 electron/service/FFmpegService.ts
- [x] 1.1.2 实现 FFmpeg 二进制路径检测
- [x] 1.1.3 实现任务队列机制（防止并发冲突）
- [x] 1.1.4 实现 getMediaInfo() 获取媒体元数据
- [x] 1.1.5 实现 extractFrames() 视频抽帧
- [x] 1.1.6 实现 generateWaveform() 音频波形生成
- [x] 1.1.7 实现 splitAudio() 音视频分离
- [x] 1.1.8 实现进度回调机制

### 1.2 FFmpeg IPC 通道
- [x] 1.2.1 创建 electron/controller/ffmpeg.ts IPC 控制器
- [x] 1.2.2 更新 electron/preload/index.ts 添加 ffmpeg API
- [x] 1.2.3 注册 IPC 通道：ffmpeg/getInfo, ffmpeg/extractFrames, ffmpeg/waveform, ffmpeg/split
- [x] 1.2.4 实现前端 ffmpegApi 封装

### 1.3 前端 FFmpeg 管理器
- [x] 1.3.1 创建 frontend/src/services/ffmpegManager.ts
- [x] 1.3.2 实现帧缓存管理（Map 结构）
- [x] 1.3.3 实现波形缓存管理
- [x] 1.3.4 实现资源导入流程（复制 + 分析 + 抽帧）
- [x] 1.3.5 实现缓存目录管理（temp/frames, temp/waveforms）

### 1.4 类型系统扩展
- [x] 1.4.1 创建 frontend/src/types/track.ts（轨道类型定义）
- [x] 1.4.2 创建 frontend/src/types/resource.ts（资源类型定义）
- [x] 1.4.3 创建 frontend/src/types/index.ts 导出统一类型
- [x] 1.4.4 定义 BaseTrackItem, VideoTrackItem, AudioTrackItem, ImageTrackItem, TextTrackItem
- [x] 1.4.5 定义 TrackLine, Resource, MediaInfo 接口

## 阶段 2：资源管理系统

### 2.1 资源状态管理
- [x] 2.1.1 创建 frontend/src/store/resourceStore.ts
- [x] 2.1.2 实现 resources 状态（Map<id, Resource>）
- [x] 2.1.3 实现 addResource, removeResource, updateResource
- [x] 2.1.4 实现资源状态持久化（与 projectStore 集成）

### 2.2 Sidebar 资源库重构
- [x] 2.2.1 重构 components/editor/Sidebar.tsx，集成 ResourceLibrary 组件
- [x] 2.2.2 实现 ResourceGroup 网格视图
- [x] 2.2.3 实现 ResourceItem 资源项（缩略图 + 信息）
- [x] 2.2.4 实现文件选择导入（系统文件对话框）
- [x] 2.2.5 实现拖拽文件导入（HTML5 Drag & Drop）
- [x] 2.2.6 实现资源右键菜单（删除、重命名、信息）
- [x] 2.2.7 实现资源类型过滤 Tab（全部/视频/音频/图片）
- [x] 2.2.8 实现资源搜索

### 2.3 资源预览
- [x] 2.3.1 实现视频资源缩略图显示
- [x] 2.3.2 实现音频资源波形缩略图
- [x] 2.3.3 实现图片资源缩略图
- [x] 2.3.4 实现资源悬浮预览（大图 + 元数据）
- [x] 2.3.5 实现资源拖拽到 Timeline 的预览

## 阶段 3：轨道系统重构

### 3.1 轨道状态管理
- [x] 3.1.1 创建 frontend/src/store/trackStore.ts
- [x] 3.1.2 实现 tracks: TrackLine[] 状态
- [x] 3.1.3 实现 addTrack, removeTrack, updateTrack
- [x] 3.1.4 实现 addItem, removeItem, updateItem
- [x] 3.1.5 实现 moveItem（同轨道移动）
- [x] 3.1.6 实现 moveItemToTrack（跨轨道移动）
- [x] 3.1.7 实现重叠检测算法（checkCollision）
- [x] 3.1.8 实现 addItemFromResource（从资源创建轨道项）

### 3.2 Timeline 组件拆分重构
- [x] 3.2.1 创建 components/editor/Timeline/EnhancedTimeline.tsx 主容器
- [x] 3.2.2 创建 TimelineRuler.tsx 时间刻度尺
- [x] 3.2.3 创建 TrackHeader.tsx 轨道头部（名称、锁定、静音）
- [x] 3.2.4 创建 TrackRow.tsx 轨道行（渲染片段）
- [x] 3.2.5 创建 ClipItem.tsx 片段组件
- [x] 3.2.6 创建 Playhead.tsx 播放头
- [x] 3.2.7 实现时间刻度自适应缩放
- [x] 3.2.8 创建 index.ts 统一导出

### 3.3 片段渲染
- [x] 3.3.1 创建 FilmstripRenderer.tsx（视频缩略图渲染）
- [x] 3.3.2 创建 WaveformRenderer.tsx（音频波形渲染）
- [x] 3.3.3 实现图片片段渲染（缩略图）
- [x] 3.3.4 实现文本片段渲染（文字预览）
- [x] 3.3.5 实现选中状态高亮
- [x] 3.3.6 实现关键帧标记显示（菱形）

### 3.4 拖拽交互
- [x] 3.4.1 实现片段水平拖拽（改变时间位置）
- [x] 3.4.2 实现片段跨轨道拖拽
- [x] 3.4.3 实现从 Sidebar 拖入资源
- [x] 3.4.4 实现拖拽时的预览指示器
- [x] 3.4.5 实现拖拽碰撞检测（阻止重叠）

### 3.5 裁剪交互
- [x] 3.5.1 实现左侧裁剪手柄（offsetL）
- [x] 3.5.2 实现右侧裁剪手柄（offsetR）
- [x] 3.5.3 实现分割片段功能（在播放头位置）
- [x] 3.5.4 实现裁剪时的时间提示

### 3.6 吸附系统
- [x] 3.6.1 创建 engine/SnapEngine.ts
- [x] 3.6.2 实现吸附到播放头
- [x] 3.6.3 实现吸附到其他片段边缘
- [x] 3.6.4 实现吸附阈值配置（像素）
- [x] 3.6.5 实现吸附线视觉指示

## 阶段 4：播放引擎升级

### 4.1 PlaybackEngine
- [x] 4.1.1 创建 engine/PlaybackEngine.ts
- [x] 4.1.2 实现帧精确播放控制
- [x] 4.1.3 实现播放速率控制
- [x] 4.1.4 实现媒体缓存管理
- [x] 4.1.5 实现多轨道渲染

### 4.2 增强播放器
- [x] 4.2.1 创建 components/editor/EnhancedPlayer.tsx
- [x] 4.2.2 实现 Canvas 渲染
- [x] 4.2.3 实现变换属性应用（x, y, scale, rotation, opacity）
- [x] 4.2.4 实现音量控制
- [x] 4.2.5 实现全屏预览

## 阶段 5：关键帧动画系统

### 5.1 关键帧插值器
- [x] 5.1.1 创建 engine/KeyframeInterpolator.ts
- [x] 5.1.2 实现 7 种缓动函数
- [x] 5.1.3 实现关键帧插值算法
- [x] 5.1.4 实现 interpolate(keyframes, time, defaults)

### 5.2 关键帧 UI
- [x] 5.2.1 在 ClipItem 上显示关键帧标记
- [x] 5.2.2 创建 KeyframeEditor.tsx 组件
- [x] 5.2.3 实现关键帧添加/删除
- [x] 5.2.4 实现关键帧属性编辑
- [x] 5.2.5 实现缓动类型选择

### 5.3 渲染集成
- [x] 5.3.1 更新 PlaybackEngine 支持关键帧
- [x] 5.3.2 实现动画值插值应用

## 阶段 6：导出渲染

### 6.1 导出服务
- [x] 6.1.1 创建 services/exportRenderer.ts
- [x] 6.1.2 实现离屏 Canvas 渲染
- [x] 6.1.3 实现帧序列导出
- [x] 6.1.4 实现进度回调

### 6.2 导出配置 UI
- [x] 6.2.1 创建 components/editor/ExportDialog.tsx
- [x] 6.2.2 实现分辨率选择
- [x] 6.2.3 实现帧率选择
- [x] 6.2.4 实现格式选择（mp4/webm/gif）
- [x] 6.2.5 实现质量预设
- [x] 6.2.6 实现导出路径选择

## 阶段 7：交互优化

### 7.1 快捷键
- [x] 7.1.1 创建 hooks/useEditorShortcuts.ts
- [x] 7.1.2 Space - 播放/暂停
- [x] 7.1.3 ← → - 前进/后退一帧
- [x] 7.1.4 Shift+← Shift+→ - 前进/后退10帧
- [x] 7.1.5 Delete/Backspace - 删除选中
- [x] 7.1.6 Ctrl+Z/Shift+Ctrl+Z - 撤销/重做
- [x] 7.1.7 S - 分割片段
- [x] 7.1.8 +/- - 时间线缩放
- [x] 7.1.9 Home/End - 跳转开头/结尾

### 7.2 快捷键帮助
- [x] 7.2.1 创建 components/editor/ShortcutHelp.tsx
- [x] 7.2.2 实现快捷键列表显示

### 7.3 撤销/重做
- [x] 7.3.1 在 trackStore 实现操作历史栈
- [x] 7.3.2 实现 undo/redo 函数
- [x] 7.3.3 实现历史限制（最多 50 步）

## 阶段 8：验证与测试

- [ ] 8.1 验证资源导入流程（视频/音频/图片）
- [ ] 8.2 验证拖拽到时间线功能
- [ ] 8.3 验证片段裁剪功能
- [ ] 8.4 验证吸附功能
- [ ] 8.5 验证播放同步（音视频同步）
- [ ] 8.6 验证关键帧动画
- [ ] 8.7 验证导出功能
- [ ] 8.8 验证快捷键
- [ ] 8.9 验证撤销/重做
- [ ] 8.10 性能测试（大项目、长视频）
