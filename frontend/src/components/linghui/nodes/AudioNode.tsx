import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { LinghuiNodeData, LinghuiRunStatus } from '../../../types/linghui';
import { useNodeRunState, useLinghuiNodeInteraction } from './LinghuiNodeRunsContext';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: '#64748b',
  running: '#3b82f6',
  succeeded: '#22c55e',
  failed: '#ef4444',
  stale: '#f97316',
};

function formatDuration(durationSec?: number): string {
  if (!durationSec || !Number.isFinite(durationSec)) {
    return '';
  }

  if (durationSec < 60) {
    return `${Math.max(1, Math.round(durationSec))} 秒`;
  }

  const minutes = Math.floor(durationSec / 60);
  const seconds = Math.round(durationSec % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function AudioNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as { source?: string; prompt?: string };
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const status = runState?.status ?? 'idle';
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  const borderColor = status !== 'idle' ? statusColor : (selected ? nodeData.accent : 'rgba(63, 63, 70, 0.7)');
  const hasUploadedSource = Boolean(String(props.source ?? '').trim());
  const durationLabel = formatDuration(runState?.result?.primary?.durationSec);
  const modeLabel = hasUploadedSource
    ? '已挂载本地音频'
    : String(props.prompt ?? '').trim()
      ? '文本转语音'
      : '待配置';

  return (
    <div
      className={`linghuiCompactNode nopan ${selected ? 'isSelected' : ''}`}
      style={{ borderColor }}
      {...interactionHandlers}
    >
      <Handle
        type="source"
        position={Position.Right}
        id="output-0"
        className="linghuiCompactHandle"
        style={{ background: nodeData.accent }}
      />

      <div className="linghuiCompactThumb linghuiCompactAudioThumb">
        <div className="linghuiCompactAudioWave" style={{ color: nodeData.accent }}>
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="linghuiCompactInfo">
        <EditableCompactNodeLabel
          nodeId={id}
          label={nodeData.label}
          fallbackLabel="音频"
        />
        <span className="linghuiCompactMeta">{durationLabel || modeLabel}</span>
        {status === 'running' && (
          <div className="linghuiCompactProgress">
            <div className="linghuiCompactProgressBar" style={{ width: `${runState?.progress ?? 0}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

export const AudioNode = memo(AudioNodeInner);
