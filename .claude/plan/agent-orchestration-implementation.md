# 智能体编排 + MCP 插件系统 - 详细实施计划（方案B）

## P2: MCP 插件支持 - InternalTransport

### 目标
让内部插件直接提供 MCP 工具，无需外部进程，与现有 MCPManager 统一。

### 新增文件
- `electron/src/service/chat/mcp/InternalTransport.ts`

### 修改文件
- `electron/src/service/chat/mcp/MCPManager.ts` - 新增 `internal` 传输支持
- `electron/src/service/chat/types.ts` - MCPTransportType 增加 `internal`

### 设计
```
InternalTransport implements MCPTransport
  ├─ send(request) → 根据 method 路由到 mcpRegistry
  │   ├─ 'tools/list' → mcpRegistry.tools.listDefinitions()
  │   ├─ 'tools/call' → mcpRegistry.tools.callTool(name, args)
  │   ├─ 'resources/list' → mcpRegistry.resources.listDefinitions()
  │   └─ 'resources/read' → mcpRegistry.resources.readResource(uri)
  └─ close() → no-op（内部无需清理）
```

MCPManager.connect() 新增 case 'internal'：
  - 不启动外部进程
  - 直接使用 InternalTransport 代理到插件注册表

---

## P3: Agent Worker 执行引擎

### 目标
Worker Agent 拥有完整的 invoke 执行链路，支持流式输出和工具调用。

### 新增文件
- `electron/src/service/chat/AgentWorker.ts`

### 设计
```typescript
class AgentWorker {
  constructor(definition: WorkerAgentDefinition, llm: BaseChatModel, tools: DynamicStructuredTool[])

  // 同步执行
  async invoke(input: AgentInput): Promise<AgentResult>

  // 流式执行
  async *stream(input: AgentInput): AsyncGenerator<AgentEvent>
}
```

Worker 内部复用 `createAgentGraph` 构建独立的 ReAct 图：
- 使用 Worker 自己的 systemPrompt、temperature、tools
- 输出标准化的 AgentEvent 流

---

## P4: AgentOrchestrator - Supervisor 模式

### 目标
Supervisor 基于 LangGraph StateGraph 管理多 Worker 并行/串行执行。

### 新增文件
- `electron/src/service/chat/AgentOrchestrator.ts`

### 设计

#### 状态定义
```typescript
OrchestratorState = {
  messages: BaseMessage[]           // 对话历史
  plan: TaskPlan[]                  // Supervisor 的任务分解
  workerResults: WorkerResult[]     // Worker 执行结果
  activeWorkers: string[]           // 当前活跃 Worker
  iteration: number                 // 迭代次数（防死循环）
}

TaskPlan = {
  workerId: string
  task: string
  priority: number
  dependencies: string[]   // 依赖的其他 task id
  status: 'pending' | 'running' | 'done' | 'error'
}
```

#### Graph 结构
```
START → supervisor → route
                       ├─ 'dispatch' → dispatcher → workers → aggregator → supervisor（循环）
                       └─ 'done' → synthesizer → END
```

节点说明：
1. **supervisor**: 分析用户需求，决定是否需要分发给 Worker
   - 根据 Worker capabilities 匹配
   - 输出 TaskPlan[]（可并行多个）

2. **dispatcher**: 将 TaskPlan 分发到对应 Worker
   - 支持并行启动多个 Worker（Promise.all）

3. **workers**: 并行执行节点
   - 每个 Worker 独立执行自己的 ReAct 图
   - 结果汇入 workerResults

4. **aggregator**: 收集 Worker 结果
   - 检查是否有失败需要重试
   - 将结果反馈给 supervisor

5. **synthesizer**: 综合所有结果生成最终回复

#### 路由逻辑
```
supervisor → 有待分发任务？ → dispatch
supervisor → 所有任务完成？ → done
supervisor → 超过最大迭代？ → done（强制终止）
```

#### 错误恢复
- Worker 执行失败 → aggregator 标记 error → supervisor 决定是否重试
- 最大重试次数 = 2
- 最大迭代次数 = 5（防死循环）

---

## P5: 示例插件

### 新增目录
- `examples/plugins/hello-mcp/` - MCP 示例插件
- `examples/plugins/hello-agent/` - Agent 示例插件

### hello-mcp 插件
```
manifest.json: category=mcp, transport=internal
dist/index.js:
  createMCPServer() → 返回工具: get_time, echo
```

### hello-agent 插件
```
manifest.json: category=agent
dist/index.js:
  createAgent() → 返回 Worker: 翻译助手（capabilities: ['translation']）
```

---

## P6: 前端 UI 适配

### 修改文件
- `electron/src/controller/plugin.ts` - 新增 IPC: 激活/停用/状态查询
- `electron/src/controller/chat.ts` - 新增 IPC: agent 编排相关

### 新增 IPC 接口

#### 插件管理
```
plugin:activate    → loadAndActivate
plugin:deactivate  → deactivate
plugin:status      → getPluginStatus
plugin:listActive  → listActivePlugins
```

#### Agent 编排
```
chat:agent:list          → 列出可用 Worker Agent
chat:agent:orchestrate   → 启动编排（Supervisor 模式）
chat:agent:status        → 查询编排状态
chat:agent:cancel        → 取消编排
```

#### 统一工具列表
```
chat:tools:list          → 合并 MCPManager + mcpRegistry 的工具
chat:tools:call          → 统一工具调用入口
```

---

## 实施顺序

1. P2: InternalTransport（~50行代码）+ MCPManager 改造
2. P3: AgentWorker 执行引擎（~100行）
3. P4: AgentOrchestrator（~250行，核心功能）
4. P5: 示例插件（验证 P2-P4）
5. P6: Controller IPC 适配（~100行）

## 依赖关系
- P3 依赖 P2（Worker 需要使用统一的工具列表）
- P4 依赖 P3（Orchestrator 需要 Worker 执行能力）
- P5 依赖 P2+P3（示例插件需要运行时支持）
- P6 依赖 P4（前端需要编排接口）
