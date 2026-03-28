import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type {
  LinghuiImageNodeMode,
  LinghuiImageNodeProperties,
  LinghuiNodeData,
  LinghuiRunStatus,
} from '../../../types/linghui';
import {
  useNodeRunState,
  useLinghuiNodeInteraction,
  useLinghuiNodeInteractionApi,
} from './LinghuiNodeRunsContext';
import { electronService } from '../../../services/electronService';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';
import { resolveLinghuiNodeViewMode } from '../linghuiNodeViewMode';

const IMAGE_TOOLBAR_ITEMS = [
  { key: 'slash' as const, label: 'Slash' },
  { key: 'multi-angle' as const, label: '多角度' },
  { key: 'outpaint' as const, label: '扩图' },
  { key: 'relight' as const, label: '打光' },
];

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

function resolveImageNodeMode(props: LinghuiImageNodeProperties): LinghuiImageNodeMode {
  if (props.mode === 'import' || props.mode === 'generate') {
    return props.mode;
  }
  return String(props.source ?? '').trim() ? 'import' : 'generate';
}

function resolveHandleTop(index: number, total: number): string {
  if (total <= 1) return '50%';
  const step = 100 / (total + 1);
  return `${step * (index + 1)}%`;
}

function ImageNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as unknown as LinghuiImageNodeProperties;
  const mode = resolveImageNodeMode(props);
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const { openImageToolPanel } = useLinghuiNodeInteractionApi();
  const status = runState?.status ?? 'idle';
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  const borderColor = status !== 'idle' ? statusColor : (selected ? nodeData.accent : 'rgba(63, 63, 70, 0.7)');
  const viewMode = resolveLinghuiNodeViewMode(nodeData.viewMode);

  const thumbSrc = getPreviewSource(runState?.result?.primary?.source || props.source);
  const hasUploadedSource = Boolean(String(props.source ?? '').trim());
  const metaLabel = hasUploadedSource
    ? (mode === 'generate' ? '本地图作为参考' : '已挂载本地图片')
    : '';

  return (
    <div
      className={`linghuiCompactNode nopan ${selected ? 'isSelected' : ''} ${viewMode === 'collapsed' ? 'isCollapsed' : ''}`}
      data-view-mode={viewMode}
      style={{ borderColor }}
      {...interactionHandlers}
    >
      {nodeData.inputs.map((slot, index) => (
        <Handle
          key={`input-${index}`}
          type="target"
          position={Position.Left}
          id={`input-${index}`}
          className="linghuiCompactHandle"
          style={{ background: slot.dataType === 'text' ? '#f59e0b' : nodeData.accent, top: resolveHandleTop(index, nodeData.inputs.length) }}
          isConnectable
        />
      ))}

      <Handle
        type="source"
        position={Position.Right}
        id="output-0"
        className="linghuiCompactHandle"
        style={{ background: nodeData.accent }}
      />

      {/* 缩略图 */}
      <div className="linghuiCompactThumb">
        {selected && (
          <div className="linghuiCompactToolBar">
            {IMAGE_TOOLBAR_ITEMS.map(item => (
              <button
                key={item.key}
                type="button"
                className="linghuiCompactToolButton nodrag nopan"
                onPointerDown={event => event.stopPropagation()}
                onClick={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  openImageToolPanel(id, item.key);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
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
        <EditableCompactNodeLabel
          nodeId={id}
          label={nodeData.label}
          fallbackLabel="图片"
        />
        {metaLabel && status === 'idle' && (
          <span className="linghuiCompactMeta">{metaLabel}</span>
        )}
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
