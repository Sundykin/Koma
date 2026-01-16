## 阶段 1：基础设施层

### 1.1 FFmpeg 服务层 (Electron)
- [ ] 1.1.1 创建 electron/service/FFmpegService.ts
- [ ] 1.1.2 实现 FFmpeg 二进制路径检测
- [ ] 1.1.3 实现任务队列机制（防止并发冲突）
- [ ] 1.1.4 实现 getMediaInfo() 获取媒体元数据
- [ ] 1.1.5 实现 extractFrames() 视频抽帧
- [ ] 1.1.6 实现 generateWaveform() 音频波形生成
- [ ] 1.1.7 实现 splitAudio() 音视频分离
- [ ] 1.1.8 实现进度回调机制

### 1.2 FFmpeg IPC 通道
- [ ] 1.2.1 创建 electron/controller/ffmpeg.ts IPC 控制器
- [ ] 1.2.2 创建 electron/preload/ffmpeg.ts 预加载脚本
- [ ] 1.2.3 注册 IPC 通道：ffmpeg/getInfo, ffmpeg/extractFrames, ffmpeg/waveform, ffmpeg/split
- [ ] 1.2.4 实现前端 ffmpegApi 封装

### 1.3 前端 FFmpeg 管理器
- [ ] 1.3.1 创建 frontend/src/services/ffmpegManager.ts
- [ ] 1.3.2 实现帧缓存管理（Map 结构）
- [ ] 1.3.3 实现波形缓存管理
- [ ] 1.3.4 实现资源导入流程（复制 + 分析 + 抽帧）
- [ ] 1.3.5 实现缓存目录管理（temp/frames, temp/waveforms）

### 1.4 类型系统扩展
- [ ] 1.4.1 创建 frontend/src/types/track.ts（轨道类型定义）
- [ ] 1.4.2 创建 frontend/src/types/resource.ts（资源类型定义）
- [ ] 1.4.3 更新 types.ts 导出统一类型
- [ ] 1.4.4 定义 BaseTrackItem, VideoTrackItem, AudioTrackItem, ImageTrackItem, TextTrackItem
- [ ] 1.4.5 定义 TrackLine, Resource, MediaInfo 接口

## 阶段 2：资源管理系统

### 2.1 资源状态管理
- [ ] 2.1.1 创建 frontend/src/stores/resourceStore.ts
- [ ] 2.1.2 实现 resources 状态（Map<id, Resource>）
- [ ] 2.1.3 实现 addResource, removeResource, updateResource
- [ ] 2.1.4 实现资源状态持久化（与 projectStore 集成）

### 2.2 Sidebar 资源库重构
- [ ] 2.2.1 创建 components/editor/Sidebar/Sidebar.tsx 主组件
- [ ] 2.2.2 创建 ResourceGrid.tsx 网格视图
- [ ] 2.2.3 创建 ResourceItem.tsx 资源项（缩略图 + 信息）
- [ ] 2.2.4 实现文件选择导入（系统文件对话框）
- [ ] 2.2.5 实现拖拽文件导入（HTML5 Drag & Drop）
- [ ] 2.2.6 实现资源右键菜单（删除、重命名、信息）
- [ ] 2.2.7 实现资源类型过滤 Tab（全部/视频/音频/图片）
- [ ] 2.2.8 实现资源搜索

### 2.3 资源预览
- [ ] 2.3.1 实现视频资源缩略图显示
- [ ] 2.3.2 实现音频资源波形缩略图
- [ ] 2.3.3 实现图片资源缩略图
- [ ] 2.3.4 实现资源悬浮预览（大图 + 元数据）
- [ ] 2.3.5 实现资源拖拽到 Timeline 的预览

## 阶段 3：轨道系统重构

### 3.1 轨道状态管理
- [ ] 3.1.1 创建 frontend/src/stores/trackStore.ts
- [ ] 3.1.2 实现 tracks: TrackLine[] 状态
- [ ] 3.1.3 实现 addTrack, removeTrack, updateTrack
- [ ] 3.1.4 实现 addItem, removeItem, updateItem
- [ ] 3.1.5 实现 moveItem（同轨道移动）
- [ ] 3.1.6 实现 moveItemToTrack（跨轨道移动）
- [ ] 3.1.7 实现重叠检测算法（checkOverlap）
- [ ] 3.1.8 实现自动轨道创建（当拖到空白区域时）

### 3.2 Timeline 组件拆分重构
- [ ] 3.2.1 创建 components/editor/Timeline/Timeline.tsx 主容器
- [ ] 3.2.2 创建 TimelineRuler.tsx 时间刻度尺
- [ ] 3.2.3 创建 TrackHeader.tsx 轨道头部（名称、锁定、静音）
- [ ] 3.2.4 创建 TrackRow.tsx 轨道行（渲染片段）
- [ ] 3.2.5 创建 ClipItem.tsx 片段组件
- [ ] 3.2.6 创建 Playhead.tsx 播放头
- [ ] 3.2.7 实现时间刻度自适应缩放

### 3.3 片段渲染
- [ ] 3.3.1 实现视频片段渲染（Filmstrip 缩略图）
- [ ] 3.3.2 实现音频片段渲染（波形显示）
- [ ] 3.3.3 实现图片片段渲染（缩略图）
- [ ] 3.3.4 实现文本片段渲染（文字预览）
- [ ] 3.3.5 实现选中状态高亮
- [ ] 3.3.6 实现关键帧标记显示（菱形）

### 3.4 拖拽交互
- [ ] 3.4.1 实现片段水平拖拽（改变时间位置）
- [ ] 3.4.2 实现片段跨轨道拖拽
- [ ] 3.4.3 实现从 Sidebar 拖入资源
- [ ] 3.4.4 实现拖拽时的预览指示器
- [ ] 3.4.5 实现拖拽碰撞检测（阻止重叠）

### 3.5 裁剪交互
- [ ] 3.5.1 实现左侧裁剪手柄（offsetL）
- [ ] 3.5.2 实现右侧裁剪手柄（offsetR）
- [ ] 3.5.3 实现裁剪时的时间提示
- [ ] 3.5.4 实现分割片段功能（在播放头位置）

### 3.6 吸附系统
- [ ] 3.6.1 创建 engine/SnapEngine.ts
- [ ] 3.6.2 实现吸附到播放头
- [ ] 3.6.3 实现吸附到其他片段边缘
- [ ] 3.6.4 实现吸附阈值配置（像素）
- [ ] 3.6.5 实现吸附线视觉指示

## 阶段 4：播放引擎升级

### 4.1 MediaEngine 完善
- [ ] 4.1.1 重构 engine/MediaEngine.ts
- [ ] 4.1.2 实现帧精确播放控制
- [ ] 4.1.3 实现播放速率控制（0.25x - 2x）
- [ ] 4.1.4 实现循环播放
- [ ] 4.1.5 实现选区播放（loop range）

### 4.2 VideoRenderer 完善
- [ ] 4.2.1 重构 engine/VideoRenderer.ts
- [ ] 4.2.2 实现多轨道 Canvas 合成
- [ ] 4.2.3 实现图层顺序渲染（按 track order）
- [ ] 4.2.4 实现变换属性应用（x, y, scale, rotation, opacity）
- [ ] 4.2.5 实现帧缓存预加载（预加载播放头前后的帧）
- [ ] 4.2.6 实现视频帧精确跳转

### 4.3 AudioController 完善
- [ ] 4.3.1 重构 engine/AudioController.ts
- [ ] 4.3.2 实现多音频轨道混合播放
- [ ] 4.3.3 实现音量控制
- [ ] 4.3.4 实现静音控制
- [ ] 4.3.5 实现音频与视频同步
- [ ] 4.3.6 实现音频跳转定位

### 4.4 Player 组件升级
- [ ] 4.4.1 创建 components/editor/Player/Player.tsx
- [ ] 4.4.2 创建 PlaybackControls.tsx（播放/暂停/上一帧/下一帧）
- [ ] 4.4.3 创建 VolumeControl.tsx（音量滑块）
- [ ] 4.4.4 创建 PlaybackRateSelector.tsx（速率选择）
- [ ] 4.4.5 实现全屏预览
- [ ] 4.4.6 实现拖拽 scrubbing（拖拽进度条预览）

## 阶段 5：关键帧动画系统

### 5.1 KeyframeEngine 完善
- [ ] 5.1.1 重构 engine/KeyframeEngine.ts
- [ ] 5.1.2 实现 7 种缓动函数
- [ ] 5.1.3 实现关键帧插值算法
- [ ] 5.1.4 实现 getAnimatedProperties(clip, time)
- [ ] 5.1.5 实现自动打帧（修改属性时自动创建关键帧）

### 5.2 关键帧 UI
- [ ] 5.2.1 在 ClipItem 上显示关键帧标记
- [ ] 5.2.2 实现关键帧点击选中
- [ ] 5.2.3 实现关键帧拖拽移动时间
- [ ] 5.2.4 实现关键帧右键菜单（删除、复制、修改缓动）
- [ ] 5.2.5 在 PropertiesPanel 显示关键帧列表

### 5.3 PropertiesPanel 属性面板
- [ ] 5.3.1 创建 components/editor/Properties/PropertiesPanel.tsx
- [ ] 5.3.2 创建 PropertyInput.tsx（属性输入控件）
- [ ] 5.3.3 创建 TransformEditor.tsx（位置/缩放/旋转编辑）
- [ ] 5.3.4 创建 KeyframeEditor.tsx（关键帧编辑）
- [ ] 5.3.5 实现属性配置化（根据 trackItem 类型显示不同属性）
- [ ] 5.3.6 实现关键帧模式指示（当前时间是否有帧）
- [ ] 5.3.7 实现「添加关键帧」按钮

## 阶段 6：导出渲染

### 6.1 导出配置 UI
- [ ] 6.1.1 创建导出配置弹窗组件
- [ ] 6.1.2 实现分辨率选择（720p/1080p/4K）
- [ ] 6.1.3 实现帧率选择（24/30/60 fps）
- [ ] 6.1.4 实现格式选择（mp4/webm/mov）
- [ ] 6.1.5 实现码率设置
- [ ] 6.1.6 实现导出路径选择

### 6.2 导出服务
- [ ] 6.2.1 创建 electron/service/ExportService.ts
- [ ] 6.2.2 实现轨道数据 → FFmpeg 命令转换
- [ ] 6.2.3 实现视频轨道合成
- [ ] 6.2.4 实现音频轨道混合
- [ ] 6.2.5 实现变换效果应用（通过 FFmpeg filter）
- [ ] 6.2.6 实现导出进度回调
- [ ] 6.2.7 实现导出取消功能

### 6.3 导出 IPC
- [ ] 6.3.1 创建 electron/controller/export.ts
- [ ] 6.3.2 注册 export/start, export/progress, export/cancel 通道
- [ ] 6.3.3 实现前端 exportApi 封装
- [ ] 6.3.4 实现导出进度弹窗

## 阶段 7：交互优化

### 7.1 快捷键
- [ ] 7.1.1 Space - 播放/暂停
- [ ] 7.1.2 ← → - 前进/后退一帧
- [ ] 7.1.3 Delete/Backspace - 删除选中
- [ ] 7.1.4 Ctrl+C/V - 复制/粘贴
- [ ] 7.1.5 Ctrl+Z/Shift+Ctrl+Z - 撤销/重做
- [ ] 7.1.6 S - 分割片段
- [ ] 7.1.7 K - 添加关键帧
- [ ] 7.1.8 +/- - 时间线缩放

### 7.2 撤销/重做
- [ ] 7.2.1 实现操作历史栈
- [ ] 7.2.2 实现 undo/redo 函数
- [ ] 7.2.3 记录轨道操作历史
- [ ] 7.2.4 记录属性修改历史
- [ ] 7.2.5 实现历史限制（最多 50 步）

### 7.3 右键菜单
- [ ] 7.3.1 片段右键菜单（删除、复制、分割、属性）
- [ ] 7.3.2 轨道右键菜单（删除、锁定、静音）
- [ ] 7.3.3 时间线空白区域右键（粘贴、添加轨道）

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
