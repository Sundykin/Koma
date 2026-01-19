# Timeline Editing Capability

## ADDED Requirements

### Requirement: REQ-TL-001 Clip Drag
系统 MUST 支持用户在时间线上拖拽片段改变位置。

#### Scenario: 水平拖拽片段
Given 时间线上有一个片段
When 用户拖拽片段向右移动 2 秒
Then 片段的起始时间增加 2 秒
And 片段的结束时间增加 2 秒

#### Scenario: 跨轨道拖拽片段
Given 时间线上有两个轨道
And 轨道 1 有一个片段
When 用户拖拽片段到轨道 2
Then 片段移动到轨道 2
And 保持时间位置不变

### Requirement: REQ-TL-002 Clip Trim
系统 MUST 支持用户裁剪片段的入点和出点。

#### Scenario: 裁剪片段左侧
Given 时间线上有一个 10 秒的视频片段
When 用户拖拽左侧手柄向右 2 秒
Then 片段可见时长变为 8 秒
And 片段起始位置向右移动 2 秒
And 源素材的入点（offsetL）增加 2 秒

#### Scenario: 裁剪片段右侧
Given 时间线上有一个 10 秒的视频片段
When 用户拖拽右侧手柄向左 3 秒
Then 片段可见时长变为 7 秒
And 片段结束位置不变
And 源素材的出点（offsetR）增加 3 秒

### Requirement: REQ-TL-003 Clip Split
系统 SHALL 支持用户在播放头位置分割片段。

#### Scenario: 分割视频片段
Given 时间线上有一个 10 秒的视频片段
And 播放头位于片段的第 4 秒位置
When 用户按下 S 键或点击分割按钮
Then 片段被分割为两个独立片段
And 第一个片段时长 4 秒
And 第二个片段时长 6 秒
And 两个片段紧邻无缝

### Requirement: REQ-TL-004 Snap
系统 SHALL 支持片段在拖拽时自动吸附到参考点。

#### Scenario: 吸附到播放头
Given 时间线上有一个片段
And 播放头在第 5 秒位置
When 用户拖拽片段边缘接近第 5 秒（10px 以内）
Then 片段边缘自动吸附到第 5 秒
And 显示吸附线指示

#### Scenario: 吸附到其他片段边缘
Given 时间线上有两个片段 A 和 B
And 片段 A 结束于第 5 秒
When 用户拖拽片段 B 的起始边缘接近第 5 秒
Then 片段 B 的起始自动吸附到第 5 秒
And A 和 B 无缝相邻

### Requirement: REQ-TL-005 Multi Select
系统 SHALL 支持用户选择多个片段。

#### Scenario: Ctrl 多选
Given 时间线上有 3 个片段 A, B, C
And 片段 A 已被选中
When 用户按住 Ctrl 点击片段 C
Then 片段 A 和 C 同时被选中
And 可以同时移动或删除

### Requirement: REQ-TL-006 Track Management
系统 MUST 支持用户管理轨道（添加、删除、锁定）。

#### Scenario: 添加轨道
Given 时间线有 1 个视频轨道
When 用户点击「添加轨道」按钮
Then 创建一个新的轨道
And 新轨道显示在现有轨道上方

#### Scenario: 锁定轨道
Given 时间线有一个包含片段的轨道
When 用户点击轨道头部的锁定按钮
Then 轨道显示锁定图标
And 该轨道上的片段无法被选择或修改

#### Scenario: 静音音频轨道
Given 时间线有一个音频轨道
When 用户点击轨道头部的静音按钮
Then 轨道显示静音图标
And 播放时该轨道音频不发声
