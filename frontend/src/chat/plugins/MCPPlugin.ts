/**
 * MCP (Model Context Protocol) 插件
 * 支持连接 MCP 服务器，获取工具和资源
 */
import type { ChatPlugin, PluginContext } from './types';
import type { ToolDefinition, ChatResponse } from '../types';

// MCP 服务器配置
export interface MCPServerConfig {
  name: string;
  transport: 'stdio' | 'sse' | 'websocket';
  command?: string;  // stdio 模式
  args?: string[];   // stdio 模式
  url?: string;      // sse/websocket 模式
  env?: Record<string, string>;
}

// MCP 工具定义
interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// MCP 资源定义
interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// MCP 服务器连接
interface MCPConnection {
  config: MCPServerConfig;
  tools: MCPTool[];
  resources: MCPResource[];
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  error?: string;
}

export class MCPPlugin implements ChatPlugin {
  name = 'mcp';
  version = '1.0.0';

  private connections: Map<string, MCPConnection> = new Map();
  private toolToServer: Map<string, string> = new Map();

  /**
   * 连接 MCP 服务器
   */
  async connectServer(config: MCPServerConfig): Promise<void> {
    const connection: MCPConnection = {
      config,
      tools: [],
      resources: [],
      status: 'connecting',
    };
    this.connections.set(config.name, connection);

    try {
      // 根据传输类型连接
      switch (config.transport) {
        case 'stdio':
          await this.connectStdio(config, connection);
          break;
        case 'sse':
          await this.connectSSE(config, connection);
          break;
        case 'websocket':
          await this.connectWebSocket(config, connection);
          break;
        default:
          throw new Error(`不支持的传输类型: ${config.transport}`);
      }

      connection.status = 'connected';

      // 注册工具到服务器映射
      for (const tool of connection.tools) {
        this.toolToServer.set(tool.name, config.name);
      }
    } catch (error) {
      connection.status = 'error';
      connection.error = error instanceof Error ? error.message : '连接失败';
      throw error;
    }
  }

  /**
   * 断开 MCP 服务器
   */
  async disconnectServer(name: string): Promise<void> {
    const connection = this.connections.get(name);
    if (!connection) return;

    // 移除工具映射
    for (const tool of connection.tools) {
      this.toolToServer.delete(tool.name);
    }

    connection.status = 'disconnected';
    this.connections.delete(name);
  }

  /**
   * 获取所有已连接的服务器
   */
  getConnections(): MCPConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * 获取所有工具定义
   */
  getTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    for (const connection of this.connections.values()) {
      if (connection.status !== 'connected') continue;

      for (const mcpTool of connection.tools) {
        tools.push({
          name: mcpTool.name,
          description: mcpTool.description,
          parameters: {
            type: 'object',
            properties: mcpTool.inputSchema.properties as Record<string, { type: string; description?: string }>,
            required: mcpTool.inputSchema.required,
          },
        });
      }
    }

    return tools;
  }

  /**
   * 执行工具
   */
  async executeTool(name: string, args: unknown): Promise<unknown> {
    const serverName = this.toolToServer.get(name);
    if (!serverName) {
      throw new Error(`工具未找到: ${name}`);
    }

    const connection = this.connections.get(serverName);
    if (!connection || connection.status !== 'connected') {
      throw new Error(`服务器未连接: ${serverName}`);
    }

    // 调用 MCP 服务器执行工具
    return this.callTool(connection, name, args);
  }

  /**
   * 获取资源
   */
  async getResource(uri: string): Promise<{ content: string; mimeType?: string }> {
    // 查找包含该资源的服务器
    for (const connection of this.connections.values()) {
      if (connection.status !== 'connected') continue;

      const resource = connection.resources.find(r => r.uri === uri);
      if (resource) {
        return this.readResource(connection, uri);
      }
    }

    throw new Error(`资源未找到: ${uri}`);
  }

  /**
   * 列出所有资源
   */
  listResources(): MCPResource[] {
    const resources: MCPResource[] = [];

    for (const connection of this.connections.values()) {
      if (connection.status !== 'connected') continue;
      resources.push(...connection.resources);
    }

    return resources;
  }

  // ========== 私有方法 ==========

  private async connectStdio(config: MCPServerConfig, connection: MCPConnection): Promise<void> {
    // stdio 模式需要 Electron 环境支持
    // 这里提供一个占位实现，实际需要通过 IPC 与主进程通信
    console.warn('MCP stdio 模式需要 Electron 环境支持');

    // 模拟获取工具列表
    // 实际实现需要启动子进程并通过 stdin/stdout 通信
    connection.tools = [];
    connection.resources = [];
  }

  private async connectSSE(config: MCPServerConfig, connection: MCPConnection): Promise<void> {
    if (!config.url) {
      throw new Error('SSE 模式需要指定 URL');
    }

    // 获取工具列表
    const toolsResponse = await fetch(`${config.url}/tools/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (toolsResponse.ok) {
      const data = await toolsResponse.json();
      connection.tools = data.tools || [];
    }

    // 获取资源列表
    const resourcesResponse = await fetch(`${config.url}/resources/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (resourcesResponse.ok) {
      const data = await resourcesResponse.json();
      connection.resources = data.resources || [];
    }
  }

  private async connectWebSocket(config: MCPServerConfig, connection: MCPConnection): Promise<void> {
    if (!config.url) {
      throw new Error('WebSocket 模式需要指定 URL');
    }

    // WebSocket 连接实现
    // 这里提供一个简化版本，实际需要完整的 WebSocket 协议处理
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(config.url!);

        ws.onopen = async () => {
          // 发送 list_tools 请求
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
            params: {},
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.id === 1 && data.result) {
              connection.tools = data.result.tools || [];
              resolve();
            }
          } catch {
            // ignore
          }
        };

        ws.onerror = () => {
          reject(new Error('WebSocket 连接失败'));
        };

        // 超时处理
        setTimeout(() => {
          if (connection.status === 'connecting') {
            ws.close();
            reject(new Error('连接超时'));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  private async callTool(connection: MCPConnection, name: string, args: unknown): Promise<unknown> {
    if (connection.config.transport === 'sse' && connection.config.url) {
      const response = await fetch(`${connection.config.url}/tools/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          arguments: args,
        }),
      });

      if (!response.ok) {
        throw new Error(`工具调用失败: ${response.statusText}`);
      }

      const data = await response.json();
      return data.content?.[0]?.text || data.result;
    }

    throw new Error('当前传输模式不支持工具调用');
  }

  private async readResource(connection: MCPConnection, uri: string): Promise<{ content: string; mimeType?: string }> {
    if (connection.config.transport === 'sse' && connection.config.url) {
      const response = await fetch(`${connection.config.url}/resources/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri }),
      });

      if (!response.ok) {
        throw new Error(`资源读取失败: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        content: data.contents?.[0]?.text || '',
        mimeType: data.contents?.[0]?.mimeType,
      };
    }

    throw new Error('当前传输模式不支持资源读取');
  }

  // ========== 生命周期钩子 ==========

  async onAfterResponse(context: PluginContext, response: ChatResponse): Promise<void> {
    // 如果响应中有工具调用，自动执行
    if (!response.toolCalls?.length) return;

    for (const call of response.toolCalls) {
      // 检查是否是 MCP 工具
      if (this.toolToServer.has(call.name)) {
        try {
          const result = await this.executeTool(call.name, call.arguments);
          context.session.addToolResult(call.id, call.name, result);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '工具执行失败';
          context.session.addToolResult(call.id, call.name, { error: errorMessage });
        }
      }
    }
  }
}
