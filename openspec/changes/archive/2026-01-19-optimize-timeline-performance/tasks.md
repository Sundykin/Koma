# Tasks: optimize-timeline-performance

## 阶段 1：拖拽性能优化（高优先级）

### 1.1 拖拽阈值检测
- [x] 1.1.1 定义 DRAG_THRESHOLD 常量（5px）
- [x] 1.1.2 修改 handleMouseDown 初始化 isDragging 为 false
- [x] 1.1.3 修改 handleMouseMove 计算移动距离
- [x] 1.1.4 只在距离超过阈值时设置 isDragging = true
- [x] 1.1.5 只在 isDragging 为 true 时执行拖拽逻辑

### 1.2 事件监听器优化
- [x] 1.2.1 修改 useEffect 依赖为 `[dragState?.itemId]`
- [x] 1.2.2 确保 cleanup 函数正确移除监听器
- [x] 1.2.3 使用 window 而非 document 绑定事件
- [x] 1.2.4 添加 rafId 的正确取消

### 1.3 updateSnapPoints 依赖修复
- [x] 1.3.1 从依赖数组移除 `currentTime`
- [x] 1.3.2 改为依赖 tracks.length 而非整个 tracks
- [x] 1.3.3 只在 tracks 结构变化时重算

### 1.4 RAF 节流优化
- [x] 1.4.1 使用 latestMouseEvent 缓存最新事件
- [x] 1.4.2 单个 RAF 处理所有状态更新
- [x] 1.4.3 使用 currentDragState 局部变量避免闭包问题

## 阶段 2：组件渲染优化

### 2.1 ClipItem memo 修复
- [x] 2.1.1 完善 arePropsEqual 比较函数
- [x] 2.1.2 比较 item 的关键属性而非引用
- [x] 2.1.3 忽略回调函数比较（假设稳定）
- [x] 2.1.4 添加 keyframes 数组长度比较

### 2.2 TrackRow 优化
- [x] 2.2.1 为 TrackRow 添加自定义比较函数
- [x] 2.2.2 比较 track.items 长度和关键属性
- [x] 2.2.3 比较选中状态相关属性

### 2.3 回调函数缓存
- [x] 2.3.1 EnhancedTimeline 中回调已使用 useCallback
- [x] 2.3.2 ClipItem 内部回调已使用 useCallback
- [ ] 2.3.3 使用 useCallback 包装关键帧相关回调（可选优化）
- [ ] 2.3.4 使用 ref 存储最新状态避免依赖（可选优化）

### 2.4 renderPreview 优化
- [ ] 2.4.1 使用 useMemo 缓存 FilmstripRenderer（可选优化）
- [ ] 2.4.2 使用 useMemo 缓存 WaveformRenderer（可选优化）
- [ ] 2.4.3 使用 useMemo 缓存 renderKeyframes（可选优化）

## 阶段 3：播放引擎优化

### 3.1 getDuration 缓存
- [x] 3.1.1 添加 _cachedDuration 私有属性
- [x] 3.1.2 添加 _durationDirty 标志
- [x] 3.1.3 修改 loadTracks 设置 dirty 标志
- [x] 3.1.4 修改 getDuration 使用缓存
- [x] 3.1.5 添加 invalidateDuration 方法

### 3.2 MediaEngine 实现
- [ ] 3.2.1 创建 engine/MediaEngine.ts（可选，现有 PlaybackEngine 已够用）
- [ ] 3.2.2 实现 play/pause/seek 方法
- [ ] 3.2.3 实现 performance.now() 高精度时间
- [ ] 3.2.4 实现事件系统（on/off/emit）
- [ ] 3.2.5 实现单例模式 getMediaEngine()

### 3.3 时间同步容差
- [x] 3.3.1 在 seekFrame 方法添加 0.05s 容差
- [x] 3.3.2 添加 SYNC_TOLERANCE 静态常量
- [x] 3.3.3 避免微小差异触发同步

### 3.4 集成到 Player
- [ ] 3.4.1 修改 Player 使用 MediaEngine（可选）
- [ ] 3.4.2 连接 timeUpdate 事件到 onTimeChange（可选）
- [ ] 3.4.3 修改 EnhancedPlayer 使用 MediaEngine（可选）
- [ ] 3.4.4 确保播放/暂停状态同步（可选）

## 阶段 4：媒体加载优化

### 4.1 FilmstripRenderer 缓存
- [x] 4.1.1 添加帧缓存 Map（resourceId:source → frames）
- [x] 4.1.2 使用 useMemo 缓存 thumbnails 计算
- [x] 4.1.3 只在 source/resourceId 变化时重加载
- [x] 4.1.4 修复 duration 依赖导致的重加载

### 4.2 WaveformRenderer 优化
- [x] 4.2.1 添加波形路径缓存（resourceId → path）
- [x] 4.2.2 添加图片缓存（path → HTMLImageElement）
- [x] 4.2.3 分离波形加载和绘制逻辑
- [ ] 4.2.4 使用 OffscreenCanvas（可选）

## 阶段 5：功能补全

### 5.1 elementsFromPoint 查询
- [x] 5.1.1 确保 TrackRow 有 data-track-id 属性（已存在）
- [ ] 5.1.2 修改拖拽检测使用 elementsFromPoint（可选）
- [ ] 5.1.3 移除 CSS 选择器查询（可选）

### 5.2 轨道高亮反馈
- [ ] 5.2.1 添加 isDropTarget prop 到 TrackRow（可选）
- [ ] 5.2.2 在拖拽时计算目标轨道（可选）
- [x] 5.2.3 添加 .dropTarget CSS 样式
- [ ] 5.2.4 拖拽结束时清除高亮（可选）

### 5.3 间隙拖放（可选）
- [ ] 5.3.1 添加 data-gap-order/position 属性
- [ ] 5.3.2 检测拖放到间隙位置
- [ ] 5.3.3 创建新轨道并移动片段

## 阶段 6：验证与测试

### 6.1 性能验证
- [ ] 6.1.1 测试 50 片段场景拖拽帧率
- [ ] 6.1.2 测试播放时 CPU 占用
- [ ] 6.1.3 测试内存泄漏情况
- [ ] 6.1.4 测试快速缩放响应

### 6.2 功能验证
- [ ] 6.2.1 验证拖拽阈值生效
- [ ] 6.2.2 验证跨轨道拖拽正确
- [ ] 6.2.3 验证播放/暂停同步
- [ ] 6.2.4 验证 seek 容差生效
- [ ] 6.2.5 验证轨道高亮显示

### 6.3 回归测试
- [ ] 6.3.1 验证裁剪功能正常
- [ ] 6.3.2 验证分割功能正常
- [ ] 6.3.3 验证吸附功能正常
- [ ] 6.3.4 验证关键帧功能正常
