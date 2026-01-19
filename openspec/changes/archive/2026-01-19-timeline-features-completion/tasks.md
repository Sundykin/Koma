# Tasks: timeline-features-completion

## 阶段 1：片段右键菜单（高优先级）

### 1.1 创建 ClipContextMenu 组件
- [ ] 1.1.1 创建 ClipContextMenu.tsx 组件文件
- [ ] 1.1.2 实现菜单项：删除片段
- [ ] 1.1.3 实现菜单项：复制片段
- [ ] 1.1.4 实现菜单项：添加关键帧
- [ ] 1.1.5 实现菜单项：分割片段
- [ ] 1.1.6 添加菜单样式（复用 KeyframeContextMenu 样式）
- [ ] 1.1.7 实现点击外部关闭菜单
- [ ] 1.1.8 实现 Escape 键关闭菜单

### 1.2 集成到 ClipItem
- [ ] 1.2.1 添加 onContextMenu 事件处理
- [ ] 1.2.2 计算菜单显示位置（考虑边界）
- [ ] 1.2.3 传递必要的回调函数
- [ ] 1.2.4 阻止默认右键菜单

### 1.3 更新 EnhancedTimeline
- [ ] 1.3.1 添加 contextMenu 状态
- [ ] 1.3.2 实现 handleClipContextMenu 回调
- [ ] 1.3.3 传递菜单操作回调到 TrackRow

## 阶段 2：片段复制粘贴

### 2.1 更新 trackStore
- [ ] 2.1.1 添加 clipboardItem 状态
- [ ] 2.1.2 实现 copySelectedItem 方法
- [ ] 2.1.3 实现 pasteItem 方法（在播放头位置）
- [ ] 2.1.4 实现 duplicateItem 方法（原位置右侧）

### 2.2 添加快捷键
- [ ] 2.2.1 在 useEditorShortcuts 添加 Ctrl+C 复制
- [ ] 2.2.2 在 useEditorShortcuts 添加 Ctrl+V 粘贴
- [ ] 2.2.3 在 useEditorShortcuts 添加 Ctrl+D 快速复制

### 2.3 集成到右键菜单
- [ ] 2.3.1 右键菜单"复制"调用 copySelectedItem
- [ ] 2.3.2 添加"粘贴"菜单项（当剪贴板有内容时）

## 阶段 3：关键帧快捷操作

### 3.1 K 键添加关键帧
- [ ] 3.1.1 在 useEditorShortcuts 添加 K 键监听
- [ ] 3.1.2 检查当前是否有选中片段
- [ ] 3.1.3 检查播放头是否在片段范围内
- [ ] 3.1.4 调用 addKeyframeToItem 添加关键帧
- [ ] 3.1.5 显示成功/失败提示

### 3.2 关键帧复制粘贴
- [ ] 3.2.1 添加 clipboardKeyframe 状态
- [ ] 3.2.2 实现 copySelectedKeyframe 方法
- [ ] 3.2.3 实现 pasteKeyframe 方法
- [ ] 3.2.4 在关键帧右键菜单集成复制功能

## 阶段 4：撤销/重做完善

### 4.1 重构历史记录系统
- [ ] 4.1.1 改用状态快照而非操作记录
- [ ] 4.1.2 添加 createSnapshot 方法
- [ ] 4.1.3 添加 restoreSnapshot 方法
- [ ] 4.1.4 限制快照数量（最多 50 个）

### 4.2 修复重做逻辑
- [ ] 4.2.1 重做时恢复下一个快照
- [ ] 4.2.2 新操作时清除重做栈

### 4.3 补全操作历史
- [ ] 4.3.1 moveItem 操作前保存快照
- [ ] 4.3.2 trimItemStart/End 操作前保存快照
- [ ] 4.3.3 addKeyframeToItem 操作前保存快照
- [ ] 4.3.4 removeKeyframeFromItem 操作前保存快照
- [ ] 4.3.5 updateKeyframe* 操作前保存快照

## 阶段 5：跨轨道拖拽高亮

### 5.1 轨道检测
- [ ] 5.1.1 在拖拽时使用 elementsFromPoint 检测
- [ ] 5.1.2 通过 data-track-id 获取轨道 ID
- [ ] 5.1.3 添加 dropTargetTrackId 状态

### 5.2 高亮显示
- [ ] 5.2.1 添加 isDropTarget prop 到 TrackRow
- [ ] 5.2.2 传递 dropTargetTrackId 到 TrackRow
- [ ] 5.2.3 应用 .dropTarget CSS 类

### 5.3 跨轨道移动
- [ ] 5.3.1 实现 moveItemToTrack 方法
- [ ] 5.3.2 验证目标轨道类型兼容性
- [ ] 5.3.3 拖拽结束时执行移动

## 阶段 6：工具栏增强

### 6.1 播放控制按钮
- [ ] 6.1.1 添加播放/暂停按钮
- [ ] 6.1.2 添加跳到开头按钮
- [ ] 6.1.3 添加跳到结尾按钮
- [ ] 6.1.4 显示当前时间/总时长

### 6.2 撤销/重做按钮
- [ ] 6.2.1 添加撤销按钮
- [ ] 6.2.2 添加重做按钮
- [ ] 6.2.3 根据 canUndo/canRedo 禁用按钮

## 阶段 7：验证与测试

### 7.1 功能验证
- [ ] 7.1.1 验证右键菜单所有功能
- [ ] 7.1.2 验证复制粘贴快捷键
- [ ] 7.1.3 验证 K 键添加关键帧
- [ ] 7.1.4 验证撤销/重做可靠性
- [ ] 7.1.5 验证跨轨道拖拽

### 7.2 回归测试
- [ ] 7.2.1 验证原有拖拽功能正常
- [ ] 7.2.2 验证原有裁剪功能正常
- [ ] 7.2.3 验证原有分割功能正常
- [ ] 7.2.4 验证关键帧编辑正常
