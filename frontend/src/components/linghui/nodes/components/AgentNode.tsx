import React, { memo } from 'react';
import { Position, type NodeProps } from '@xyflow/react';
import type {
  LinghuiAgentNodeProperties,
  LinghuiNodeData,
  LinghuiRunStatus,
} from '../../../../types/linghui';
import { getLinghuiResultText } from '../../../../types/linghui';
import { useLinghuiNodeInteraction, useLinghuiNodeEditorVisibility, useNodeRunState } from '../state/LinghuiNodeRunsContext';
import { LinghuiNodeEditor } from '../../editors/components/LinghuiNodeEditor';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';
import { resolveLinghuiNodeViewMode } from '../../editors/state/linghuiNodeViewMode';
import { resolveDefaultCompactNodeStyle } from '../state/linghuiNodeCardSizing';
import { cssVars } from '../../../../theme/runtime';
import { LinghuiNodeRunError } from './LinghuiNodeRunError';
import { LinghuiNodeHandle } from './LinghuiNodeHandle';

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

function AgentNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as unknown as LinghuiAgentNodeProperties;
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
    props.prompt ??
    '',
  ).trim();
  const toolCount = Array.isArray(props.enabledTools) ? props.enabledTools.length : 0;
  const metaLabel = status === 'running'
    ? `Agent 推理中 · 最多 ${Math.max(1, Number(props.maxIterations ?? 6))} 轮`
    : `工具 ${toolCount} 个 · 最多 ${Math.max(1, Number(props.maxIterations ?? 6))} 轮`;
  const viewMode = resolveLinghuiNodeViewMode(nodeData.viewMode);
  const isEditorVisible = useLinghuiNodeEditorVisibility(id, 'linghui/agent');

  return (
    <div
      className={`linghuiCompactNode nopan ${selected ? 'isSelected' : ''} ${viewMode === 'collapsed' ? 'isCollapsed' : ''} ${isEditorVisible ? 'hasInlineEditor' : ''}`}
      data-view-mode={viewMode}
      style={nodeStyle}
      {...interactionHandlers}
    >
      {nodeData.inputs.map((slot, index) => (
        <LinghuiNodeHandle
          key={`input-${index}`}
          type="target"
          position={Position.Left}
          id={`input-${index}`}
          dataType={slot.dataType}
          accent={nodeData.accent}
          top={resolveHandleTop(index, nodeData.inputs.length)}
          title={slot.name}
        />
      ))}

      <LinghuiNodeHandle
        type="source"
        position={Position.Right}
        id="output-0"
        dataType={nodeData.outputs[0]?.dataType}
        accent={nodeData.accent}
        title={nodeData.outputs[0]?.name}
      />

      <div className="linghuiCompactThumb linghuiCompactTextThumb">
        <div className="linghuiCompactTextGlyph linghuiCompactAccentText">
          AI
        </div>
        <div className="linghuiCompactTextLines">
          <span className="linghuiCompactAccentLineStrong" />
          <span className="linghuiCompactAccentLineMedium" />
          <span />
        </div>
      </div>

      <div className="linghuiCompactInfo">
        <EditableCompactNodeLabel
          nodeId={id}
          label={nodeData.label}
          fallbackLabel="Agent"
        />
        <span className="linghuiCompactMeta">{metaLabel}</span>
        {previewText ? (
          <div className="linghuiCompactTextExcerpt">
            {previewText.slice(0, 84)}
          </div>
        ) : null}
        <LinghuiNodeRunError runState={runState} />
        {status === 'running' && (
          <div className="linghuiCompactProgress">
            <div className="linghuiCompactProgressBar" />
          </div>
        )}
      </div>

      {isEditorVisible ? <LinghuiNodeEditor nodeId={id} nodeType="linghui/agent" /> : null}
    </div>
  );
}

export const AgentNode = memo(AgentNodeInner);
