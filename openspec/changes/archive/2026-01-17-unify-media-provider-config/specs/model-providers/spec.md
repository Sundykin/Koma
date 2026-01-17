# model-providers Spec Delta

## ADDED Requirements

### Requirement: Multi-TTI Configuration
系统 SHALL 支持管理多个文生图（TTI）配置。

#### Scenario: TTI 配置数据结构
- **WHEN** 创建新的 TTI 配置时
- **THEN** 配置包含以下字段：
  - id: 唯一标识（UUID）
  - name: 用户自定义名称
  - provider: 'comfyui' | 'jimeng' | 'qwen-image' | 'midjourney' | 'dall-e' | 'flux'
  - apiKey: API 密钥（加密存储）
  - baseUrl: API 地址
  - workflowJson: ComfyUI 工作流 JSON（路径或内容）
  - workflowMapping: 节点映射配置
  - modelName: 模型名称
  - defaultSize: 默认尺寸
  - isDefault: 是否为默认配置
  - createdAt, updatedAt: 时间戳

#### Scenario: TTI 配置 CRUD
- **WHEN** 用户管理 TTI 配置时
- **THEN** 支持添加、编辑、删除操作
- **AND** 保存到 ttiConfigs 数组
- **AND** 删除时检查项目引用

### Requirement: Multi-ITV Configuration
系统 SHALL 支持管理多个图生视频（ITV）配置。

#### Scenario: ITV 配置数据结构
- **WHEN** 创建新的 ITV 配置时
- **THEN** 配置包含以下字段：
  - id: 唯一标识（UUID）
  - name: 用户自定义名称
  - provider: 'runway' | 'kling' | 'pika' | 'minimax' | 'comfyui-animatediff'
  - apiKey: API 密钥（加密存储）
  - baseUrl: API 地址
  - workflowJson: ComfyUI 工作流（AnimateDiff）
  - defaultDuration: 默认时长
  - defaultResolution: 默认分辨率
  - isDefault: 是否为默认配置

#### Scenario: ITV 配置 CRUD
- **WHEN** 用户管理 ITV 配置时
- **THEN** 支持添加、编辑、删除操作
- **AND** 保存到 itvConfigs 数组

### Requirement: Multi-TTS Configuration
系统 SHALL 支持管理多个语音合成（TTS）配置。

#### Scenario: TTS 配置数据结构
- **WHEN** 创建新的 TTS 配置时
- **THEN** 配置包含以下字段：
  - id: 唯一标识（UUID）
  - name: 用户自定义名称
  - provider: 'edge-tts' | 'openai-tts' | 'fish-audio' | 'gpt-sovits' | 'doubao-tts'
  - apiKey: API 密钥（加密存储，部分免费服务不需要）
  - baseUrl: API/服务地址
  - defaultVoice: 默认音色
  - defaultSpeed: 默认语速
  - isDefault: 是否为默认配置

#### Scenario: TTS 配置 CRUD
- **WHEN** 用户管理 TTS 配置时
- **THEN** 支持添加、编辑、删除操作
- **AND** 保存到 ttsConfigs 数组

### Requirement: Media Provider Presets
系统 SHALL 提供常见媒体服务厂商的预设配置。

#### Scenario: TTI 厂商预设
- **WHEN** 用户添加 TTI 配置时
- **THEN** 可选择预设厂商快速填充
- **AND** 包含：即梦 AI、通义万相、Midjourney、DALL-E、Flux、ComfyUI

#### Scenario: ITV 厂商预设
- **WHEN** 用户添加 ITV 配置时
- **THEN** 可选择预设厂商快速填充
- **AND** 包含：Runway Gen-3、可灵 AI、Pika、MiniMax 海螺、ComfyUI AnimateDiff

#### Scenario: TTS 厂商预设
- **WHEN** 用户添加 TTS 配置时
- **THEN** 可选择预设厂商快速填充
- **AND** 包含：Edge TTS（免费）、OpenAI TTS、豆包 TTS、Fish Audio、GPT-SoVITS

### Requirement: ComfyUI Workflow Management
系统 SHALL 支持 ComfyUI 工作流文件管理。

#### Scenario: 工作流上传
- **WHEN** 用户选择 ComfyUI 类型的 Provider
- **THEN** 可上传工作流 JSON 文件
- **AND** 系统解析并存储工作流
- **AND** 显示工作流节点列表

#### Scenario: 节点映射配置
- **WHEN** 工作流上传后
- **THEN** 系统识别输入节点（图片、正向提示词、负向提示词、种子等）
- **AND** 用户可配置节点 ID 与系统输入的映射关系
- **AND** 映射保存到 workflowMapping 字段

### Requirement: Project Media Provider Selection
系统 SHALL 支持项目级别的媒体配置选择。

#### Scenario: 项目配置关联
- **WHEN** 创建或编辑项目时
- **THEN** 可选择该项目使用的 TTI/ITV/TTS 配置
- **AND** 默认选项为「使用全局默认」
- **AND** 配置 ID 保存到项目数据

#### Scenario: 获取项目 Provider
- **WHEN** 项目需要调用媒体生成服务时
- **THEN** 优先使用项目指定的配置
- **AND** 若未指定则使用全局默认配置
- **AND** 通过工厂函数 getProjectXXXProvider(projectId) 获取

### Requirement: Unified Provider Factory
系统 SHALL 提供统一的 Provider 工厂函数。

#### Scenario: 获取 TTI Provider
- **WHEN** 调用 getProjectTTIProvider(projectId)
- **THEN** 返回项目配置或默认配置对应的 TTI Provider 实例
- **AND** Provider 实现统一的 generate(prompt, options) 接口

#### Scenario: 获取 ITV Provider
- **WHEN** 调用 getProjectITVProvider(projectId)
- **THEN** 返回项目配置或默认配置对应的 ITV Provider 实例
- **AND** Provider 实现统一的 generate(imageUrl, motionPrompt, options) 接口

#### Scenario: 获取 TTS Provider
- **WHEN** 调用 getProjectTTSProvider(projectId)
- **THEN** 返回项目配置或默认配置对应的 TTS Provider 实例
- **AND** Provider 实现统一的 synthesize(text, voiceId, options) 接口

## MODIFIED Requirements

### Requirement: Provider Interface
系统 SHALL 定义统一的模型提供者接口。

#### Scenario: 媒体 Provider 基础接口
- **WHEN** 实现新的媒体 Provider 时
- **THEN** 必须实现 MediaProvider 基础接口
- **AND** 包含 validate、testConnection 方法
- **AND** 根据类型实现对应的生成方法
