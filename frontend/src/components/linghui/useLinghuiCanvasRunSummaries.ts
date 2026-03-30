import { useMemo } from 'react';
import type { Edge, Node } from '@xyflow/react';
import type { LinghuiNodeRunState, LinghuiRunStatus } from '../../types/linghui';

interface UseLinghuiCanvasRunSummariesParams {
  nodes: Node[];
  edges: Edge[];
  nodeRuns: Record<string, LinghuiNodeRunState>;
}

function mergeTraceStatus(current: LinghuiRunStatus | undefined, next: LinghuiRunStatus): LinghuiRunStatus {
  if (current === 'failed' || next === 'failed') return 'failed';
  if (current === 'running' || next === 'running') return 'running';
  if (current === 'stale' || next === 'stale') return 'stale';
  if (current === 'succeeded' || next === 'succeeded') return 'succeeded';
  return next;
}

export function useLinghuiCanvasRunSummaries({
  nodes,
  edges,
  nodeRuns,
}: UseLinghuiCanvasRunSummariesParams) {
  const canvasRunSummary = useMemo(() => {
    const values = Object.values(nodeRuns);
    const failedNodeIds = Object.entries(nodeRuns)
      .filter(([, item]) => item.status === 'failed')
      .sort((left, right) => (right[1].updatedAt ?? 0) - (left[1].updatedAt ?? 0))
      .map(([nodeId]) => nodeId);
    const staleNodeIds = Object.entries(nodeRuns)
      .filter(([, item]) => item.status === 'stale')
      .sort((left, right) => (right[1].updatedAt ?? 0) - (left[1].updatedAt ?? 0))
      .map(([nodeId]) => nodeId);
    const edgeStatuses: Record<string, LinghuiRunStatus> = {};

    for (const edge of edges) {
      const runState = nodeRuns[edge.target];
      const status = runState?.status;
      if (!status || status === 'idle') {
        continue;
      }

      if ((runState.upstreamIds?.length ?? 0) > 0 && !runState.upstreamIds?.includes(edge.source)) {
        continue;
      }

      edgeStatuses[edge.id] = mergeTraceStatus(edgeStatuses[edge.id], status);
    }

    return {
      running: values.filter(item => item.status === 'running').length,
      failed: failedNodeIds.length,
      stale: staleNodeIds.length,
      failedNodeIds,
      staleNodeIds,
      edgeStatuses,
    };
  }, [edges, nodeRuns]);

  const groupRunSummaries = useMemo(() => {
    const groupNodes = nodes.filter(node => node.type === 'group');
    const groupMap = new Map<string, {
      total: number;
      running: number;
      failed: number;
      stale: number;
      succeeded: number;
      idle: number;
      updatedAt?: number;
    }>();

    for (const groupNode of groupNodes) {
      groupMap.set(groupNode.id, {
        total: 0,
        running: 0,
        failed: 0,
        stale: 0,
        succeeded: 0,
        idle: 0,
        updatedAt: undefined,
      });
    }

    for (const node of nodes) {
      if (node.type === 'group' || !node.parentId || !groupMap.has(node.parentId)) continue;

      const summary = groupMap.get(node.parentId)!;
      const runState = nodeRuns[node.id];
      summary.total += 1;

      if (!runState || runState.status === 'idle') {
        summary.idle += 1;
      } else if (runState.status === 'running') {
        summary.running += 1;
      } else if (runState.status === 'failed') {
        summary.failed += 1;
      } else if (runState.status === 'stale') {
        summary.stale += 1;
      } else if (runState.status === 'succeeded') {
        summary.succeeded += 1;
      }

      const updatedAt = runState?.updatedAt;
      if (updatedAt && (!summary.updatedAt || updatedAt > summary.updatedAt)) {
        summary.updatedAt = updatedAt;
      }
    }

    return Object.fromEntries([...groupMap.entries()].map(([groupId, summary]) => {
      const status: 'idle' | 'running' | 'failed' | 'stale' | 'succeeded' | 'partial' = summary.failed > 0
        ? 'failed'
        : summary.running > 0
          ? 'running'
          : summary.stale > 0
            ? 'stale'
            : summary.total > 0 && summary.succeeded === summary.total
              ? 'succeeded'
              : summary.succeeded > 0
                ? 'partial'
                : 'idle';

      return [groupId, {
        ...summary,
        status,
      }];
    }));
  }, [nodeRuns, nodes]);

  return {
    canvasRunSummary,
    groupRunSummaries,
  };
}
