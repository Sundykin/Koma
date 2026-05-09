import React, { type PropsWithChildren } from 'react';
import type { LinghuiNodeData, LinghuiRunStatus } from '../../../../types/linghui';
import { useLinghuiNodeInteraction, useNodeRunState } from '../state/LinghuiNodeRunsContext';
import { resolveLinghuiNodeViewMode } from '../../editors/state/linghuiNodeViewMode';
import { cssVars } from '../../../../theme/runtime';
import { LinghuiNodeRunError } from './LinghuiNodeRunError';
import { LinghuiNodePorts } from './LinghuiNodeHandle';

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: 'var(--token-text-muted)',
  running: 'var(--token-status-info)',
  succeeded: 'var(--token-status-success)',
  failed: 'var(--token-status-error)',
  stale: 'var(--token-status-warning)',
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
  const borderColor = status !== 'idle' ? statusColor : (selected ? data.accent : 'var(--token-border-base)');
  const viewMode = resolveLinghuiNodeViewMode(data.viewMode);
  const nodeStyle = cssVars({
    '--linghui-node-bg': data.background,
    '--linghui-node-border': borderColor,
    '--linghui-node-shadow': status === 'running'
      ? `0 0 16px color-mix(in srgb, ${statusColor} 40%, transparent)`
      : selected
        ? `0 0 12px color-mix(in srgb, ${data.accent} 30%, transparent)`
        : 'none',
    '--linghui-accent': data.accent,
    '--linghui-progress': `${Math.round(runState?.progress ?? 0)}%`,
  });

  return (
    <div
      className={`linghuiRFNode nopan ${selected ? 'isSelected' : ''} ${viewMode === 'collapsed' ? 'isCollapsed' : ''}`}
      data-view-mode={viewMode}
      style={nodeStyle}
      {...interactionHandlers}
    >
      {/* Header */}
      <div className="linghuiRFNodeHeader">
        <span className="linghuiRFNodeAccent" />
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
          />
        </div>
      )}

      <LinghuiNodePorts accent={data.accent} inputs={data.inputs} outputs={data.outputs} />

      {/* Node content */}
      <div className="linghuiRFNodeBody">
        <LinghuiNodeRunError runState={runState} />
        {children}
      </div>
    </div>
  );
};
