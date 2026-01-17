# model-providers Specification

## Purpose
TBD - created by archiving change add-antd-timeline-editor. Update Purpose after archive.
## Requirements
### Requirement: Provider Interface
系统 SHALL 定义统一的模型提供者接口。

#### Scenario: 接口定义
- **WHEN** 实现新的模型提供者时
- **THEN** 必须实现 ModelProvider 接口
- **AND** 包含 validate、testConnection 方法
- **AND** 根据能力实现 generateText/generateImage/generateVideo 方法

#### Scenario: 从配置创建 Provider
- **WHEN** 调用 createLLMProvider 工厂方法
- **THEN** 接受 LLMModelConfig 对象作为参数
- **AND** 根据 provider 字段创建对应实例
- **AND** openai-compatible 类型使用 OpenAIProvider 并传入自定义 baseUrl

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

