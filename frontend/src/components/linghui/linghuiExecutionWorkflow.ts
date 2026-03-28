import type {
  LinghuiExecutionContext,
  LinghuiExecutionLogEntry,
  LinghuiExecutionQueueState,
  LinghuiNodeResult,
  LinghuiNodeRunState,
  LinghuiRFEdgeSnapshot,
  LinghuiRFNodeSnapshot,
} from '../../types/linghui';
import { executeNode } from './linghuiExecutionNodeExecutors';
import {
  createLog,
  createNodeView,
  isLinghuiExecutionCancelledError,
  throwIfExecutionAborted,
} from './linghuiExecutionShared';

function getDirectUpstreamNodeIds(edges: LinghuiRFEdgeSnapshot[], nodeId: string): string[] {
  const incoming = new Set<string>();
  for (const edge of edges) {
    if (edge.target === nodeId) incoming.add(edge.source);
  }
  return [...incoming];
}

export function collectLinghuiDependentNodeIds(edges: LinghuiRFEdgeSnapshot[], rootNodeIds: string[]): string[] {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    adjacency.get(edge.source)?.add(edge.target);
  }

  const queue = [...new Set(rootNodeIds)];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }

  return [...visited];
}

function collectRequiredNodeIds(edges: LinghuiRFEdgeSnapshot[], targetNodeIds: string[]): string[] {
  const stack = [...targetNodeIds];
  const required = new Set<string>(targetNodeIds);

  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const upstreamId of getDirectUpstreamNodeIds(edges, current)) {
      if (required.has(upstreamId)) continue;
      required.add(upstreamId);
      stack.push(upstreamId);
    }
  }

  return [...required];
}

function topologicalSort(
  nodes: LinghuiRFNodeSnapshot[],
  edges: LinghuiRFEdgeSnapshot[],
  requiredNodeIds: Set<string>,
): LinghuiRFNodeSnapshot[] {
  const filteredNodes = nodes.filter(node => requiredNodeIds.has(node.id));
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, Set<string>>();

  for (const node of filteredNodes) {
    indegree.set(node.id, 0);
    adjacency.set(node.id, new Set());
  }

  for (const edge of edges) {
    if (!requiredNodeIds.has(edge.source) || !requiredNodeIds.has(edge.target)) continue;
    adjacency.get(edge.source)?.add(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const queue = filteredNodes
    .filter(node => (indegree.get(node.id) ?? 0) === 0)
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
  const ordered: LinghuiRFNodeSnapshot[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    ordered.push(node);

    for (const nextId of adjacency.get(node.id) ?? []) {
      const nextDegree = (indegree.get(nextId) ?? 0) - 1;
      indegree.set(nextId, nextDegree);
      if (nextDegree === 0) {
        const nextNode = filteredNodes.find(item => item.id === nextId);
        if (nextNode) queue.push(nextNode);
      }
    }
  }

  if (ordered.length === filteredNodes.length) {
    return ordered;
  }

  const orderedSet = new Set(ordered.map(node => node.id));
  return [...ordered, ...filteredNodes.filter(node => !orderedSet.has(node.id))];
}

export interface ExecuteLinghuiWorkflowOptions {
  context: LinghuiExecutionContext;
  targetNodeIds?: string[];
  previousRuns?: Record<string, LinghuiNodeRunState>;
  resolveTargetsOnly?: boolean;
  seedPreviousOutputs?: boolean;
  signal?: AbortSignal;
  onNodeStateChange?: (nodeId: string, nextState: LinghuiNodeRunState) => void;
  onLog?: (entry: LinghuiExecutionLogEntry) => void;
  onQueueChange?: (queue: LinghuiExecutionQueueState) => void;
}

export interface ExecuteLinghuiWorkflowResult {
  runs: Record<string, LinghuiNodeRunState>;
  queue: LinghuiExecutionQueueState;
}

function seedNodeOutputsFromRuns(
  previousRuns: Record<string, LinghuiNodeRunState>,
): Record<string, LinghuiNodeResult> {
  const outputs: Record<string, LinghuiNodeResult> = {};

  for (const [nodeId, runState] of Object.entries(previousRuns)) {
    if (!runState?.result) continue;
    if (runState.status !== 'succeeded' && runState.status !== 'stale') continue;
    outputs[nodeId] = runState.result;
  }

  return outputs;
}

export async function executeLinghuiWorkflow(options: ExecuteLinghuiWorkflowOptions): Promise<ExecuteLinghuiWorkflowResult> {
  const {
    context,
    targetNodeIds,
    previousRuns = {},
    resolveTargetsOnly = false,
    seedPreviousOutputs = true,
    signal,
    onNodeStateChange,
    onLog,
    onQueueChange,
  } = options;
  const normalizedTargetIds = targetNodeIds?.length ? targetNodeIds : context.nodes.map(node => node.id);
  const requiredNodeIds = new Set(
    resolveTargetsOnly
      ? normalizedTargetIds
      : collectRequiredNodeIds(context.edges, normalizedTargetIds),
  );
  const orderedNodes = topologicalSort(context.nodes, context.edges, requiredNodeIds);
  const nextRuns: Record<string, LinghuiNodeRunState> = { ...previousRuns };
  let queueState: LinghuiExecutionQueueState = {
    status: orderedNodes.length > 0 ? 'running' : 'completed',
    total: orderedNodes.length,
    targetNodeIds: normalizedTargetIds,
    queuedNodeIds: orderedNodes.map(node => node.id),
    runningNodeId: undefined,
    completedNodeIds: [],
    failedNodeIds: [],
    canceledNodeIds: [],
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };

  const emitQueueChange = (updater: (current: LinghuiExecutionQueueState) => LinghuiExecutionQueueState) => {
    queueState = {
      ...updater(queueState),
      updatedAt: Date.now(),
    };
    onQueueChange?.(queueState);
  };

  const cancelExecution = (currentNodeId?: string): ExecuteLinghuiWorkflowResult => {
    const canceledIds = [
      ...queueState.canceledNodeIds,
      ...(currentNodeId ? [currentNodeId] : []),
      ...queueState.queuedNodeIds,
    ];

    emitQueueChange(current => ({
      ...current,
      status: 'canceled',
      queuedNodeIds: [],
      runningNodeId: undefined,
      canceledNodeIds: [...new Set(canceledIds)],
    }));

    return {
      runs: nextRuns,
      queue: queueState,
    };
  };

  onQueueChange?.(queueState);

  if (seedPreviousOutputs) {
    context.nodeOutputs = {
      ...seedNodeOutputsFromRuns(previousRuns),
      ...context.nodeOutputs,
    };
  }

  for (const snapshot of orderedNodes) {
    if (signal?.aborted) {
      onLog?.(createLog('info', '已取消当前执行队列'));
      return cancelExecution();
    }

    const nodeId = snapshot.id;
    const upstreamIds = getDirectUpstreamNodeIds(context.edges, nodeId);
    const upstreamFailure = upstreamIds.find(upstreamId => nextRuns[upstreamId]?.status === 'failed');

    if (upstreamFailure) {
      const failedState: LinghuiNodeRunState = {
        status: 'failed',
        error: '上游节点执行失败',
        updatedAt: Date.now(),
        upstreamIds,
      };
      nextRuns[nodeId] = failedState;
      onNodeStateChange?.(nodeId, failedState);
      onLog?.(createLog('error', `${snapshot.data.label} 未执行：上游依赖失败`, nodeId));
      emitQueueChange(current => ({
        ...current,
        queuedNodeIds: current.queuedNodeIds.filter(id => id !== nodeId),
        failedNodeIds: [...current.failedNodeIds, nodeId],
      }));
      continue;
    }

    emitQueueChange(current => ({
      ...current,
      status: signal?.aborted ? 'canceling' : 'running',
      queuedNodeIds: current.queuedNodeIds.filter(id => id !== nodeId),
      runningNodeId: nodeId,
    }));

    const runningState: LinghuiNodeRunState = {
      status: 'running',
      progress: 0,
      message: '准备执行',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      upstreamIds,
      result: previousRuns[nodeId]?.result,
    };
    nextRuns[nodeId] = runningState;
    onNodeStateChange?.(nodeId, runningState);
    onLog?.(createLog('info', `开始执行 ${snapshot.data.label}`, nodeId));

    const nodeView = createNodeView(context, snapshot);

    try {
      throwIfExecutionAborted(signal);
      const result = await executeNode(nodeView, (progress, message) => {
        throwIfExecutionAborted(signal);
        const nextState: LinghuiNodeRunState = {
          ...nextRuns[nodeId],
          status: 'running',
          progress,
          message,
          updatedAt: Date.now(),
          upstreamIds,
        };
        nextRuns[nodeId] = nextState;
        onNodeStateChange?.(nodeId, nextState);
      }, signal);
      throwIfExecutionAborted(signal);

      context.nodeOutputs[nodeId] = result;
      const successState: LinghuiNodeRunState = {
        status: 'succeeded',
        progress: 100,
        message: '执行完成',
        result,
        startedAt: runningState.startedAt,
        updatedAt: Date.now(),
        upstreamIds,
      };
      nextRuns[nodeId] = successState;
      onNodeStateChange?.(nodeId, successState);
      onLog?.(createLog('success', `${snapshot.data.label} 执行完成`, nodeId));
      emitQueueChange(current => ({
        ...current,
        runningNodeId: undefined,
        completedNodeIds: [...current.completedNodeIds, nodeId],
      }));
    } catch (error: unknown) {
      if (isLinghuiExecutionCancelledError(error) || signal?.aborted) {
        const fallbackState = previousRuns[nodeId]
          ? {
              ...previousRuns[nodeId],
              message: '执行已取消',
              updatedAt: Date.now(),
              upstreamIds,
            }
          : {
              status: 'idle' as const,
              message: '执行已取消',
              updatedAt: Date.now(),
              upstreamIds,
            };
        nextRuns[nodeId] = fallbackState;
        onNodeStateChange?.(nodeId, fallbackState);
        onLog?.(createLog('info', `${snapshot.data.label} 已取消执行`, nodeId));
        return cancelExecution(nodeId);
      }

      const failedState: LinghuiNodeRunState = {
        status: 'failed',
        progress: 100,
        error: (error as { message?: string } | undefined)?.message || '执行失败',
        message: '执行失败',
        result: previousRuns[nodeId]?.result,
        startedAt: runningState.startedAt,
        updatedAt: Date.now(),
        upstreamIds,
      };
      nextRuns[nodeId] = failedState;
      onNodeStateChange?.(nodeId, failedState);
      onLog?.(createLog('error', `${snapshot.data.label} 执行失败：${failedState.error}`, nodeId));
      emitQueueChange(current => ({
        ...current,
        runningNodeId: undefined,
        failedNodeIds: [...current.failedNodeIds, nodeId],
      }));
    }
  }

  emitQueueChange(current => ({
    ...current,
    status: current.failedNodeIds.length > 0 ? 'failed' : 'completed',
    runningNodeId: undefined,
    queuedNodeIds: [],
  }));

  return {
    runs: nextRuns,
    queue: queueState,
  };
}
