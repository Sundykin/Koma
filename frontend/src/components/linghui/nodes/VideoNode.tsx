import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type {
  LinghuiNodeData,
  LinghuiRunStatus,
  LinghuiVideoNodeProperties,
} from '../../../types/linghui';
import {
  useNodeRunState,
  useLinghuiNodeInteraction,
  useLinghuiNodeEditorVisibility,
} from './LinghuiNodeRunsContext';
import { LinghuiNodeEditor } from '../LinghuiNodeEditor';
import { electronService } from '../../../services/electronService';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';
import { resolveLinghuiNodeViewMode } from '../linghuiNodeViewMode';
import { resolveMediaCardSize } from './linghuiNodeCardSizing';

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

function resolveHandleTop(index: number, total: number): string {
  if (total <= 1) return '50%';
  const step = 100 / (total + 1);
  return `${step * (index + 1)}%`;
}

function getHandleColor(dataType: LinghuiNodeData['inputs'][number]['dataType'], accent: string): string {
  switch (dataType) {
    case 'text':
      return '#f59e0b';
    case 'audio':
      return '#f97316';
    case 'video':
      return '#38bdf8';
    default:
      return accent;
  }
}

function VideoNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as unknown as LinghuiVideoNodeProperties;
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const status = runState?.status ?? 'idle';
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  const viewMode = resolveLinghuiNodeViewMode(nodeData.viewMode);

  const primaryVideo = runState?.result?.primary;
  const posterSrc = getPreviewSource(
    primaryVideo?.posterSource ||
    primaryVideo?.source ||
    props.posterSource,
  );
  const hasUploadedSource = Boolean(String(props.source ?? '').trim());
  const modeLabel = props.refMode === 'first-last-frame' ? '首尾帧模式' : '多参考模式';
  const mediaCardStyle = resolveMediaCardSize({
    width: primaryVideo?.width,
    height: primaryVideo?.height,
    aspectRatio: typeof runState?.result?.metadata?.aspectRatio === 'string'
      ? runState.result.metadata.aspectRatio
      : String(props.aspectRatio ?? '16:9'),
  }).style;
  const isEditorVisible = useLinghuiNodeEditorVisibility(id, 'linghui/video');

  return (
    <div
      className={`linghuiCompactNode nopan ${selected ? 'isSelected' : ''} ${viewMode === 'collapsed' ? 'isCollapsed' : ''} ${isEditorVisible ? 'hasInlineEditor' : ''}`}
      data-view-mode={viewMode}
      style={{
        ...mediaCardStyle,
        boxShadow: status !== 'idle'
          ? `0 0 0 1px ${statusColor}66, 0 12px 28px rgba(2, 6, 23, 0.32)`
          : selected
            ? '0 0 0 1px rgba(255, 255, 255, 0.08), 0 12px 24px rgba(2, 6, 23, 0.26)'
            : undefined,
      }}
      {...interactionHandlers}
    >
      {nodeData.inputs.map((slot, index) => (
        <Handle
          key={`input-${index}`}
          type="target"
          position={Position.Left}
          id={`input-${index}`}
          className="linghuiCompactHandle"
          style={{ background: getHandleColor(slot.dataType, nodeData.accent), top: resolveHandleTop(index, nodeData.inputs.length) }}
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
        <div className="linghuiCompactThumbMeta">
          <EditableCompactNodeLabel
            nodeId={id}
            label={nodeData.label}
            fallbackLabel="视频"
          />
          <div className="linghuiCompactVideoIndicator">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="white">
              <polygon points="3,1 10,6 3,11" />
            </svg>
          </div>
        </div>
        <div className="linghuiCompactThumbFooter">
          <span className="linghuiCompactThumbCaption">
            {hasUploadedSource ? '已挂载本地视频' : modeLabel}
          </span>
        </div>
        {status === 'running' && (
          <div className="linghuiCompactThumbProgress">
            <div className="linghuiCompactProgressBar" style={{ width: `${runState?.progress ?? 0}%` }} />
          </div>
        )}
      </div>

      {isEditorVisible ? <LinghuiNodeEditor nodeId={id} nodeType="linghui/video" /> : null}
    </div>
  );
}

export const VideoNode = memo(VideoNodeInner);
