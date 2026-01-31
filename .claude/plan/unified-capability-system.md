# 统一能力系统 (Unified Capability System) - 实施计划

## 概述

将 Provider/MCP Tool/Resource 统一为 **Capability** 抽象层，Agent 通过声明所需能力由系统自动解析，
同时实现 MCP 配置导入和生图工具。

## 核心设计

### Capability 统一抽象

```
CapabilityRegistry (统一入口)
├── Tool Capabilities      ← MCP Tools (外部/内部) + 内置工具
├── Provider Capabilities  ← TTI/ITV/TTS/LLM Providers
└── Resource Capabilities  ← MCP Resources

Agent 声明 requiredCapabilities: ['image-generation', 'web-search']
→ CapabilityRegistry.resolve() 自动匹配可用能力
→ 转换为 LangChain DynamicStructuredTool 注入 AgentWorker
```

### 与现有架构的关系

```
CapabilityRegistry (新, 统一门面)
  ├── wraps ProviderRegistry (保留, 内部适配)
  ├── wraps MCPRegistry      (保留, 内部适配)
  ├── wraps mcpManager       (保留, 外部 MCP 连接)
  └── new:  MCPConfigLoader  (批量导入外部 MCP 配置)
```

**原则**: 现有注册表保留为内部实现，CapabilityRegistry 作为统一门面对外暴露。

---

## 实施阶段

### P1: Capability 类型系统

**新增文件**: `electron/src/service/plugin/capability/types.ts`

```typescript
// 能力类型
type CapabilityType = 'tool' | 'provider' | 'resource';

// 能力来源
type CapabilitySource =
  | { kind: 'mcp-external'; serverName: string }
  | { kind: 'mcp-internal'; pluginId: string }
  | { kind: 'provider'; pluginId?: string; providerKind: 'tti' | 'itv' | 'tts' | 'llm' }
  | { kind: 'builtin' };

// 能力描述符
interface CapabilityDescriptor {
  id: string;                // "mcp:serverName:toolName" | "provider:tti:dall-e"
  name: string;
  type: CapabilityType;
  description: string;
  tags: string[];            // 语义标签: ['image-generation', 'dall-e', 'tti']
  inputSchema?: Record<string, unknown>;
  source: CapabilitySource;
}

// 能力调用结果
interface CapabilityResult {
  success: boolean;
  data?: unknown;
  error?: string;
  mimeType?: string;
}

// 能力查询过滤
interface CapabilityFilter {
  type?: CapabilityType;
  tags?: string[];           // 任一匹配
  source?: CapabilitySource['kind'];
}
```

### P2: CapabilityRegistry

**新增文件**: `electron/src/service/plugin/capability/CapabilityRegistry.ts`

- 统一注册、查询、调用接口
- `register(descriptor, invoker)` / `unregister(id)`
- `list(filter?)` / `findByTags(tags)` / `resolve(requirements)`
- `invoke(id, args)` → CapabilityResult
- 监听现有注册表变更，自动同步

### P3: Provider → Capability 适配器

**新增文件**: `electron/src/service/plugin/capability/ProviderAdapter.ts`

- 将 ProviderRegistry 中的每个 Provider 包装为 Capability
- TTI Provider → tool capability, tags: ['image-generation', 'tti', providerType]
  - inputSchema: { prompt: string, negativePrompt?: string, width?: number, height?: number, ... }
  - invoke → 调用 provider.factory → 执行生成 → 返回图片 URL/base64
- ITV Provider → tool capability, tags: ['video-generation', 'itv']
- TTS Provider → tool capability, tags: ['text-to-speech', 'tts']
- LLM Provider → tool capability, tags: ['language-model', 'llm']

### P4: MCP → Capability 适配器

**新增文件**: `electron/src/service/plugin/capability/MCPAdapter.ts`

- 将 MCPManager 和 mcpRegistry 中的工具/资源包装为 Capability
- 外部 MCP Tool → tool capability, source: mcp-external
- 内部 MCP Tool → tool capability, source: mcp-internal
- MCP Resource → resource capability

### P5: MCP 配置导入 (MCPConfigLoader)

**新增文件**: `electron/src/service/chat/mcp/MCPConfigLoader.ts`

- 支持从 JSON 文件导入 MCP 服务器配置
- 兼容 Claude Desktop mcpServers 格式:
  ```json
  {
    "mcpServers": {
      "server-name": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-xxx"],
        "env": {}
      }
    }
  }
  ```
- `loadFromFile(path)` → 解析 → 批量调用 mcpManager.connect()
- `loadFromObject(config)` → 同上
- `exportConfig()` → 导出当前连接为 JSON

**修改文件**: `electron/src/controller/chat.ts`
- 新增 IPC: `chat:mcp:importConfig`, `chat:mcp:exportConfig`

### P6: 生图能力 (Image Generation)

**新增文件**: `examples/plugins/image-gen/manifest.json` + `dist/index.js`

这是一个 **MCP 类型插件**，通过 PluginAPI 调用 ProviderRegistry 中的 TTI 渠道:

```javascript
createMCPServer() {
  return {
    name: 'image-gen',
    transport: 'internal',
    tools: [{
      definition: {
        name: 'generate_image',
        description: '文本生图 - 根据描述生成图片',
        inputSchema: { prompt, negativePrompt, width, height, model }
      },
      handler: async (args) => {
        // 通过 CapabilityRegistry 查找可用的 TTI provider
        // 调用 provider 生成图片
        // 返回 { url, base64, metadata }
      }
    }, {
      definition: {
        name: 'image_to_video',
        description: '图生视频 - 根据图片生成视频',
        inputSchema: { imageUrl, prompt, duration }
      },
      handler: async (args) => { ... }
    }]
  };
}
```

同时在 CapabilityRegistry 层面，ProviderAdapter 自动将 TTI/ITV Provider 暴露为 Capability，
所以即使不装插件，Agent 也能通过 capability 调用生图。

### P7: AgentTemplate + AgentWorker 增强

**修改文件**: `electron/src/service/chat/types.ts`

```typescript
interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  // 新增: 能力需求
  requiredCapabilities?: string[];  // 标签匹配: ['image-generation']
  allowedCapabilities?: string[];   // 精确ID白名单
  // 新增: 工作流
  mode?: 'single' | 'orchestrated'; // 单 Agent 还是编排模式
  workerIds?: string[];              // orchestrated 模式下的 Worker 列表
  // 保留原有
  enabledTools?: string[];
  temperature?: number;
  maxTokens?: number;
  icon?: string;
  color?: string;
  isPreset?: boolean;
}
```

**修改文件**: `electron/src/service/chat/AgentWorker.ts`

- 构造函数新增: 从 CapabilityRegistry 解析能力 → 转为工具
- `resolveCapabilities()` 方法: 根据 Worker 定义的 requiredCapabilities 查找并注入

**修改文件**: `electron/src/service/chat/AgentOrchestrator.ts`

- `initWorkers()` 时注入 capability-resolved 工具

### P8: ChatService 集成 Orchestrator 路径

**修改文件**: `electron/src/service/chat/ChatService.ts`

- `sendMessage` / `sendMessageStream` 根据会话配置的 AgentTemplate.mode 选择路径:
  - `single` → 现有 AgentGraph 路径
  - `orchestrated` → AgentOrchestrator 路径

### P9: Controller + IPC 扩展

**修改文件**: `electron/src/controller/chat.ts`

- `chat:capability:list` → 列出所有可用能力
- `chat:capability:invoke` → 调用能力
- `chat:mcp:importConfig` → 导入 MCP 配置
- `chat:mcp:exportConfig` → 导出 MCP 配置
- `chat:agent:templates` → 列出 Agent 模板 (含增强字段)

---

## 文件变更清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `electron/src/service/plugin/capability/types.ts` | Capability 类型定义 |
| `electron/src/service/plugin/capability/CapabilityRegistry.ts` | 统一能力注册表 |
| `electron/src/service/plugin/capability/ProviderAdapter.ts` | Provider → Capability 适配 |
| `electron/src/service/plugin/capability/MCPAdapter.ts` | MCP → Capability 适配 |
| `electron/src/service/plugin/capability/index.ts` | 模块导出 |
| `electron/src/service/chat/mcp/MCPConfigLoader.ts` | MCP 配置导入/导出 |
| `examples/plugins/image-gen/manifest.json` | 生图插件清单 |
| `examples/plugins/image-gen/dist/index.js` | 生图插件实现 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `electron/src/service/plugin/types.ts` | 新增 Capability 相关类型到 PluginAPI |
| `electron/src/service/plugin/registries/index.ts` | 导出 capabilityRegistry |
| `electron/src/service/plugin/runtime.ts` | 激活插件时同步 Capability |
| `electron/src/service/plugin/index.ts` | 导出 capability 模块 |
| `electron/src/service/chat/types.ts` | 增强 AgentTemplate, SessionConfig |
| `electron/src/service/chat/AgentWorker.ts` | 使用 CapabilityRegistry 解析工具 |
| `electron/src/service/chat/AgentOrchestrator.ts` | 支持 capability-aware 初始化 |
| `electron/src/service/chat/ChatService.ts` | Orchestrator 路径集成 |
| `electron/src/service/chat/mcp/index.ts` | 导出 MCPConfigLoader |
| `electron/src/controller/chat.ts` | 新增 capability/config IPC |

---

## 执行顺序

P1 → P2 → P3 + P4 (并行) → P5 + P6 (并行) → P7 → P8 → P9
