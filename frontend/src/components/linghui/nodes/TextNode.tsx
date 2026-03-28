import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type {
  LinghuiNodeData,
  LinghuiRunStatus,
  LinghuiTextNodeProperties,
} from '../../../types/linghui';
import { useLinghuiNodeInteraction, useNodeRunState } from './LinghuiNodeRunsContext';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: '#64748b',
  running: '#3b82f6',
  succeeded: '#22c55e',
  failed: '#ef4444',
  stale: '#f97316',
};

function TextNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as unknown as LinghuiTextNodeProperties;
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const status = runState?.status ?? 'idle';
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  const borderColor = status !== 'idle' ? statusColor : (selected ? nodeData.accent : 'rgba(63, 63, 70, 0.7)');
  const previewText = String(
    runState?.result?.text ??
    (props.mode === 'manual' ? props.content : props.prompt) ??
    '',
  ).trim();
  const modeLabel = props.mode === 'generate' ? 'LLM 生成' : '手动文本';

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

      <div className="linghuiCompactThumb linghuiCompactTextThumb">
        <div className="linghuiCompactTextGlyph" style={{ color: nodeData.accent }}>
          T
        </div>
        <div className="linghuiCompactTextLines">
          <span style={{ background: `${nodeData.accent}80` }} />
          <span style={{ background: `${nodeData.accent}55` }} />
          <span style={{ background: `${nodeData.accent}35` }} />
        </div>
      </div>

      <div className="linghuiCompactInfo">
        <EditableCompactNodeLabel
          nodeId={id}
          label={nodeData.label}
          fallbackLabel="文本"
        />
        <span className="linghuiCompactMeta">{modeLabel}</span>
        {previewText ? (
          <div className="linghuiCompactTextExcerpt">
            {previewText.slice(0, 72)}
          </div>
        ) : null}
        {status === 'running' && (
          <div className="linghuiCompactProgress">
            <div className="linghuiCompactProgressBar" style={{ width: `${runState?.progress ?? 0}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

export const TextNode = memo(TextNodeInner);
