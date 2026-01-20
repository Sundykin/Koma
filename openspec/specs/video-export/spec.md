# video-export Specification

## Purpose
TBD - created by archiving change enhance-video-editor. Update Purpose after archive.
## Requirements
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

### Requirement: Draft Export Framework

The system SHALL provide an extensible draft export framework that supports exporting timeline data to various video editing software formats.

#### Scenario: Exporter registration and discovery

- **WHEN** the application initializes
- **THEN** the system registers all available draft exporters
- **AND** the export dialog can query available export formats

#### Scenario: Adding a new export format

- **WHEN** a developer implements a new DraftExporter
- **AND** registers it with the ExporterRegistry
- **THEN** the new format becomes available in the export dialog
- **AND** no changes are required to existing code

### Requirement: Coordinate System Abstraction

The system SHALL abstract coordinate system transformations to support different software conventions without modifying the editor's internal data structures.

#### Scenario: Editor coordinate preservation

- **WHEN** exporting timeline data
- **THEN** the original Track and Clip data remains unchanged
- **AND** all transformations are applied during the export process

#### Scenario: Target software coordinate conversion

- **WHEN** exporting to a target format
- **THEN** the system uses the appropriate CoordinateTransformer for that format
- **AND** position, scale, rotation, opacity, and time values are correctly converted

### Requirement: Jianying Draft Export

The system SHALL support exporting the timeline as a Jianying (CapCut) draft folder.

#### Scenario: Export timeline to Jianying draft

- **WHEN** user selects "Jianying Draft" format in the export dialog
- **AND** specifies a draft name and output directory
- **THEN** the system creates a draft folder containing:
  - `draft_content.json` with timeline data
  - `draft_meta_info.json` with metadata
- **AND** all video/audio/text clips are mapped to Jianying segments
- **AND** clip positions are converted from pixels to half-canvas units
- **AND** time values are converted from seconds to microseconds

#### Scenario: Material path handling

- **WHEN** exporting to Jianying draft
- **THEN** the system uses absolute file paths for all materials
- **AND** optionally copies material files to the draft folder if user enables the option

### Requirement: Export Format Selection

The export dialog SHALL allow users to choose between video export and draft export formats.

#### Scenario: Format selection in export dialog

- **WHEN** user opens the export dialog
- **THEN** the system displays available export types (Video, Draft)
- **AND** for Draft type, shows available formats from ExporterRegistry

#### Scenario: Format-specific options

- **WHEN** user selects a draft export format
- **THEN** the system displays format-specific options
- **AND** for Jianying: draft name, output directory, copy materials option

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

