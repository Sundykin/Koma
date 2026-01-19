# media-playback Specification

## Purpose
定义媒体播放引擎的性能要求。

## ADDED Requirements

### Requirement: REQ-PLAY-PERF-001 60fps Playback
系统 MUST 在播放时保持 60fps 的流畅度。

#### Scenario: 单视频播放
Given 时间线上有一个视频片段
When 用户点击播放
Then 播放帧率 >= 60fps
And 无可感知卡顿

#### Scenario: 多轨道播放
Given 时间线上有 5 个视频轨道
When 用户点击播放
Then 播放帧率 >= 30fps
And CPU 占用 < 50%

### Requirement: REQ-PLAY-PERF-002 State Update Throttle
系统 MUST 节流状态更新，避免过度渲染。

#### Scenario: 播放时状态更新
Given 视频正在播放
When 播放引擎更新时间
Then 状态更新频率 <= 60Hz
And React 组件不会每帧重渲染

#### Scenario: UI 时间显示
Given 视频正在播放
When 时间显示组件更新
Then 更新频率 <= 30Hz
And 不影响播放流畅度

### Requirement: REQ-PLAY-PERF-003 Media Sync Tolerance
系统 MUST 使用合理的媒体同步容差。

#### Scenario: 视频时间同步
Given 视频正在播放
When 引擎时间与视频时间差 < 0.1s
Then 不执行 seek 操作
And 视频继续正常播放

#### Scenario: 视频时间偏移大
Given 视频正在播放
When 引擎时间与视频时间差 >= 0.1s
Then 执行 seek 操作
And 视频跳转到正确位置

### Requirement: REQ-PLAY-PERF-004 Visibility Culling
系统 SHALL 只渲染当前时间可见的片段。

#### Scenario: 多片段场景
Given 时间线上有 100 个片段
And 当前时间只有 3 个片段可见
When 执行渲染
Then 只渲染 3 个可见片段
And 不遍历不可见片段

### Requirement: REQ-PLAY-PERF-005 Memory Management
系统 MUST 正确管理内存，避免泄漏。

#### Scenario: 播放后停止
Given 用户播放视频后暂停
When 等待 10 秒
Then 内存占用不增长

#### Scenario: 切换项目
Given 用户打开一个项目
When 用户切换到另一个项目
Then 旧项目的媒体资源被释放
And 内存占用恢复到基线

## MODIFIED Requirements

### Requirement: REQ-ENGINE-001 RAF Loop (Modified)
系统 MUST 使用高效的 RAF 循环实现。

#### Scenario: RAF 循环运行
Given 播放引擎正在运行
When RAF 回调执行
Then 使用 performance.now() 计算 delta
And 不使用递归调用
And 暂停时正确取消 RAF
