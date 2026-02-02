# model-providers Specification

## Purpose
TBD - created by archiving change add-antd-timeline-editor. Update Purpose after archive.
## Requirements
### Requirement: Provider Interface
系统 SHALL 定义统一的模型提供者接口。

#### Scenario: 媒体 Provider 基础接口
- **WHEN** 实现新的媒体 Provider 时
- **THEN** 必须实现 MediaProvider 基础接口
- **AND** 包含 validate、testConnection 方法
- **AND** 根据类型实现对应的生成方法

### Requirement: Provider Registry
系统 SHALL 支持动态注册和切换模型提供者。

#### Scenario: 注册提供者
- **WHEN** 应用启动时
- **THEN** 系统注册所有内置提供者（Gemini, OpenAI, ComfyUI）

#### Scenario: 获取提供者
- **WHEN** 需要调用模型能力时
- **THEN** 根据当前配置的 provider 类型获取对应实例
- **AND** 如果配置无效则抛出错误

### Requirement: Gemini Provider
系统 SHALL 支持 Google Gemini API 调用。

#### Scenario: 文本生成
- **WHEN** 调用 generateText 方法
- **THEN** 使用 @google/genai SDK 发送请求
- **AND** 返回生成的文本内容

#### Scenario: 图片生成
- **WHEN** 调用 generateImage 方法
- **THEN** 使用 Gemini 图片生成模型
- **AND** 返回 base64 编码的图片数据

### Requirement: OpenAI Provider
系统 SHALL 支持 OpenAI API 调用。

#### Scenario: 文本生成
- **WHEN** 调用 generateText 方法
- **THEN** 使用 OpenAI Chat Completions API
- **AND** 返回 assistant 消息内容

#### Scenario: 图片生成
- **WHEN** 调用 generateImage 方法
- **THEN** 使用 DALL-E API
- **AND** 返回图片 URL 或 base64 数据

### Requirement: Connection Test
系统 SHALL 支持测试模型连接可用性。

#### Scenario: 测试连接
- **WHEN** 用户点击「测试连接」按钮
- **THEN** 系统向 API 发送简单测试请求
- **AND** 显示成功或失败状态
- **AND** 失败时显示错误信息

### Requirement: Configuration Validation
系统 SHALL 在使用前验证配置有效性。

#### Scenario: 验证配置
- **WHEN** 保存配置或调用模型前
- **THEN** 系统验证必填字段（apiKey, modelName）
- **AND** 验证 baseUrl 格式（openai-compatible 必填）
- **AND** 验证 name 字段不为空且不重复
- **AND** 无效时显示具体错误

### Requirement: Multi-Model Configuration
系统 SHALL 支持管理多个 LLM 模型配置。

#### Scenario: 配置数据结构
- **WHEN** 创建新的 LLM 配置时
- **THEN** 配置包含以下字段：
  - id: 唯一标识（UUID）
  - name: 用户自定义名称
  - provider: 'openai' | 'gemini' | 'openai-compatible'
  - baseUrl: API 地址（openai-compatible 必填）
  - apiKey: API 密钥（加密存储）
  - modelName: 模型名称
  - isDefault: 是否为默认模型
  - createdAt, updatedAt: 时间戳

#### Scenario: 添加配置
- **WHEN** 用户在设置中点击「添加模型」
- **THEN** 打开配置编辑器
- **AND** 用户填写必要信息后保存
- **AND** 新配置追加到 llmConfigs 数组

#### Scenario: 编辑配置
- **WHEN** 用户点击某个配置的「编辑」按钮
- **THEN** 打开配置编辑器并填充现有值
- **AND** 保存时更新对应配置

#### Scenario: 删除配置
- **WHEN** 用户点击某个配置的「删除」按钮
- **THEN** 显示确认对话框
- **AND** 确认后从 llmConfigs 数组中移除
- **AND** 如果删除的是默认配置，清空 defaultLLMConfigId
- **AND** 如果有项目引用此配置，提示用户并将这些项目重置为使用默认

### Requirement: Default Model Setting
系统 SHALL 支持设置默认 LLM 模型。

#### Scenario: 设置默认模型
- **WHEN** 用户在配置列表中点击「设为默认」
- **THEN** 该配置的 isDefault 设为 true
- **AND** 其他配置的 isDefault 设为 false
- **AND** 更新 defaultLLMConfigId

#### Scenario: 获取默认模型
- **WHEN** 系统需要使用 LLM 且未指定配置时
- **THEN** 返回 isDefault 为 true 的配置
- **AND** 如果没有默认配置，返回第一个配置或 null

### Requirement: OpenAI Compatible Presets
系统 SHALL 提供常用国产大模型的预设配置。

#### Scenario: 预设列表
- **WHEN** 用户选择 provider 为 'openai-compatible'
- **THEN** 显示预设渠道下拉框
- **AND** 包含以下预设：
  - DeepSeek: baseUrl = 'https://api.deepseek.com/v1'
  - 通义千问: baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  - 智谱 AI: baseUrl = 'https://open.bigmodel.cn/api/paas/v4'
  - 月之暗面 (Kimi): baseUrl = 'https://api.moonshot.cn/v1'
  - 自定义: 允许手动输入 baseUrl

#### Scenario: 预设自动填充
- **WHEN** 用户选择某个预设
- **THEN** 自动填充 baseUrl 字段
- **AND** 提供该渠道常用模型名的下拉建议

### Requirement: LLM Provider Directory Structure
系统 SHALL 将 LLM Provider 组织在独立的 `providers/llm/` 目录中。

#### Scenario: LLM 目录结构
- **GIVEN** providers 目录结构
- **WHEN** 开发者需要添加新的 LLM Provider
- **THEN** 应在 `providers/llm/` 目录下创建
- **AND** 继承 `LLMProvider` 接口
- **AND** 在 `providers/llm/index.ts` 中注册

### Requirement: TTI Provider Directory Structure
系统 SHALL 将 TTI Provider 组织在独立的 `providers/tti/` 目录中。

#### Scenario: TTI 目录结构
- **GIVEN** providers 目录结构
- **WHEN** 开发者需要添加新的 TTI Provider
- **THEN** 应在 `providers/tti/` 目录下创建
- **AND** 继承 `TTIProvider` 接口
- **AND** 在 `providers/tti/index.ts` 中注册

### Requirement: Provider Directory Consistency
系统 SHALL 保持所有 Provider 目录结构一致。

#### Scenario: 统一目录结构
- **GIVEN** 四类 Provider（LLM, TTI, ITV, TTS）
- **THEN** 每类 Provider 都有独立目录（llm/, tti/, itv/, tts/）
- **AND** 每个目录包含 index.ts（工厂函数）和 types.ts（类型定义）
- **AND** 根目录 providers/index.ts 统一导出所有 Provider

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

### Requirement: NanoBanana TTI Provider
系统 SHALL 支持 nano-banana 官方文生图服务。

#### Scenario: 创建图片生成任务
- **WHEN** 调用 NanoBananaProvider.generate(prompt, options)
- **THEN** 向 `POST /api/nano-banana` 发送请求
- **AND** 请求体包含 model、prompt、aspect_ratio、image_size
- **AND** 返回 task_id 用于后续轮询

#### Scenario: 轮询任务状态
- **WHEN** 调用 NanoBananaProvider.checkProgress(taskId)
- **THEN** 向 `GET /api/nano-banana/task/{task_id}` 发送请求
- **AND** 返回 ProgressInfo 包含 state、data
- **AND** state 为 succeeded 时 data.images[0].url 是图片地址
- **AND** state 为 failed 时返回错误信息

#### Scenario: 测试连接
- **WHEN** 调用 NanoBananaProvider.testConnection()
- **THEN** 向 `GET /api/user/balance` 发送请求
- **AND** 返回 200 表示连接成功

### Requirement: Sora2 Official ITV Provider
系统 SHALL 支持 sora2 官方图生视频服务。

#### Scenario: 创建视频生成任务
- **WHEN** 调用 Sora2Provider.generate(imagePath, prompt, options)
- **THEN** 向 `POST /v1/videos/generations` 发送请求
- **AND** 请求体包含 model="sora-2"、prompt、aspect_ratio、duration、image_urls
- **AND** 返回任务 id 用于后续轮询

#### Scenario: 轮询任务状态
- **WHEN** 调用 Sora2Provider.checkProgress(taskId)
- **THEN** 向 `GET /v1/videos/tasks/{taskId}` 发送请求
- **AND** 返回 state、progress、data
- **AND** state 为 succeeded 时 data 包含视频 URL

### Requirement: Official Providers Only
系统 SHALL 默认仅展示官方渠道配置选项。

#### Scenario: TTI 渠道列表
- **WHEN** 用户打开 TTI 配置
- **THEN** TTI_PRESETS 仅包含 nano-banana（官方）
- **AND** 隐藏 ComfyUI、即梦、MidJourney 等第三方渠道

#### Scenario: ITV 渠道列表
- **WHEN** 用户打开 ITV 配置
- **THEN** ITV_PRESETS 仅包含 sora2（官方）
- **AND** 隐藏 Runway、可灵、Pika 等第三方渠道

#### Scenario: 保留第三方代码
- **GIVEN** 第三方 Provider 代码已存在
- **WHEN** 隐藏第三方渠道
- **THEN** 仅从预设列表中移除
- **AND** Provider 实现代码保留不删除

