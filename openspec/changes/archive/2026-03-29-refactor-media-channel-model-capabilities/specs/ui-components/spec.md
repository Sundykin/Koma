## MODIFIED Requirements

### Requirement: LLM Config List Component
系统 SHALL 以“渠道 + 渠道内模型”的形式展示 LLM 配置。

#### Scenario: 列表展示
- **WHEN** 用户进入设置页面的 LLM 配置选项卡
- **THEN** 系统 MUST 按渠道卡片展示所有已配置的 LLM 渠道
- **AND** 每个渠道卡片 MUST 显示共享连接状态、默认模型和该渠道内的模型列表

#### Scenario: 模型能力展示
- **WHEN** 显示某个 LLM 渠道卡片
- **THEN** 系统 MUST 在模型列表中展示该模型的能力徽标和默认标记
- **AND** SHALL 不再把每个模型渲染成独立配置对象

### Requirement: LLM Config Editor Component
系统 SHALL 提供渠道级的 LLM 配置编辑器，而不是单模型配置编辑器。

#### Scenario: 新增配置
- **WHEN** 用户点击「添加模型」或「添加渠道」按钮
- **THEN** 打开渠道配置编辑器
- **AND** 表单 MUST 包含渠道共享字段、连接测试入口和模型目录预览

#### Scenario: 模型目录预览
- **WHEN** 用户选择某个 LLM 渠道类型
- **THEN** 系统 MUST 展示该渠道内可用模型列表
- **AND** MUST 允许用户设置默认模型

### Requirement: Project LLM Selector Component
系统 SHALL 在项目设置中提供基于渠道和模型的 LLM 选择组件。

#### Scenario: 模型选择下拉框
- **WHEN** 用户打开项目设置
- **THEN** 显示按渠道分组的 LLM 模型选择器
- **AND** 选项 MUST 包含所有已启用模型和「使用全局默认」选项

#### Scenario: 显示当前配置
- **WHEN** 项目已关联某个 LLM 模型
- **THEN** 显示该模型所属渠道、模型名称和能力摘要
- **AND** 如果模型已失效，MUST 显示警告并提示重新选择

### Requirement: TTI Config Manager Component
系统 SHALL 提供按渠道组织的文生图配置管理组件。

#### Scenario: 配置列表展示
- **WHEN** 用户进入 TTI 设置页
- **THEN** 系统 MUST 以渠道卡片列表展示所有 TTI 渠道
- **AND** 每个渠道卡片 MUST 展示默认模型和模型能力徽标

#### Scenario: 配置编辑
- **WHEN** 用户点击「添加」或「编辑」按钮
- **THEN** 打开渠道配置编辑器
- **AND** MUST 显示渠道共享配置和模型目录
- **AND** 渠道若支持工作流型能力则展示对应附加配置入口

### Requirement: ITV Config Manager Component
系统 SHALL 提供按渠道组织且能力可视化的视频配置管理组件。

#### Scenario: 配置列表展示
- **WHEN** 用户进入 ITV 设置页
- **THEN** 系统 MUST 以渠道卡片列表展示所有 ITV 渠道
- **AND** 每个渠道卡片 MUST 显示 `baseUrl`、连接状态和默认视频模型

#### Scenario: 模型能力矩阵
- **WHEN** 展示某个 ITV 渠道的模型列表
- **THEN** 系统 MUST 为每个模型显示支持的文生视频、图生视频、参考生视频、首尾帧视频能力徽标
- **AND** 用户 MUST 能直接看出不同模型的能力范围

### Requirement: TTS Config Manager Component
系统 SHALL 提供按渠道组织的语音合成配置管理组件。

#### Scenario: 配置列表展示
- **WHEN** 用户进入 TTS 设置页
- **THEN** 系统 MUST 以渠道卡片列表展示所有 TTS 渠道
- **AND** 每个渠道卡片 MUST 显示默认模型和音色能力摘要

#### Scenario: 音色试听
- **WHEN** 用户配置 TTS 渠道时
- **THEN** 系统 MUST 基于当前模型提供可用音色选择和试听
- **AND** SHALL 不再脱离模型上下文展示音色列表

### Requirement: Project Media Selector Component
系统 SHALL 提供项目级的渠道模型选择组件，并按能力过滤可选项。

#### Scenario: 配置选择
- **WHEN** 在项目设置中配置媒体服务
- **THEN** 系统 MUST 显示 LLM、TTI、ITV、TTS 四个模型选择器
- **AND** 每个选择器 MUST 以渠道分组展示所有已启用模型
- **AND** 选项包含「使用全局默认」

#### Scenario: 能力过滤
- **WHEN** 某个业务动作要求特定能力
- **THEN** 选择器或入口 MUST 只显示支持该能力的模型
- **AND** SHALL 不要求用户自行判断模型是否可用

### Requirement: Storyboard Video Generation
系统 SHALL 在分镜页面提供能力感知的视频生成入口。

#### Scenario: 单个分镜视频生成
- **WHEN** 用户在分镜卡片点击视频生成按钮
- **THEN** 系统 MUST 使用 `shotRenderWorkflow` 执行完整渲染
- **AND** MUST 根据当前视频模型能力决定可执行的视频模式
- **AND** 显示渲染进度（图片 → 语音 → 视频）

#### Scenario: 导演面板渲染
- **WHEN** 用户在导演面板点击"渲染此镜头"
- **THEN** 执行完整的分镜渲染流程
- **AND** 视频部分 MUST 使用统一模型解析器和能力级请求

## ADDED Requirements

### Requirement: Capability Badges In Media Pickers
系统 SHALL 在所有媒体模型选择器中展示模型能力范围。

#### Scenario: 设置页展示能力徽标
- **WHEN** 用户浏览媒体渠道中的模型列表
- **THEN** 系统 MUST 以标签或徽标展示每个模型支持的能力集合
- **AND** ITV 模型 MUST 明确区分文生视频、图生视频、参考生视频、首尾帧视频

#### Scenario: 项目选择器展示能力徽标
- **WHEN** 用户在项目设置或业务弹窗中选择模型
- **THEN** 系统 MUST 同步展示模型能力徽标
- **AND** 当前业务所需能力 MUST 高亮显示
