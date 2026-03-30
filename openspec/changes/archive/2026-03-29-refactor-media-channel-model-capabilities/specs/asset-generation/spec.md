## MODIFIED Requirements

### Requirement: Shot Rendering Workflow
系统 SHALL 在分镜渲染工作流中统一解析所需的媒体模型能力，而不是直接依赖旧的 provider 获取逻辑。

#### Scenario: Render video with project snapshot
- **WHEN** 用户渲染单个或多个分镜视频
- **THEN** 系统 MUST 先解析当前项目选中的视频模型和所需视频能力
- **AND** MUST 将项目 `styleSnapshot` 传入对应的能力级 prompt compiler
- **AND** 若当前模型不支持所需能力则 MUST 阻止执行并提示更换模型

### Requirement: Prop Preview Video Generation
系统 SHALL 通过统一的视频能力解析生成道具预览视频。

#### Scenario: 生成道具预览视频
- **GIVEN** 道具已有参考图片
- **WHEN** 用户点击「生成预览视频」按钮
- **THEN** 系统 MUST 解析支持 `video.image-to-video` 的当前视频模型
- **AND** MUST 使用道具图片和能力级标准请求生成短视频
- **AND** 若当前模型不支持该能力则 MUST 给出明确提示

#### Scenario: 预览视频播放
- **WHEN** 道具已有预览视频
- **THEN** 在属性面板显示视频缩略图
- **AND** 点击可播放视频

### Requirement: Snapshot-Driven Asset Generation
所有资产生成工作流 MUST 在能力级请求编译阶段统一读取项目 `styleSnapshot`。

#### Scenario: Character scene and prop generation use snapshot
- **Given** 项目包含 `styleSnapshot`
- **When** 生成角色定妆照、场景图或道具图
- **Then** 对应工作流 MUST 使用项目 `styleSnapshot.ttiStylePrefix`
- **And** 工作流 SHALL 不直接访问全局风格目录

#### Scenario: Character preview video uses snapshot
- **Given** 项目包含 `styleSnapshot`
- **When** 生成角色预览视频或道具预览视频
- **Then** 视频能力级 prompt compiler MUST 使用项目 `styleSnapshot.ttiStylePrefix`
- **And** 角色/道具预览视频实现 MUST 不再使用硬编码厂商特定文案

### Requirement: No Duplicate Style Injection
系统 MUST 避免在能力级 prompt 编译与渠道映射两个阶段重复追加同一风格。

#### Scenario: Render uses existing shot prompt without reapplying style
- **Given** 分镜已经存在 `imagePrompt` 或 `videoPrompt`
- **When** 用户继续执行文生图或视频渲染
- **Then** 渲染阶段 MUST 直接使用现有提示词
- **And** 渠道适配器 SHALL 不再次为同一请求追加项目风格

#### Scenario: Render applies style only for fallback prompt
- **Given** 分镜不存在已定稿的图片或视频提示词
- **When** 渲染阶段回退到自动构建 prompt
- **Then** 系统 MUST 在能力级 prompt compiler 中注入风格
- **And** 风格只在标准请求构建时应用一次

## ADDED Requirements

### Requirement: Capability-Aware Video Workflow Routing
系统 SHALL 根据工作流可用输入自动确定所需的视频能力，并在不支持时快速失败。

#### Scenario: 分镜视频工作流解析能力
- **WHEN** 分镜视频工作流发起视频生成
- **THEN** 系统 MUST 根据工作流提供的结构化输入判定所需能力类型
- **AND** SHALL 将该能力类型传给统一解析器

#### Scenario: 工作流遇到不兼容模型
- **WHEN** 当前项目选择的视频模型不支持该工作流所需能力
- **THEN** 系统 MUST 终止该次视频生成
- **AND** MUST 提示用户选择支持该能力的模型
- **AND** SHALL 不静默降级到其他视频模式
