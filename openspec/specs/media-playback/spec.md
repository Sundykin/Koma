# media-playback Specification

## Purpose
TBD - created by archiving change enhance-video-editor. Update Purpose after archive.
## Requirements
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

### Requirement: REQ-PLAY-007 Keyframe Animation
播放器 MUST 在播放时正确渲染关键帧动画效果。

#### Scenario: 播放关键帧动画
Given 片段在第 0 秒有关键帧 (scale=1)
And 片段在第 2 秒有关键帧 (scale=2)
When 播放到第 1 秒
Then 画面显示 scale=1.5（线性插值）
And 缩放效果平滑过渡

#### Scenario: 缓动曲线应用
Given 片段有两个关键帧
And 缓动设置为 ease-in-out
When 播放动画
Then 动画开始慢、中间快、结束慢
And 效果符合缓动曲线

### Requirement: REQ-PLAY-008 Seek Keyframe State
播放器 MUST 在跳转时正确计算关键帧状态。

#### Scenario: 跳转到关键帧之间
Given 片段有关键帧动画
When 用户跳转到两个关键帧之间的时间点
Then 画面正确显示插值后的状态
And 位置、缩放、旋转、透明度都正确

#### Scenario: 跳转到关键帧精确位置
Given 片段在第 3 秒有关键帧 (rotation=45)
When 用户跳转到第 3 秒
Then 画面精确显示 rotation=45

### Requirement: REQ-PLAY-009 Transform Order
播放器 MUST 按正确顺序应用变换。

#### Scenario: 标准变换顺序
Given 片段设置了 translate, rotate, scale
When 渲染该片段
Then 变换按 translate → rotate → scale 顺序应用
And 视觉效果符合预期

### Requirement: REQ-PLAY-010 Opacity Animation
播放器 MUST 支持透明度动画。

#### Scenario: 淡入效果
Given 片段在第 0 秒有关键帧 (opacity=0)
And 片段在第 1 秒有关键帧 (opacity=1)
When 播放前 1 秒
Then 片段从完全透明渐变为不透明
And 过渡平滑

