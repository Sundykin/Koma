# Media Playback Capability

## ADDED Requirements

### Requirement: REQ-PLAY-001 Video Playback
系统 MUST 支持用户播放时间线上的视频内容。

#### Scenario: 播放视频
Given 时间线上有视频片段
And 播放头在片段起始位置
When 用户点击播放按钮
Then Canvas 渲染当前帧画面
And 播放头按实时速度移动
And 画面与时间同步更新

#### Scenario: 暂停播放
Given 视频正在播放中
When 用户点击暂停按钮
Then 播放停止
And 播放头停留在当前位置
And 画面保持当前帧

### Requirement: REQ-PLAY-002 Audio Sync
系统 MUST 确保音频与视频同步播放。

#### Scenario: 音视频同步
Given 时间线上有视频轨道和音频轨道
And 两个轨道在同一时间段有内容
When 用户播放
Then 视频画面与音频同步
And 无明显的音画不同步

#### Scenario: 多音轨混合
Given 时间线上有 3 个音频轨道同时有内容
When 用户播放
Then 3 个音频轨道同时发声
And 音量按各轨道设置混合

### Requirement: REQ-PLAY-003 Seek
系统 MUST 支持用户跳转到任意时间位置。

#### Scenario: 点击时间刻度跳转
Given 时间线正在显示
When 用户点击时间刻度尺的第 10 秒位置
Then 播放头跳转到第 10 秒
And 画面更新为第 10 秒的帧

#### Scenario: 拖拽播放头
Given 时间线正在显示
When 用户拖拽播放头
Then 画面实时更新（scrubbing）
And 释放后停留在目标位置

### Requirement: REQ-PLAY-004 Playback Rate
系统 SHALL 支持用户调整播放速率。

#### Scenario: 2 倍速播放
Given 时间线上有内容
When 用户选择 2x 播放速率
Then 视频以 2 倍速播放
And 音频以 2 倍速播放（不变调）

### Requirement: REQ-PLAY-005 Frame Step
系统 SHALL 支持用户逐帧浏览。

#### Scenario: 前进一帧
Given 播放头在某一帧
When 用户按下右箭头键
Then 播放头前进 1 帧（约 33ms @ 30fps）
And 画面更新

#### Scenario: 后退一帧
Given 播放头在某一帧
When 用户按下左箭头键
Then 播放头后退 1 帧
And 画面更新

### Requirement: REQ-PLAY-006 Canvas Rendering
播放器 MUST 使用 Canvas 合成渲染多轨道内容。

#### Scenario: 多层合成
Given 时间线有 2 个视频轨道重叠
And 上层轨道有透明度 50%
When 用户播放
Then Canvas 按层级顺序渲染
And 上层内容以 50% 透明度叠加在下层上

#### Scenario: 变换渲染
Given 一个片段设置了 scale=0.5, rotation=45
When 该片段被渲染
Then Canvas 应用缩放和旋转变换
And 显示正确的变换效果
