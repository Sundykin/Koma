/**
 * MCP IPC 服务
 * 前端通过 IPC 与 Electron 主进程的 MCPManager 通信
 */

import type {
  MCPServerConfig,
  MCPTool,
  MCPResource,
  MCPConnection,
} from '../types/mcp';
import { getElectronAPI as getBaseElectronAPI } from './electronService';

// Electron API 类型
interface ElectronMCPAPI {
  chat: {
    mcp: {
      connect: (config: MCPServerConfig) => Promise<MCPConnection>;
      disconnect: (name: string) => Promise<void>;
      list: (includeTools?: boolean) => Promise<MCPConnection[]>;
      listTools: () => Promise<MCPTool[]>;
      listResources: () => Promise<MCPResource[]>;
      callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
      readResource: (uri: string) => Promise<{ content: string; mimeType?: string }>;
    };
  };
}

// 获取 Electron API
function getElectronAPI(): ElectronMCPAPI | null {
  const api = getBaseElectronAPI() as any;
  return api?.chat?.mcp ? (api as ElectronMCPAPI) : null;
}

/**
 * MCP 服务
 */
export const mcpService = {
  /**
   * 连接 MCP 服务器
   */
  async connect(config: MCPServerConfig): Promise<MCPConnection> {
    const api = getElectronAPI();
    if (!api) {
      throw new Error('Electron API not available');
    }
    return api.chat.mcp.connect(config);
  },

  /**
   * 断开 MCP 服务器
   */
  async disconnect(name: string): Promise<void> {
    const api = getElectronAPI();
    if (!api) {
      throw new Error('Electron API not available');
    }
    return api.chat.mcp.disconnect(name);
  },

  /**
   * 获取所有连接
   */
  async getConnections(includeTools = true): Promise<MCPConnection[]> {
    const api = getElectronAPI();
    if (!api) {
      return [];
    }
    return api.chat.mcp.list(includeTools);
  },

  /**
   * 获取所有工具
   */
  async getTools(): Promise<MCPTool[]> {
    const api = getElectronAPI();
    if (!api) {
      return [];
    }
    return api.chat.mcp.listTools();
  },

  /**
   * 获取所有资源
   */
  async getResources(): Promise<MCPResource[]> {
    const api = getElectronAPI();
    if (!api) {
      return [];
    }
    return api.chat.mcp.listResources();
  },

  /**
   * 调用工具
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const api = getElectronAPI();
    if (!api) {
      throw new Error('Electron API not available');
    }
    return api.chat.mcp.callTool(name, args);
  },

  /**
   * 读取资源
   */
  async readResource(uri: string): Promise<{ content: string; mimeType?: string }> {
    const api = getElectronAPI();
    if (!api) {
      throw new Error('Electron API not available');
    }
    return api.chat.mcp.readResource(uri);
  },

  /**
   * 允许工具调用
   */
  async approveToolCall(callId: string): Promise<void> {
    const api = getElectronAPI();
    if (!api) {
      throw new Error('Electron API not available');
    }
    // TODO: 实现工具调用审批
    console.log('approveToolCall', callId);
  },

  /**
   * 拒绝工具调用
   */
  async rejectToolCall(callId: string): Promise<void> {
    const api = getElectronAPI();
    if (!api) {
      throw new Error('Electron API not available');
    }
    // TODO: 实现工具调用拒绝
    console.log('rejectToolCall', callId);
  },
};

export default mcpService;
