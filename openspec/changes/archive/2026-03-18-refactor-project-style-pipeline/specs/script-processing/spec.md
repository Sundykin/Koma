## MODIFIED Requirements
### Requirement: Script to Shot List (核心)
系统 SHALL 使用项目 `styleSnapshot` 完成分镜拆解与分镜提示词生成。

#### Scenario: 分镜提示词生成使用项目快照
- **WHEN** 系统为 Shot 生成图片或视频提示词
- **THEN** 系统 MUST 从项目 `styleSnapshot.ttiStylePrefix` 读取视觉风格
- **AND** 提示词生成 SHALL 不再依赖 `settings.stylePrompts`

### Requirement: Use Global Prompt Templates
系统 SHALL 在剧本分析与分镜拆解中将项目风格快照作为模板输入的一部分。

#### Scenario: 分镜生成使用项目风格模板变量
- **WHEN** ScriptAnalysisService 或 ShotAnalysisService 执行分镜拆解
- **THEN** 模板填充 MUST 包含来自项目 `styleSnapshot.llmPromptSuffix` 的风格变量
- **AND** LLM SHALL 基于项目风格生成分镜结构与视觉描述

## ADDED Requirements
### Requirement: Snapshot-Driven Script Analysis
剧本解析相关的所有 LLM 工作流 MUST 读取项目 `styleSnapshot.llmPromptSuffix`。

#### Scenario: Character scene and prop extraction use project style
- **Given** 项目包含 `styleSnapshot.llmPromptSuffix`
- **When** 系统执行角色、场景、道具提取
- **Then** 对应 LLM Prompt MUST 注入项目风格要求
- **And** 解析服务 SHALL 不直接访问全局风格目录

#### Scenario: Shot breakdown uses project style
- **Given** 项目包含 `styleSnapshot.llmPromptSuffix`
- **When** 系统执行 AI 分镜拆解
- **Then** `shot_breakdown` 相关 Prompt MUST 注入项目风格要求
- **And** 输出的分镜结构 SHALL 与项目风格保持一致

### Requirement: Project Snapshot Is The Only Style Contract
脚本处理链路 MUST 将项目 `styleSnapshot` 视为唯一风格输入契约。

#### Scenario: Storyboard page reads project snapshot
- **Given** 用户进入分镜页面
- **When** 用户执行生成提示词、生成图片、生成视频等操作
- **Then** 页面 SHALL 从当前项目读取 `styleSnapshot`
- **And** 页面 MUST 不再读取遗留全局 `stylePrompts`
