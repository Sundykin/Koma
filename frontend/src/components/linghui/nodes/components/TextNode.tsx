import React, { memo, useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { type NodeProps, useStore } from '@xyflow/react';
import { FileText } from 'lucide-react';
import type {
  LinghuiNodeData,
  LinghuiRunStatus,
  LinghuiTextNodeProperties,
} from '../../../../types/linghui';
import { getLinghuiResultText, resolveLinghuiTextNodeViewState } from '../../../../types/linghui';
import {
  useLinghuiNodeInteraction,
  useLinghuiNodeEditorVisibility,
  useLinghuiNodeMutation,
  useNodeRunState,
} from '../state/LinghuiNodeRunsContext';
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

interface TextNodeManualResourceEditorProps {
  value: string;
  onCommit: (value: string) => void;
}

const TextNodeManualResourceEditor: React.FC<TextNodeManualResourceEditorProps> = ({
  value,
  onCommit,
}) => {
  const [draft, setDraft] = useState(value);
  const isComposingRef = useRef(false);

  useEffect(() => {
    if (isComposingRef.current) return;
    setDraft(value);
  }, [value]);

  const commit = useCallback((nextValue: string) => {
    onCommit(nextValue);
  }, [onCommit]);

  return (
    <textarea
      className="linghuiTextNodeResourceTextarea"
      value={draft}
      placeholder="请编写内容，开始你的创作。"
      autoFocus
      onCompositionStart={() => {
        isComposingRef.current = true;
      }}
      onCompositionEnd={event => {
        isComposingRef.current = false;
        const nextValue = event.currentTarget.value;
        setDraft(nextValue);
        commit(nextValue);
      }}
      onChange={event => {
        const nextValue = event.target.value;
        setDraft(nextValue);
        if (!isComposingRef.current) {
          commit(nextValue);
        }
      }}
      onBlur={() => {
        if (!isComposingRef.current && draft !== value) {
          commit(draft);
        }
      }}
      onPointerDown={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
    />
  );
};

function TextNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as unknown as LinghuiTextNodeProperties;
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const { updateNodeData } = useLinghuiNodeMutation();
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
  const content = String(props.content ?? '');
  const modeLabel = props.mode === 'generate' ? 'LLM 生成' : '手动文本';
  const viewMode = resolveLinghuiNodeViewMode(nodeData.viewMode);
  const isEditorVisible = useLinghuiNodeEditorVisibility(id, 'linghui/text');
  const isManualMode = props.mode === 'manual';
  const isManualEditorVisible = isManualMode && isEditorVisible && !selected;
  const shouldShowTextGenerator = selected || isEditorVisible;

  const updateContent = useCallback((content: string) => {
    updateNodeData(id, prev => ({
      ...prev,
      properties: {
        ...prev.properties,
        content,
      },
    }));
  }, [id, updateNodeData]);

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
      ) : isManualMode ? (
        previewText || isManualEditorVisible ? (
          <div className={`linghuiTextNodeResourceState ${isManualEditorVisible ? 'isEditing' : ''}`}>
            {isManualEditorVisible ? (
              <TextNodeManualResourceEditor
                value={content}
                onCommit={updateContent}
              />
            ) : (
              <div className="linghuiTextNodeResourceText">
                {previewText}
              </div>
            )}
          </div>
        ) : (
          <LinghuiTextNodeEmptyState nodeId={id} variant="manual" />
        )
      ) : (
        <>
          {previewText ? (
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
                <div className="linghuiCompactTextExcerpt">
                  {previewText.slice(0, 72)}
                </div>
                <LinghuiNodeRunError runState={runState} />
                {status === 'running' && (
                  <div className="linghuiCompactProgress">
                    <div className="linghuiCompactProgressBar" />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="linghuiTextNodePendingState" aria-label="等待 LLM 生成文本">
              <FileText size={90} strokeWidth={1.2} aria-hidden="true" />
            </div>
          )}
        </>
      )}

      {shouldShowTextGenerator ? <LinghuiNodeEditor nodeId={id} nodeType="linghui/text" forceVisible /> : null}
    </div>
  );
}

export const TextNode = memo(TextNodeInner);
