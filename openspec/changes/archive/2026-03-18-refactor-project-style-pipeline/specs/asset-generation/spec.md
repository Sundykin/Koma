## MODIFIED Requirements
### Requirement: Consistent Style Prefix Application
所有 TTI/ITV 生成调用 MUST 统一应用项目 `styleSnapshot` 中的视觉风格前缀。

#### Scenario: Shot prompt generation uses project snapshot
- **Given** 项目包含 `styleSnapshot.ttiStylePrefix`
- **When** 生成分镜图片提示词或视频提示词
- **Then** 系统 MUST 从项目 `styleSnapshot` 读取风格前缀
- **And** 系统 SHALL 不读取 `settings.stylePrompts`

#### Scenario: Shot image generation uses project snapshot
- **Given** 项目包含 `styleSnapshot.ttiStylePrefix`
- **When** 生成分镜图片
- **Then** TTI 提示词 MUST 使用项目 `styleSnapshot.ttiStylePrefix`
- **And** 生成入口 MUST 显式透传项目风格快照

#### Scenario: Batch shot prompt generation uses project snapshot
- **Given** 项目包含 `styleSnapshot`
- **When** 批量生成分镜提示词
- **Then** 所有分镜 MUST 共享同一份项目风格快照
- **And** 批处理中 SHALL 不再从全局设置读取风格

### Requirement: Shot Rendering Workflow
系统 SHALL 在分镜渲染工作流中统一使用项目 `styleSnapshot`。

#### Scenario: Render video with project snapshot
- **WHEN** 用户渲染单个或多个分镜视频
- **THEN** 系统 MUST 将项目 `styleSnapshot` 传入渲染工作流
- **AND** workflow SHALL 使用 `styleSnapshot.ttiStylePrefix` 构建 fallback 视频提示词

## ADDED Requirements
### Requirement: Snapshot-Driven Asset Generation
所有资产生成工作流 MUST 只读取项目 `styleSnapshot` 作为风格输入。

#### Scenario: Character scene and prop generation use snapshot
- **Given** 项目包含 `styleSnapshot`
- **When** 生成角色定妆照、场景图或道具图
- **Then** 对应工作流 MUST 使用项目 `styleSnapshot.ttiStylePrefix`
- **And** 工作流 SHALL 不直接访问全局风格目录

#### Scenario: Character preview video uses snapshot
- **Given** 项目包含 `styleSnapshot`
- **When** 生成角色预览视频或道具预览视频
- **Then** ITV 提示词 MUST 使用项目 `styleSnapshot.ttiStylePrefix`
- **And** 角色/道具预览视频实现 MUST 不再使用硬编码固定风格文案

### Requirement: No Duplicate Style Injection
系统 MUST 避免在提示词生成与媒体渲染两个阶段重复追加同一风格。

#### Scenario: Render uses existing shot prompt without reapplying style
- **Given** 分镜已经存在 `imagePrompt` 或 `videoPrompt`
- **When** 用户继续执行文生图或图生视频渲染
- **Then** 渲染阶段 MUST 直接使用现有分镜提示词
- **And** 系统 SHALL 不再次在已有提示词前追加项目风格

#### Scenario: Render applies style only for fallback prompt
- **Given** 分镜不存在已定稿的图片或视频提示词
- **When** 渲染阶段回退到自动构建 prompt
- **Then** 系统 MUST 从项目 `styleSnapshot` 注入风格
- **And** 风格只在 fallback prompt 构建时应用一次
