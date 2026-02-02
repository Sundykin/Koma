# Chat 模块修复计划 - 第二轮

## 问题清单

1. **思考过程未展示** - 需要兼容 DeepSeek `reasoning_content` 和 Claude `<think>` 标签
2. **历史对话存储逻辑错误** - 新建对话应创建新会话，加载历史应正确回灌消息
3. **MCP 配置未集成** - MCPSettings 组件未使用，配置未持久化
4. **多智能体架构缺失** - AgentTemplates 组件未集成

---

## 实施方案

### Phase 1: 类型扩展

**修改 `frontend/src/chat/types.ts`**
- `ChatMessage` 添加 `reasoning?: string`
- `ChatChunk` 添加 `reasoning?: string`
- `ChatResponse` 添加 `reasoning?: string`
- `createAssistantMessage` 支持 reasoning 参数

### Phase 2: 适配器层 reasoning 解析

**修改 `frontend/src/chat/adapters/OpenAIAdapter.ts`**
- 流式响应读取 `delta.reasoning_content` 或 `delta.reasoning`
- 非流式响应读取 `message.reasoning_content`

**修改 `frontend/src/chat/adapters/ClaudeAdapter.ts`**
- 实现 `<think>` 标签流式解析器（状态机）
- `consumeThink()` - 逐字符解析，分离思考和正文
- `flushThink()` - 流结束时刷新缓冲区
- `parseThinkText()` - 非流式解析

### Phase 3: ChatSession 和 useChat 扩展

**修改 `frontend/src/chat/ChatSession.ts`**
- `addAssistantMessage` 支持 reasoning 参数
- `sendStream` 累积 reasoning 内容

**修改 `frontend/src/chat/hooks/useChat.ts`**
- 新增 `streamingReasoning` 状态
- 新增 `loadMessages()` 方法 - 从历史数据恢复会话
- 流式循环中分离 reasoning 和 content

### Phase 4: UI 渲染

**修改 `frontend/src/chat/components/MessageBubble.tsx`**
- 添加思考过程展示区域（可折叠）
- 使用 Ant Design Collapse 或自定义样式

**修改 `frontend/src/chat/components/ChatRenderer.tsx`**
- `ChatRendererProps` 添加 `streamingReasoning`
- `StreamingMessage` 组件支持 reasoning 渲染

**修改 `frontend/src/chat/components/ChatRenderer.module.css`**
- 添加 `.reasoningBlock` 样式

### Phase 5: 历史对话修复

**修改 `frontend/src/components/chat/ChatPage.tsx`**
- `handleLoadSession` 调用 `loadChatMessages` 回灌消息
- `handleClear` 改为创建新会话（调用 `createSession`）
- 提示语从"对话已清空"改为"已创建新对话"

### Phase 6: MCP 和 Agent 集成

**新建 `frontend/src/store/settings/chatSettings.ts`**
- `getMCPServers()` / `saveMCPServers()`
- `getAgentTemplates()` / `saveAgentTemplates()`
- `getActiveAgentId()` / `setActiveAgentId()`

**修改 `frontend/src/types.ts`**
- `AppSettings` 添加 `mcpServers`、`agentTemplates`、`activeAgentId`

**修改 `frontend/src/components/chat/ChatPage.tsx`**
- 工具栏添加 MCP 和 Agent 按钮
- 集成 MCPSettings 和 AgentTemplates 弹窗
- 初始化时连接 MCP 服务器
- Agent 选择时更新 systemPrompt

---

## 文件变更清单

### 新建文件
- `frontend/src/store/settings/chatSettings.ts`

### 修改文件
1. `frontend/src/chat/types.ts`
2. `frontend/src/chat/adapters/OpenAIAdapter.ts`
3. `frontend/src/chat/adapters/ClaudeAdapter.ts`
4. `frontend/src/chat/ChatSession.ts`
5. `frontend/src/chat/hooks/useChat.ts`
6. `frontend/src/chat/components/MessageBubble.tsx`
7. `frontend/src/chat/components/ChatRenderer.tsx`
8. `frontend/src/chat/components/ChatRenderer.module.css`
9. `frontend/src/components/chat/ChatPage.tsx`
10. `frontend/src/components/chat/AgentTemplates.tsx`
11. `frontend/src/types.ts`
12. `frontend/src/store/settings/core.ts`
13. `frontend/src/store/settings/index.ts`

---

## 技术要点

- **`<think>` 解析器**：使用状态机逐字符解析，处理跨 chunk 的标签
- **历史回灌**：使用 `ChatSession.fromJSON` 重建会话实例
- **MCP 连接**：启动时自动连接已保存的服务器配置
