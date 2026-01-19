## 阶段 1：关键帧引擎重构

### 1.1 数据结构更新
- [x] 1.1.1 更新 `types/track.ts` 中的 Keyframe 接口（完整属性快照模式）
- [x] 1.1.2 添加 EasingType 枚举
- [x] 1.1.3 更新 VideoTrackItem/ImageTrackItem 添加默认变换属性
- [x] 1.1.4 创建 TransformProperties 类型

### 1.2 关键帧引擎
- [x] 1.2.1 重写 `engine/keyframe.ts` 实现 getAnimatedProperties()
- [x] 1.2.2 实现 7 种缓动函数
- [x] 1.2.3 实现 addKeyframe() 函数
- [x] 1.2.4 实现 removeKeyframe() 函数
- [x] 1.2.5 实现 updateKeyframeTime() 函数
- [x] 1.2.6 实现 updateKeyframeEasing() 函数
- [x] 1.2.7 实现 autoKeyframe() 自动打帧函数

### 1.3 数据迁移
- ~~1.3.1 创建 migrateKeyframes() 函数兼容旧数据格式~~ (已移除，无需兼容旧数据)
- ~~1.3.2 在 trackStore 加载时自动迁移~~ (跳过)

## 阶段 2：Store 层更新

### 2.1 trackStore 扩展
- [x] 2.1.1 添加 addKeyframeToItem() action
- [x] 2.1.2 添加 removeKeyframeFromItem() action
- [x] 2.1.3 添加 updateKeyframeInItem() action
- [x] 2.1.4 添加 updateItemTransform() action（触发自动打帧）
- [x] 2.1.5 selectedKeyframeId 状态（在 EnhancedTimeline 本地管理）
- [x] 2.1.6 selectKeyframe 功能（在 EnhancedTimeline 实现）

## 阶段 3：属性面板

### 3.1 PropertiesPanel 组件
- [x] 3.1.1 创建 `components/editor/PropertiesPanel/index.tsx` 主组件
- [x] 3.1.2 创建 PropertyRow.tsx 单个属性行组件
- [x] 3.1.3 实现数值输入（支持拖拽调整）
- [x] 3.1.4 实现关键帧切换按钮（菱形图标）
- [x] 3.1.5 创建 styles.css 样式文件

### 3.2 缓动选择器
- [x] 3.2.1 创建 EasingPicker.tsx 组件
- [x] 3.2.2 实现缓动曲线预览（小 Canvas）
- [x] 3.2.3 实现下拉选择 7 种缓动

### 3.3 集成到 VideoEditor
- [x] 3.3.1 通过 Sidebar 集成 PropertiesPanel（已移除旧版 PropertiesPanel.tsx）
- [x] 3.3.2 连接选中片段到属性面板（通过 trackStore）
- [x] 3.3.3 实现属性变更回调（通过 trackStore actions）

## 阶段 4：关键帧 UI 可视化

### 4.1 关键帧标记
- [x] 4.1.1 创建 `Timeline/KeyframeMarker.tsx` 菱形标记组件
- [x] 4.1.2 实现点击选中关键帧
- [x] 4.1.3 实现拖拽调整关键帧时间
- [x] 4.1.4 实现时间提示（拖拽时显示）
- [x] 4.1.5 实现选中状态样式

### 4.2 关键帧右键菜单
- [x] 4.2.1 创建 KeyframeContextMenu.tsx 组件
- [x] 4.2.2 实现「删除关键帧」菜单项
- [x] 4.2.3 实现「复制关键帧」菜单项
- [x] 4.2.4 实现「设置缓动」子菜单

### 4.3 ClipItem 集成
- [x] 4.3.1 修改 ClipItem.tsx 渲染关键帧标记
- [x] 4.3.2 实现关键帧标记层级（在片段内容上方）
- [x] 4.3.3 添加关键帧相关 props 传递

## 阶段 5：拖拽交互优化

### 5.1 拖拽状态重构（参考 electron-egg）
- [x] 5.1.1 重构 DragState 接口，添加完整状态追踪
  - clipId, clip, startX, startY
  - originalStart, originalTrackId
  - currentX, currentY, isDragging
  - currentTrackId（实时检测）
- [x] 5.1.2 实现 shouldStartDrag() 阈值检测（5px）
- [x] 5.1.3 修改 EnhancedTimeline 区分点击和拖拽

### 5.2 轨道检测优化
- [x] 5.2.1 为 TrackRow 添加 data-track-id 属性
- ~~5.2.2 使用 document.elementsFromPoint() 快速检测轨道~~ (可选优化，暂跳过)
- ~~5.2.3 实现跨轨道拖拽时的轨道高亮~~ (可选优化，暂跳过)
- ~~5.2.4 添加 data-gap-order/position 属性~~ (可选优化，暂跳过)

### 5.3 实时预览
- [x] 5.3.1 实现拖拽时实时更新片段位置
- [x] 5.3.2 添加拖拽预览指示器样式
- [x] 5.3.3 实现拖拽时的时间提示 tooltip

### 5.4 关键帧拖拽
- [x] 5.4.1 添加关键帧拖拽到 dragState
- [x] 5.4.2 实现关键帧水平拖拽（调整时间）
- [x] 5.4.3 实现边界检测（不超出片段范围）

## 阶段 5.5：拖拽性能优化

### 5.5.1 RAF 节流
- [x] 实现 requestAnimationFrame 节流 mousemove 处理
- [x] 添加 latestMouseEvent 缓存最新事件
- [x] 实现 cleanup 函数取消未执行的 RAF

### 5.5.2 React 渲染优化
- [x] ClipItem 使用 memo + 精细化 arePropsEqual 比较
- [x] TrackRow 使用 memo
- [x] KeyframeMarker 使用 memo
- [x] 避免在 render 中创建新对象/函数

### 5.5.3 状态更新批处理
- ~~引入 unstable_batchedUpdates~~ (可选优化)
- [x] 合并相关状态更新减少重渲染
- [x] 使用 useCallback 缓存事件处理函数

### 5.5.4 CSS 性能优化
- ~~使用 CSS 类切换而非 inline style~~ (可选优化)
- [x] 添加 will-change 提示 GPU 加速
- ~~使用 transform 代替 left/top 定位~~ (可选优化)

### 5.5.5 关键帧缓存
- [x] 实现 sortedKeyframesCache（WeakMap）
- [x] 缓存已排序的关键帧列表
- [x] 避免重复排序开销

## 阶段 6：播放引擎修复

### 6.1 VideoRenderer 更新
- [x] 6.1.1 修改 renderClip() 集成 getAnimatedProperties()
- [x] 6.1.2 修复 Canvas 变换顺序（translate → rotate → scale）
- [x] 6.1.3 修复 opacity 应用
- [x] 6.1.4 优化媒体缓存机制

### 6.2 播放同步
- [x] 6.2.1 确保关键帧动画与播放时间同步
- [x] 6.2.2 修复跳转（seek）时的关键帧计算
- ~~6.2.3 优化帧率控制~~ (可选优化)

## 阶段 7：时间线 UI 优化

### 7.1 视觉优化
- ~~7.1.1 优化时间标尺刻度密度~~ (可选优化)
- [x] 7.1.2 优化轨道背景网格（更淡）
- [x] 7.1.3 优化片段选中样式
- [x] 7.1.4 添加关键帧菱形样式

### 7.2 交互反馈
- [x] 7.2.1 添加拖拽时的光标变化
- ~~7.2.2 添加属性修改时的视觉反馈~~ (可选优化)
- [x] 7.2.3 添加关键帧操作的提示信息

## 阶段 8：验证与测试

### 8.1 功能验证
- [ ] 8.1.1 验证关键帧添加/删除
- [ ] 8.1.2 验证关键帧拖拽调整时间
- [ ] 8.1.3 验证自动打帧机制
- [ ] 8.1.4 验证缓动曲线效果
- [ ] 8.1.5 验证属性面板编辑

### 8.2 播放验证
- [ ] 8.2.1 验证关键帧动画播放
- [ ] 8.2.2 验证多片段同时动画
- [ ] 8.2.3 验证跳转时动画状态
- [ ] 8.2.4 验证导出时动画渲染

### 8.3 兼容性验证
- ~~8.3.1 验证旧数据格式迁移~~ (无需兼容旧数据)
- [ ] 8.3.2 验证与现有功能兼容（裁剪、分割、吸附）
