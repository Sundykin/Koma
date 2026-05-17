import type { LinghuiExecutionQueueState } from '../../../../types/linghui';

export function mergeLinghuiPageExecutionQueues(
  queues: LinghuiExecutionQueueState[],
): LinghuiExecutionQueueState | null {
  if (queues.length === 0) {
    return null;
  }

  const status: LinghuiExecutionQueueState['status'] = queues.some(q => q.status === 'canceling')
    ? 'canceling'
    : queues.some(q => q.status === 'running')
      ? 'running'
      : queues.some(q => q.status === 'failed')
        ? 'failed'
        : queues.some(q => q.status === 'canceled')
          ? 'canceled'
          : queues.every(q => q.status === 'completed')
            ? 'completed'
            : 'running';

  const dedupe = (ids: string[]) => Array.from(new Set(ids));
  const runningNodeIds = dedupe(queues.flatMap(q => q.runningNodeIds));

  return {
    status,
    total: queues.reduce((sum, q) => sum + q.total, 0),
    targetNodeIds: dedupe(queues.flatMap(q => q.targetNodeIds)),
    queuedNodeIds: dedupe(queues.flatMap(q => q.queuedNodeIds)),
    runningNodeIds,
    runningNodeId: runningNodeIds[0],
    completedNodeIds: dedupe(queues.flatMap(q => q.completedNodeIds)),
    failedNodeIds: dedupe(queues.flatMap(q => q.failedNodeIds)),
    canceledNodeIds: dedupe(queues.flatMap(q => q.canceledNodeIds)),
    startedAt: Math.min(...queues.map(q => q.startedAt ?? Number.POSITIVE_INFINITY)),
    updatedAt: Math.max(...queues.map(q => q.updatedAt ?? 0)),
  };
}
