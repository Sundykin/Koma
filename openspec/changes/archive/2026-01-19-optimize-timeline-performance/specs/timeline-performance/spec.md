# timeline-performance Specification

## Purpose
定义时间线编辑器的性能要求和交互优化规范。

## ADDED Requirements

### Requirement: REQ-PERF-001 Drag Threshold
系统 MUST 在用户拖拽片段时使用阈值检测，避免误触发拖拽操作。

#### Scenario: 点击不触发拖拽
Given 时间线上有一个片段
When 用户点击片段但移动距离小于 5 像素
Then 不触发拖拽操作
And 片段位置保持不变

#### Scenario: 超过阈值触发拖拽
Given 时间线上有一个片段
When 用户按下鼠标并移动超过 5 像素
Then 触发拖拽操作
And 片段跟随鼠标移动

### Requirement: REQ-PERF-002 60fps Drag
系统 MUST 在拖拽操作期间保持 60fps 的流畅度。

#### Scenario: 大量片段场景拖拽
Given 时间线上有 50 个片段
When 用户拖拽其中一个片段
Then 拖拽过程帧时间 < 16.67ms
And 无可感知的卡顿

#### Scenario: 快速拖拽
Given 用户正在拖拽片段
When 用户快速移动鼠标
Then 片段位置实时更新
And 使用 RAF 节流避免过度渲染

### Requirement: REQ-PERF-003 Track Highlight
系统 SHALL 在拖拽片段时高亮显示目标轨道。

#### Scenario: 拖拽到目标轨道
Given 用户正在拖拽片段
When 鼠标移动到另一个轨道上方
Then 目标轨道显示高亮边框
And 离开轨道时高亮消失

#### Scenario: 使用 elementsFromPoint 检测
Given 用户正在拖拽片段
When 系统检测鼠标下方元素
Then 使用 document.elementsFromPoint() API
And 通过 data-track-id 属性识别轨道

### Requirement: REQ-PERF-004 Duration Cache
系统 MUST 缓存时间线总时长计算结果，避免每帧重复计算。

#### Scenario: 播放时获取时长
Given 时间线正在播放
When 引擎每帧调用 getDuration()
Then 返回缓存的时长值
And 不遍历所有轨道和片段

#### Scenario: 片段变化后更新缓存
Given 时间线有缓存的时长值
When 用户添加、删除或移动片段
Then 缓存标记为脏（dirty）
And 下次调用时重新计算

### Requirement: REQ-PERF-005 Time Sync Tolerance
系统 SHALL 在时间同步时使用容差值，避免频繁 seek 操作。

#### Scenario: 微小时间差不触发同步
Given 引擎时间为 5.00 秒
When 外部请求同步到 5.03 秒（差值 < 0.05s）
Then 不执行 seek 操作
And 时间保持为 5.00 秒

#### Scenario: 较大时间差触发同步
Given 引擎时间为 5.00 秒
When 外部请求同步到 5.10 秒（差值 >= 0.05s）
Then 执行 seek 操作
And 时间更新为 5.10 秒

### Requirement: REQ-PERF-006 Media Cache
系统 SHALL 缓存媒体预览资源，避免重复加载。

#### Scenario: 缩略图缓存
Given 视频片段已加载缩略图
When 用户拖拽调整片段位置
Then 使用缓存的缩略图
And 不重新加载

#### Scenario: 波形图缓存
Given 音频片段已加载波形图
When 用户缩放时间线
Then 使用缓存的波形数据
And 只重绘 Canvas

## MODIFIED Requirements

### Requirement: REQ-TL-001 Clip Drag (Modified)
系统 MUST 支持用户在时间线上拖拽片段改变位置，并提供流畅的交互体验。

#### Scenario: 水平拖拽片段（性能优化）
Given 时间线上有一个片段
When 用户拖拽片段向右移动 2 秒
Then 片段的起始时间增加 2 秒
And 片段的结束时间增加 2 秒
And 拖拽过程保持 60fps

#### Scenario: 跨轨道拖拽片段（带高亮）
Given 时间线上有两个轨道
And 轨道 1 有一个片段
When 用户拖拽片段到轨道 2
Then 轨道 2 显示高亮边框
And 片段移动到轨道 2
And 保持时间位置不变
