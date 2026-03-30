## ADDED Requirements

### Requirement: Media Channel Catalog
系统 SHALL 为 LLM、TTI、ITV、TTS 建立统一的渠道目录，且将“渠道定义”和“用户配置”分离。

#### Scenario: 渠道定义包含模型目录
- **WHEN** 系统注册一个内置渠道或插件渠道
- **THEN** 该渠道定义 MUST 声明所属媒体类别、共享配置 schema、模型列表和创建适配器的方法
- **AND** 每个模型 MUST 作为渠道内成员存在，而不是单独作为一条配置记录存在

#### Scenario: 用户配置仅保存渠道实例信息
- **WHEN** 用户在设置中保存某个渠道
- **THEN** 系统 MUST 只保存该渠道的共享连接信息、启用状态、默认模型和必要的模型覆盖项
- **AND** 系统 SHALL 不在用户配置中重复保存完整模型能力矩阵

### Requirement: Model Capability Matrix
系统 SHALL 允许每个模型独立声明能力范围、输入契约和界面元数据。

#### Scenario: 模型声明能力范围
- **WHEN** 某个模型被注册到渠道目录中
- **THEN** 该模型 MUST 显式声明自己支持的能力类型列表
- **AND** 每项能力 MUST 关联输入契约标识、提示词编译器标识和可选的参数 schema

#### Scenario: 模型能力驱动界面裁剪
- **WHEN** 用户选择某个模型
- **THEN** 系统 MUST 只显示该模型真实支持的能力入口和表单变体
- **AND** 系统 SHALL 不暴露该模型未声明的生成模式

### Requirement: Unified Capability Resolution
系统 SHALL 通过统一解析器为任意媒体调用解析出可执行的渠道、模型和能力上下文。

#### Scenario: 项目选择优先级解析
- **WHEN** 某个工作流或界面请求执行指定媒体能力
- **THEN** 系统 MUST 优先读取项目级的 `channelId + modelId` 选择
- **AND** 项目未指定时 MUST 回退到对应媒体类别的全局默认模型

#### Scenario: 不支持能力时失败
- **WHEN** 当前选中的模型未声明所请求的能力
- **THEN** 系统 MUST 阻止执行
- **AND** MUST 返回“当前模型不支持此能力”的明确错误
- **AND** MUST 提供当前媒体类别下支持该能力的可选模型集合

### Requirement: Standard Capability Requests
系统 SHALL 为不同媒体能力提供显式的标准请求契约，调用链路必须以能力类型为入口。

#### Scenario: 视频请求声明能力类型
- **WHEN** 任意入口构建视频生成请求
- **THEN** 请求 MUST 显式声明 `video.text-to-video`、`video.image-to-video`、`video.reference-to-video` 或 `video.start-end-to-video` 中的一种
- **AND** 系统 MUST 依据该能力类型校验必填输入结构

#### Scenario: 非法输入被拒绝
- **WHEN** 某个请求的输入结构与所声明能力不匹配
- **THEN** 系统 MUST 在进入渠道适配器前拒绝该请求
- **AND** SHALL 不依赖厂商接口报错来发现模式不匹配

### Requirement: Channel Adapter Execution
系统 SHALL 要求所有渠道适配器消费统一的解析上下文和标准请求，再映射到厂商接口。

#### Scenario: 渠道适配器执行标准请求
- **WHEN** 解析器返回可执行上下文后
- **THEN** 渠道适配器 MUST 接收所选渠道配置、模型定义、能力定义和标准请求
- **AND** MUST 由适配器负责将其转换为厂商请求体、查询接口和结果映射

#### Scenario: 插件渠道复用同一契约
- **WHEN** 插件注册新的媒体渠道
- **THEN** 插件实现 MUST 使用与内置渠道相同的目录定义和适配器执行契约
- **AND** 系统 SHALL 不为插件渠道定义单独的旧式 provider 旁路
