/**
 * Graph Executor 类型定义
 * 基于 waoowaoo 的 graph-executor
 */

// ============ State 类型 ============

export interface StateRef {
  scriptId?: string;
  storyboardId?: string;
  voiceLineBatchId?: string;
  versionHash?: string;
  cursor?: string;
}

export interface GraphExecutorState {
  refs: StateRef;
  meta: Record<string, unknown>;
}

// ============ Graph Node ============

export interface GraphNodeContext<TState extends GraphExecutorState> {
  runId: string;
  projectId: string;
  userId: string;
  nodeKey: string;
  attempt: number;
  state: TState;
}

export interface GraphNodeResult {
  output?: Record<string, unknown>;
  checkpointRefs?: StateRef;
  checkpointMeta?: Record<string, unknown>;
}

export interface GraphNode<TState extends GraphExecutorState> {
  key: string;
  title: string;
  maxAttempts?: number;
  timeoutMs?: number;
  run: (context: GraphNodeContext<TState>) => Promise<GraphNodeResult | void>;
}

// ============ Graph Executor Input ============

export interface GraphExecutorInput<TState extends GraphExecutorState> {
  runId: string;
  projectId: string;
  userId: string;
  state: TState;
  nodes: GraphNode<TState>[];
}

// ============ Graph Cancellation Error ============

export class GraphCancellationError extends Error {
  constructor(message = 'run canceled') {
    super(message);
    this.name = 'GraphCancellationError';
  }
}
