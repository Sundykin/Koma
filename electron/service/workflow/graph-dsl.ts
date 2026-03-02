/**
 * 工作流 DAG 验证和拓扑排序
 */
import type { WorkflowDefinition, WorkflowNode, WorkflowConnection } from './types';

/** 验证工作流定义 */
export function validateWorkflow(def: WorkflowDefinition): string[] {
  const errors: string[] = [];
  const nodeIds = new Set(def.nodes.map(n => n.id));

  if (!nodeIds.has(def.startNodeId)) {
    errors.push(`起始节点 ${def.startNodeId} 不存在`);
  }

  for (const conn of def.connections) {
    if (!nodeIds.has(conn.source)) {
      errors.push(`连接 ${conn.id} 的源节点 ${conn.source} 不存在`);
    }
    if (!nodeIds.has(conn.target)) {
      errors.push(`连接 ${conn.id} 的目标节点 ${conn.target} 不存在`);
    }
  }

  // 检测环路
  if (hasCycle(def)) {
    errors.push('工作流包含环路');
  }

  return errors;
}

/** 检测 DAG 是否有环 */
function hasCycle(def: WorkflowDefinition): boolean {
  const adj = new Map<string, string[]>();
  for (const node of def.nodes) {
    adj.set(node.id, []);
  }
  for (const conn of def.connections) {
    adj.get(conn.source)?.push(conn.target);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    inStack.add(nodeId);
    for (const next of adj.get(nodeId) || []) {
      if (inStack.has(next)) return true;
      if (!visited.has(next) && dfs(next)) return true;
    }
    inStack.delete(nodeId);
    return false;
  }

  for (const node of def.nodes) {
    if (!visited.has(node.id) && dfs(node.id)) return true;
  }
  return false;
}
