/**
 * MCP 管理器
 * 支持 stdio, SSE, WebSocket 三种传输
 */
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import type {
  MCPServerConfig,
  MCPConnection,
  MCPToolDefinition,
  MCPResource,
} from '../types';

interface MCPRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface MCPTransport {
  send(request: MCPRequest): Promise<MCPResponse>;
  close(): Promise<void>;
}

// Stdio 传输实现
class StdioTransport implements MCPTransport {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: MCPResponse) => void;
    reject: (error: Error) => void;
  }>();
  private buffer = '';

  constructor(private config: MCPServerConfig) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { command, args = [], env } = this.config;
      if (!command) {
        reject(new Error('stdio transport requires command'));
        return;
      }

      this.process = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...env },
        shell: true,
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        console.error(`[MCP ${this.config.name}] stderr:`, data.toString());
      });

      this.process.on('error', (err) => {
        reject(err);
      });

      this.process.on('exit', (code) => {
        if (code !== 0) {
          console.error(`[MCP ${this.config.name}] exited with code ${code}`);
        }
        this.cleanup();
      });

      // 等待进程启动
      setTimeout(() => resolve(), 100);
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line) as MCPResponse;
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          this.pendingRequests.delete(response.id);
          pending.resolve(response);
        }
      } catch (e) {
        // 忽略非 JSON 行
      }
    }
  }

  async send(request: MCPRequest): Promise<MCPResponse> {
    if (!this.process?.stdin) {
      throw new Error('Transport not connected');
    }

    const id = ++this.requestId;
    const req = { ...request, id };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.process!.stdin!.write(JSON.stringify(req) + '\n');

      // 超时处理
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  async close(): Promise<void> {
    this.cleanup();
  }

  private cleanup(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    for (const pending of this.pendingRequests.values()) {
      pending.reject(new Error('Transport closed'));
    }
    this.pendingRequests.clear();
  }
}

// SSE 传输实现
class SSETransport implements MCPTransport {
  private baseUrl: string;

  constructor(private config: MCPServerConfig) {
    if (!config.url) {
      throw new Error('SSE transport requires url');
    }
    this.baseUrl = config.url;
  }

  async send(request: MCPRequest): Promise<MCPResponse> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    return response.json();
  }

  async close(): Promise<void> {
    // SSE 是无状态的
  }
}

// WebSocket 传输实现
class WebSocketTransport implements MCPTransport {
  private ws: WebSocket | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: MCPResponse) => void;
    reject: (error: Error) => void;
  }>();

  constructor(private config: MCPServerConfig) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.config.url) {
        reject(new Error('WebSocket transport requires url'));
        return;
      }

      // Node.js 环境使用 ws 包
      const WebSocketImpl = require('ws');
      this.ws = new WebSocketImpl(this.config.url);

      this.ws!.onopen = () => resolve();
      this.ws!.onerror = (err: any) => reject(err);
      this.ws!.onmessage = (event: any) => {
        try {
          const response = JSON.parse(event.data) as MCPResponse;
          const pending = this.pendingRequests.get(response.id);
          if (pending) {
            this.pendingRequests.delete(response.id);
            pending.resolve(response);
          }
        } catch (e) {
          // 忽略非 JSON 消息
        }
      };
      this.ws!.onclose = () => this.cleanup();
    });
  }

  async send(request: MCPRequest): Promise<MCPResponse> {
    if (!this.ws || this.ws.readyState !== 1) { // OPEN = 1
      throw new Error('Transport not connected');
    }

    const id = ++this.requestId;
    const req = { ...request, id };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify(req));

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.cleanup();
  }

  private cleanup(): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(new Error('Transport closed'));
    }
    this.pendingRequests.clear();
  }
}

// MCP 连接封装
class MCPConnectionImpl {
  private transport: MCPTransport | null = null;
  public tools: MCPToolDefinition[] = [];
  public resources: MCPResource[] = [];
  public status: MCPConnection['status'] = 'disconnected';
  public error?: string;

  constructor(public readonly config: MCPServerConfig) {}

  async connect(): Promise<void> {
    this.status = 'connecting';
    try {
      switch (this.config.transport) {
        case 'stdio':
          this.transport = new StdioTransport(this.config);
          await (this.transport as StdioTransport).connect();
          break;
        case 'sse':
          this.transport = new SSETransport(this.config);
          break;
        case 'websocket':
          this.transport = new WebSocketTransport(this.config);
          await (this.transport as WebSocketTransport).connect();
          break;
        default:
          throw new Error(`Unknown transport: ${this.config.transport}`);
      }

      // 初始化协议
      await this.initialize();

      // 发现工具和资源
      await this.discoverTools();
      await this.discoverResources();

      this.status = 'connected';
      this.error = undefined;
    } catch (err: any) {
      this.status = 'error';
      this.error = err.message;
      throw err;
    }
  }

  private async initialize(): Promise<void> {
    await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {},
      },
      clientInfo: {
        name: 'koma-chat',
        version: '1.0.0',
      },
    });
  }

  private async discoverTools(): Promise<void> {
    try {
      const response = await this.send('tools/list', {});
      const result = response.result as { tools?: Array<{
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
      }> };

      this.tools = (result.tools || []).map(tool => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema || {},
        serverName: this.config.name,
      }));
    } catch (err) {
      console.error(`[MCP ${this.config.name}] Failed to list tools:`, err);
      this.tools = [];
    }
  }

  private async discoverResources(): Promise<void> {
    try {
      const response = await this.send('resources/list', {});
      const result = response.result as { resources?: Array<{
        uri: string;
        name?: string;
        mimeType?: string;
      }> };

      this.resources = (result.resources || []).map(resource => ({
        uri: resource.uri,
        name: resource.name || resource.uri,
        mimeType: resource.mimeType,
        serverName: this.config.name,
      }));
    } catch (err) {
      // 资源发现失败不是致命错误
      this.resources = [];
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const response = await this.send('tools/call', { name, arguments: args });
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.result;
  }

  async readResource(uri: string): Promise<{ content: string; mimeType?: string }> {
    const response = await this.send('resources/read', { uri });
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.result as { content: string; mimeType?: string };
  }

  private async send(method: string, params?: Record<string, unknown>): Promise<MCPResponse> {
    if (!this.transport) {
      throw new Error('Transport not connected');
    }
    return this.transport.send({
      jsonrpc: '2.0',
      id: 0,
      method,
      params,
    });
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    this.status = 'disconnected';
    this.tools = [];
    this.resources = [];
  }

  toSummary(): MCPConnection {
    return {
      name: this.config.name,
      transport: this.config.transport,
      status: this.status,
      tools: this.tools,
      resources: this.resources,
      error: this.error,
    };
  }
}

export class MCPManager extends EventEmitter {
  private connections = new Map<string, MCPConnectionImpl>();

  async connect(config: MCPServerConfig): Promise<MCPConnection> {
    // 已存在则先断开
    if (this.connections.has(config.name)) {
      await this.disconnect(config.name);
    }

    const connection = new MCPConnectionImpl(config);
    this.connections.set(config.name, connection);

    try {
      await connection.connect();
      this.emit('connected', connection.toSummary());
    } catch (err) {
      this.emit('error', { name: config.name, error: err });
      throw err;
    }

    return connection.toSummary();
  }

  async disconnect(name: string): Promise<void> {
    const connection = this.connections.get(name);
    if (connection) {
      await connection.disconnect();
      this.connections.delete(name);
      this.emit('disconnected', { name });
    }
  }

  async disconnectAll(): Promise<void> {
    for (const name of this.connections.keys()) {
      await this.disconnect(name);
    }
  }

  listConnections(): MCPConnection[] {
    return Array.from(this.connections.values()).map(c => c.toSummary());
  }

  listTools(): MCPToolDefinition[] {
    const tools: MCPToolDefinition[] = [];
    for (const connection of this.connections.values()) {
      tools.push(...connection.tools);
    }
    return tools;
  }

  listResources(): MCPResource[] {
    const resources: MCPResource[] = [];
    for (const connection of this.connections.values()) {
      resources.push(...connection.resources);
    }
    return resources;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    // 查找工具所属的连接
    for (const connection of this.connections.values()) {
      const tool = connection.tools.find(t => t.name === name);
      if (tool) {
        return connection.callTool(name, args);
      }
    }
    throw new Error(`Tool not found: ${name}`);
  }

  async readResource(uri: string): Promise<{ content: string; mimeType?: string }> {
    // 查找资源所属的连接
    for (const connection of this.connections.values()) {
      const resource = connection.resources.find(r => r.uri === uri);
      if (resource) {
        return connection.readResource(uri);
      }
    }
    throw new Error(`Resource not found: ${uri}`);
  }

  getConnection(name: string): MCPConnection | undefined {
    return this.connections.get(name)?.toSummary();
  }
}

export const mcpManager = new MCPManager();
export default mcpManager;
