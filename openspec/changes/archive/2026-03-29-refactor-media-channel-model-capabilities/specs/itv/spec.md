## MODIFIED Requirements

### Requirement: ITV Provider Interface
系统 SHALL 支持按渠道组织的视频模型目录，并由模型能力矩阵决定可执行的视频生成模式。

#### Scenario: 注册视频渠道
- **WHEN** 应用启动时
- **THEN** 系统 MUST 注册所有 ITV 渠道定义
- **AND** 每个渠道 MUST 暴露多个可选模型或至少一个模型
- **AND** 每个模型 MUST 显式声明支持的 `video.*` 能力集合

#### Scenario: 选择视频模型
- **WHEN** 用户在项目或界面中选择某个视频模型
- **THEN** 系统 MUST 仅暴露该模型支持的视频生成模式
- **AND** SHALL 不再把“视频能力范围”建立在 provider 名称猜测上

### Requirement: Video Generation Parameters
系统 SHALL 根据所选模型和能力动态约束视频生成参数。

#### Scenario: 模型约束参数范围
- **WHEN** 用户配置视频时长、分辨率、比例或其他生成参数
- **THEN** 系统 MUST 只允许选择当前模型在当前能力下支持的参数值
- **AND** MUST 使用模型定义的默认参数初始化表单

#### Scenario: 切换能力清理无效参数
- **WHEN** 用户切换到不同的视频能力或不同模型
- **THEN** 系统 MUST 清理与新能力不兼容的输入和参数
- **AND** MUST 明确提示哪些字段因能力变化而失效

### Requirement: Generation Progress
系统 SHALL 显示按渠道、模型和能力区分的视频生成进度。

#### Scenario: 进度反馈
- **WHEN** 视频生成进行中
- **THEN** 系统 MUST 显示当前渠道名、模型名、能力模式和任务状态
- **AND** 对于支持的渠道 MUST 显示百分比进度

#### Scenario: 异步状态查询
- **WHEN** 渠道使用异步生成模式
- **THEN** 系统 MUST 使用该渠道定义的查询接口轮询任务状态
- **AND** 生成完成后 MUST 下载或持久化输出视频

### Requirement: Video Cache
系统 SHALL 缓存生成的视频，并记录可复现的渠道模型上下文。

#### Scenario: 版本存储
- **WHEN** 视频生成完成
- **THEN** 系统 MUST 存储本地视频文件
- **AND** MUST 记录 `channelId`、`modelId`、`capability`、提示词和关键参数

#### Scenario: 版本回溯
- **WHEN** 用户切换视频版本
- **THEN** 系统 MUST 加载对应版本的视频文件
- **AND** MUST 能显示该版本的渠道、模型和能力信息

## ADDED Requirements

### Requirement: Capability-Driven Video Generation
系统 SHALL 将视频生成拆分为显式的模型能力，而不是单一的 ITV 调用。

#### Scenario: 文生视频
- **WHEN** 选中的模型支持 `video.text-to-video`
- **THEN** 系统 MUST 允许用户仅基于提示词生成视频
- **AND** SHALL 不要求上传首图或参考图

#### Scenario: 图生视频
- **WHEN** 选中的模型支持 `video.image-to-video`
- **THEN** 系统 MUST 要求一张主图作为生成输入
- **AND** MUST 使用主图和提示词生成视频

#### Scenario: 参考生视频
- **WHEN** 选中的模型支持 `video.reference-to-video`
- **THEN** 系统 MUST 要求参考图集合输入
- **AND** MUST 按该能力的输入契约构建请求

#### Scenario: 首尾帧视频
- **WHEN** 选中的模型支持 `video.start-end-to-video`
- **THEN** 系统 MUST 要求首帧和尾帧两张图片
- **AND** MUST 生成由首帧到尾帧平滑过渡的视频

### Requirement: Capability-Aware Video Prompt Compilation
系统 SHALL 根据目标视频能力选择对应的提示词编译路径。

#### Scenario: 工作流编译视频请求
- **WHEN** 项目工作流或灵绘请求视频生成
- **THEN** 系统 MUST 先生成带有能力类型的标准视频请求
- **AND** MUST 按该能力所绑定的 prompt compiler 构建提示词和输入摘要

#### Scenario: 渠道适配器不再反推模式
- **WHEN** 视频请求进入渠道适配器
- **THEN** 适配器 MUST 直接消费已编译的能力级标准请求
- **AND** SHALL 不再通过 provider 名称或字段猜测当前生成模式

### Requirement: Vidu Channel
系统 SHALL 在新架构下接入 Vidu 作为多模型视频渠道。

#### Scenario: 渠道共享配置
- **WHEN** 用户配置 Vidu 渠道
- **THEN** 系统 MUST 允许配置 `baseUrl` 和 `apiKey`
- **AND** 系统 SHALL 以 [vidu视频渠道.md](/Users/sunmeng/workspace/Koma/vidu视频渠道.md) 作为该渠道的接口契约来源
- **AND** 鉴权头 MUST 映射为 `Authorization: Bearer {apiKey}`

#### Scenario: 本地渠道文档接口映射
- **WHEN** Vidu 渠道执行不同视频能力
- **THEN** 文生视频 MUST 映射到 `POST /vidu/v2/text2video`
- **AND** 图生视频 MUST 映射到 `POST /vidu/v2/img2video`
- **AND** 参考生视频 MUST 映射到 `POST /vidu/v2/reference2video`
- **AND** 首尾帧视频 MUST 映射到 `POST /vidu/v2/start-end2video`
- **AND** 任务查询 MUST 映射到 `GET /vidu/v2/tasks/{task_id}/creations`

#### Scenario: 模型能力过滤
- **WHEN** 用户切换到不同的 Vidu 模型
- **THEN** 系统 MUST 根据该模型的能力矩阵更新可用模式
- **AND** MUST 阻止用户在不支持某能力的模型上发起对应请求

## REMOVED Requirements

### Requirement: Image to Video Generation
**Reason**: 旧要求将视频生成默认限定为单图生视频，无法覆盖文生视频、参考生视频和首尾帧视频。
**Migration**: 改为使用 `video.text-to-video`、`video.image-to-video`、`video.reference-to-video`、`video.start-end-to-video` 四类显式能力。

### Requirement: Runway Gen-3 Provider
**Reason**: 视频厂商支持范围应由渠道目录定义，而不是在 ITV 核心规范中硬编码单个 provider requirement。
**Migration**: 若后续继续支持 Runway，应以 ITV 渠道定义和模型能力矩阵形式重新声明。

### Requirement: Kling (可灵) Provider
**Reason**: 视频厂商支持范围应由渠道目录定义，而不是在 ITV 核心规范中硬编码单个 provider requirement。
**Migration**: 若后续继续支持可灵，应以 ITV 渠道定义和模型能力矩阵形式重新声明。

### Requirement: Pika Provider
**Reason**: 视频厂商支持范围应由渠道目录定义，而不是在 ITV 核心规范中硬编码单个 provider requirement。
**Migration**: 若后续继续支持 Pika，应以 ITV 渠道定义和模型能力矩阵形式重新声明。

### Requirement: Sora2 Provider (占位)
**Reason**: 旧要求以单个 provider 占位方式描述能力，不符合新的渠道模型能力结构。
**Migration**: 若后续继续支持 Sora2，应以 ITV 渠道定义和模型能力矩阵形式重新声明。

### Requirement: ComfyUI AnimateDiff Provider
**Reason**: 旧要求将本地工作流型能力直接固化为 ITV provider requirement，不符合新的渠道目录抽象。
**Migration**: 若后续继续支持 ComfyUI 视频能力，应以 ITV 渠道定义和模型能力矩阵形式重新声明。

### Requirement: Sora2 Character Extraction API
**Reason**: 角色提取不是本次统一视频生成能力的核心 contract，继续放在 ITV 核心规范中会混淆生成能力与提取能力。
**Migration**: 如需恢复，应在后续以独立能力类型（例如 `video.character-extract`）重新建模。

### Requirement: 预览视频任务 ID 保存
**Reason**: 旧要求只围绕 Sora2 任务 ID 设计持久化字段，不适合作为通用 ITV 核心规范。
**Migration**: 通用视频任务元数据应存入统一媒体资产 metadata；特定渠道的任务引用在各自能力中单独声明。
