## ADDED Requirements

### Requirement: Provider Interface
系统 SHALL 定义统一的模型提供者接口。

#### Scenario: 接口定义
- **WHEN** 实现新的模型提供者时
- **THEN** 必须实现 ModelProvider 接口
- **AND** 包含 validate、testConnection 方法
- **AND** 根据能力实现 generateText/generateImage/generateVideo 方法

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
- **AND** 验证 baseUrl 格式（如果提供）
- **AND** 无效时显示具体错误
