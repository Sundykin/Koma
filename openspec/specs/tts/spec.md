# tts Specification

## Purpose
TBD - created by archiving change add-antd-timeline-editor. Update Purpose after archive.
## Requirements
### Requirement: TTS Provider Interface
系统 SHALL 支持多种 TTS 服务提供商。

#### Scenario: Provider 注册
- **WHEN** 应用启动时
- **THEN** 系统注册所有内置 TTS Provider
- **AND** 包括：Edge TTS、OpenAI TTS、Fish Audio、GPT-SoVITS

#### Scenario: Provider 切换
- **WHEN** 用户在设置中选择不同的 TTS Provider
- **THEN** 系统切换到对应的语音合成服务
- **AND** 保留各 Provider 的独立配置

### Requirement: Voice Configuration
系统 SHALL 支持语音参数配置。

#### Scenario: 角色音色绑定
- **WHEN** 用户为角色配置语音时
- **THEN** 可选择音色（voice ID）
- **AND** 可设置语速（0.5x - 2.0x）
- **AND** 可设置音调偏移
- **AND** 配置保存到角色数据中

#### Scenario: 默认音色
- **WHEN** 角色未配置音色时
- **THEN** 使用项目默认音色
- **AND** 用户可在项目设置中修改默认值

### Requirement: Speech Synthesis
系统 SHALL 支持将文本转换为语音。

#### Scenario: 单句合成
- **WHEN** 用户触发分镜配音生成
- **THEN** 系统提取分镜的 dialogue 文本
- **AND** 调用 TTS Provider 生成音频
- **AND** 返回音频文件路径或 base64 数据

#### Scenario: 批量合成
- **WHEN** 用户触发批量配音生成
- **THEN** 系统按序处理多个分镜的配音
- **AND** 显示整体进度
- **AND** 支持取消操作

#### Scenario: 多角色对话
- **WHEN** 分镜包含多角色对话时
- **THEN** 系统识别对话归属的角色
- **AND** 使用对应角色的音色生成
- **AND** 合并为单个音频文件（可选）

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
系统 SHALL 缓存已生成的语音。

#### Scenario: 缓存命中
- **WHEN** 请求相同文本+音色+参数的语音
- **THEN** 直接返回缓存的音频文件
- **AND** 避免重复调用 API

#### Scenario: 缓存失效
- **WHEN** 用户修改文本或音色配置
- **THEN** 标记原缓存为失效
- **AND** 下次请求重新生成

