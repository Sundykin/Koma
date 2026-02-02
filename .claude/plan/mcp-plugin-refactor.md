# MCP 插件统一规范改造计划

## 方案概述

采用 **方案B：后端执行 + 前端UI** 模型，无任何兼容性处理。

### 核心原则
- MCP/Provider/Agent 执行逻辑统一在 Electron 后端
- 前端只负责 UI 展示和配置
- 工具命名强制 `pluginId:toolName` 格式
- 配置通过统一 API 读写，禁止直接读取 settings.json
- 现有插件完全按新规范重写

---

## 后端实施计划（9步）

### Step 1: 对齐 Plugin SDK 类型 ⬅️ 基础
- **模块**: Plugin SDK
- **文件**:
  - `packages/plugin-sdk/src/plugin.ts` - 补齐 mcpMeta/agentMeta
  - `packages/plugin-sdk/src/index.ts` - 导出新类型
- **依赖**: 无
- **产出**: 类型定义与 `electron/src/service/plugin/types.ts` 完全对齐

### Step 2: 扩展 ElectronPluginAPI 配置接口
- **模块**: Electron 后端 API
- **文件**:
  - `electron/src/service/plugin/types.ts` - 添加接口定义
  - `electron/src/service/plugin/runtime.ts` - 实现配置读写
- **依赖**: Step 1
- **产出**: `channels.getProviderConfig` / `channels.updateProviderConfig`

### Step 3: 强制工具命名空间
- **模块**: MCP 注册表
- **文件**:
  - `electron/src/service/plugin/registries/MCPRegistry.ts`
  - `electron/src/service/chat/mcp/MCPManager.ts`
- **依赖**: Step 1
- **产出**: 注册时强制 `pluginId:toolName` 格式

### Step 4: MCPManager 作为统一入口
- **模块**: Chat/MCP 集成
- **文件**:
  - `electron/src/service/chat/ChatService.ts`
  - `electron/src/service/chat/AgentGraph.ts`
  - `electron/src/service/chat/AgentWorker.ts`
- **依赖**: Step 3
- **产出**: 移除直接 mcpRegistry 调用，统一走 MCPManager

### Step 5: 移除前端 MCPPlugin
- **模块**: 前端聊天
- **文件**:
  - `frontend/src/chat/plugins/MCPPlugin.ts` - 删除
  - `frontend/src/chat/plugins/PluginManager.ts` - 清理引用
  - `frontend/src/chat/index.ts` - 清理导出
- **依赖**: Step 4
- **产出**: 前端不再有 MCP 协议实现

### Step 6: 重写 Seedream 后端源码
- **模块**: Seedream 插件
- **文件**:
  - `packages/plugins/seedream-tti-provider/src/backend.ts` - 新增
  - `packages/plugins/seedream-tti-provider/manifest.json` - 更新 entry.backend
- **依赖**: Step 2
- **产出**: 真正的后端源码，使用 ElectronPluginAPI 读取配置

### Step 7: 新增 VectorEngine 后端实现
- **模块**: VectorEngine 插件
- **文件**:
  - `packages/plugins/vectorengine-provider/src/backend.ts` - 新增
  - `packages/plugins/vectorengine-provider/manifest.json` - 更新 entry.backend
- **依赖**: Step 2
- **产出**: 参照 Seedream 实现后端调用

### Step 8: 清理遗留代码
- **模块**: 插件运行时
- **文件**:
  - `electron/src/service/plugin/runtime.ts`
  - `electron/src/service/plugin/bridge.ts`
- **依赖**: Steps 4-7
- **产出**: 删除所有 legacy 和 fallback 逻辑

### Step 9: 更新示例插件
- **模块**: Examples
- **文件**:
  - `examples/plugins/hello-mcp/`
  - `examples/plugins/hello-agent/`
  - `examples/plugins/image-gen/`
- **依赖**: Steps 3-7
- **产出**: 示例符合新规范

---

## 前端实施计划（4阶段）

### Phase 1: 基础架构重构
#### Step 1.1: 定义类型系统
- **文件**: `frontend/src/types/mcp.ts` - 新增
- **内容**: MCPServerConfig, MCPTool, MCPResource, ToolCallState

#### Step 1.2: 封装 IPC 服务
- **文件**: `frontend/src/services/mcpService.ts` - 新增
- **功能**: getServers, addServer, removeServer, connectServer, approveToolCall, rejectToolCall

### Phase 2: 配置管理 UI
#### Step 2.1: 服务器配置组件
- **文件**: `frontend/src/components/settings/MCPConfigManager.tsx` - 新增
- **参考**: LLMConfigManager 布局模式
- **UI**: ServerList + ServerModal（支持 Stdio/SSE/WebSocket）

#### Step 2.2: 集成到设置页
- **文件**: `frontend/src/components/settings/SettingsPage.tsx`
- **变更**: 新增 Tab 项 "扩展工具 (MCP)"

### Phase 3: 聊天流 UI
#### Step 3.1: 工具调用组件
- **文件**: `frontend/src/chat/components/tools/ToolCallItem.tsx` - 新增
- **功能**: 展示工具名称、参数、状态图标

#### Step 3.2: 审批卡片组件
- **文件**: `frontend/src/chat/components/tools/ToolApprovalCard.tsx` - 新增
- **功能**: Human-in-the-loop 确认界面

#### Step 3.3: 结果渲染组件
- **文件**: `frontend/src/chat/components/tools/ToolResultRenderer.tsx` - 新增
- **功能**: 文本/图片/JSON 智能渲染

### Phase 4: 集成与清理
#### Step 4.1: 更新消息气泡
- **文件**: `frontend/src/chat/components/MessageBubble.tsx`
- **变更**: 引入新组件，替换 pre 兜底渲染

#### Step 4.2: 废弃旧 Plugin 实现
- **文件**: `frontend/src/chat/plugins/MCPPlugin.ts` - 删除
- **文件**: `frontend/src/chat/plugins/index.ts` - 清理导出

---

## 依赖关系图

```
后端 Step 1 ─────┬──→ Step 2 ──→ Step 6 (Seedream)
                 │            └──→ Step 7 (VectorEngine)
                 │
                 └──→ Step 3 ──→ Step 4 ──→ Step 5 ──→ Step 8
                                                    └──→ Step 9

前端 Phase 1 ──→ Phase 2 ──┐
                           ├──→ Phase 4
             Phase 1 ──→ Phase 3 ──┘

跨模块:
  后端 Step 2 ←─ 前端 Phase 1 (IPC 接口定义)
  后端 Step 5 ←→ 前端 Phase 4 (同步移除)
```

---

## 关键接口定义

### MCP 工具命名格式
```
{pluginId}:{toolName}
例如: com.koma.hello-mcp:get_time
```

### ElectronPluginAPI 扩展
```typescript
interface ElectronPluginAPI {
  channels: {
    getProviderConfig: (type: string) => Promise<Record<string, unknown> | null>;
    updateProviderConfig: (type: string, config: Record<string, unknown>) => Promise<void>;
    // ... 其他现有方法
  };
}
```

### 前端 IPC 服务
```typescript
export const mcpService = {
  getServers(): Promise<MCPServerConfig[]>;
  addServer(config): Promise<MCPServerConfig>;
  removeServer(id: string): Promise<void>;
  connectServer(id: string): Promise<void>;
  disconnectServer(id: string): Promise<void>;
  approveToolCall(callId: string): Promise<void>;
  rejectToolCall(callId: string): Promise<void>;
};
```

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 配置不一致 | 统一配置 API 作为唯一入口 |
| 工具命名冲突 | 强制命名空间规则 |
| 后端权限未执行 | ElectronPluginAPI 添加 scope enforcement |

---

## 执行顺序建议

1. **第一批**（基础）: 后端 Step 1-3, 前端 Phase 1
2. **第二批**（配置）: 后端 Step 2, 前端 Phase 2
3. **第三批**（插件改造）: 后端 Step 6-7
4. **第四批**（集成）: 后端 Step 4-5, 前端 Phase 3-4
5. **第五批**（清理）: 后端 Step 8-9
