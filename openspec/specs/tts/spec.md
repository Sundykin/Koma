# tts Specification

## Purpose
TBD - updated by archiving change refactor-media-channel-model-capabilities. Refine Purpose after archive.

## Requirements

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

#### Scenario: 批量合成
- **WHEN** 用户触发批量配音生成
- **THEN** 系统按序处理多个分镜的配音
- **AND** 显示整体进度
- **AND** 支持取消操作

#### Scenario: 多角色对话
- **WHEN** 分镜包含多角色对话时
- **THEN** 系统 MUST 在同一 TTS 模型上下文中解析角色音色
- **AND** SHALL 不再依赖旧 provider 选择逻辑切换实现

### Requirement: Audio Processing
系统 SHALL 支持音频后处理。

#### Scenario: 静音填充
- **WHEN** 生成配音后
- **THEN** 可在句首/句尾添加静音间隔
- **AND** 默认句尾 0.3s 静音

#### Scenario: 音量标准化
- **WHEN** 合成音频后
- **THEN** 自动进行音量标准化
- **AND** 确保不同分镜音量一致

### Requirement: Edge TTS Provider
系统 SHALL 支持 Microsoft Edge TTS（免费）。

#### Scenario: 音色列表
- **WHEN** 选择 Edge TTS Provider
- **THEN** 提供预置的音色列表
- **AND** 包括中文音色（晓晓、云希、云扬等）
- **AND** 支持多语言音色

#### Scenario: 调用方式
- **WHEN** 调用 Edge TTS
- **THEN** 使用 edge-tts 库或 API
- **AND** 不需要 API Key

### Requirement: OpenAI TTS Provider
系统 SHALL 支持 OpenAI TTS API。

#### Scenario: 配置
- **WHEN** 选择 OpenAI TTS Provider
- **THEN** 需要配置 API Key
- **AND** 可选择 tts-1 或 tts-1-hd 模型
- **AND** 可选择音色（alloy, echo, fable, onyx, nova, shimmer）

### Requirement: Fish Audio Provider
系统 SHALL 支持 Fish Audio TTS 服务。

#### Scenario: 配置
- **WHEN** 选择 Fish Audio Provider
- **THEN** 需要配置 API Key
- **AND** 支持自定义音色模型 ID
- **AND** 支持克隆音色

### Requirement: GPT-SoVITS Provider (本地)
系统 SHALL 支持本地部署的 GPT-SoVITS。

#### Scenario: 配置
- **WHEN** 选择 GPT-SoVITS Provider
- **THEN** 需要配置本地服务地址（如 http://localhost:9880）
- **AND** 支持自定义参考音频
- **AND** 支持角色模型切换

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
