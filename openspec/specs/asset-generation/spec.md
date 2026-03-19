# asset-generation Specification

## Purpose
TBD - created by archiving change add-antd-timeline-editor. Update Purpose after archive.
## Requirements
### Requirement: Shot Confirmation
系统 SHALL 支持分镜确认状态管理。

#### Scenario: 确认分镜
- **WHEN** 用户在分镜列表中点击「确认」按钮
- **THEN** 该分镜状态变为 confirmed: true
- **AND** 显示确认状态视觉标识（绿色勾选）

#### Scenario: 取消确认
- **WHEN** 用户对已确认的分镜点击「取消确认」
- **THEN** 该分镜状态变为 confirmed: false
- **AND** 从时间线移除对应片段

#### Scenario: 批量确认
- **WHEN** 用户选择多个分镜并点击「批量确认」
- **THEN** 所有选中分镜状态变为 confirmed

### Requirement: Auto Track Population
系统 SHALL 自动将确认的分镜填充到时间线。

#### Scenario: 自动入轨
- **WHEN** 分镜被确认时
- **THEN** 系统自动在主轨道创建对应的视频片段
- **AND** 片段按分镜顺序排列
- **AND** 如果有配音，同时创建音频轨道片段

#### Scenario: 时序计算
- **WHEN** 多个分镜被确认
- **THEN** 片段按分镜列表顺序依次排列
- **AND** 每个片段的开始时间为前一片段的结束时间
- **AND** 自动扩展 duration 以容纳所有片段

### Requirement: Shot Version Control
系统 SHALL 支持分镜的版本管理。

#### Scenario: 保存 Seed
- **WHEN** 用户对某次生成结果满意
- **THEN** 可以锁定该次生成的 seed 值
- **AND** 后续重新生成时使用相同 seed

#### Scenario: 版本历史
- **WHEN** 分镜多次生成后
- **THEN** 系统保留每次生成的结果历史
- **AND** 用户可以切换回历史版本

### Requirement: Manju-DSL Protocol
系统 SHALL 使用 Manju-DSL 作为项目数据协议。

#### Scenario: DSL 结构
- **WHEN** 导出项目数据
- **THEN** 输出符合 Manju-DSL 规范的 JSON
- **AND** 包含 projectId, shots, timeline 字段
- **AND** timeline 包含 layers 数组（main_shot, overlay_char 等）

#### Scenario: DSL 导入
- **WHEN** 导入 Manju-DSL JSON 文件
- **THEN** 系统解析并恢复项目状态
- **AND** 重建时间线轨道和片段
- **AND** 恢复关键帧动画数据

#### Scenario: DSL Schema 验证
- **WHEN** 导入 DSL 文件时
- **THEN** 系统验证 JSON 结构符合 Schema
- **AND** 无效数据显示具体错误

### Requirement: Shot Rendering Workflow
系统 SHALL 在分镜渲染工作流中统一使用项目 `styleSnapshot`。

#### Scenario: Render video with project snapshot
- **WHEN** 用户渲染单个或多个分镜视频
- **THEN** 系统 MUST 将项目 `styleSnapshot` 传入渲染工作流
- **AND** workflow SHALL 使用 `styleSnapshot.ttiStylePrefix` 构建 fallback 视频提示词

### Requirement: Character Costume Photo Generation
系统 SHALL 生成包含三视图的角色定妆照。

#### Scenario: 统一生成入口
- **WHEN** 从任何入口触发角色定妆照生成
- **THEN** 统一调用 `characterAssetWorkflow.generateCostumePhoto()`
- **AND** 不再使用 `AssetGenerationService.generateCharacterImage()`
- **AND** 所有入口生成的图片都包含三视图

#### Scenario: 项目风格应用
- **WHEN** 生成任何 TTI 图片
- **THEN** 从项目配置读取 `theme` 和 `stylePrompt`
- **AND** 调用 `getThemeStylePrefix()` 获取风格前缀
- **AND** 将风格前缀添加到提示词开头

### Requirement: Shot Image Style Application
系统 SHALL 在分镜图片生成时应用项目风格。

#### Scenario: ShotGenerationService 风格应用
- **WHEN** 通过 `ShotGenerationService` 生成分镜图片
- **THEN** 接受 `theme` 和 `stylePrompt` 参数
- **AND** 在 `buildShotPrompt()` 中调用 `getThemeStylePrefix()`
- **AND** 将风格前缀添加到分镜提示词开头

### Requirement: Deprecated Service Warning
系统 SHALL 对废弃服务提供警告。

#### Scenario: AssetGenerationService 废弃标记
- **WHEN** 开发者引用 `AssetGenerationService`
- **THEN** 文件顶部有 `@deprecated` 注释说明
- **AND** 注释指向替代方案 `characterAssetWorkflow`

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

### Requirement: Prop Preview Video Generation
系统 SHALL 支持道具预览视频的生成。

#### Scenario: 生成道具预览视频
- **GIVEN** 道具已有参考图片
- **WHEN** 用户点击「生成预览视频」按钮
- **THEN** 使用道具图片 + ITV 服务生成短视频
- **AND** 显示生成进度
- **AND** 生成完成后视频保存到道具目录

#### Scenario: 预览视频播放
- **WHEN** 道具已有预览视频
- **THEN** 在属性面板显示视频缩略图
- **AND** 点击可播放视频

### Requirement: Prop Extraction API
系统 SHALL 支持通过 Sora2 API 提取道具。

#### Scenario: 调用道具提取 API
- **GIVEN** 道具已有预览视频
- **AND** 视频已上传到可访问的 URL
- **WHEN** 用户点击「提取道具」按钮
- **THEN** 调用 Sora2 的道具提取接口
- **AND** 返回的 propId 保存到道具数据的 `sora2PropId` 字段

#### Scenario: 提取失败处理
- **WHEN** 道具提取 API 调用失败
- **THEN** 显示错误信息
- **AND** 保留原有绑定状态（如有）
- **AND** 允许用户重试

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

