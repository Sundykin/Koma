## MODIFIED Requirements

### Requirement: Project Media Provider Selection
系统 SHALL 在所有媒体生成入口统一使用项目级 Provider 配置解析。

#### Scenario: Workflow entry resolves project provider first
- **When** 任意角色、场景、道具或分镜工作流触发 TTI、ITV 或 TTS
- **Then** 系统 MUST 先读取项目保存的 `ttiConfigId`、`itvConfigId`、`ttsConfigId`
- **And** 仅在对应项目字段为空时才回退到全局默认配置
- **And** UI 和 Workflow SHALL 不再分别从 `settings` 读取不同的默认媒体配置

### Requirement: Unified Provider Factory
系统 SHALL 提供统一的项目级 Provider 工厂和请求式媒体调用契约。

#### Scenario: 获取 TTI Provider
- **When** 调用项目级 TTI Provider 工厂
- **Then** 返回的 Provider MUST 接收统一的 `TTIRequest`
- **And** Provider MUST 返回 `ProviderStartResult<ImageOutput>` 或等价的统一结果语义

#### Scenario: 获取 ITV Provider
- **When** 调用项目级 ITV Provider 工厂
- **Then** 返回的 Provider MUST 接收统一的 `ITVRequest`
- **And** `ITVRequest` MUST 区分 `primaryImage` 与 `additionalReferences`
- **And** Provider MUST 返回 `ProviderStartResult<VideoOutput>` 或等价的统一结果语义

#### Scenario: 获取 TTS Provider
- **When** 调用项目级 TTS Provider 工厂
- **Then** 返回的 Provider MUST 接收统一的 `TTSRequest`
- **And** Provider MUST 返回 `ProviderStartResult<AudioOutput>` 或等价的统一结果语义

## ADDED Requirements

### Requirement: Unified Provider Task Lifecycle
系统 SHALL 对 TTI、ITV、TTS Provider 使用统一的异步任务生命周期。

#### Scenario: Async provider exposes common task snapshot
- **When** 某个 Provider 通过远程任务异步生成媒体
- **Then** start 调用 MUST 返回统一的 `taskId`
- **And** 后续状态查询 MUST 通过统一的 task snapshot 语义返回 `queued`、`running`、`succeeded` 或 `failed`
- **And** 编排层 SHALL 不依赖单个 Provider 的私有状态字段名

#### Scenario: Immediate provider still uses common orchestration
- **When** 某个 Provider 可以同步返回最终媒体结果
- **Then** start 调用 MUST 返回统一的 immediate 结果语义
- **And** 编排层仍然 SHALL 通过同一条持久化与结果绑定路径处理输出

### Requirement: Normalized Provider Asset Inputs
系统 SHALL 在 Provider 边界统一媒体输入格式。

#### Scenario: Local and transient sources are normalized before provider call
- **Given** 工作流持有本地文件路径、`blob:` URL、`data:` URL 或远程 URL
- **When** 构建 TTI 或 ITV 请求
- **Then** 系统 MUST 先把输入解析为统一的 `ProviderAssetInput`
- **And** Provider 实现 SHALL 不再直接处理本地路径字符串或 `blob:` URL

### Requirement: Plugin Provider Contract Versioning
系统 SHALL 使用 SDK 版本边界管理插件 Provider 契约。

#### Scenario: Incompatible plugin provider fails fast
- **When** 插件声明的媒体 Provider SDK 版本低于宿主要求
- **Then** 宿主 MUST 在注册阶段拒绝该 Provider
- **And** 系统 SHALL 给出清晰的版本不兼容提示
- **And** 宿主工作流 SHALL 不新增运行时兼容分支来适配旧插件
