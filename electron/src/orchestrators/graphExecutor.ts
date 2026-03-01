/**
 * Graph Executor - 节点图执行引擎
 * 基于 waoowaoo 的 Graph Executor 模式
 */

import type { OrchestratorContext, OrchestratorStepMeta, OrchestratorStepOutput } from './types';

// ============ Graph Node 类型 ============

export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface GraphNode<TInput = unknown, TOutput = unknown> {
  id: string;
  type: string;
  name: string;
  dependencies: string[]; // 依赖的节点 ID
  execute: (input: TInput, context: GraphExecutorContext) => Promise<TOutput>;
  onError?: (error: Error, context: GraphExecutorContext) => Promise<void>;
  retryable?: boolean;
  maxRetries?: number;
}

export interface GraphNodeState {
  nodeId: string;
  status: NodeStatus;
  startTime?: number;
  endTime?: number;
  attempt: number;
  input?: unknown;
  output?: unknown;
  error?: Error;
}

// ============ Graph Executor Context ============

export interface GraphExecutorContext extends OrchestratorContext {
  getNodeOutput: <T = unknown>(nodeId: string) => T | undefined;
  setNodeOutput: (nodeId: string, output: unknown) => void;
  runStep: (
    meta: OrchestratorStepMeta,
    prompt: string,
    action: string,
    maxOutputTokens: number
  ) => Promise<OrchestratorStepOutput>;
}

// ============ Graph Executor ============

export class GraphExecutor {
  private nodes: Map<string, GraphNode>;
  private nodeStates: Map<string, GraphNodeState>;
  private nodeOutputs: Map<string, unknown>;

  constructor() {
    this.nodes = new Map();
    this.nodeStates = new Map();
    this.nodeOutputs = new Map();
  }

  /**
   * 注册节点
   */
  registerNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
    this.nodeStates.set(node.id, {
      nodeId: node.id,
      status: 'pending',
      attempt: 0,
    });
  }

  /**
   * 获取节点输出
   */
  getNodeOutput<T = unknown>(nodeId: string): T | undefined {
    return this.nodeOutputs.get(nodeId) as T | undefined;
  }

  /**
   * 设置节点输出
   */
  setNodeOutput(nodeId: string, output: unknown): void {
    this.nodeOutputs.set(nodeId, output);
  }

  /**
   * 检查节点依赖是否满足
   */
  private areDependenciesMet(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    for (const depId of node.dependencies) {
      const depState = this.nodeStates.get(depId);
      if (!depState || depState.status !== 'completed') {
        return false;
      }
    }

    return true;
  }

  /**
   * 获取可执行的节点
   */
  private getExecutableNodes(): GraphNode[] {
    const executable: GraphNode[] = [];

    for (const [nodeId, node] of this.nodes) {
      const state = this.nodeStates.get(nodeId);
      if (!state) continue;

      if (state.status === 'pending' && this.areDependenciesMet(nodeId)) {
        executable.push(node);
      }
    }

    return executable;
  }

  /**
   * 执行单个节点
   */
  private async executeNode(
    node: GraphNode,
    context: GraphExecutorContext
  ): Promise<void> {
    const state = this.nodeStates.get(node.id);
    if (!state) throw new Error(`Node state not found: ${node.id}`);

    state.status = 'running';
    state.startTime = Date.now();
    state.attempt++;

    try {
      // 收集依赖节点的输出作为输入
      const input = this.collectNodeInputs(node);
      state.input = input;

      // 执行节点
      const output = await node.execute(input, context);

      // 保存输出
      state.output = output;
      this.setNodeOutput(node.id, output);

      state.status = 'completed';
      state.endTime = Date.now();

      await context.onProgress(
        this.calculateProgress(),
        node.type,
        `Completed: ${node.name}`
      );
    } catch (error) {
      state.error = error as Error;

      // 处理错误
      if (node.onError) {
        await node.onError(error as Error, context);
      }

      // 重试逻辑
      const maxRetries = node.maxRetries ?? 0;
      if (node.retryable && state.attempt <= maxRetries) {
        state.status = 'pending';
        await context.onProgress(
          this.calculateProgress(),
          node.type,
          `Retrying: ${node.name} (attempt ${state.attempt}/${maxRetries})`
        );
      } else {
        state.status = 'failed';
        state.endTime = Date.now();
        throw error;
      }
    }
  }

  /**
   * 收集节点输入
   */
  private collectNodeInputs(node: GraphNode): unknown {
    if (node.dependencies.length === 0) {
      return undefined;
    }

    if (node.dependencies.length === 1) {
      return this.getNodeOutput(node.dependencies[0]);
    }

    // 多个依赖，返回对象
    const inputs: Record<string, unknown> = {};
    for (const depId of node.dependencies) {
      inputs[depId] = this.getNodeOutput(depId);
    }
    return inputs;
  }

  /**
   * 计算执行进度
   */
  private calculateProgress(): number {
    let completed = 0;
    let total = this.nodes.size;

    for (const state of this.nodeStates.values()) {
      if (state.status === 'completed') {
        completed++;
      }
    }

    return total > 0 ? (completed / total) * 100 : 0;
  }

  /**
   * 执行图
   */
  async execute(context: OrchestratorContext): Promise<Map<string, unknown>> {
    const executorContext: GraphExecutorContext = {
      ...context,
      getNodeOutput: this.getNodeOutput.bind(this),
      setNodeOutput: this.setNodeOutput.bind(this),
      runStep: async (meta, prompt, action, maxTokens) => {
        // TODO: 实现 AI 步骤执行
        return {
          text: '',
          reasoning: '',
        };
      },
    };

    while (true) {
      // 检查是否取消
      if (context.isCancelled?.()) {
        throw new Error('Execution cancelled');
      }

      // 获取可执行节点
      const executable = this.getExecutableNodes();

      if (executable.length === 0) {
        // 检查是否全部完成
        const allCompleted = Array.from(this.nodeStates.values()).every(
          (state) => state.status === 'completed' || state.status === 'skipped'
        );

        if (allCompleted) {
          break; // 执行完成
        }

        // 检查是否有失败节点
        const hasFailed = Array.from(this.nodeStates.values()).some(
          (state) => state.status === 'failed'
        );

        if (hasFailed) {
          throw new Error('Graph execution failed');
        }

        // 死锁检测
        throw new Error('Graph execution deadlock detected');
      }

      // 并行执行所有可执行节点
      await Promise.all(
        executable.map((node) => this.executeNode(node, executorContext))
      );
    }

    return this.nodeOutputs;
  }

  /**
   * 获取执行状态
   */
  getExecutionState(): Map<string, GraphNodeState> {
    return new Map(this.nodeStates);
  }

  /**
   * 重置执行器
   */
  reset(): void {
    this.nodeOutputs.clear();
    for (const [nodeId] of this.nodes) {
      this.nodeStates.set(nodeId, {
        nodeId,
        status: 'pending',
        attempt: 0,
      });
    }
  }
}

