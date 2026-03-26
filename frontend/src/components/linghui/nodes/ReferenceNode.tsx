import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type {
  LinghuiNodeData,
  LinghuiReferenceNodeProperties,
  LinghuiRunStatus,
} from '../../../types/linghui';
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
  if (
    source.startsWith('http://') ||
    source.startsWith('https://') ||
    source.startsWith('data:') ||
    source.startsWith('blob:') ||
    source.startsWith('koma-local://')
  ) {
    return source;
  }
  return electronService.fs.toLocalUrl(source);
}

function ReferenceNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as unknown as LinghuiReferenceNodeProperties;
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const status = runState?.status ?? 'idle';
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  const borderColor = status !== 'idle' ? statusColor : (selected ? nodeData.accent : 'rgba(63, 63, 70, 0.7)');
  const thumbSource = getPreviewSource(runState?.result?.primary?.source || props.source);
  const note = String(props.note ?? '').trim();

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

      <div className="linghuiCompactThumb">
        {thumbSource ? (
          <img src={thumbSource} alt="reference-preview" draggable={false} />
        ) : (
          <div className="linghuiCompactThumbEmpty" style={{ background: `${nodeData.accent}18` }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="3" stroke={nodeData.accent} strokeWidth="1.5" strokeOpacity="0.6" />
              <path d="M6 16l3.5-3.5 2.5 2.5L15 12l3 4" stroke={nodeData.accent} strokeWidth="1.5" strokeOpacity="0.6" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="9" cy="8.5" r="1.5" fill={nodeData.accent} fillOpacity="0.5" />
            </svg>
          </div>
        )}
      </div>

      <div className="linghuiCompactInfo">
        <EditableCompactNodeLabel
          nodeId={id}
          label={nodeData.label}
          fallbackLabel="参考图"
        />
        <span className="linghuiCompactMeta">
          {note || (thumbSource ? '已挂载参考图' : '拖入图片或上传')}
        </span>
      </div>
    </div>
  );
}

export const ReferenceNode = memo(ReferenceNodeInner);
