# Proposal: add-chat-module

## Summary
重构随机剧本生成功能，并开发一个通用的多轮对话模块。

## Problem Statement

### 当前问题
1. **随机剧本生成逻辑不连贯**：当前实现分两步（先生成创意 → 再生成剧本），导致：
   - 两次 LLM 调用之间缺乏上下文连续性
   - 创意和剧本可能风格不一致
   - 增加了不必要的延迟和 token 消耗

2. **缺乏通用对话能力**：项目中没有可复用的多轮对话模块，限制了：
   - 用户与 AI 的交互式创作体验
   - Agent 模式和工具调用的扩展
   - 复杂流式对话的渲染

### 目标
1. 将随机剧本生成改为一步完成，直接生成随机剧本
2. 开发一个通用的对话模块，支持：
   - 多轮对话历史管理
   - 流式输出渲染
   - 多模型统一抽象
   - Agent 模式 / MCP / Function Call 扩展
   - 文件上传能力

## Proposed Solution

### 1. 简化随机剧本生成
- 合并 `random_idea_generation` 和 `script_generation` 为单一 Prompt
- 一次 LLM 调用直接输出完整剧本
- 保留创意元素作为剧本元数据

### 2. 通用对话模块架构

```
frontend/src/
├── chat/                          # 对话模块根目录
│   ├── types.ts                   # 核心类型定义
│   ├── ChatSession.ts             # 会话管理器
│   ├── ChatRenderer.tsx           # 对话渲染组件 (基于 ds-markdown)
│   │
│   ├── adapters/                  # 模型适配器层
│   │   ├── types.ts               # 适配器接口
│   │   ├── BaseAdapter.ts         # 基础适配器
│   │   ├── OpenAIAdapter.ts       # OpenAI 兼容适配器
│   │   ├── GeminiAdapter.ts       # Gemini 适配器
│   │   ├── ClaudeAdapter.ts       # Claude 适配器
│   │   └── index.ts               # 适配器工厂
│   │
│   ├── plugins/                   # 插件系统
│   │   ├── types.ts               # 插件接口
│   │   ├── PluginManager.ts       # 插件管理器
│   │   ├── FunctionCallPlugin.ts  # Function Call 插件
│   │   ├── MCPPlugin.ts           # MCP 协议插件
│   │   └── FileUploadPlugin.ts    # 文件上传插件
│   │
│   └── hooks/                     # React Hooks
│       ├── useChat.ts             # 对话状态管理
│       ├── useChatStream.ts       # 流式输出处理
│       └── useChatHistory.ts      # 历史记录管理
```

### 3. 核心抽象设计

#### 统一消息格式
```typescript
interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

interface ContentPart {
  type: 'text' | 'image' | 'file';
  text?: string;
  imageUrl?: string;
  fileData?: FileData;
}
```

#### 模型适配器接口
```typescript
interface ChatAdapter {
  readonly type: string;

  // 核心方法
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk>;

  // 能力检测
  supports(capability: AdapterCapability): boolean;

  // 连接测试
  testConnection(): Promise<boolean>;
}

type AdapterCapability =
  | 'streaming'
  | 'function_call'
  | 'vision'
  | 'file_upload'
  | 'structured_output';
```

#### 插件接口
```typescript
interface ChatPlugin {
  name: string;
  version: string;

  // 生命周期钩子
  onBeforeRequest?(context: PluginContext): Promise<void>;
  onAfterResponse?(context: PluginContext, response: ChatResponse): Promise<void>;
  onStreamChunk?(context: PluginContext, chunk: ChatChunk): Promise<ChatChunk>;
  onError?(context: PluginContext, error: Error): Promise<void>;

  // 工具注册 (for Function Call / MCP)
  getTools?(): ToolDefinition[];
  executeTool?(name: string, args: unknown): Promise<unknown>;
}
```

## Impact Analysis

### 受影响的文件
- `frontend/src/workflow/scriptGenerator.ts` - 简化随机生成逻辑
- `frontend/src/store/promptTemplates.ts` - 新增/修改 Prompt 模板
- `frontend/src/components/project/ScriptWorkbench.tsx` - 可能的 UI 调整

### 新增文件
- `frontend/src/chat/` 目录下的所有文件

### 依赖变更
- 新增 `ds-markdown` 依赖用于流式 Markdown 渲染

## Risks and Mitigations

| 风险 | 影响 | 缓解措施 |
|-----|------|---------|
| 对话模块复杂度高 | 开发周期长 | 分阶段实现，先核心后扩展 |
| 不同模型 API 差异大 | 适配器实现困难 | 定义最小公共接口，差异通过能力检测处理 |
| 流式渲染性能问题 | 用户体验差 | 使用 ds-markdown 成熟方案，做好性能测试 |

## Success Criteria
1. 随机剧本生成一步完成，响应时间减少 30%+
2. 对话模块支持至少 3 种模型（OpenAI/Gemini/Claude）
3. 流式输出渲染流畅，无明显卡顿
4. 插件系统可扩展，支持 Function Call 基础能力

## Related Specs
- `model-providers` - 现有 Provider 抽象
- `script-generation` - 剧本生成规范
