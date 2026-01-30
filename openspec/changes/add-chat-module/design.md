# Design: add-chat-module

## Architecture Overview

本设计文档描述通用对话模块的架构设计，该模块将作为项目中所有 AI 对话交互的基础设施。

## Design Principles

1. **业务无关性**：对话模块不绑定任何具体业务，系统提示词由调用方注入
2. **插件化扩展**：通过插件机制支持 Function Call、MCP、文件上传等能力
3. **统一抽象**：所有模型通过适配器层统一调用规范
4. **流式优先**：默认支持流式输出，提升用户体验

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Application Layer                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │ ScriptWorkshop  │  │ ChatDialog      │  │ AgentPanel      │     │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘     │
└───────────┼─────────────────────┼─────────────────────┼─────────────┘
            │                     │                     │
            └─────────────────────┼─────────────────────┘
                                  │
┌─────────────────────────────────┼───────────────────────────────────┐
│                         Chat Module                                  │
│  ┌──────────────────────────────┴──────────────────────────────┐   │
│  │                      useChat Hook                            │   │
│  │  - 会话状态管理                                               │   │
│  │  - 消息发送/接收                                              │   │
│  │  - 流式输出处理                                               │   │
│  └──────────────────────────────┬──────────────────────────────┘   │
│                                 │                                   │
│  ┌──────────────────────────────┴──────────────────────────────┐   │
│  │                    ChatSession                               │   │
│  │  - 消息历史管理                                               │   │
│  │  - 上下文窗口控制                                             │   │
│  │  - 会话持久化                                                 │   │
│  └──────────────────────────────┬──────────────────────────────┘   │
│                                 │                                   │
│  ┌──────────────────────────────┴──────────────────────────────┐   │
│  │                   PluginManager                              │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │   │
│  │  │FunctionCall │ │    MCP      │ │ FileUpload  │            │   │
│  │  │   Plugin    │ │   Plugin    │ │   Plugin    │            │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘            │   │
│  └──────────────────────────────┬──────────────────────────────┘   │
│                                 │                                   │
│  ┌──────────────────────────────┴──────────────────────────────┐   │
│  │                   Adapter Layer                              │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │   │
│  │  │   OpenAI    │ │   Gemini    │ │   Claude    │            │   │
│  │  │  Adapter    │ │  Adapter    │ │  Adapter    │            │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘            │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      External LLM APIs                               │
│  OpenAI API  │  Google AI API  │  Anthropic API  │  Compatible APIs │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. ChatSession - 会话管理器

负责管理单个对话会话的完整生命周期。

```typescript
class ChatSession {
  private id: string;
  private messages: ChatMessage[];
  private systemPrompt: string;
  private adapter: ChatAdapter;
  private plugins: ChatPlugin[];
  private options: SessionOptions;

  // 发送消息并获取响应
  async send(content: string | ContentPart[]): Promise<ChatMessage>;

  // 流式发送
  async *sendStream(content: string | ContentPart[]): AsyncIterable<ChatChunk>;

  // 消息管理
  getMessages(): ChatMessage[];
  clearMessages(): void;
  truncateToTokenLimit(maxTokens: number): void;

  // 会话持久化
  async save(): Promise<void>;
  static async load(id: string): Promise<ChatSession>;
}
```

### 2. Adapter Layer - 模型适配器

将不同模型的 API 统一为相同的调用接口。

#### 基础适配器
```typescript
abstract class BaseAdapter implements ChatAdapter {
  protected config: AdapterConfig;

  // 子类必须实现
  abstract chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  abstract chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk>;

  // 通用实现
  supports(capability: AdapterCapability): boolean {
    return this.capabilities.includes(capability);
  }

  // 消息格式转换 - 子类可覆盖
  protected toProviderFormat(messages: ChatMessage[]): unknown;
  protected fromProviderFormat(response: unknown): ChatResponse;
}
```

#### OpenAI 适配器
```typescript
class OpenAIAdapter extends BaseAdapter {
  readonly type = 'openai';
  readonly capabilities = ['streaming', 'function_call', 'vision', 'structured_output'];

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.config.model,
        messages: this.toOpenAIMessages(messages),
        tools: options?.tools,
        response_format: options?.responseFormat,
      }),
    });
    return this.fromOpenAIResponse(await response.json());
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk> {
    // SSE 流式处理
  }
}
```

#### Gemini 适配器
```typescript
class GeminiAdapter extends BaseAdapter {
  readonly type = 'gemini';
  readonly capabilities = ['streaming', 'function_call', 'vision', 'file_upload'];

  // 使用 @google/genai SDK
  private client: GoogleGenerativeAI;

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const model = this.client.getGenerativeModel({ model: this.config.model });
    const result = await model.generateContent({
      contents: this.toGeminiContents(messages),
      tools: options?.tools ? this.toGeminiTools(options.tools) : undefined,
    });
    return this.fromGeminiResponse(result);
  }
}
```

### 3. Plugin System - 插件系统

提供可扩展的能力增强机制。

```typescript
class PluginManager {
  private plugins: Map<string, ChatPlugin> = new Map();

  register(plugin: ChatPlugin): void;
  unregister(name: string): void;

  // 执行生命周期钩子
  async executeBeforeRequest(context: PluginContext): Promise<void>;
  async executeAfterResponse(context: PluginContext, response: ChatResponse): Promise<void>;
  async executeOnStreamChunk(context: PluginContext, chunk: ChatChunk): Promise<ChatChunk>;

  // 收集所有插件的工具定义
  collectTools(): ToolDefinition[];

  // 执行工具调用
  async executeTool(name: string, args: unknown): Promise<unknown>;
}
```

#### Function Call 插件
```typescript
class FunctionCallPlugin implements ChatPlugin {
  name = 'function-call';
  version = '1.0.0';

  private tools: Map<string, ToolHandler> = new Map();

  // 注册工具
  registerTool(definition: ToolDefinition, handler: ToolHandler): void;

  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  async executeTool(name: string, args: unknown): Promise<unknown> {
    const handler = this.tools.get(name);
    if (!handler) throw new Error(`Tool not found: ${name}`);
    return handler.execute(args);
  }

  // 处理响应中的工具调用
  async onAfterResponse(context: PluginContext, response: ChatResponse): Promise<void> {
    if (response.toolCalls?.length) {
      for (const call of response.toolCalls) {
        const result = await this.executeTool(call.name, call.arguments);
        context.session.addToolResult(call.id, result);
      }
      // 继续对话以获取最终响应
      await context.session.continueWithToolResults();
    }
  }
}
```

#### MCP 插件
```typescript
class MCPPlugin implements ChatPlugin {
  name = 'mcp';
  version = '1.0.0';

  private servers: Map<string, MCPServer> = new Map();

  // 连接 MCP 服务器
  async connectServer(config: MCPServerConfig): Promise<void>;

  // 从 MCP 服务器获取工具
  getTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const server of this.servers.values()) {
      tools.push(...server.getTools());
    }
    return tools;
  }

  async executeTool(name: string, args: unknown): Promise<unknown> {
    // 路由到对应的 MCP 服务器执行
  }
}
```

### 4. ChatRenderer - 对话渲染组件

基于 ds-markdown 实现流式 Markdown 渲染。

```typescript
interface ChatRendererProps {
  messages: ChatMessage[];
  streaming?: boolean;
  streamingContent?: string;
  onRetry?: (messageId: string) => void;
  onCopy?: (content: string) => void;
  renderAvatar?: (role: string) => React.ReactNode;
  renderToolCall?: (toolCall: ToolCall) => React.ReactNode;
}

const ChatRenderer: React.FC<ChatRendererProps> = ({
  messages,
  streaming,
  streamingContent,
  ...props
}) => {
  return (
    <div className={styles.chatContainer}>
      {messages.map(msg => (
        <MessageBubble key={msg.id} message={msg} {...props} />
      ))}
      {streaming && streamingContent && (
        <StreamingMessage content={streamingContent} />
      )}
    </div>
  );
};

// 使用 ds-markdown 渲染流式内容
const StreamingMessage: React.FC<{ content: string }> = ({ content }) => {
  return (
    <DsMarkdown
      content={content}
      typing={true}
      typingSpeed={20}
      codeTheme="github-dark"
      enableMath={true}
    />
  );
};
```

### 5. useChat Hook - React 状态管理

```typescript
interface UseChatOptions {
  adapter: ChatAdapter;
  systemPrompt?: string;
  plugins?: ChatPlugin[];
  onError?: (error: Error) => void;
  onStreamStart?: () => void;
  onStreamEnd?: () => void;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;
  error: Error | null;

  send: (content: string | ContentPart[]) => Promise<void>;
  sendStream: (content: string | ContentPart[]) => Promise<void>;
  retry: (messageId: string) => Promise<void>;
  clear: () => void;
  setSystemPrompt: (prompt: string) => void;
}

function useChat(options: UseChatOptions): UseChatReturn {
  const [session] = useState(() => new ChatSession(options));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');

  const sendStream = useCallback(async (content: string | ContentPart[]) => {
    setIsLoading(true);
    setIsStreaming(true);
    setStreamingContent('');

    try {
      const userMessage = session.addUserMessage(content);
      setMessages(prev => [...prev, userMessage]);

      for await (const chunk of session.sendStream(content)) {
        setStreamingContent(prev => prev + chunk.content);
      }

      const assistantMessage = session.getLastMessage();
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      options.onError?.(error as Error);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setStreamingContent('');
    }
  }, [session, options]);

  // ... 其他方法实现

  return {
    messages,
    isLoading,
    isStreaming,
    streamingContent,
    error,
    send,
    sendStream,
    retry,
    clear,
    setSystemPrompt,
  };
}
```

## Data Flow

### 普通对话流程
```
User Input
    │
    ▼
useChat.send()
    │
    ▼
ChatSession.send()
    │
    ├─► PluginManager.executeBeforeRequest()
    │   (插件预处理：添加工具定义等)
    │
    ▼
ChatAdapter.chat()
    │
    ├─► toProviderFormat() (消息格式转换)
    ├─► HTTP Request to LLM API
    └─► fromProviderFormat() (响应格式转换)
    │
    ▼
PluginManager.executeAfterResponse()
    │
    ├─► 检测 toolCalls
    ├─► 执行工具调用
    └─► 继续对话 (如有工具结果)
    │
    ▼
Update Messages State
    │
    ▼
ChatRenderer 渲染
```

### 流式对话流程
```
User Input
    │
    ▼
useChat.sendStream()
    │
    ▼
ChatSession.sendStream()
    │
    ▼
ChatAdapter.chatStream()
    │
    ├─► SSE/WebSocket 连接
    │
    ▼
for await (chunk of stream)
    │
    ├─► PluginManager.executeOnStreamChunk()
    ├─► setStreamingContent(prev + chunk)
    └─► ChatRenderer 实时渲染
    │
    ▼
Stream End
    │
    ▼
Final Message Assembly
```

## Integration with Existing Code

### 与现有 LLM Provider 的关系

现有的 `providers/llm/` 目录下的 Provider 主要用于简单的文本生成场景。新的 Chat Adapter 层将：

1. **复用配置**：使用相同的 `LLMModelConfig` 配置结构
2. **独立实现**：Chat Adapter 专注于对话场景，支持更丰富的特性
3. **渐进迁移**：现有 Provider 继续工作，新功能使用 Chat Module

```typescript
// 从现有配置创建 Chat Adapter
function createChatAdapterFromConfig(config: LLMModelConfig): ChatAdapter {
  switch (config.provider) {
    case 'openai':
    case 'openai-compatible':
      return new OpenAIAdapter({
        baseUrl: config.baseUrl || 'https://api.openai.com/v1',
        apiKey: config.apiKey,
        model: config.modelName,
      });
    case 'gemini':
      return new GeminiAdapter({
        apiKey: config.apiKey,
        model: config.modelName,
      });
    case 'claude':
      return new ClaudeAdapter({
        apiKey: config.apiKey,
        model: config.modelName,
      });
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}
```

## Error Handling

```typescript
// 统一错误类型
class ChatError extends Error {
  constructor(
    message: string,
    public code: ChatErrorCode,
    public cause?: Error
  ) {
    super(message);
    this.name = 'ChatError';
  }
}

enum ChatErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  RATE_LIMIT = 'RATE_LIMIT',
  CONTEXT_LENGTH_EXCEEDED = 'CONTEXT_LENGTH_EXCEEDED',
  TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
}

// 适配器中的错误处理
class OpenAIAdapter extends BaseAdapter {
  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    try {
      const response = await fetch(...);
      if (!response.ok) {
        const error = await response.json();
        throw this.mapOpenAIError(error);
      }
      return this.fromOpenAIResponse(await response.json());
    } catch (error) {
      if (error instanceof ChatError) throw error;
      throw new ChatError('Network error', ChatErrorCode.NETWORK_ERROR, error as Error);
    }
  }

  private mapOpenAIError(error: any): ChatError {
    if (error.code === 'context_length_exceeded') {
      return new ChatError(error.message, ChatErrorCode.CONTEXT_LENGTH_EXCEEDED);
    }
    // ... 其他错误映射
  }
}
```

## Performance Considerations

1. **消息历史裁剪**：当消息历史过长时，自动裁剪早期消息以控制 token 消耗
2. **流式渲染优化**：使用 `requestAnimationFrame` 批量更新 DOM
3. **适配器缓存**：复用适配器实例，避免重复创建
4. **插件懒加载**：按需加载插件，减少初始化开销

## Security Considerations

1. **API Key 保护**：API Key 仅在适配器内部使用，不暴露给前端组件
2. **工具执行沙箱**：Function Call 执行在受限环境中
3. **输入验证**：对用户输入和工具参数进行验证
4. **XSS 防护**：Markdown 渲染时进行 HTML 转义
