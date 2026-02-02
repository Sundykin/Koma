# Tasks: add-chat-module

## Phase 1: 简化随机剧本生成

### 1.1 合并 Prompt 模板
- [x] 创建新的 `random_script_generation` Prompt 模板
- [x] 模板直接输出完整剧本，包含创意元素作为元数据
- [x] 更新 `promptTemplates.ts` 添加新模板类型

### 1.2 重构生成逻辑
- [x] 修改 `scriptGenerator.ts` 中的 `generateRandomScript` 函数
- [x] 移除两步调用，改为单次 LLM 调用
- [x] 保持 `onProgress` 回调兼容性
- [x] 更新返回类型，包含剧本和元数据

### 1.3 验证
- [x] 测试随机剧本生成功能
- [x] 验证生成质量和一致性
- [x] 确认响应时间改善

---

## Phase 2: 对话模块核心类型

### 2.1 类型定义
- [x] 创建 `frontend/src/chat/types.ts`
- [x] 定义 `ChatMessage` 接口（支持多模态内容）
- [x] 定义 `ChatOptions`、`ChatResponse`、`ChatChunk` 类型
- [x] 定义 `ToolCall`、`ToolDefinition` 类型
- [x] 定义 `AdapterCapability` 枚举
- [x] 定义 `ChatError` 错误类型

### 2.2 适配器接口
- [x] 创建 `frontend/src/chat/adapters/types.ts`
- [x] 定义 `ChatAdapter` 接口
- [x] 定义 `AdapterConfig` 配置类型

---

## Phase 3: 模型适配器实现

### 3.1 基础适配器
- [x] 创建 `frontend/src/chat/adapters/BaseAdapter.ts`
- [x] 实现通用的消息格式转换逻辑
- [x] 实现能力检测方法
- [x] 实现错误处理基础设施

### 3.2 OpenAI 适配器
- [x] 创建 `frontend/src/chat/adapters/OpenAIAdapter.ts`
- [x] 实现 `chat()` 方法
- [x] 实现 `chatStream()` 方法（SSE 处理）
- [x] 实现 Function Call 支持
- [x] 支持 OpenAI 兼容 API（DeepSeek、通义等）

### 3.3 Gemini 适配器
- [x] 创建 `frontend/src/chat/adapters/GeminiAdapter.ts`
- [x] 使用 `@google/genai` SDK
- [x] 实现流式输出
- [x] 实现文件上传支持

### 3.4 Claude 适配器
- [x] 创建 `frontend/src/chat/adapters/ClaudeAdapter.ts`
- [x] 使用 Anthropic API
- [x] 实现流式输出
- [x] 实现 Tool Use 支持

### 3.5 适配器工厂
- [x] 创建 `frontend/src/chat/adapters/index.ts`
- [x] 实现 `createChatAdapter()` 工厂函数
- [x] 实现从现有 LLMModelConfig 创建适配器

---

## Phase 4: 会话管理

### 4.1 ChatSession 类
- [x] 创建 `frontend/src/chat/ChatSession.ts`
- [x] 实现消息历史管理
- [x] 实现 `send()` 和 `sendStream()` 方法
- [x] 实现上下文窗口控制（token 限制）
- [x] 实现系统提示词注入

### 4.2 会话持久化
- [x] 实现会话保存到本地存储
- [x] 实现会话加载和恢复
- [x] 支持 Electron 文件系统存储

---

## Phase 5: 插件系统

### 5.1 插件基础设施
- [x] 创建 `frontend/src/chat/plugins/types.ts`
- [x] 定义 `ChatPlugin` 接口
- [x] 定义 `PluginContext` 类型

### 5.2 插件管理器
- [x] 创建 `frontend/src/chat/plugins/PluginManager.ts`
- [x] 实现插件注册/注销
- [x] 实现生命周期钩子执行
- [x] 实现工具收集和路由

### 5.3 Function Call 插件
- [x] 创建 `frontend/src/chat/plugins/FunctionCallPlugin.ts`
- [x] 实现工具注册
- [x] 实现工具执行
- [x] 实现自动工具调用循环

### 5.4 文件上传插件
- [x] 创建 `frontend/src/chat/plugins/FileUploadPlugin.ts`
- [x] 实现文件读取和编码
- [x] 实现图片预处理
- [x] 支持多种文件类型

---

## Phase 6: React 集成

### 6.1 useChat Hook
- [x] 创建 `frontend/src/chat/hooks/useChat.ts`
- [x] 实现消息状态管理
- [x] 实现流式输出状态
- [x] 实现错误处理
- [x] 实现重试机制

### 6.2 useChatStream Hook
- [x] 创建 `frontend/src/chat/hooks/useChatStream.ts` (合并到 useChat)
- [x] 封装流式输出处理逻辑
- [x] 实现中断/取消功能

### 6.3 useChatHistory Hook
- [x] 创建 `frontend/src/chat/hooks/useChatHistory.ts` (合并到 ChatSession)
- [x] 实现历史记录加载
- [x] 实现历史记录搜索

---

## Phase 7: 对话渲染组件

### 7.1 安装依赖
- [x] 安装 `ds-markdown` 包
- [x] 配置 Tailwind/CSS 兼容性

### 7.2 ChatRenderer 组件
- [x] 创建 `frontend/src/chat/components/ChatRenderer.tsx`
- [x] 实现消息列表渲染
- [x] 实现流式内容渲染（使用 ds-markdown）
- [x] 实现代码高亮
- [x] 实现数学公式渲染

### 7.3 辅助组件
- [x] 实现 `MessageBubble` 组件
- [x] 实现 `ToolCallDisplay` 组件 (集成到 MessageBubble)
- [x] 实现 `ThinkingIndicator` 组件
- [x] 实现 `FilePreview` 组件 (待后续扩展)

---

## Phase 8: 集成与测试

### 8.1 模块导出
- [x] 创建 `frontend/src/chat/index.ts`
- [x] 导出所有公共 API

### 8.2 UI 集成
- [x] 创建 `frontend/src/components/chat/ChatPage.tsx`
- [x] 使用全局 LLM 配置
- [x] 在 Sidebar 添加对话菜单
- [x] 在 App.tsx 添加对话视图路由

### 8.3 集成测试
- [ ] 测试各适配器的基本对话功能
- [ ] 测试流式输出
- [ ] 测试 Function Call 流程
- [ ] 测试文件上传

### 8.4 文档
- [ ] 编写使用示例
- [ ] 编写插件开发指南

---

## Phase 9: MCP 支持

### 9.1 MCP 插件
- [x] 创建 `frontend/src/chat/plugins/MCPPlugin.ts`
- [x] 实现 MCP 服务器连接（SSE/WebSocket/stdio）
- [x] 实现工具发现和调用
- [x] 实现资源访问

---

## Dependencies

```
Phase 1 (独立)
    │
    ▼
Phase 2 ──► Phase 3 ──► Phase 4
    │           │
    ▼           ▼
Phase 5 ◄──────┘
    │
    ▼
Phase 6 ──► Phase 7
    │
    ▼
Phase 8
    │
    ▼
Phase 9 (可选)
```

## Parallelizable Work

- Phase 3.2, 3.3, 3.4 (各适配器实现) 可并行
- Phase 5.3, 5.4 (各插件实现) 可并行
- Phase 6.1, 6.2, 6.3 (各 Hook 实现) 可并行
- Phase 7.2, 7.3 (渲染组件) 可并行
