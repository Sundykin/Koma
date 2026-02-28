/**
 * MCP Gateway
 * 统一管理 MCP 工具、资源、提示词的注册和调用
 */

/** MCP 工具定义 */
export interface McpToolDefinition {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** MCP 资源定义 */
export interface McpResourceDefinition {
  id: string;
  name: string;
  description?: string;
  uri?: string;
  mimeType?: string;
}

/** MCP 提示词定义 */
export interface McpPromptDefinition {
  id: string;
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

/** MCP 调用上下文 */
export interface McpCallContext {
  callerId?: string;
  sessionId?: string;
}

/** MCP 处理器类型 */
export type McpToolHandler = (args: unknown, ctx: McpCallContext) => Promise<unknown>;
export type McpResourceHandler = (args: unknown, ctx: McpCallContext) => Promise<unknown>;
export type McpPromptHandler = (args: unknown, ctx: McpCallContext) => Promise<unknown>;

interface RegisteredTool {
  definition: McpToolDefinition;
  handler: McpToolHandler;
  pluginId?: string;
}

interface RegisteredResource {
  definition: McpResourceDefinition;
  handler: McpResourceHandler;
  pluginId?: string;
}

interface RegisteredPrompt {
  definition: McpPromptDefinition;
  handler: McpPromptHandler;
  pluginId?: string;
}

class McpGateway {
  private tools = new Map<string, RegisteredTool>();
  private resources = new Map<string, RegisteredResource>();
  private prompts = new Map<string, RegisteredPrompt>();

  /** 注册工具 */
  registerTool(definition: McpToolDefinition, handler: McpToolHandler, pluginId?: string): void {
    this.tools.set(definition.id, { definition, handler, pluginId });
  }

  /** 注册插件工具 (自动命名空间化) */
  registerPluginTool(
    pluginId: string,
    name: string,
    definition: Omit<McpToolDefinition, 'id'>,
    handler: McpToolHandler
  ): void {
    const id = `${pluginId}/tool:${name}`;
    this.registerTool({ ...definition, id, name }, handler, pluginId);
  }

  /** 注销工具 */
  unregisterTool(id: string): void {
    this.tools.delete(id);
  }

  /** 列出所有工具 */
  listTools(): McpToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /** 调用工具 */
  async callTool(id: string, args: unknown, ctx: McpCallContext): Promise<unknown> {
    const tool = this.tools.get(id);
    if (!tool) {
      throw new Error(`Tool ${id} not found`);
    }
    return await tool.handler(args, ctx);
  }

  /** 注册资源 */
  registerResource(definition: McpResourceDefinition, handler: McpResourceHandler, pluginId?: string): void {
    this.resources.set(definition.id, { definition, handler, pluginId });
  }

  /** 注册插件资源 */
  registerPluginResource(
    pluginId: string,
    name: string,
    definition: Omit<McpResourceDefinition, 'id'>,
    handler: McpResourceHandler
  ): void {
    const id = `${pluginId}/resource:${name}`;
    this.registerResource({ ...definition, id, name }, handler, pluginId);
  }

  /** 注销资源 */
  unregisterResource(id: string): void {
    this.resources.delete(id);
  }

  /** 列出所有资源 */
  listResources(): McpResourceDefinition[] {
    return Array.from(this.resources.values()).map((r) => r.definition);
  }

  /** 读取资源 */
  async readResource(id: string, args: unknown, ctx: McpCallContext): Promise<unknown> {
    const resource = this.resources.get(id);
    if (!resource) {
      throw new Error(`Resource ${id} not found`);
    }
    return await resource.handler(args, ctx);
  }

  /** 注册提示词 */
  registerPrompt(definition: McpPromptDefinition, handler: McpPromptHandler, pluginId?: string): void {
    this.prompts.set(definition.id, { definition, handler, pluginId });
  }

  /** 注册插件提示词 */
  registerPluginPrompt(
    pluginId: string,
    name: string,
    definition: Omit<McpPromptDefinition, 'id'>,
    handler: McpPromptHandler
  ): void {
    const id = `${pluginId}/prompt:${name}`;
    this.registerPrompt({ ...definition, id, name }, handler, pluginId);
  }

  /** 注销提示词 */
  unregisterPrompt(id: string): void {
    this.prompts.delete(id);
  }

  /** 列出所有提示词 */
  listPrompts(): McpPromptDefinition[] {
    return Array.from(this.prompts.values()).map((p) => p.definition);
  }

  /** 运行提示词 */
  async runPrompt(id: string, args: unknown, ctx: McpCallContext): Promise<unknown> {
    const prompt = this.prompts.get(id);
    if (!prompt) {
      throw new Error(`Prompt ${id} not found`);
    }
    return await prompt.handler(args, ctx);
  }

  /** 注销插件的所有 MCP 贡献 */
  unregisterByPlugin(pluginId: string): void {
    for (const [id, tool] of this.tools) {
      if (tool.pluginId === pluginId) this.tools.delete(id);
    }
    for (const [id, resource] of this.resources) {
      if (resource.pluginId === pluginId) this.resources.delete(id);
    }
    for (const [id, prompt] of this.prompts) {
      if (prompt.pluginId === pluginId) this.prompts.delete(id);
    }
  }

  /** 通用注销 */
  unregister(id: string): void {
    if (id.includes('/tool:')) {
      this.unregisterTool(id);
    } else if (id.includes('/resource:')) {
      this.unregisterResource(id);
    } else if (id.includes('/prompt:')) {
      this.unregisterPrompt(id);
    } else {
      this.unregisterTool(id);
      this.unregisterResource(id);
      this.unregisterPrompt(id);
    }
  }

  /** 清空所有注册 */
  clear(): void {
    this.tools.clear();
    this.resources.clear();
    this.prompts.clear();
  }

  /** 获取统计信息 */
  getStats(): { tools: number; resources: number; prompts: number } {
    return {
      tools: this.tools.size,
      resources: this.resources.size,
      prompts: this.prompts.size,
    };
  }
}

/** 全局 MCP Gateway 实例 */
export const mcpGateway = new McpGateway();
