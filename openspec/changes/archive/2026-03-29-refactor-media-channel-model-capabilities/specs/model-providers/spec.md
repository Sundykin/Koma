## MODIFIED Requirements

### Requirement: Provider Interface
系统 SHALL 定义统一的媒体渠道适配接口，而不是按单个模型配置实现 provider 接口。

#### Scenario: 实现新的媒体渠道
- **WHEN** 开发者新增一个媒体渠道
- **THEN** 必须实现渠道适配器接口并提供渠道定义
- **AND** 渠道定义 MUST 暴露共享配置 schema、模型目录和能力矩阵
- **AND** 渠道适配器 MUST 支持连接测试、标准请求执行和任务状态查询

#### Scenario: 执行模型能力
- **WHEN** 运行时请求某个模型能力
- **THEN** 渠道适配器 MUST 接收解析后的渠道配置、模型定义和能力定义
- **AND** SHALL 不再依赖“当前配置本身就是模型”的旧假设

### Requirement: Provider Registry
系统 SHALL 支持按媒体类别注册和解析渠道目录。

#### Scenario: 注册渠道定义
- **WHEN** 应用启动时
- **THEN** 系统 MUST 注册所有内置渠道定义
- **AND** 每个渠道定义 MUST 按 `llm`、`tti`、`itv`、`tts` 之一归类

#### Scenario: 获取渠道定义
- **WHEN** 需要调用模型能力时
- **THEN** 系统 MUST 先根据媒体类别、项目选择和能力类型解析出对应渠道定义
- **AND** 若没有可执行模型则 MUST 返回解析错误

### Requirement: Connection Test
系统 SHALL 支持以渠道为单位测试连接可用性。

#### Scenario: 测试渠道连接
- **WHEN** 用户点击某个渠道的「测试连接」按钮
- **THEN** 系统 MUST 使用该渠道的共享配置创建适配器
- **AND** MUST 执行渠道级测试请求
- **AND** MUST 显示成功或失败状态

### Requirement: Configuration Validation
系统 SHALL 在保存渠道配置或执行模型能力前验证配置有效性。

#### Scenario: 验证渠道共享配置
- **WHEN** 用户保存渠道配置
- **THEN** 系统 MUST 验证该渠道所需的共享字段
- **AND** MUST 验证 `baseUrl`、鉴权字段和启用状态是否满足渠道 schema

#### Scenario: 验证默认模型
- **WHEN** 用户设置某个媒体类别的默认模型
- **THEN** 系统 MUST 验证该模型属于已配置且启用的渠道
- **AND** MUST 验证该模型没有被显式禁用

### Requirement: Default Model Setting
系统 SHALL 支持按媒体类别设置默认模型。

#### Scenario: 设置默认模型
- **WHEN** 用户在某个媒体类别下点击「设为默认模型」
- **THEN** 系统 MUST 保存该类别的 `defaultChannelId + defaultModelId`
- **AND** 其他模型 SHALL 失去该类别默认标记

#### Scenario: 获取默认模型
- **WHEN** 系统需要某个媒体类别的默认能力提供方
- **THEN** MUST 返回该类别当前的默认模型选择
- **AND** 若默认模型失效则 MUST 要求用户重新选择

### Requirement: Provider Directory Consistency
系统 SHALL 按“媒体类别 / 渠道”组织实现目录，而不是按“类别 / 单个 provider 配置类型”组织。

#### Scenario: 统一目录结构
- **WHEN** 开发者新增或维护媒体渠道
- **THEN** 代码结构 MUST 以 `providers/<category>/<channel>/` 为基本单元
- **AND** 每个渠道目录 MUST 包含渠道定义、模型目录、能力映射和适配器实现

### Requirement: Project Media Provider Selection
系统 SHALL 支持项目级别的渠道模型选择。

#### Scenario: 项目配置关联
- **WHEN** 创建或编辑项目时
- **THEN** 每个媒体类别 MUST 支持保存 `channelId + modelId`
- **AND** 默认选项为「使用全局默认」

#### Scenario: 获取项目模型选择
- **WHEN** 项目需要调用媒体生成服务时
- **THEN** 系统 MUST 优先使用项目指定的渠道模型
- **AND** 若未指定则 MUST 回退到该类别的全局默认模型

### Requirement: Unified Provider Factory
系统 SHALL 提供统一的模型解析与适配器工厂。

#### Scenario: 解析媒体执行上下文
- **WHEN** 任意调用方请求执行某个媒体能力
- **THEN** 系统 MUST 通过统一解析器返回渠道定义、渠道配置、模型定义、能力定义和适配器实例
- **AND** 调用方 SHALL 不再直接调用 `getProjectTTIProvider`、`getProjectITVProvider`、`getProjectTTSProvider` 一类旧工厂

#### Scenario: 统一执行入口
- **WHEN** 调用方拿到解析后的执行上下文
- **THEN** 系统 MUST 通过标准请求接口执行对应能力
- **AND** SHALL 不再暴露依赖旧 provider 参数顺序的专用生成接口

## REMOVED Requirements

### Requirement: Multi-Model Configuration
**Reason**: 旧要求将一条配置直接等同于一个模型，无法表达“一个渠道下多个模型且能力不同”的目标结构。
**Migration**: 改为配置渠道共享连接信息，并在渠道目录中选择默认模型；旧 `llmConfigs` 结构不再保留。

### Requirement: Multi-TTI Configuration
**Reason**: 旧要求以独立配置记录承载单个 TTI 模型，和新的渠道内模型目录结构冲突。
**Migration**: 改为在 TTI 渠道下管理多个模型，旧 `ttiConfigs` 结构不再保留。

### Requirement: Multi-ITV Configuration
**Reason**: 旧要求默认每条 ITV 配置只对应一种 provider/模型，无法表达模型能力矩阵。
**Migration**: 改为在 ITV 渠道下管理多个模型及其视频能力，旧 `itvConfigs` 结构不再保留。

### Requirement: Multi-TTS Configuration
**Reason**: 旧要求默认每条 TTS 配置只对应一个 provider/模型，无法统一到渠道模型选择。
**Migration**: 改为在 TTS 渠道下管理多个模型及其音色元数据，旧 `ttsConfigs` 结构不再保留。

### Requirement: Official Providers Only
**Reason**: 新目录结构不再通过硬编码预设列表限制可见渠道范围，而是由渠道目录本身决定可用渠道。
**Migration**: 通过渠道定义控制内置渠道集合；旧“仅显示某几个预设 provider”的要求不再适用。
