import React, { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
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

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: '#64748b',
  running: '#3b82f6',
  succeeded: '#22c55e',
  failed: '#ef4444',
  stale: '#f97316',
};

function resolveHandleTop(index: number, total: number): string {
  if (total <= 1) return '50%';
  const step = 100 / (total + 1);
  return `${step * (index + 1)}%`;
}

function getHandleColor(dataType: LinghuiNodeData['inputs'][number]['dataType'], accent: string): string {
  switch (dataType) {
    case 'text':
      return '#f59e0b';
    case 'video':
      return '#38bdf8';
    default:
      return accent;
  }
}

function ScriptNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as unknown as LinghuiScriptNodeProperties;
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const status = runState?.status ?? 'idle';
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;

  const fallbackShots = useMemo(() => (
    props.mode === 'manual' ? parseLinghuiScriptContent(String(props.content ?? '')).shots : []
  ), [props.content, props.mode]);
  const shots = runState?.result?.kind === 'storyboard'
    ? (runState.result.shots ?? [])
    : fallbackShots;
  const previewLine = shots[0]?.description || shots[0]?.title || String(props.prompt ?? '').trim();
  const modeLabel = props.mode === 'generate' ? '脚本生成' : '结构化脚本';
  const viewLabel = props.viewMode === 'table' ? '表格视图' : '卡片视图';
  const viewMode = resolveLinghuiNodeViewMode(nodeData.viewMode);
  const isEditorVisible = useLinghuiNodeEditorVisibility(id, 'linghui/script');

  return (
    <div
      className={`linghuiCompactNode nopan ${selected ? 'isSelected' : ''} ${viewMode === 'collapsed' ? 'isCollapsed' : ''} ${isEditorVisible ? 'hasInlineEditor' : ''}`}
      data-view-mode={viewMode}
      style={{
        ...resolveDefaultCompactNodeStyle({ thumbHeight: 214, minHeight: 368 }),
        borderColor: status !== 'idle' ? statusColor : (selected ? nodeData.accent : 'rgba(63, 63, 70, 0.7)'),
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

      {nodeData.outputs.map((_, index) => (
        <Handle
          key={`output-${index}`}
          type="source"
          position={Position.Right}
          id={`output-${index}`}
          className="linghuiCompactHandle"
          style={{ background: index === 0 ? '#f59e0b' : nodeData.accent, top: resolveHandleTop(index, nodeData.outputs.length) }}
        />
      ))}

      <div className="linghuiCompactThumb linghuiCompactScriptThumb">
        <div className="linghuiCompactScriptFrame">
          <span style={{ background: `${nodeData.accent}cc` }} />
          <span style={{ background: `${nodeData.accent}a6` }} />
          <span style={{ background: `${nodeData.accent}80` }} />
        </div>
        <div className="linghuiCompactScriptGrid">
          {Array.from({ length: 4 }, (_, index) => (
            <span key={index} style={{ borderColor: `${nodeData.accent}55` }} />
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
        {status === 'running' && (
          <div className="linghuiCompactProgress">
            <div className="linghuiCompactProgressBar" style={{ width: `${runState?.progress ?? 0}%` }} />
          </div>
        )}
      </div>

      {isEditorVisible ? <LinghuiNodeEditor nodeId={id} nodeType="linghui/script" /> : null}
    </div>
  );
}

export const ScriptNode = memo(ScriptNodeInner);
