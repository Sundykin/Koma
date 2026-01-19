# Spec Delta: timeline-editing

## Added Requirements

### Requirement: REQ-TL-007 Keyframe Visualization
系统 MUST 在时间线片段上可视化显示关键帧标记。

#### Scenario: 显示关键帧菱形标记
Given 一个片段有 3 个关键帧
When 用户查看该片段
Then 片段上显示 3 个菱形标记
And 标记位置对应关键帧时间

#### Scenario: 选中关键帧
Given 片段上有关键帧标记
When 用户点击某个关键帧标记
Then 该关键帧被选中
And 属性面板显示该关键帧的属性值

### Requirement: REQ-TL-008 Keyframe Drag
系统 MUST 支持用户拖拽关键帧调整时间位置。

#### Scenario: 拖拽关键帧改变时间
Given 片段在第 2 秒有一个关键帧
When 用户拖拽该关键帧到第 4 秒位置
Then 关键帧时间更新为第 4 秒
And 动画效果相应更新

#### Scenario: 关键帧边界限制
Given 片段时长 10 秒
And 第 5 秒有一个关键帧
When 用户尝试拖拽关键帧超出片段范围
Then 关键帧停留在片段边界
And 不允许拖出片段

### Requirement: REQ-TL-009 Keyframe Context Menu
系统 SHALL 支持关键帧右键菜单操作。

#### Scenario: 删除关键帧
Given 片段有一个关键帧被选中
When 用户右键点击并选择「删除关键帧」
Then 该关键帧被删除
And 动画自动重新计算

#### Scenario: 复制关键帧
Given 片段有一个关键帧被选中
When 用户右键点击并选择「复制关键帧」
Then 关键帧属性被复制到剪贴板
And 可以粘贴到其他时间点

#### Scenario: 设置缓动曲线
Given 片段有一个关键帧被选中
When 用户右键点击并选择「缓动」子菜单
Then 显示 7 种缓动选项
And 用户可以选择一种缓动类型

### Requirement: REQ-TL-010 Drag Threshold
系统 MUST 实现拖拽阈值以区分点击和拖拽。

#### Scenario: 点击选中不触发拖拽
Given 时间线上有一个片段
When 用户点击片段但移动小于 5px
Then 片段被选中
And 不触发拖拽操作

#### Scenario: 超过阈值开始拖拽
Given 时间线上有一个片段
When 用户按住并移动超过 5px
Then 开始拖拽操作
And 显示拖拽预览

### Requirement: REQ-TL-011 Real-time Drag Preview
系统 MUST 在拖拽时提供实时位置预览。

#### Scenario: 拖拽时实时更新位置
Given 用户正在拖拽一个片段
When 用户移动鼠标
Then 片段位置实时更新
And 显示目标位置指示器

#### Scenario: 跨轨道拖拽高亮
Given 用户正在拖拽片段
When 片段移动到另一个轨道上方
Then 目标轨道显示高亮
And 释放时片段移动到该轨道

### Requirement: REQ-TL-012 Drag Performance
系统 MUST 保证拖拽交互达到 60fps 流畅体验。

#### Scenario: 拖拽不卡顿
Given 时间线上有多个片段
When 用户拖拽任意片段
Then 拖拽过程帧率保持 60fps
And 无明显卡顿或延迟

#### Scenario: 跨轨道拖拽流畅
Given 用户正在跨轨道拖拽片段
When 片段在多个轨道间移动
Then 轨道高亮切换流畅
And 片段位置更新无延迟

#### Scenario: 大量关键帧不影响性能
Given 片段有 20 个以上关键帧
When 用户拖拽该片段
Then 拖拽仍保持 60fps
And 关键帧标记渲染不卡顿
