## ADDED Requirements

### Requirement: 分镜直出视频导出

系统 SHALL 支持直接从分镜数据按顺序导出视频，无需进入时间线编辑器。

#### Scenario: 按分镜顺序拼接

- **WHEN** 用户在导出中心选择"快速视频导出"
- **THEN** 系统 SHALL 按分镜序号顺序拼接所有 Shot 的视频/图片
- **AND** 每个无视频的 Shot 使用其选中的图片作为静帧（默认 5 秒）
- **AND** 每个有视频的 Shot 使用其选中的视频素材

#### Scenario: 导出参数配置

- **WHEN** 用户选择快速视频导出
- **THEN** 系统 SHALL 提供配置选项：
  - 分辨率（720p/1080p/4K）
  - 静帧时长（默认 5 秒）
  - 是否包含 TTS 音频
  - 是否添加字幕
  - 输出格式（MP4/WebM）

#### Scenario: 导出进度

- **WHEN** 导出开始执行
- **THEN** 系统 SHALL 显示进度条和当前处理的分镜序号
- **AND** 支持取消操作
- **AND** 完成后显示导出文件路径和打开目录按钮

### Requirement: 分镜直出剪映草稿

系统 SHALL 支持直接从分镜数据生成剪映草稿，无需进入时间线编辑器。

#### Scenario: 从分镜构建剪映草稿

- **WHEN** 用户在导出中心选择"剪映草稿导出"
- **THEN** 系统 SHALL 直接从 Shot 数据构建 draft_content.json
- **AND** 每个 Shot 映射为一个剪映片段
- **AND** Shot 的视频/图片映射为素材
- **AND** Shot 的文案映射为字幕

#### Scenario: 草稿包含音频

- **WHEN** Shot 有关联的 TTS 音频
- **THEN** 系统 SHALL 将音频映射到剪映的音频轨道
- **AND** 音频时长与对应片段对齐

#### Scenario: 选择导出范围

- **WHEN** 用户配置导出选项
- **THEN** 系统 SHALL 支持选择导出范围：
  - 全部分镜
  - 当前章节
  - 手动选择的分镜范围

### Requirement: 分镜图片序列导出

系统 SHALL 支持将分镜图片按顺序导出为图片序列。

#### Scenario: 导出所有分镜图片

- **WHEN** 用户在导出中心选择"图片序列导出"
- **THEN** 系统 SHALL 按分镜序号导出所有选中的图片
- **AND** 文件名格式为 `{序号}_{章节名}.{ext}`
- **AND** 支持选择是否启用超分辨率放大

#### Scenario: 导出配置

- **WHEN** 配置图片序列导出
- **THEN** 系统 SHALL 提供选项：
  - 图片格式（PNG/JPEG）
  - 是否超分辨率（2x 放大）
  - 导出范围（全部/章节/选中）
  - 输出目录选择
