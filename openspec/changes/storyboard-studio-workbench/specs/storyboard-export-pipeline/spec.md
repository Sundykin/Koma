## ADDED Requirements

### Requirement: 分镜直出统一中间层

系统 SHALL 使用 Storyboard Manifest 和标准轨道结构作为分镜直出的统一中间层。

#### Scenario: 构建导出清单

- **WHEN** 任意分镜导出开始执行
- **THEN** 系统 SHALL 从当前 Episode 的 Shot 列表构建 Storyboard Manifest
- **AND** 每个条目 SHALL 包含分镜顺序、媒体来源、持续时间和字幕内容

#### Scenario: 构建轨道

- **WHEN** 需要导出视频或剪映草稿
- **THEN** 系统 SHALL 将 Manifest 编译为标准视频轨与字幕轨
- **AND** 缺少媒体的分镜 SHALL 被跳过或明确标识

### Requirement: 快速视频导出

系统 SHALL 支持不经过时间线编辑器的快速视频导出。

#### Scenario: 直接从分镜导出视频

- **WHEN** 用户在导出中心选择快速视频导出
- **THEN** 系统 SHALL 按分镜顺序拼接图片和视频素材
- **AND** 图片分镜 SHALL 使用静帧持续时间参与导出

### Requirement: 剪映草稿导出

系统 SHALL 支持直接从分镜导出剪映草稿。

#### Scenario: 直接生成剪映草稿目录

- **WHEN** 用户在导出中心选择剪映草稿导出
- **THEN** 系统 SHALL 生成可供剪映读取的草稿目录
- **AND** 草稿目录 SHALL 包含 `draft_content.json` 与 `draft_meta_info.json`

### Requirement: 图片序列导出

系统 SHALL 支持按分镜顺序导出图片序列。

#### Scenario: 导出图片序列

- **WHEN** 用户在导出中心选择图片序列导出
- **THEN** 系统 SHALL 导出当前有效的分镜图片
- **AND** 支持图片格式选择和超分辨率开关

### Requirement: 高级编辑器为可选路径

系统 SHALL 保留高级编辑器入口，但不将其作为默认导出前置步骤。

#### Scenario: 用户需要进一步剪辑

- **WHEN** 用户在导出中心选择高级编辑器
- **THEN** 系统 SHALL 允许用户进入时间线编辑器继续处理
- **AND** 默认导出路径 SHALL 仍然可以直接从分镜执行
