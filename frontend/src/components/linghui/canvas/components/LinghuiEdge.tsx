import React, { memo, type CSSProperties } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import type { LinghuiRunStatus } from '../../../../types/linghui';
import { useLinghuiExecutionTrace, useNodeRunState } from '../../nodes/state/LinghuiNodeRunsContext';

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: 'var(--token-text-muted)',
  running: 'var(--token-status-info)',
  succeeded: 'var(--token-status-success)',
  failed: 'var(--token-status-error)',
  stale: 'var(--token-status-warning)',
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
  selected,
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
  const edgeStyle = {
    ...style,
    '--linghui-edge-stroke': color,
    '--linghui-edge-stroke-width': selected ? 4 : linkStatus === 'running' ? 3 : 2,
    '--linghui-edge-stroke-dasharray': linkStatus === 'running' ? '8 6' : 'none',
    '--linghui-edge-opacity': selected ? 1 : traceStatus ? 0.98 : 0.72,
    '--linghui-edge-filter': selected
      ? `drop-shadow(0 0 6px ${color})`
      : traceStatus
        ? `drop-shadow(0 0 4px ${color})`
        : 'none',
  } as CSSProperties;

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
      interactionWidth={24}
      style={edgeStyle}
    />
  );
}

export const LinghuiEdge = memo(LinghuiEdgeInner);

export const linghuiEdgeTypes = {
  'linghui-edge': LinghuiEdge,
};
