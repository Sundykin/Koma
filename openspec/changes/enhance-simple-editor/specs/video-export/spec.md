## MODIFIED Requirements

### Requirement: REQ-EXP-001 Export Configuration
系统 MUST 支持用户配置导出参数，并使用 FFmpeg 进行视频合成。

#### Scenario: 设置导出分辨率
- **WHEN** 用户打开导出对话框
- **WHEN** 用户选择 1080p (1920x1080)
- **THEN** 预览显示目标分辨率
- **AND** 导出时按该分辨率渲染

#### Scenario: 设置导出帧率
- **WHEN** 用户打开导出对话框
- **WHEN** 用户选择 30 fps
- **THEN** 导出时按 30 帧每秒渲染

#### Scenario: 设置导出格式
- **WHEN** 用户打开导出对话框
- **WHEN** 用户选择 MP4 (H.264)
- **THEN** 导出文件为 .mp4 格式
- **AND** 使用 H.264 编码

#### Scenario: 选择输出路径
- **WHEN** 用户打开导出对话框
- **THEN** 可以选择输出文件路径
- **AND** 默认使用项目目录

## ADDED Requirements

### Requirement: FFmpeg Video Composition
系统 MUST 使用 FFmpeg 将时间线轨道合成为视频文件。

#### Scenario: 逐帧渲染
- **WHEN** 用户开始导出
- **THEN** 系统逐帧渲染时间线内容到 Canvas
- **AND** 每帧导出为 PNG 图片
- **AND** 图片序列保存到临时目录

#### Scenario: 音频提取
- **WHEN** 时间线包含音频/视频素材
- **THEN** 提取所有音轨
- **AND** 按音量设置混合多轨道音频
- **AND** 输出为临时音频文件

#### Scenario: FFmpeg 合成命令
- **WHEN** 图片序列和音频准备完成
- **THEN** 调用 FFmpeg 合成视频
- **AND** 使用用户选择的编码参数
- **AND** 合并图片序列和音频

#### Scenario: 临时文件清理
- **WHEN** 导出完成或取消
- **THEN** 清理临时目录中的图片序列
- **AND** 清理临时音频文件
