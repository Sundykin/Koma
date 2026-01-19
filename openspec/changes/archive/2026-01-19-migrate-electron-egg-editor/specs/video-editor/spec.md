# Video Editor

## MODIFIED Requirements

### Requirement: Timeline Performance
时间轴组件 MUST 在拖拽 Clip 时保持流畅，无明显卡顿。

#### Scenario: 拖拽 Clip 移动位置
- Given 用户在时间轴上选中一个 Clip
- When 用户拖拽该 Clip 到新位置
- Then Clip 应实时跟随鼠标移动，帧率保持 60fps

#### Scenario: 拖拽 Clip 调整时长
- Given 用户在时间轴上选中一个 Clip
- When 用户拖拽 Clip 的边缘调整时长
- Then 时长变化应实时反映，无延迟

### Requirement: Playback Smoothness
播放器 MUST 以稳定的帧率播放视频内容。

#### Scenario: 播放视频
- Given 时间轴上有视频 Clip
- When 用户点击播放按钮
- Then 视频应以 60fps 平滑播放，音视频同步

#### Scenario: Seek 跳转
- Given 视频正在播放
- When 用户点击时间轴任意位置
- Then 播放器应立即跳转到对应时间点

### Requirement: Shot Data Import
编辑器 MUST 能够导入 Shot 数据到时间轴。

#### Scenario: 导入 Shot 列表
- Given 用户有一组 Shot 数据
- When 编辑器加载这些 Shot
- Then 每个 Shot 应转换为对应的 Clip 显示在时间轴上

### Requirement: Resource Drag and Drop
用户 MUST 能够从资源面板拖放素材到时间轴。

#### Scenario: 拖放视频资源
- Given 资源面板中有视频素材
- When 用户拖拽视频到视频轨道
- Then 应在放置位置创建新的 Clip
