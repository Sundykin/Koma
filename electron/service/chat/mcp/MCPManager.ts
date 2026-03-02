/**
 * MCP 管理器
 * 支持 stdio, SSE, WebSocket 三种传输
 * 包含心跳检测、自动重连、熔断保护
 */
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import type {
  MCPServerConfig,
  MCPConnection,
  MCPToolDefinition,
  MCPResource,
} from '../types';
import { InternalTransport } from './InternalTransport';
import { logger } from 'ee-core/log';

// ── Health config ──
const HEARTBEAT_INTERVAL_MS = 30_000;
const RECONNECT_MAX_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 2_000;
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_RESET_MS = 120_000;

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
  private connected = false;

  constructor(private config: MCPServerConfig) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { command, args = [], env } = this.config;
      if (!command) {
        reject(new Error('stdio transport requires command'));
        return;
      }

      // Windows 上需要特殊处理 npx
      let finalCommand = command;
      let finalArgs = args;
      if (process.platform === 'win32') {
        if (command === 'npx' || command === 'npm' || command === 'node') {
          finalCommand = 'cmd.exe';
          finalArgs = ['/c', command, ...args];
        }
      }

      logger.info(`[MCP ${this.config.name}] Starting: ${finalCommand} ${finalArgs.join(' ')}`);

      this.process = spawn(finalCommand, finalArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...env },
        windowsHide: true,
      });

      let startupTimeout: NodeJS.Timeout;
      let hasError = false;

      this.process.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        logger.debug(`[MCP ${this.config.name}] stdout:`, text.slice(0, 500));
        this.buffer += text;
        this.processBuffer();

        // 收到数据说明进程已启动
        if (!this.connected && !hasError) {
          this.connected = true;
          clearTimeout(startupTimeout);
          resolve();
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        logger.warn(`[MCP ${this.config.name}] stderr:`, text);
        // 某些 MCP 服务器会在 stderr 输出日志，不一定是错误
      });

      this.process.on('error', (err) => {
        logger.error(`[MCP ${this.config.name}] process error:`, err);
        hasError = true;
        if (!this.connected) {
          clearTimeout(startupTimeout);
          reject(new Error(`Failed to start process: ${err.message}`));
        }
      });

      this.process.on('exit', (code, signal) => {
        logger.info(`[MCP ${this.config.name}] exited with code ${code}, signal ${signal}`);
        if (!this.connected && !hasError) {
          hasError = true;
          clearTimeout(startupTimeout);
          reject(new Error(`Process exited unexpectedly with code ${code}, signal ${signal}`));
        }
        this.cleanup();
      });

      // 等待启动超时
      startupTimeout = setTimeout(() => {
        if (!this.connected && !hasError) {
          this.connected = true; // 假设已连接，让后续请求决定
          logger.info(`[MCP ${this.config.name}] Startup timeout, assuming connected`);
          resolve();
        }
      }, 5000);
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
    if (!this.process || !this.process.stdin || this.process.killed) {
      throw new Error('Transport not connected');
    }

    const id = ++this.requestId;
    const req = { ...request, id };

    logger.debug(`[MCP ${this.config.name}] Sending:`, JSON.stringify(req).slice(0, 200));

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      try {
        this.process!.stdin!.write(JSON.stringify(req) + '\n', (err) => {
          if (err) {
            this.pendingRequests.delete(id);
            reject(err);
          }
        });
      } catch (err) {
        this.pendingRequests.delete(id);
        reject(err);
        return;
      }

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

  // 发送通知（不需要响应）
  async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    if (!this.process || !this.process.stdin || this.process.killed) {
      return;
    }
    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    logger.debug(`[MCP ${this.config.name}] Sending notification:`, method);
    this.process.stdin.write(JSON.stringify(notification) + '\n');
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

    return response.json() as Promise<MCPResponse>;
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

  // Health management
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private consecutiveFailures = 0;
  private circuitOpen = false;
  private circuitOpenedAt = 0;
  public lastHeartbeat: number = 0;

  constructor(
    public readonly config: MCPServerConfig,
    private onStatusChange?: (name: string, status: MCPConnection['status'], error?: string) => void,
  ) {}

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
        case 'internal':
          // 内部传输：直接代理到插件注册表
          this.transport = new InternalTransport(this.config.pluginId);
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
      this.reconnectAttempts = 0;
      this.consecutiveFailures = 0;
      this.lastHeartbeat = Date.now();

      // Start heartbeat for stateful transports
      if (this.config.transport !== 'sse') {
        this.startHeartbeat();
      }
    } catch (err: any) {
      this.status = 'error';
      this.error = err.message;
      throw err;
    }
  }

  private async initialize(): Promise<void> {
    const response = await this.send('initialize', {
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
    logger.debug(`[MCP ${this.config.name}] Initialize response:`, response);

    // 发送 initialized 通知 (MCP 协议要求)
    if (this.transport) {
      try {
        await (this.transport as StdioTransport).sendNotification('notifications/initialized', {});
      } catch (e) {
        // 通知失败不是致命错误
        logger.warn(`[MCP ${this.config.name}] Failed to send initialized notification:`, e);
      }
    }
  }

  private async discoverTools(): Promise<void> {
    try {
      const response = await this.send('tools/list', {});
      const result = response.result as { tools?: Array<{
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
      }> };

      // 使用 pluginId 或 serverName 作为命名空间
      const namespace = this.config.pluginId || this.config.name;

      this.tools = (result.tools || []).map(tool => {
        // 强制命名空间：pluginId:toolName 或 serverName:toolName
        const namespacedName = tool.name.includes(':') ? tool.name : `${namespace}:${tool.name}`;
        return {
          name: namespacedName,
          description: tool.description || '',
          inputSchema: tool.inputSchema || {},
          serverName: this.config.name,
          pluginId: this.config.pluginId,
        };
      });
    } catch (err) {
      logger.error(`[MCP ${this.config.name}] Failed to list tools:`, err);
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
    // 如果工具名包含命名空间，去掉前缀再调用 MCP 服务器
    const actualName = name.includes(':') ? name.split(':').slice(1).join(':') : name;
    const response = await this.send('tools/call', { name: actualName, arguments: args });
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
    this.stopHeartbeat();
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    this.status = 'disconnected';
    this.tools = [];
    this.resources = [];
  }

  // ── Heartbeat ──

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => this.ping(), HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Lightweight ping — sends a tools/list request to verify transport is alive */
  private async ping(): Promise<void> {
    if (this.status !== 'connected' || !this.transport) return;
    try {
      await this.send('tools/list', {});
      this.lastHeartbeat = Date.now();
      this.consecutiveFailures = 0;
    } catch {
      logger.warn(`[MCP ${this.config.name}] Heartbeat failed`);
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
        this.openCircuit();
      }
      this.status = 'error';
      this.error = 'Heartbeat failed';
      this.onStatusChange?.(this.config.name, 'error', 'Heartbeat failed');
    }
  }

  // ── Circuit breaker ──

  private openCircuit(): void {
    if (this.circuitOpen) return;
    this.circuitOpen = true;
    this.circuitOpenedAt = Date.now();
    logger.warn(`[MCP ${this.config.name}] Circuit opened after ${this.consecutiveFailures} failures`);
  }

  isCircuitOpen(): boolean {
    if (!this.circuitOpen) return false;
    // Auto-reset after cooldown
    if (Date.now() - this.circuitOpenedAt > CIRCUIT_RESET_MS) {
      this.circuitOpen = false;
      this.consecutiveFailures = 0;
      logger.info(`[MCP ${this.config.name}] Circuit reset`);
      return false;
    }
    return true;
  }

  recordToolFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
      this.openCircuit();
    }
  }

  recordToolSuccess(): void {
    if (this.consecutiveFailures > 0) {
      this.consecutiveFailures = 0;
      this.circuitOpen = false;
    }
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
  private reconnectTimers = new Map<string, NodeJS.Timeout>();
  /** Stored configs for auto-reconnect */
  private configs = new Map<string, MCPServerConfig>();

  async connect(config: MCPServerConfig): Promise<MCPConnection> {
    // 已存在则先断开
    if (this.connections.has(config.name)) {
      await this.disconnect(config.name);
    }

    this.configs.set(config.name, config);

    const connection = new MCPConnectionImpl(config, (name, status, error) => {
      this.emit('status-change', { name, status, error });
      // Trigger auto-reconnect on error for non-internal transports
      if (status === 'error' && config.transport !== 'internal') {
        this.scheduleReconnect(name);
      }
    });
    this.connections.set(config.name, connection);

    try {
      await connection.connect();
      this.emit('connected', connection.toSummary());
    } catch (err) {
      this.emit('error', { name: config.name, error: err });
      // Schedule reconnect on initial failure
      if (config.transport !== 'internal') {
        this.scheduleReconnect(config.name);
      }
      throw err;
    }

    return connection.toSummary();
  }

  async disconnect(name: string): Promise<void> {
    this.cancelReconnect(name);
    const connection = this.connections.get(name);
    if (connection) {
      await connection.disconnect();
      this.connections.delete(name);
      this.configs.delete(name);
      this.emit('disconnected', { name });
    }
  }

  async disconnectAll(): Promise<void> {
    for (const name of [...this.connections.keys()]) {
      await this.disconnect(name);
    }
  }

  // ── Auto-reconnect ──

  private scheduleReconnect(name: string): void {
    this.cancelReconnect(name);
    const conn = this.connections.get(name);
    if (!conn) return;

    // Access reconnect attempts through the connection
    const config = this.configs.get(name);
    if (!config) return;

    conn['reconnectAttempts']++;
    const attempt = conn['reconnectAttempts'];

    if (attempt > RECONNECT_MAX_ATTEMPTS) {
      logger.warn(`[MCP] ${name}: max reconnect attempts (${RECONNECT_MAX_ATTEMPTS}) reached, giving up`);
      this.emit('reconnect-failed', { name, attempts: attempt });
      return;
    }

    const delay = Math.min(RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt - 1), 60_000);
    logger.info(`[MCP] ${name}: scheduling reconnect attempt ${attempt} in ${delay}ms`);

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(name);
      try {
        // Disconnect old transport
        const oldConn = this.connections.get(name);
        if (oldConn) {
          await oldConn.disconnect();
          this.connections.delete(name);
        }
        // Re-connect with stored config
        await this.connect(config);
        logger.info(`[MCP] ${name}: reconnected on attempt ${attempt}`);
        this.emit('reconnected', { name, attempt });
      } catch (err) {
        logger.warn(`[MCP] ${name}: reconnect attempt ${attempt} failed`);
        // scheduleReconnect will be triggered again by status-change callback
      }
    }, delay);

    this.reconnectTimers.set(name, timer);
  }

  private cancelReconnect(name: string): void {
    const timer = this.reconnectTimers.get(name);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(name);
    }
  }

  listConnections(): MCPConnection[] {
    return Array.from(this.connections.values()).map(c => c.toSummary());
  }

  /** Get connection health summary */
  getHealthStatus(): Array<{ name: string; status: MCPConnection['status']; lastHeartbeat: number; circuitOpen: boolean }> {
    return Array.from(this.connections.values()).map(c => ({
      name: c.config.name,
      status: c.status,
      lastHeartbeat: c.lastHeartbeat,
      circuitOpen: c.isCircuitOpen(),
    }));
  }

  listTools(): MCPToolDefinition[] {
    const tools: MCPToolDefinition[] = [];
    for (const connection of this.connections.values()) {
      if (!connection.isCircuitOpen()) {
        tools.push(...connection.tools);
      }
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
      if (connection.isCircuitOpen()) continue;
      const tool = connection.tools.find(t => t.name === name);
      if (tool) {
        try {
          const result = await connection.callTool(name, args);
          connection.recordToolSuccess();
          return result;
        } catch (err) {
          connection.recordToolFailure();
          throw err;
        }
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
