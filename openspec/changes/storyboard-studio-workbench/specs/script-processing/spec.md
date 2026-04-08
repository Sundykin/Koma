## MODIFIED Requirements

### Requirement: Script Input

系统 SHALL 将剧本输入和处理整合到分镜工作台右侧的引导式工作流中。

#### Scenario: 工作台内导入剧本

- **WHEN** 用户在分镜工作台打开剧本工作室
- **THEN** 系统 SHALL 支持粘贴文本和导入 `.txt` / `.md` / `.srt` 文件
- **AND** 导入结果 SHALL 在同一工作流中继续精炼和拆分

### Requirement: Shot Generation with Preview

系统 SHALL 保留分镜生成预览，并在确认后直接写入当前 Episode。

#### Scenario: 预览后应用

- **WHEN** 用户完成剧本拆分并确认结果
- **THEN** 系统 SHALL 允许用户选择 append 或 replace
- **AND** 结果 SHALL 直接写回分镜列表

## ADDED Requirements

### Requirement: 渐进式剧本工作流

系统 SHALL 提供逐步推进的剧本处理流程，而不是一次性黑盒生成。

#### Scenario: 剧本处理步骤

- **WHEN** 用户在剧本工作室中推进流程
- **THEN** 系统 SHALL 提供导入、精炼、章节划分、拆分分镜、确认应用等步骤
- **AND** 每一步 SHALL 能看到当前草稿结果

#### Scenario: 中间结果可重试

- **WHEN** 用户对某一步中间结果不满意
- **THEN** 系统 SHALL 允许在该步骤重新执行
- **AND** 不强制用户从头开始整个工作流
