# chat-module Specification Delta

## Purpose
通用多轮对话模块，提供与 LLM 交互的统一抽象层，支持流式输出、多模型适配、插件扩展。

## ADDED Requirements

### Requirement: Chat Message Format
系统 SHALL 定义统一的对话消息格式，支持多模态内容。

#### Scenario: 文本消息
- **WHEN** 用户发送纯文本消息
- **THEN** 消息 content 为字符串类型
- **AND** role 为 'user'

#### Scenario: 多模态消息
- **WHEN** 用户发送包含图片的消息
- **THEN** 消息 content 为 ContentPart 数组
- **AND** 包含 type='text' 和 type='image' 的部分

#### Scenario: 工具调用消息
- **WHEN** 模型返回工具调用
- **THEN** 消息包含 toolCalls 数组
- **AND** 每个 toolCall 包含 id、name、arguments

---

### Requirement: Chat Adapter Interface
系统 SHALL 定义统一的模型适配器接口。

#### Scenario: 同步对话
- **WHEN** 调用 adapter.chat(messages, options)
- **THEN** 返回 Promise<ChatResponse>
- **AND** ChatResponse 包含 content、toolCalls、usage

#### Scenario: 流式对话
- **WHEN** 调用 adapter.chatStream(messages, options)
- **THEN** 返回 AsyncIterable<ChatChunk>
- **AND** 每个 chunk 包含增量 content

#### Scenario: 能力检测
- **WHEN** 调用 adapter.supports(capability)
- **THEN** 返回该适配器是否支持指定能力
- **AND** 能力包括 streaming、function_call、vision、file_upload

---

### Requirement: OpenAI Adapter
系统 SHALL 提供 OpenAI API 适配器。

#### Scenario: 标准 OpenAI 调用
- **WHEN** 配置 provider 为 'openai'
- **THEN** 使用 https://api.openai.com/v1 作为 baseUrl
- **AND** 支持 GPT-4、GPT-4o 等模型

#### Scenario: OpenAI 兼容 API 调用
- **WHEN** 配置 provider 为 'openai-compatible'
- **THEN** 使用自定义 baseUrl
- **AND** 支持 DeepSeek、通义千问等兼容服务

#### Scenario: 流式输出
- **WHEN** 调用 chatStream 方法
- **THEN** 使用 SSE 协议接收流式响应
- **AND** 实时解析并 yield ChatChunk

---

### Requirement: Gemini Adapter
系统 SHALL 提供 Google Gemini API 适配器。

#### Scenario: Gemini 调用
- **WHEN** 配置 provider 为 'gemini'
- **THEN** 使用 @google/genai SDK
- **AND** 支持 gemini-2.0-flash、gemini-pro 等模型

#### Scenario: 文件上传
- **WHEN** 消息包含文件内容
- **THEN** 使用 Gemini File API 上传
- **AND** 在请求中引用文件 URI

---

### Requirement: Claude Adapter
系统 SHALL 提供 Anthropic Claude API 适配器。

#### Scenario: Claude 调用
- **WHEN** 配置 provider 为 'claude'
- **THEN** 使用 Anthropic Messages API
- **AND** 支持 claude-sonnet、claude-opus 等模型

#### Scenario: Tool Use
- **WHEN** 请求包含 tools 定义
- **THEN** 转换为 Claude tool_use 格式
- **AND** 正确处理 tool_result 响应

---

### Requirement: Chat Session Management
系统 SHALL 提供会话管理功能。

#### Scenario: 创建会话
- **WHEN** 调用 new ChatSession(options)
- **THEN** 创建新的对话会话
- **AND** 可注入系统提示词
- **AND** 可指定使用的适配器

#### Scenario: 发送消息
- **WHEN** 调用 session.send(content)
- **THEN** 将用户消息添加到历史
- **AND** 调用适配器获取响应
- **AND** 将助手消息添加到历史
- **AND** 返回助手消息

#### Scenario: 上下文窗口控制
- **WHEN** 消息历史超过 token 限制
- **THEN** 自动裁剪早期消息
- **AND** 保留系统提示词

#### Scenario: 会话持久化
- **WHEN** 调用 session.save()
- **THEN** 将会话数据保存到存储
- **AND** 可通过 ChatSession.load(id) 恢复

---

### Requirement: Plugin System
系统 SHALL 提供插件扩展机制。

#### Scenario: 插件注册
- **WHEN** 调用 pluginManager.register(plugin)
- **THEN** 插件被注册到管理器
- **AND** 插件的生命周期钩子被激活

#### Scenario: 请求前钩子
- **WHEN** 发送消息前
- **THEN** 执行所有插件的 onBeforeRequest 钩子
- **AND** 插件可修改请求上下文

#### Scenario: 响应后钩子
- **WHEN** 收到模型响应后
- **THEN** 执行所有插件的 onAfterResponse 钩子
- **AND** 插件可处理工具调用

#### Scenario: 流式块钩子
- **WHEN** 收到流式输出块
- **THEN** 执行所有插件的 onStreamChunk 钩子
- **AND** 插件可转换或过滤块内容

---

### Requirement: Function Call Plugin
系统 SHALL 提供 Function Call 插件。

#### Scenario: 工具注册
- **WHEN** 调用 plugin.registerTool(definition, handler)
- **THEN** 工具被注册到插件
- **AND** 工具定义包含在后续请求中

#### Scenario: 自动工具执行
- **WHEN** 模型返回 toolCalls
- **THEN** 插件自动执行对应工具
- **AND** 将结果添加到会话
- **AND** 继续对话获取最终响应

---

### Requirement: File Upload Plugin
系统 SHALL 提供文件上传插件。

#### Scenario: 图片上传
- **WHEN** 用户上传图片文件
- **THEN** 插件读取并编码为 base64
- **AND** 转换为适配器支持的格式

#### Scenario: 文档上传
- **WHEN** 用户上传文档文件
- **THEN** 插件提取文本内容
- **AND** 作为消息内容的一部分

---

### Requirement: useChat Hook
系统 SHALL 提供 React Hook 封装。

#### Scenario: 基本使用
- **WHEN** 调用 useChat(options)
- **THEN** 返回 messages、isLoading、send 等状态和方法

#### Scenario: 流式输出状态
- **WHEN** 流式输出进行中
- **THEN** isStreaming 为 true
- **AND** streamingContent 实时更新

#### Scenario: 错误处理
- **WHEN** 对话出错
- **THEN** error 状态被设置
- **AND** 调用 onError 回调

---

### Requirement: Chat Renderer Component
系统 SHALL 提供对话渲染组件。

#### Scenario: 消息列表渲染
- **WHEN** 传入 messages 数组
- **THEN** 渲染所有消息气泡
- **AND** 区分用户和助手消息样式

#### Scenario: 流式内容渲染
- **WHEN** streaming 为 true
- **THEN** 使用 ds-markdown 渲染流式内容
- **AND** 支持打字机效果

#### Scenario: 代码高亮
- **WHEN** 消息包含代码块
- **THEN** 使用语法高亮渲染
- **AND** 支持复制代码功能

#### Scenario: 数学公式
- **WHEN** 消息包含 LaTeX 公式
- **THEN** 使用 KaTeX 渲染公式
