/**
 * Function Call 插件
 */
import type { ChatPlugin, PluginContext, ToolHandler } from './types';
import type { ToolDefinition, ChatResponse } from '../types';

export class FunctionCallPlugin implements ChatPlugin {
  name = 'function-call';
  version = '1.0.0';

  private tools: Map<string, ToolHandler> = new Map();

  registerTool(definition: ToolDefinition, execute: (args: unknown) => Promise<unknown>): void {
    this.tools.set(definition.name, { definition, execute });
  }

  unregisterTool(name: string): void {
    this.tools.delete(name);
  }

  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  async executeTool(name: string, args: unknown): Promise<unknown> {
    const handler = this.tools.get(name);
    if (!handler) {
      throw new Error(`工具未找到: ${name}`);
    }
    return handler.execute(args);
  }

  async onAfterResponse(context: PluginContext, response: ChatResponse): Promise<void> {
    if (!response.toolCalls?.length) {
      return;
    }

    // 执行工具调用并添加结果到会话
    for (const call of response.toolCalls) {
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
