# 智能体编排 + MCP 插件系统重构计划

## 概述

重构对话智能体系统，实现 Supervisor 模式多智能体编排，并将 MCP 能力纳入统一插件体系。

## 架构设计

### 插件类型

| 类型 | 说明 | 运行位置 |
|------|------|----------|
| provider | TTI/ITV/TTS 能力 | 前端 + Electron |
| global | 功能页面 | 前端 |
| tool | 工具菜单 | 前端 |
| mcp | MCP 服务器/工具 | Electron |
| agent | 智能体 Worker | Electron |

### MCP 传输类型

- `stdio` - 外部进程
- `sse` - HTTP SSE
- `websocket` - WebSocket
- `internal` - 内部插件（直接调用）

## 实施阶段

- [x] P1: 插件类型扩展 + ElectronPluginRuntime
- [x] P2: MCP 插件支持（MCPRegistry + InternalTransport）
- [x] P3: Agent 插件支持（AgentWorker 执行引擎）
- [x] P4: AgentOrchestrator（Supervisor 模式）
- [x] P5: 示例插件开发
- [x] P6: 前端 UI 适配（Controller IPC）

## 文件变更

### 新增文件

- `electron/src/service/plugin/types.ts`
- `electron/src/service/plugin/runtime.ts`
- `electron/src/service/plugin/bridge.ts`
- `electron/src/service/plugin/registries/ProviderRegistry.ts`
- `electron/src/service/plugin/registries/MCPRegistry.ts`
- `electron/src/service/plugin/registries/AgentRegistry.ts`
- `electron/src/service/chat/AgentOrchestrator.ts`
- `electron/src/service/chat/AgentWorker.ts`
- `electron/src/service/chat/mcp/InternalTransport.ts`
- `examples/plugins/hello-mcp/`
- `examples/plugins/hello-agent/`

### 修改文件

- `electron/src/service/plugin.ts`
- `electron/src/controller/plugin.ts`
- `electron/src/service/chat/mcp/MCPManager.ts`
- `electron/src/service/chat/ChatService.ts`
