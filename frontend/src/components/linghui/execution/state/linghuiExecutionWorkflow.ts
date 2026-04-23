import type {
  LinghuiExecutionContext,
  LinghuiExecutionLogEntry,
  LinghuiExecutionQueueState,
  LinghuiNodeResult,
  LinghuiNodeRunState,
  LinghuiRFEdgeSnapshot,
  LinghuiRFNodeSnapshot,
} from '../../../../types/linghui';
import { executeNode } from './linghuiExecutionNodeExecutors';
import {
  buildTopologicalLayers,
  collectLinghuiDependentNodeIds,
  collectRequiredNodeIds,
  getDirectUpstreamNodeIds,
} from './linghuiExecutionGraph';
import {
  createLog,
  createNodeView,
  isLinghuiExecutionCancelledError,
  throwIfExecutionAborted,
} from './linghuiExecutionShared';

function withRunningNodeIds(
  queue: LinghuiExecutionQueueState,
  runningNodeIds: string[],
): LinghuiExecutionQueueState {
  return {
    ...queue,
    runningNodeIds,
    runningNodeId: runningNodeIds[0],
  };
}

function withoutNodeId(items: string[], nodeId: string): string[] {
  return items.filter(id => id !== nodeId);
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
  const executionLayers = buildTopologicalLayers(context.nodes, context.edges, requiredNodeIds);
  const orderedNodes = executionLayers.flat();
  const nextRuns: Record<string, LinghuiNodeRunState> = { ...previousRuns };
  let queueState: LinghuiExecutionQueueState = {
    status: orderedNodes.length > 0 ? 'running' : 'completed',
    total: orderedNodes.length,
    targetNodeIds: normalizedTargetIds,
    queuedNodeIds: orderedNodes.map(node => node.id),
    runningNodeIds: [],
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

  const cancelExecution = (currentNodeIds: string[] = []): ExecuteLinghuiWorkflowResult => {
    const canceledIds = [
      ...queueState.canceledNodeIds,
      ...currentNodeIds,
      ...queueState.runningNodeIds,
      ...queueState.queuedNodeIds,
    ];

    emitQueueChange(current => withRunningNodeIds({
      ...current,
      status: 'canceled',
      queuedNodeIds: [],
      canceledNodeIds: [...new Set(canceledIds)],
    }, []));

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

  for (const layer of executionLayers) {
    if (signal?.aborted) {
      onLog?.(createLog('info', '已取消当前执行队列'));
      return cancelExecution();
    }

    const blockedNodeIds: string[] = [];
    const runnableNodes = layer.flatMap(snapshot => {
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
        blockedNodeIds.push(nodeId);
        return [];
      }

      return [{ snapshot, nodeId, upstreamIds }];
    });

    if (blockedNodeIds.length > 0) {
      const blockedNodeIdSet = new Set(blockedNodeIds);
      emitQueueChange(current => withRunningNodeIds({
        ...current,
        queuedNodeIds: current.queuedNodeIds.filter(id => !blockedNodeIdSet.has(id)),
        failedNodeIds: [...current.failedNodeIds, ...blockedNodeIds],
      }, current.runningNodeIds));
    }

    if (!runnableNodes.length) {
      continue;
    }

    const layerNodeIds = runnableNodes.map(node => node.nodeId);
    const layerNodeIdSet = new Set(layerNodeIds);
    emitQueueChange(current => withRunningNodeIds({
      ...current,
      status: signal?.aborted ? 'canceling' : 'running',
      queuedNodeIds: current.queuedNodeIds.filter(id => !layerNodeIdSet.has(id)),
    }, [...current.runningNodeIds, ...layerNodeIds]));

    const outcomes = await Promise.all(runnableNodes.map(async ({
      snapshot,
      nodeId,
      upstreamIds,
    }) => {
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
        const result = await executeNode(nodeView, (progress, message, partialResult) => {
          throwIfExecutionAborted(signal);
          const nextState: LinghuiNodeRunState = {
            ...nextRuns[nodeId],
            status: 'running',
            progress,
            message,
            result: partialResult ?? nextRuns[nodeId]?.result,
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
        emitQueueChange(current => withRunningNodeIds({
          ...current,
          completedNodeIds: [...current.completedNodeIds, nodeId],
        }, withoutNodeId(current.runningNodeIds, nodeId)));
        return { nodeId, status: 'succeeded' as const };
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
          emitQueueChange(current => withRunningNodeIds(current, withoutNodeId(current.runningNodeIds, nodeId)));
          return { nodeId, status: 'canceled' as const };
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
        emitQueueChange(current => withRunningNodeIds({
          ...current,
          failedNodeIds: [...current.failedNodeIds, nodeId],
        }, withoutNodeId(current.runningNodeIds, nodeId)));
        return { nodeId, status: 'failed' as const };
      }
    }));

    const canceledNodeIds = outcomes
      .filter(outcome => outcome.status === 'canceled')
      .map(outcome => outcome.nodeId);
    if (signal?.aborted || canceledNodeIds.length > 0) {
      onLog?.(createLog('info', '已取消当前执行队列'));
      return cancelExecution(canceledNodeIds);
    }
  }

  emitQueueChange(current => withRunningNodeIds({
    ...current,
    status: current.failedNodeIds.length > 0 ? 'failed' : 'completed',
    queuedNodeIds: [],
  }, []));

  return {
    runs: nextRuns,
    queue: queueState,
  };
}
