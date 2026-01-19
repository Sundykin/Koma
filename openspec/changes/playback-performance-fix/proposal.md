# Proposal: playback-performance-fix

## Status
Draft

## Why

播放性能远不及参考项目 electron-egg，存在严重的卡顿问题。

### 根因分析

| 问题 | 位置 | 影响 |
|------|------|------|
| RAF 递归调用 | PlaybackEngine.ts:459-486 | 栈溢出风险、性能下降 |
| 每帧 setState | Player.tsx:43-46 | React 每帧重渲染整个组件 |
| 每帧 emitState | PlaybackEngine.ts:491 | 所有回调每帧触发 |
| 视频同步阈值太宽 | VideoRenderer.ts:167 | 频繁 seek 导致缓冲 |
| 每帧 reverse() | VideoRenderer.ts:94 | O(n) 排序每帧执行 |
| getDuration 每帧调用 | PlaybackEngine.ts:472 | 即使缓存也可能遍历 |

### electron-egg 的优化策略

1. **高精度时间**: `performance.now()` + delta 计算
2. **RAF 正确实现**: 箭头函数 + 单次请求
3. **可见性剪裁**: `getVisibleClips()` 只渲染可见元素
4. **Canvas 状态隔离**: `save()/restore()` 隔离变换
5. **0.1s seek 阈值**: 避免频繁跳转
6. **音视频分离**: AudioController 独立处理音频

## What Changes

### 阶段 1：RAF 循环重构

1. **改用箭头函数**
   - `_tick = (): void => { ... }` 避免 bind 开销
   - 单次 RAF 请求，循环内重新请求

2. **移除递归调用**
   - 不再调用 `scheduleNextFrame()`
   - 使用 `this.animationFrameId = requestAnimationFrame(this._tick)`

### 阶段 2：状态更新节流

1. **节流 emitState**
   - 只在时间变化超过阈值时触发
   - 或使用 RAF 合并多次更新

2. **节流 Player setState**
   - 使用 `useRef` 存储最新状态
   - 使用 `requestAnimationFrame` 批量更新
   - 或使用 `useDeferredValue`

3. **分离时间显示组件**
   - 时间显示独立组件，避免整个 Player 重渲染

### 阶段 3：渲染优化

1. **预排序轨道**
   - 在 `setTracks` 时排序一次
   - 缓存排序结果

2. **可见性剪裁**
   - 实现 `getVisibleClips(time)` 方法
   - 只渲染当前时间可见的片段

3. **Canvas 状态管理**
   - 使用 `save()/restore()` 隔离变换
   - 避免状态污染

### 阶段 4：媒体同步优化

1. **调整 seek 阈值**
   - 视频同步阈值从 100ms 改为 0.1s
   - 添加播放状态检测，只在播放时同步

2. **视频元素管理**
   - 视频静音，音频由 AudioController 处理
   - 正确设置 `playbackRate`

### 阶段 5：内存泄漏修复

1. **完善 dispose()**
   - 移除所有事件监听
   - 正确清理媒体元素
   - 添加 try-catch 处理

2. **Player 组件清理**
   - useEffect 返回 cleanup 函数
   - unsubscribe 所有事件

## Affected Files

- `frontend/src/engine/PlaybackEngine.ts`
- `frontend/src/engine/MediaEngine.ts`
- `frontend/src/engine/VideoRenderer.ts`
- `frontend/src/engine/AudioController.ts`
- `frontend/src/components/editor/Player.tsx`

## Risks

1. **回归风险** - 播放逻辑核心改动
2. **音视频同步** - 阈值调整可能影响同步精度

## Success Metrics

- 播放时 CPU 占用降低 50%+
- 播放帧率稳定 60fps
- 无可感知卡顿
- 内存泄漏归零
