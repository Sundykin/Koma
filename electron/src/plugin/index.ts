/**
 * 插件系统统一导出
 */

// 宿主管理器
export { pluginHost } from './host';
export type {
  PluginManifest,
  PluginStatus,
  PluginRuntime,
  PluginInfo,
} from './host';

// 能力点注册表
export { capabilityRegistry } from './capability/registry';
export type {
  CapabilityDescriptor,
  CapabilityContribution,
  CapabilityContext,
  CapabilityHandler,
} from './capability/registry';

// MCP Gateway
export { mcpGateway } from './mcp/gateway';
export type {
  McpToolDefinition,
  McpResourceDefinition,
  McpPromptDefinition,
  McpCallContext,
  McpToolHandler,
  McpResourceHandler,
  McpPromptHandler,
} from './mcp/gateway';

// Provider 类型
export * from './types';
