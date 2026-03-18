# script-generation Specification

## Purpose
TBD - created by archiving change fix-ai-and-visual-style. Update Purpose after archive.
## Requirements
### Requirement: Random Script Generation
系统 SHALL 提供随机剧本生成功能，用户可以一键让AI随机生成完整剧本。

#### Scenario: User clicks random generate button
- **Given** 用户在剧本工作室界面
- **When** 用户点击"随机生成剧本"按钮
- **Then** 系统 SHALL 调用LLM生成随机创意（主题、风格、关键元素）
- **And** 系统 SHALL 基于生成的创意自动生成完整剧本
- **And** 生成过程 MUST 显示进度提示
- **And** 生成完成后剧本 SHALL 自动填充到编辑器

#### Scenario: Random generation with LLM not configured
- **Given** 用户未配置LLM模型
- **When** 用户点击"随机生成剧本"按钮
- **Then** 系统 MUST 显示错误提示"未配置 LLM 模型"

#### Scenario: Random generation fails
- **Given** LLM调用失败（网络错误、API错误等）
- **When** 生成过程出错
- **Then** 系统 MUST 显示具体错误信息
- **And** 用户 SHALL 可以重试

### Requirement: Random Idea Generation Template
系统 MUST 提供随机创意生成的 Prompt 模板。

#### Scenario: Template available in prompt templates
- **Given** 系统启动
- **When** 加载 Prompt 模板
- **Then** `random_idea_generation` 模板 MUST 可用
- **And** 模板输出格式 SHALL 为包含 topic、style、keyElements、logline 的 JSON

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

