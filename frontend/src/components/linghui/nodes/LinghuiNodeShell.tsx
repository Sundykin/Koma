import React, { type PropsWithChildren } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { LinghuiNodeData, LinghuiRunStatus } from '../../../types/linghui';
import { useLinghuiNodeInteraction, useNodeRunState } from './LinghuiNodeRunsContext';
import { resolveLinghuiNodeViewMode } from '../linghuiNodeViewMode';

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: '#64748b',
  running: '#3b82f6',
  succeeded: '#22c55e',
  failed: '#ef4444',
  stale: '#f97316',
};

function getStatusMeta(status?: LinghuiRunStatus, progress?: number) {
  switch (status) {
    case 'running':
      return { label: progress != null ? `执行中 ${Math.round(progress)}%` : '执行中', className: 'is-running' };
    case 'succeeded':
      return { label: '已完成', className: 'is-success' };
    case 'failed':
      return { label: '失败', className: 'is-error' };
    case 'stale':
      return { label: '待重跑', className: 'is-warning' };
    default:
      return { label: '未运行', className: 'is-idle' };
  }
}

interface LinghuiNodeShellProps {
  nodeId: string;
  data: LinghuiNodeData;
  selected: boolean;
}

export const LinghuiNodeShell: React.FC<PropsWithChildren<LinghuiNodeShellProps>> = ({
  nodeId,
  data,
  selected,
  children,
}) => {
  const runState = useNodeRunState(nodeId);
  const interactionHandlers = useLinghuiNodeInteraction(nodeId);
  const status = runState?.status ?? 'idle';
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  const statusMeta = getStatusMeta(status, runState?.progress);
  const borderColor = status !== 'idle' ? statusColor : (selected ? data.accent : 'rgba(63, 63, 70, 0.9)');
  const viewMode = resolveLinghuiNodeViewMode(data.viewMode);

  return (
    <div
      className={`linghuiRFNode nopan ${selected ? 'isSelected' : ''} ${viewMode === 'collapsed' ? 'isCollapsed' : ''}`}
      data-view-mode={viewMode}
      style={{
        background: data.background,
        borderColor,
        boxShadow: status === 'running'
          ? `0 0 16px ${statusColor}40`
          : selected
            ? `0 0 12px ${data.accent}30`
            : undefined,
      }}
      {...interactionHandlers}
    >
      {/* Header */}
      <div className="linghuiRFNodeHeader">
        <span className="linghuiRFNodeAccent" style={{ background: data.accent }} />
        <span className="linghuiRFNodeTitle">{data.label}</span>
        <span className={`linghuiNodeStatusBadge ${statusMeta.className}`}>
          {statusMeta.label}
        </span>
      </div>

      {/* Progress bar */}
      {status === 'running' && (
        <div className="linghuiRunProgress">
          <div
            className="linghuiRunProgressBar"
            style={{ width: `${Math.round(runState?.progress ?? 0)}%` }}
          />
        </div>
      )}

      {/* Input handles */}
      {data.inputs.map((slot, index) => (
        <Handle
          key={`input-${index}`}
          type="target"
          position={Position.Left}
          id={`input-${index}`}
          style={{
            top: `${52 + index * 28}px`,
            background: data.accent,
            width: 10,
            height: 10,
            border: '2px solid #0f1720',
          }}
          title={slot.name}
        />
      ))}

      {/* Output handles */}
      {data.outputs.map((slot, index) => (
        <Handle
          key={`output-${index}`}
          type="source"
          position={Position.Right}
          id={`output-${index}`}
          style={{
            top: `${52 + index * 28}px`,
            background: data.accent,
            width: 10,
            height: 10,
            border: '2px solid #0f1720',
          }}
          title={slot.name}
        />
      ))}

      {/* Node content */}
      <div className="linghuiRFNodeBody">
        {children}
      </div>
    </div>
  );
};
