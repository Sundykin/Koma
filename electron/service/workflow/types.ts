/**
 * 工作流系统类型定义
 * DAG 编排、节点执行、状态管理
 */

export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'paused';
export type RunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/** 工作流节点 */
export interface WorkflowNode {
  id: string;
  label: string;
  type: 'task' | 'gate' | 'parallel';
  // 执行器标识（对应注册的 handler）
  handler: string;
  // 输入参数模板（可引用上游节点输出）
  params?: Record<string, unknown>;
  // HITL 门控：需要人工确认才能继续
  requireApproval?: boolean;
}

/** 节点连接 */
export interface WorkflowConnection {
  id: string;
  source: string;
  target: string;
  // 条件表达式（可选）
  condition?: string;
}

/** 工作流定义 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  startNodeId: string;
}

/** 节点执行记录 */
export interface NodeRecord {
  nodeId: string;
  status: NodeStatus;
  progress: number;
  currentStep?: string;
  output?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

/** 工作流运行记录 */
export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: RunStatus;
  nodes: Map<string, NodeRecord>;
  context: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}
