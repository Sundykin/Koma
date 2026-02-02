# Spec Delta: media-playback

## Added Requirements

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
