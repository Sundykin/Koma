import React, { memo, useMemo } from 'react';
import { Position, type NodeProps } from '@xyflow/react';
import type {
  LinghuiNodeData,
  LinghuiRunStatus,
  LinghuiScriptNodeProperties,
} from '../../../../types/linghui';
import { useLinghuiNodeInteraction, useLinghuiNodeEditorVisibility, useNodeRunState } from '../state/LinghuiNodeRunsContext';
import { LinghuiNodeEditor } from '../../editors/components/LinghuiNodeEditor';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';
import { parseLinghuiScriptContent } from '../../editors/state/linghuiScriptNodeUtils';
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

function ScriptNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as unknown as LinghuiScriptNodeProperties;
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const status = runState?.status ?? 'idle';
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  const nodeStyle = cssVars({
    ...resolveDefaultCompactNodeStyle({ thumbHeight: 214, minHeight: 368 }),
    '--linghui-node-border': status !== 'idle' ? statusColor : (selected ? nodeData.accent : 'var(--token-border-base)'),
    '--linghui-accent': nodeData.accent,
    '--linghui-progress': `${runState?.progress ?? 0}%`,
  });

  const fallbackShots = useMemo(() => (
    props.mode === 'manual' ? parseLinghuiScriptContent(String(props.content ?? '')).shots : []
  ), [props.content, props.mode]);
  const shots = runState?.result?.kind === 'storyboard'
    ? (runState.result.shots ?? [])
    : fallbackShots;
  const previewLine = shots[0]?.description
    || shots[0]?.title
    || (runState?.result?.kind === 'storyboard' ? String(runState.result.text ?? '').trim() : '')
    || String(props.prompt ?? '').trim();
  const modeLabel = props.mode === 'generate' ? '脚本生成' : '结构化脚本';
  const viewLabel = props.viewMode === 'table' ? '表格视图' : '卡片视图';
  const viewMode = resolveLinghuiNodeViewMode(nodeData.viewMode);
  const isEditorVisible = useLinghuiNodeEditorVisibility(id, 'linghui/script');

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

      {nodeData.outputs.map((slot, index) => (
        <LinghuiNodeHandle
          key={`output-${index}`}
          type="source"
          position={Position.Right}
          id={`output-${index}`}
          dataType={slot.dataType}
          accent={nodeData.accent}
          top={resolveHandleTop(index, nodeData.outputs.length)}
          title={slot.name}
        />
      ))}

      <div className="linghuiCompactThumb linghuiCompactScriptThumb">
        <div className="linghuiCompactScriptFrame">
          <span className="linghuiCompactAccentLineStrong" />
          <span className="linghuiCompactAccentLineMedium" />
          <span className="linghuiCompactAccentLineSoft" />
        </div>
        <div className="linghuiCompactScriptGrid">
          {Array.from({ length: 4 }, (_, index) => (
            <span key={index} className="linghuiCompactAccentBorder" />
          ))}
        </div>
      </div>

      <div className="linghuiCompactInfo">
        <EditableCompactNodeLabel
          nodeId={id}
          label={nodeData.label}
          fallbackLabel="脚本"
        />
        <span className="linghuiCompactMeta">
          {status === 'running' ? '脚本整理中' : `${modeLabel} · ${viewLabel}`}
        </span>
        {shots.length > 0 && (
          <span className="linghuiCompactMeta">
            {shots.length} 个镜头
          </span>
        )}
        {previewLine ? (
          <div className="linghuiCompactTextExcerpt">
            {previewLine.slice(0, 80)}
          </div>
        ) : null}
        <LinghuiNodeRunError runState={runState} />
        {status === 'running' && (
          <div className="linghuiCompactProgress">
            <div className="linghuiCompactProgressBar" />
          </div>
        )}
      </div>

      {isEditorVisible ? <LinghuiNodeEditor nodeId={id} nodeType="linghui/script" /> : null}
    </div>
  );
}

export const ScriptNode = memo(ScriptNodeInner);
