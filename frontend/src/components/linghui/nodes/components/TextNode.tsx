import React, { memo, useMemo } from 'react';
import { type NodeProps, useStore } from '@xyflow/react';
import { FileText } from 'lucide-react';
import type {
  LinghuiNodeData,
  LinghuiRunStatus,
  LinghuiTextNodeProperties,
} from '../../../../types/linghui';
import { getLinghuiResultText, resolveLinghuiTextNodeViewState } from '../../../../types/linghui';
import { useLinghuiNodeInteraction, useLinghuiNodeEditorVisibility, useNodeRunState } from '../state/LinghuiNodeRunsContext';
import { useLinghuiConnectTarget } from '../state/useLinghuiConnectTarget';
import { LinghuiNodeEditor } from '../../editors/components/LinghuiNodeEditor';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';
import { resolveLinghuiNodeViewMode } from '../../editors/state/linghuiNodeViewMode';
import { resolveDefaultCompactNodeStyle } from '../state/linghuiNodeCardSizing';
import { cssVars } from '../../../../theme/runtime';
import { LinghuiNodeRunError } from './LinghuiNodeRunError';
import { LinghuiNodePorts } from './LinghuiNodeHandle';
import { LinghuiTextNodeEmptyState } from './LinghuiTextNodeEmptyState';

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: 'var(--token-text-muted)',
  running: 'var(--token-status-info)',
  succeeded: 'var(--token-status-success)',
  failed: 'var(--token-status-error)',
  stale: 'var(--token-status-warning)',
};

function TextNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as unknown as LinghuiTextNodeProperties;
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const status = runState?.status ?? 'idle';
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;

  // LibTV `selectHasIncomingEdge(id)`：判断是否有任意上游边连入本节点。
  // ReactFlow 通过 useStore 订阅 edges；这里只在 edges 变化时重算。
  const hasIncomingEdge = useStore(state => state.edges.some(edge => edge.target === id));
  // LibTV 连线 hover 抖动：当用户从其它节点拖线到本节点时，加 .isConnectTarget 触发抖动。
  const isConnectTarget = useLinghuiConnectTarget(id);

  const viewState = useMemo(() => resolveLinghuiTextNodeViewState({
    properties: props,
    result: runState?.result,
    runStatus: status,
    hasIncomingEdge,
  }), [props, runState?.result, status, hasIncomingEdge]);

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

  // LibTV `hideTargetHandle = isResourceAction(action)`：manual 模式（=TEXT_RESOURCE）隐藏左 target handle。
  // 资源态不需要上游输入，掩盖 handle 避免误连。
  const portInputs = props.mode === 'manual' ? [] : nodeData.inputs;

  return (
    <div
      className={`linghuiCompactNode nopan is-${status} ${selected ? 'isSelected' : ''} ${viewMode === 'collapsed' ? 'isCollapsed' : ''} ${isEditorVisible ? 'hasInlineEditor' : ''} ${isConnectTarget ? 'isConnectTarget' : ''}`}
      data-view-mode={viewMode}
      data-text-view={viewState}
      style={nodeStyle}
      {...interactionHandlers}
    >
      <LinghuiNodePorts accent={nodeData.accent} inputs={portInputs} outputs={nodeData.outputs} />

      {viewState === 'empty_generate' ? (
        <LinghuiTextNodeEmptyState nodeId={id} />
      ) : viewState === 'pending' ? (
        // LibTV 55676-55683：居中 Text2Icon size=90，无任何文字。
        <div className="linghuiTextNodePendingState" aria-label="等待上游产出">
          <FileText size={90} strokeWidth={1.2} aria-hidden="true" />
        </div>
      ) : (
        <>
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
            <LinghuiNodeRunError runState={runState} />
            {status === 'running' && (
              <div className="linghuiCompactProgress">
                <div className="linghuiCompactProgressBar" />
              </div>
            )}
          </div>
        </>
      )}

      {isEditorVisible ? <LinghuiNodeEditor nodeId={id} nodeType="linghui/text" /> : null}
    </div>
  );
}

export const TextNode = memo(TextNodeInner);
