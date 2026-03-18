## ADDED Requirements
### Requirement: Project Style Aware Script Generation
剧本生成相关的所有 LLM 功能 MUST 使用项目 `styleSnapshot.llmPromptSuffix`。

#### Scenario: Random script generation uses project style
- **Given** 当前项目包含 `styleSnapshot.llmPromptSuffix`
- **When** 用户触发随机生成剧本
- **Then** 系统 MUST 将项目风格要求注入随机剧本生成 Prompt
- **And** 生成结果 SHALL 与项目风格一致

#### Scenario: Generate script from idea uses project style
- **Given** 当前项目包含 `styleSnapshot.llmPromptSuffix`
- **When** 用户基于创意生成剧本
- **Then** 系统 MUST 将项目风格要求注入剧本生成 Prompt
- **And** 系统 SHALL 同时保留用户输入的题材/时长要求

#### Scenario: Polish script uses project style
- **Given** 当前项目包含 `styleSnapshot.llmPromptSuffix`
- **When** 用户触发 AI 润色
- **Then** 系统 MUST 将项目风格要求注入润色 Prompt
- **And** 润色结果 SHALL 保持项目风格一致性
