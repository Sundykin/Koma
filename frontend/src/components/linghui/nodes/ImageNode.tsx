import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { LinghuiNodeData, LinghuiRunStatus } from '../../../types/linghui';
import { useNodeRunState, useLinghuiNodeInteraction } from './LinghuiNodeRunsContext';
import { electronService } from '../../../services/electronService';

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

function ImageNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const status = runState?.status ?? 'idle';
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  const borderColor = status !== 'idle' ? statusColor : (selected ? nodeData.accent : 'rgba(63, 63, 70, 0.7)');

  // 缩略图来源：执行结果 > 空
  const thumbSrc = getPreviewSource(runState?.result?.primary?.source);

  return (
    <div
      className={`linghuiCompactNode nopan ${selected ? 'isSelected' : ''}`}
      style={{ borderColor }}
      {...interactionHandlers}
    >
      {/* 多连接输入 Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="input-0"
        className="linghuiCompactHandle"
        style={{ background: nodeData.accent }}
        isConnectable
      />

      {/* 输出 Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="output-0"
        className="linghuiCompactHandle"
        style={{ background: nodeData.accent }}
      />

      {/* 缩略图 */}
      <div className="linghuiCompactThumb">
        {thumbSrc ? (
          <img src={thumbSrc} alt="preview" draggable={false} />
        ) : (
          <div className="linghuiCompactThumbEmpty" style={{ background: `${nodeData.accent}18` }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="3" stroke={nodeData.accent} strokeWidth="1.5" strokeOpacity="0.6" />
              <circle cx="8.5" cy="8.5" r="2" stroke={nodeData.accent} strokeWidth="1.5" strokeOpacity="0.6" />
              <path d="M3 16l5-5 4 4 3-3 6 6" stroke={nodeData.accent} strokeWidth="1.5" strokeOpacity="0.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>

      {/* 标签 */}
      <div className="linghuiCompactInfo">
        <span className="linghuiCompactLabel">{nodeData.label}</span>
        {status === 'running' && (
          <div className="linghuiCompactProgress">
            <div className="linghuiCompactProgressBar" style={{ width: `${runState?.progress ?? 0}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

export const ImageNode = memo(ImageNodeInner);
