import React, { memo, type CSSProperties } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type {
  LinghuiNodeData,
  LinghuiRunStatus,
  LinghuiTextNodeProperties,
} from '../../../../types/linghui';
import { getLinghuiResultText } from '../../../../types/linghui';
import { useLinghuiNodeInteraction, useLinghuiNodeEditorVisibility, useNodeRunState } from '../state/LinghuiNodeRunsContext';
import { LinghuiNodeEditor } from '../../editors/components/LinghuiNodeEditor';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';
import { resolveLinghuiNodeViewMode } from '../../editors/state/linghuiNodeViewMode';
import { resolveDefaultCompactNodeStyle } from '../state/linghuiNodeCardSizing';
import { cssVars } from '../../../../theme/runtime';

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: 'var(--token-text-muted)',
  running: 'var(--token-status-info)',
  succeeded: 'var(--token-status-success)',
  failed: 'var(--token-status-error)',
  stale: 'var(--token-status-warning)',
};

function resolveHandleTop(index: number, total: number): string {
  if (total <= 1) return '50%';
  const step = 100 / (total + 1);
  return `${step * (index + 1)}%`;
}

function getHandleColor(dataType: LinghuiNodeData['inputs'][number]['dataType'], accent: string): string {
  switch (dataType) {
    case 'text':
      return 'var(--token-status-warning)';
    case 'video':
      return 'var(--token-status-info)';
    case 'audio':
      return 'var(--token-status-warning)';
    default:
      return accent;
  }
}

function TextNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as unknown as LinghuiTextNodeProperties;
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const status = runState?.status ?? 'idle';
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  const nodeStyle = cssVars({
    ...resolveDefaultCompactNodeStyle({ thumbHeight: 214, minHeight: 356 }),
    '--linghui-node-border': status !== 'idle' ? statusColor : (selected ? nodeData.accent : 'var(--token-border-base)'),
    '--linghui-accent': nodeData.accent,
    '--linghui-progress': `${runState?.progress ?? 0}%`,
  });
  const previewText = String(
    getLinghuiResultText(runState?.result) ??
    (props.mode === 'manual' ? props.content : props.prompt) ??
    '',
  ).trim();
  const modeLabel = props.mode === 'generate' ? 'LLM 生成' : '手动文本';
  const viewMode = resolveLinghuiNodeViewMode(nodeData.viewMode);
  const isEditorVisible = useLinghuiNodeEditorVisibility(id, 'linghui/text');

  return (
    <div
      className={`linghuiCompactNode nopan ${selected ? 'isSelected' : ''} ${viewMode === 'collapsed' ? 'isCollapsed' : ''} ${isEditorVisible ? 'hasInlineEditor' : ''}`}
      data-view-mode={viewMode}
      style={nodeStyle}
      {...interactionHandlers}
    >
      {nodeData.inputs.map((slot, index) => (
        <Handle
          key={`input-${index}`}
          type="target"
          position={Position.Left}
          id={`input-${index}`}
          className="linghuiCompactHandle"
          style={{
            '--linghui-handle-bg': getHandleColor(slot.dataType, nodeData.accent),
            '--linghui-handle-top': resolveHandleTop(index, nodeData.inputs.length),
          } as CSSProperties}
          isConnectable
        />
      ))}

      <Handle
        type="source"
        position={Position.Right}
        id="output-0"
        className="linghuiCompactHandle"
        style={{ '--linghui-handle-bg': nodeData.accent } as CSSProperties}
      />

      <div className="linghuiCompactThumb linghuiCompactTextThumb">
        <div className="linghuiCompactTextGlyph linghuiCompactAccentText">
          T
        </div>
        <div className="linghuiCompactTextLines">
          <span className="linghuiCompactAccentLineStrong" />
          <span className="linghuiCompactAccentLineMedium" />
          <span className="linghuiCompactAccentLineSoft" />
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
            <div className="linghuiCompactProgressBar" />
          </div>
        )}
      </div>

      {isEditorVisible ? <LinghuiNodeEditor nodeId={id} nodeType="linghui/text" /> : null}
    </div>
  );
}

export const TextNode = memo(TextNodeInner);
