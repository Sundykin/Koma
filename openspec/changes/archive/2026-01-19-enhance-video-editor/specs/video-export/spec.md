# Video Export Capability

## ADDED Requirements

### Requirement: REQ-EXP-001 Export Configuration
系统 MUST 支持用户配置导出参数。

#### Scenario: 设置导出分辨率
Given 用户打开导出对话框
When 用户选择 1080p (1920x1080)
Then 预览显示目标分辨率
And 导出时按该分辨率渲染

#### Scenario: 设置导出帧率
Given 用户打开导出对话框
When 用户选择 30 fps
Then 导出时按 30 帧每秒渲染

#### Scenario: 设置导出格式
Given 用户打开导出对话框
When 用户选择 MP4 (H.264)
Then 导出文件为 .mp4 格式
And 使用 H.264 编码

### Requirement: REQ-EXP-002 Export Progress
系统 MUST 在导出过程中显示进度。

#### Scenario: 显示导出进度
Given 用户开始导出一个 60 秒的视频
When 导出进行中
Then 显示进度条（0% - 100%）
And 显示已处理时间 / 总时间
And 显示预计剩余时间

#### Scenario: 取消导出
Given 导出正在进行中
When 用户点击取消按钮
Then 导出过程中止
And 临时文件被清理
And 显示「导出已取消」提示

### Requirement: REQ-EXP-003 Export Complete
系统 MUST 在导出完成后进行正确处理。

#### Scenario: 导出成功
Given 导出正在进行
When 所有帧渲染完成
And 文件写入成功
Then 显示「导出完成」提示
And 提供「打开文件夹」按钮
And 提供「播放」按钮

#### Scenario: 导出失败
Given 导出正在进行
When FFmpeg 报告错误
Then 显示错误信息
And 临时文件被清理
And 用户可以重试

### Requirement: REQ-EXP-004 Track Composition
系统 MUST 在导出时正确合成所有轨道。

#### Scenario: 视频轨道合成
Given 时间线有 2 个视频轨道
And 轨道按 order 排序
When 导出时
Then 下层轨道先渲染
And 上层轨道覆盖在上
And 应用各片段的变换属性

#### Scenario: 音频轨道混合
Given 时间线有 3 个音频轨道
And 各轨道有不同音量设置
When 导出时
Then 所有音频轨道按音量混合
And 静音轨道不参与混合
And 输出单一音轨

#### Scenario: 关键帧动画导出
Given 一个片段有关键帧动画
And 从第 0 秒 scale=1 到第 2 秒 scale=1.5
When 导出时
Then 每一帧按插值计算变换
And 输出平滑的缩放动画
