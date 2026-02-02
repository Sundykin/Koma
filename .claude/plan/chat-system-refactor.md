# 对话系统重构实施计划

## 概述
将对话系统从前端直接调用 LLM 迁移到 Electron 主进程，使用 LangChain.js + LangGraph.js 构建智能体框架。

## 技术选型
- LangChain.js v1.2 + LangGraph.js
- @langchain/mcp-adapters (MCP 集成)
- IPC 有状态会话架构

---

## Phase 1: 基础设施搭建

### 1.1 安装依赖
```bash
# electron 目录
cd electron
pnpm add langchain @langchain/langgraph @langchain/core @langchain/openai @langchain/anthropic @langchain/google-genai @modelcontextprotocol/sdk zod
```

### 1.2 Electron 服务目录结构
```
electron/src/service/chat/
├── index.ts              # 导出
├── ChatService.ts        # 核心服务
├── SessionStore.ts       # 会话存储
├── AgentGraph.ts         # LangGraph 智能体
├── types.ts              # 类型定义
├── tools/
│   ├── ToolRegistry.ts   # 工具注册表
│   └── ToolBindings.ts   # 工具绑定
└── mcp/
    ├── MCPManager.ts     # MCP 管理器
    └── transports/       # 传输实现
        ├── StdioTransport.ts
        ├── SSETransport.ts
        └── WebSocketTransport.ts
```

### 1.3 Controller 新增
```
electron/src/controller/chat.ts
```

---

## Phase 2: 后端核心实现

### 2.1 类型定义 (types.ts)
- ChatInput: 用户输入
- ChatOptions: 对话选项 (temperature, maxTokens, tools)
- SessionState: 会话状态
- StreamEvent: 流式事件

### 2.2 SessionStore 实现
- createSession(windowId) -> sessionId
- getSession(sessionId) -> Session
- disposeSession(sessionId)
- TTL 自动清理

### 2.3 AgentGraph 实现 (LangGraph)
- StateGraph 定义
- agent 节点: 调用 LLM
- tool 节点: 执行工具
- ReAct 循环: agent -> (tool?) -> agent -> END

### 2.4 MCPManager 实现
- connect(config): 连接 MCP 服务器
- disconnect(name): 断开连接
- listTools(): 获取工具列表
- callTool(name, args): 调用工具
- 支持 stdio/SSE/WebSocket 三种传输

### 2.5 ChatService 实现
- createSession(): 创建会话
- sendMessage(): 同步发送
- sendMessageStream(): 流式发送
- cancelStream(): 取消流式

---

## Phase 3: IPC 通信层

### 3.1 IPC Channels
请求/响应:
- chat:session:create
- chat:session:dispose
- chat:message:send
- chat:message:sendStream
- chat:message:cancel
- chat:mcp:connect
- chat:mcp:disconnect
- chat:mcp:list

事件推送:
- chat:stream:chunk
- chat:stream:tool
- chat:stream:done
- chat:stream:error

### 3.2 Preload 暴露
```typescript
window.electronAPI.chat = {
  createSession,
  disposeSession,
  sendMessage,
  sendMessageStream,
  cancelStream,
  onStreamChunk,
  onStreamDone,
  onStreamError,
  mcp: { connect, disconnect, list }
}
```

---

## Phase 4: 前端重构

### 4.1 IPC 客户端封装
新建 `frontend/src/chat/ipc/chatIPC.ts`:
- 封装 IPC 调用
- 事件订阅管理
- 类型安全

### 4.2 useChat Hook 重写
改为 IPC 驱动:
- 订阅流式事件
- 管理 UI 状态
- 支持取消操作

### 4.3 ChatPage 简化
- 移除 adapter 实例化
- 使用 sessionId 管理会话
- 修复设置按钮 bug (移除提前 return)

### 4.4 AgentTemplates 增强
新增字段:
- enabledTools: string[] (MCP 工具选择)
- temperature: number (温度滑块)
- maxTokens: number (最大 token)

### 4.5 移除旧代码
- frontend/src/chat/adapters/* (移除)
- frontend/src/chat/plugins/* (移除)
- frontend/src/chat/ChatSession.ts (移除)

---

## Phase 5: Bug 修复

### 5.1 设置按钮无法操作
问题: ChatPage.tsx 在 adapter 为空时提前 return
修复: 移除提前 return，允许配置界面独立工作

### 5.2 MCP 工具配置缺失
问题: AgentTemplates 只有提示词编辑
修复: 新增 enabledTools 多选框，从 MCP 获取工具列表

---

## 实施顺序

1. **[后端]** 安装依赖，创建目录结构
2. **[后端]** 实现 types.ts, SessionStore.ts
3. **[后端]** 实现 MCPManager (stdio 优先)
4. **[后端]** 实现 AgentGraph (LangGraph)
5. **[后端]** 实现 ChatService
6. **[后端]** 实现 Controller + IPC 注册
7. **[前端]** 更新 preload 暴露 chat API
8. **[前端]** 实现 chatIPC.ts
9. **[前端]** 重写 useChat Hook
10. **[前端]** 重构 ChatPage (修复 bug)
11. **[前端]** 增强 AgentTemplates
12. **[清理]** 移除旧代码

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| ESM/CJS 兼容 | 使用 dynamic import |
| MCP stdio 安全 | 限制可执行命令 |
| 流式性能 | 批量合并 + 节流 |
| 多模型差异 | LangChain 统一封装 |

---

## 预期产出

- 完整的智能体框架 (单智能体 + ReAct)
- 全量 MCP 支持 (stdio/SSE/WebSocket)
- IPC 驱动的对话系统
- 修复所有已知 bug
