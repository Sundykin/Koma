import React, { memo, useCallback } from 'react';
import { type NodeProps } from '@xyflow/react';
import { ArrowUp, LoaderCircle, Settings2, Wand2 } from 'lucide-react';
import type {
  LinghuiAgentNodeProperties,
  LinghuiNodeData,
  LinghuiRunStatus,
} from '../../../../types/linghui';
import { getLinghuiResultText } from '../../../../types/linghui';
import {
  useLinghuiNodeEditorApi,
  useLinghuiNodeInteraction,
  useLinghuiNodeInteractionApi,
  useLinghuiNodeEditorVisibility,
  useLinghuiNodeMutation,
  useNodeRunState,
} from '../state/LinghuiNodeRunsContext';
import { LinghuiNodeEditor } from '../../editors/components/LinghuiNodeEditor';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';
import { resolveLinghuiNodeViewMode } from '../../editors/state/linghuiNodeViewMode';
import { resolveDefaultCompactNodeStyle } from '../state/linghuiNodeCardSizing';
import { cssVars } from '../../../../theme/runtime';
import { LinghuiNodeRunError } from './LinghuiNodeRunError';
import { LinghuiNodePorts } from './LinghuiNodeHandle';
import {
  LINGHUI_AGENT_PROMPT_PRESETS,
  mergeLinghuiAgentPresetPrompt,
  mergeLinghuiAgentPresetSystemPrompt,
  type LinghuiAgentPromptPreset,
} from '../../editors/state/linghuiAgentPromptPresets';

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: 'var(--token-text-muted)',
  running: 'var(--token-status-info)',
  succeeded: 'var(--token-status-success)',
  failed: 'var(--token-status-error)',
  stale: 'var(--token-status-warning)',
};

function AgentNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as unknown as LinghuiAgentNodeProperties;
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const interactionApi = useLinghuiNodeInteractionApi();
  const editorApi = useLinghuiNodeEditorApi();
  const { updateNodeData } = useLinghuiNodeMutation();
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
  const maxIterations = Math.max(1, Number(props.maxIterations ?? 6));
  const metaLabel = status === 'running'
    ? `Agent 推理中 · 最多 ${maxIterations} 轮`
    : `工具 ${toolCount} 个 · 最多 ${maxIterations} 轮`;
  const viewMode = resolveLinghuiNodeViewMode(nodeData.viewMode);
  const isEditorVisible = useLinghuiNodeEditorVisibility(id, 'linghui/agent');
  const isRunning = status === 'running';
  const canRunAgent = Boolean(String(props.prompt ?? '').trim());

  const handleApplyPreset = useCallback((preset: LinghuiAgentPromptPreset) => {
    updateNodeData(id, prev => {
      const prevProps = prev.properties as Partial<LinghuiAgentNodeProperties>;
      return {
        ...prev,
        properties: {
          ...prev.properties,
          prompt: mergeLinghuiAgentPresetPrompt(String(prevProps.prompt ?? ''), preset),
          systemPrompt: mergeLinghuiAgentPresetSystemPrompt(String(prevProps.systemPrompt ?? ''), preset),
          maxIterations: preset.maxIterations ?? prevProps.maxIterations ?? 6,
        },
      };
    }, { markStale: false });
  }, [id, updateNodeData]);

  const handleRun = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canRunAgent || isRunning) return;
    editorApi.onRunNode(id);
  }, [canRunAgent, editorApi, id, isRunning]);

  const handleOpenSettings = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    interactionApi.openNodeEditor(id);
  }, [id, interactionApi]);

  return (
    <div
      className={`linghuiCompactNode nopan is-${status} ${selected ? 'isSelected' : ''} ${viewMode === 'collapsed' ? 'isCollapsed' : ''} ${isEditorVisible ? 'hasInlineEditor' : ''}`}
      data-view-mode={viewMode}
      style={nodeStyle}
      {...interactionHandlers}
    >
      <LinghuiNodePorts accent={nodeData.accent} inputs={nodeData.inputs} outputs={nodeData.outputs} />

      <div className="linghuiCompactThumb linghuiCompactTextThumb">
        <div className="linghuiCompactAgentPresetStrip nodrag nopan" aria-label="Agent 任务模板">
          {LINGHUI_AGENT_PROMPT_PRESETS.slice(0, 4).map(preset => (
            <button
              key={preset.key}
              type="button"
              className="linghuiCompactAgentPresetChip"
              title={preset.description}
              onPointerDown={event => event.stopPropagation()}
              onMouseDown={event => event.stopPropagation()}
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                handleApplyPreset(preset);
              }}
            >
              <Wand2 size={11} aria-hidden="true" />
              <span>{preset.label}</span>
            </button>
          ))}
        </div>
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
        <div className="linghuiCompactAgentActionRow nodrag nopan">
          <button
            type="button"
            className="linghuiCompactAgentIconButton"
            onPointerDown={event => event.stopPropagation()}
            onMouseDown={event => event.stopPropagation()}
            onClick={handleOpenSettings}
            aria-label="打开 Agent 设置"
            title="打开 Agent 设置"
          >
            <Settings2 size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="linghuiCompactAgentRunButton"
            onPointerDown={event => event.stopPropagation()}
            onMouseDown={event => event.stopPropagation()}
            onClick={handleRun}
            disabled={!canRunAgent || isRunning}
            aria-label="执行 Agent"
            title={canRunAgent ? '执行 Agent' : '请先输入任务目标'}
          >
            {isRunning ? <LoaderCircle size={13} className="linghuiCompactInlineSpinner" aria-hidden="true" /> : <ArrowUp size={13} aria-hidden="true" />}
            <span>{isRunning ? '执行中' : '执行'}</span>
          </button>
        </div>
      </div>

      {isEditorVisible ? <LinghuiNodeEditor nodeId={id} nodeType="linghui/agent" /> : null}
    </div>
  );
}

export const AgentNode = memo(AgentNodeInner);
