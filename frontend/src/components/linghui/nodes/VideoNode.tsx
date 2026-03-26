import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { LinghuiNodeData, LinghuiRunStatus } from '../../../types/linghui';
import { useNodeRunState, useLinghuiNodeInteraction } from './LinghuiNodeRunsContext';
import { electronService } from '../../../services/electronService';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: '#64748b',
  running: '#3b82f6',
  succeeded: '#22c55e',
  failed: '#ef4444',
  stale: '#f97316',
};

function getPreviewSource(source?: string): string {
  if (!source) return '';
  if (source.startsWith('http') || source.startsWith('data:') || source.startsWith('blob:') || source.startsWith('koma-local://')) return source;
  return electronService.fs.toLocalUrl(source);
}

function VideoNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const status = runState?.status ?? 'idle';
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  const borderColor = status !== 'idle' ? statusColor : (selected ? nodeData.accent : 'rgba(63, 63, 70, 0.7)');

  const posterSrc = getPreviewSource(runState?.result?.primary?.posterSource || runState?.result?.primary?.source);

  return (
    <div
      className={`linghuiCompactNode nopan ${selected ? 'isSelected' : ''}`}
      style={{ borderColor }}
      {...interactionHandlers}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="input-0"
        className="linghuiCompactHandle"
        style={{ background: nodeData.accent }}
        isConnectable
      />

      <Handle
        type="source"
        position={Position.Right}
        id="output-0"
        className="linghuiCompactHandle"
        style={{ background: nodeData.accent }}
      />

      <div className="linghuiCompactThumb">
        {posterSrc ? (
          <img src={posterSrc} alt="preview" draggable={false} />
        ) : (
          <div className="linghuiCompactThumbEmpty" style={{ background: `${nodeData.accent}18` }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="3" stroke={nodeData.accent} strokeWidth="1.5" strokeOpacity="0.6" />
              <polygon points="10,8 16,12 10,16" fill={nodeData.accent} fillOpacity="0.5" />
            </svg>
          </div>
        )}
        {/* 视频标识 */}
        <div className="linghuiCompactVideoIndicator">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="white">
            <polygon points="3,1 10,6 3,11" />
          </svg>
        </div>
      </div>

      <div className="linghuiCompactInfo">
        <EditableCompactNodeLabel
          nodeId={id}
          label={nodeData.label}
          fallbackLabel="视频"
        />
        {status === 'running' && (
          <div className="linghuiCompactProgress">
            <div className="linghuiCompactProgressBar" style={{ width: `${runState?.progress ?? 0}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

export const VideoNode = memo(VideoNodeInner);
