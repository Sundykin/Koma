# Tasks: playback-performance-fix

## 阶段 1：RAF 循环重构（高优先级）

### 1.1 PlaybackEngine RAF 重构
- [x] 1.1.1 将 scheduleNextFrame 改为箭头函数 `_tick`
- [x] 1.1.2 移除递归调用，改用循环内重新请求 RAF
- [x] 1.1.3 使用 delta 时间计算而非帧数累加
- [x] 1.1.4 确保暂停时正确取消 RAF

### 1.2 MediaEngine RAF 重构
- [x] 1.2.1 同样改用箭头函数
- [x] 1.2.2 修复时间累加精度问题
- [x] 1.2.3 使用 performance.now() 高精度时间

## 阶段 2：状态更新节流（高优先级）

### 2.1 节流 emitState
- [x] 2.1.1 添加上次 emit 时间记录
- [x] 2.1.2 只在时间变化超过 16ms 时触发
- [x] 2.1.3 或合并多次更新到单次 RAF

### 2.2 Player 组件优化
- [x] 2.2.1 使用 useRef 存储实时状态
- [x] 2.2.2 使用 RAF 批量更新 UI
- [x] 2.2.3 分离 TimeDisplay 组件
- [x] 2.2.4 分离 PlaybackControls 组件
- [x] 2.2.5 使用 React.memo 包装子组件

### 2.3 回调函数优化
- [x] 2.3.1 onTimeChange 节流（每 100ms）
- [x] 2.3.2 onPlayStateChange 仅状态变化时触发

## 阶段 3：渲染优化

### 3.1 轨道预排序
- [x] 3.1.1 在 loadTracks 时按 order 排序
- [x] 3.1.2 缓存排序结果 _sortedTracks
- [x] 3.1.3 render 时直接使用缓存

### 3.2 可见性剪裁
- [x] 3.2.1 实现 getVisibleClips(time) 方法
- [x] 3.2.2 返回当前时间可见的片段列表
- [x] 3.2.3 render 只渲染可见片段

### 3.3 Canvas 优化
- [x] 3.3.1 使用 save()/restore() 隔离变换
- [x] 3.3.2 复用变换矩阵计算
- [ ] 3.3.3 考虑使用 OffscreenCanvas（可选）

## 阶段 4：媒体同步优化

### 4.1 视频同步
- [x] 4.1.1 seek 阈值改为 0.1s（100ms）
- [x] 4.1.2 添加播放状态检测
- [x] 4.1.3 只在播放时执行同步
- [x] 4.1.4 视频元素设置 muted=true

### 4.2 音频同步
- [x] 4.2.1 AudioController seek 阈值改为 0.1s
- [x] 4.2.2 同步 playbackRate
- [x] 4.2.3 进入/离开片段范围自动 play/pause

## 阶段 5：内存泄漏修复

### 5.1 PlaybackEngine dispose
- [x] 5.1.1 取消 RAF
- [x] 5.1.2 移除所有事件监听
- [x] 5.1.3 清理媒体元素（不调用 load()）
- [x] 5.1.4 关闭 AudioContext（try-catch）
- [x] 5.1.5 清空 callbacks Set

### 5.2 VideoRenderer dispose
- [x] 5.2.1 清理 mediaCache
- [x] 5.2.2 释放 Canvas 引用
- [x] 5.2.3 移除事件监听

### 5.3 Player 组件清理
- [x] 5.3.1 useEffect 返回 cleanup
- [x] 5.3.2 unsubscribe onUpdate 回调
- [x] 5.3.3 engine.dispose() 调用

## 阶段 6：验证与测试

### 6.1 性能验证
- [ ] 6.1.1 测试播放时 CPU 占用（目标 < 30%）
- [ ] 6.1.2 测试播放帧率（目标 60fps）
- [ ] 6.1.3 测试长时间播放内存增长
- [ ] 6.1.4 对比 electron-egg 性能

### 6.2 功能验证
- [ ] 6.2.1 验证播放/暂停正常
- [ ] 6.2.2 验证 seek 正常
- [ ] 6.2.3 验证音视频同步
- [ ] 6.2.4 验证关键帧动画正常

### 6.3 回归测试
- [ ] 6.3.1 验证时间线拖拽正常
- [ ] 6.3.2 验证片段裁剪正常
- [ ] 6.3.3 验证导出功能正常
