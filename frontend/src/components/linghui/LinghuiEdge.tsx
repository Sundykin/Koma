import React, { memo } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import type { LinghuiRunStatus } from '../../types/linghui';
import { useLinghuiExecutionTrace, useNodeRunState } from './nodes/LinghuiNodeRunsContext';

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: '#64748b',
  running: '#3b82f6',
  succeeded: '#22c55e',
  failed: '#ef4444',
  stale: '#f97316',
};

function getLinkStatus(statuses: LinghuiRunStatus[]): LinghuiRunStatus {
  if (statuses.includes('failed')) return 'failed';
  if (statuses.includes('running')) return 'running';
  if (statuses.includes('stale')) return 'stale';
  if (statuses.includes('succeeded')) return 'succeeded';
  return 'idle';
}

function LinghuiEdgeInner({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
}: EdgeProps) {
  const sourceRunState = useNodeRunState(source);
  const targetRunState = useNodeRunState(target);
  const executionTrace = useLinghuiExecutionTrace();

  const fromStatus = sourceRunState?.status ?? 'idle';
  const toStatus = targetRunState?.status ?? 'idle';
  const traceStatus = executionTrace.edgeStatuses[id];
  const linkStatus = traceStatus ?? getLinkStatus([fromStatus, toStatus]);
  const color = STATUS_COLORS[linkStatus] ?? STATUS_COLORS.idle;

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        ...style,
        stroke: color,
        strokeWidth: linkStatus === 'running' ? 3 : 2,
        strokeDasharray: linkStatus === 'running' ? '8 6' : undefined,
        opacity: traceStatus ? 0.98 : 0.72,
        filter: traceStatus ? `drop-shadow(0 0 4px ${color})` : undefined,
        transition: 'stroke 200ms ease, stroke-width 200ms ease, opacity 200ms ease, filter 200ms ease',
      }}
    />
  );
}

export const LinghuiEdge = memo(LinghuiEdgeInner);

export const linghuiEdgeTypes = {
  'linghui-edge': LinghuiEdge,
};
