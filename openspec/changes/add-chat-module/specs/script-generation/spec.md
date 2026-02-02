# script-generation Specification Delta

## Purpose
修改随机剧本生成逻辑，简化为一步直接生成。

## MODIFIED Requirements

### Requirement: Random Script Generation
系统 SHALL 提供随机剧本生成功能，用户可以一键让AI随机生成完整剧本。

#### Scenario: User clicks random generate button
- **Given** 用户在剧本工作室界面
- **When** 用户点击"随机生成剧本"按钮
- **Then** 系统 SHALL 调用 LLM 直接生成完整随机剧本
- **And** 剧本包含随机生成的主题、风格、角色和情节
- **And** 生成过程 MUST 显示进度提示
- **And** 生成完成后剧本 SHALL 自动填充到编辑器
- **And** 返回结果包含剧本文本和创意元数据

#### Scenario: Random generation with LLM not configured
- **Given** 用户未配置LLM模型
- **When** 用户点击"随机生成剧本"按钮
- **Then** 系统 MUST 显示错误提示"未配置 LLM 模型"

#### Scenario: Random generation fails
- **Given** LLM调用失败（网络错误、API错误等）
- **When** 生成过程出错
- **Then** 系统 MUST 显示具体错误信息
- **And** 用户 SHALL 可以重试

---

## ADDED Requirements

### Requirement: Random Script Generation Template
系统 MUST 提供随机剧本生成的 Prompt 模板。

#### Scenario: Template available in prompt templates
- **Given** 系统启动
- **When** 加载 Prompt 模板
- **Then** `random_script_generation` 模板 MUST 可用
- **And** 模板直接输出完整剧本
- **And** 剧本开头包含元数据注释（主题、风格、关键元素）

#### Scenario: Template output format
- **Given** 调用随机剧本生成
- **When** LLM 返回结果
- **Then** 结果包含完整剧本文本
- **And** 剧本格式符合项目标准（场景、对话、动作描述）

---

## REMOVED Requirements

### Requirement: Random Idea Generation Template
~~系统 MUST 提供随机创意生成的 Prompt 模板。~~

> **移除原因**: 随机创意生成已合并到随机剧本生成中，不再需要单独的创意生成步骤。
