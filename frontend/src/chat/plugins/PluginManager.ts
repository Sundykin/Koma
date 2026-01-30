/**
 * 插件管理器
 */
import type { ChatPlugin, PluginContext, ToolHandler } from './types';
import type { ChatResponse, ChatChunk, ToolDefinition } from '../types';

export class PluginManager {
  private plugins: Map<string, ChatPlugin> = new Map();

  register(plugin: ChatPlugin): void {
    this.plugins.set(plugin.name, plugin);
  }

  unregister(name: string): void {
    this.plugins.delete(name);
  }

  getPlugin(name: string): ChatPlugin | undefined {
    return this.plugins.get(name);
  }

  getAllPlugins(): ChatPlugin[] {
    return Array.from(this.plugins.values());
  }

  async executeBeforeRequest(context: PluginContext): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.onBeforeRequest) {
        await plugin.onBeforeRequest(context);
      }
    }
  }

  async executeAfterResponse(context: PluginContext, response: ChatResponse): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.onAfterResponse) {
        await plugin.onAfterResponse(context, response);
      }
    }
  }

  async executeOnStreamChunk(context: PluginContext, chunk: ChatChunk): Promise<ChatChunk> {
    let result = chunk;
    for (const plugin of this.plugins.values()) {
      if (plugin.onStreamChunk) {
        result = await plugin.onStreamChunk(context, result);
      }
    }
    return result;
  }

  async executeOnError(context: PluginContext, error: Error): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.onError) {
        await plugin.onError(context, error);
      }
    }
  }

  collectTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.getTools) {
        tools.push(...plugin.getTools());
      }
    }
    return tools;
  }

  async executeTool(name: string, args: unknown): Promise<unknown> {
    for (const plugin of this.plugins.values()) {
      if (plugin.executeTool && plugin.getTools) {
        const tools = plugin.getTools();
        if (tools.some(t => t.name === name)) {
          return plugin.executeTool(name, args);
        }
      }
    }
    throw new Error(`工具未找到: ${name}`);
  }
}
