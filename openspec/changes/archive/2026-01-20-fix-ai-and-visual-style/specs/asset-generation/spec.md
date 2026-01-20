# Spec Delta: asset-generation

## ADDED Requirements

### Requirement: Consistent Style Prefix Application
所有TTI/ITV生成调用 MUST 统一应用项目的视觉风格前缀。

#### Scenario: Shot prompt generation uses project style
- **Given** 项目配置了视觉风格 `theme` 或 `stylePrompt`
- **When** 生成分镜提示词
- **Then** 提示词 MUST 包含对应的风格前缀
- **And** 风格前缀 SHALL 从项目配置自动读取

#### Scenario: Shot image generation uses project style
- **Given** 项目配置了视觉风格
- **When** 生成分镜图片
- **Then** TTI提示词 MUST 包含风格前缀
- **And** 系统 SHALL 使用 `tti_shot_image` 模板
- **And** `stylePrefix` 变量 MUST 被正确填充

#### Scenario: Batch shot prompt generation uses project style
- **Given** 项目配置了视觉风格
- **When** 批量生成分镜提示词
- **Then** 所有分镜提示词 MUST 包含相同的风格前缀
- **And** 风格前缀 SHALL 在批处理开始时读取一次

#### Scenario: Style prefix retrieval for custom preset
- **Given** 项目使用了自定义风格预设
- **When** 获取风格前缀
- **Then** 系统 SHALL 从自定义预设配置中读取 `ttiStylePrefix`
- **And** 如果预设不存在，系统 MUST 返回空字符串

### Requirement: Shot Prompt Service Enhancement
分镜提示词服务 MUST 自动应用项目风格。

#### Scenario: ShotPromptService reads project config
- **Given** 创建 ShotPromptService 实例时传入 projectId
- **When** 调用 `generateShotPrompt` 而未传入 stylePrefix
- **Then** 服务 SHALL 自动从项目配置读取 theme 和 stylePrompt
- **And** 系统 MUST 使用 `getThemeStylePrefix` 获取风格前缀

#### Scenario: Explicit stylePrefix overrides project config
- **Given** 调用方显式传入 stylePrefix 参数
- **When** 生成分镜提示词
- **Then** 系统 MUST 使用传入的 stylePrefix
- **And** 系统 SHALL 不从项目配置读取

### Requirement: Shot Image Generation Workflow
系统 SHALL 提供分镜图片生成工作流。

#### Scenario: Generate shot image with style
- **Given** 分镜有 description 提示词
- **And** 项目配置了视觉风格
- **When** 调用分镜图片生成
- **Then** 系统 MUST 组合风格前缀和分镜提示词
- **And** 系统 SHALL 调用TTI服务生成图片
- **And** 系统 MUST 保存图片到分镜的 imagePath

#### Scenario: Generate shot image without description
- **Given** 分镜没有 description
- **When** 尝试生成分镜图片
- **Then** 系统 MUST 提示"请先生成分镜提示词"

## Related Capabilities
- asset-generation
- script-processing
