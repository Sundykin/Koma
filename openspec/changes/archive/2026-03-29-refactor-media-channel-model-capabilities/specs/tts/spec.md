## MODIFIED Requirements

### Requirement: TTS Provider Interface
系统 SHALL 支持按渠道组织的 TTS 模型目录，并通过所选模型执行语音合成。

#### Scenario: 注册 TTS 渠道
- **WHEN** 应用启动时
- **THEN** 系统 MUST 注册所有 TTS 渠道定义
- **AND** 每个渠道 MUST 暴露可选模型列表

#### Scenario: 选择 TTS 模型
- **WHEN** 用户在项目或全局设置中选择某个 TTS 模型
- **THEN** 系统 MUST 通过该模型解析语音合成请求
- **AND** SHALL 不再以单条 provider 配置直接代表最终模型

### Requirement: Voice Configuration
系统 SHALL 按所选 TTS 模型约束音色配置。

#### Scenario: 角色音色绑定
- **WHEN** 用户为角色配置语音时
- **THEN** 系统 MUST 只展示当前 TTS 模型提供的音色集合或允许的音色输入方式
- **AND** 用户设置的音速、音调和相关参数 MUST 受当前模型约束

#### Scenario: 模型切换后的音色校验
- **WHEN** 项目切换到另一个 TTS 模型
- **THEN** 系统 MUST 校验已有默认音色和角色音色是否仍然有效
- **AND** 对无效音色 MUST 提示用户重新选择或重置

### Requirement: Speech Synthesis
系统 SHALL 通过统一目录解析的 TTS 模型执行语音合成。

#### Scenario: 单句合成
- **WHEN** 用户触发分镜配音生成
- **THEN** 系统 MUST 先解析当前项目选中的 TTS 渠道模型
- **AND** MUST 使用该模型执行语音合成

#### Scenario: 多角色对话
- **WHEN** 分镜包含多角色对话时
- **THEN** 系统 MUST 在同一 TTS 模型上下文中解析角色音色
- **AND** SHALL 不再依赖旧 provider 选择逻辑切换实现

### Requirement: TTS Cache
系统 SHALL 缓存已生成的语音，并记录对应的渠道模型上下文。

#### Scenario: 缓存命中
- **WHEN** 请求相同文本、模型、音色和参数的语音
- **THEN** 系统 MUST 直接返回缓存结果
- **AND** 缓存键 MUST 包含 `channelId` 和 `modelId`

#### Scenario: 模型变化导致缓存失效
- **WHEN** 用户切换 TTS 模型或修改模型级参数
- **THEN** 系统 MUST 将不再匹配当前模型上下文的缓存视为失效
- **AND** 下次请求 MUST 重新生成
