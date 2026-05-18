import React, { memo, useMemo } from 'react';
import { type NodeProps, useStore } from '@xyflow/react';
import { Disc3, LoaderCircle } from 'lucide-react';
import {
  getLinghuiResultPrimaryMedia,
  resolveLinghuiAudioNodeViewState,
  type LinghuiAudioNodeProperties,
  type LinghuiNodeData,
  type LinghuiRunStatus,
} from '../../../../types/linghui';
import { useNodeRunState, useLinghuiNodeInteraction, useLinghuiNodeEditorVisibility } from '../state/LinghuiNodeRunsContext';
import { useLinghuiConnectTarget } from '../state/useLinghuiConnectTarget';
import { LinghuiNodeEditor } from '../../editors/components/LinghuiNodeEditor';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';
import { resolveLinghuiNodeViewMode } from '../../editors/state/linghuiNodeViewMode';
import { resolveDefaultCompactNodeStyle } from '../state/linghuiNodeCardSizing';
import { cssVars } from '../../../../theme/runtime';
import { LinghuiNodeRunError } from './LinghuiNodeRunError';
import { LinghuiNodePorts } from './LinghuiNodeHandle';
import { LinghuiAudioNodeEmptyState } from './LinghuiAudioNodeEmptyState';
import { LinghuiAudioNodeUploadFloat } from './LinghuiAudioNodeUploadFloat';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: 'var(--token-text-muted)',
  running: 'var(--token-status-info)',
  succeeded: 'var(--token-status-success)',
  failed: 'var(--token-status-error)',
  stale: 'var(--token-status-warning)',
};

function formatDuration(durationSec?: number): string {
  if (!durationSec || !Number.isFinite(durationSec)) {
    return '';
  }

  if (durationSec < 60) {
    return `${Math.max(1, Math.round(durationSec))} 秒`;
  }

  const minutes = Math.floor(durationSec / 60);
  const seconds = Math.round(durationSec % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function AudioNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as unknown as LinghuiAudioNodeProperties;
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const status = runState?.status ?? 'idle';
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  const nodeStyle = cssVars({
    ...resolveDefaultCompactNodeStyle({ thumbHeight: 214, minHeight: 316 }),
    '--linghui-node-border': status !== 'idle' ? statusColor : (selected ? nodeData.accent : 'var(--token-border-base)'),
    '--linghui-accent': nodeData.accent,
    '--linghui-progress': `${runState?.progress ?? 0}%`,
  });
  const hasIncomingEdge = useStore(state => state.edges.some(edge => edge.target === id));
  const viewState = useMemo(() => resolveLinghuiAudioNodeViewState({
    properties: props,
    result: runState?.result,
    runStatus: status,
    hasIncomingEdge,
  }), [hasIncomingEdge, props, runState?.result, status]);
  const primaryAudio = getLinghuiResultPrimaryMedia(runState?.result);
  const rawAudioSource = String(props.source || primaryAudio?.source || '').trim();
  const audioSource = toFileSystemDisplayUrl(rawAudioSource) || rawAudioSource;
  const durationLabel = formatDuration(primaryAudio?.durationSec);
  const hasUploadedSource = Boolean(String(props.source ?? '').trim());
  const normalizedRunProgress = typeof runState?.progress === 'number' && Number.isFinite(runState.progress)
    ? Math.max(0, Math.min(100, Math.round(runState.progress)))
    : 0;
  const normalizedRunMessage = String(runState?.message ?? '').trim();
  const footerCaption = status === 'running'
    ? `${normalizedRunMessage && normalizedRunMessage !== '准备执行' ? normalizedRunMessage : '等待音频生成…'}${normalizedRunProgress > 0 ? ` · ${normalizedRunProgress}%` : ''}`
    : durationLabel || (hasUploadedSource ? '透传输出' : '文本转音频');
  const viewMode = resolveLinghuiNodeViewMode(nodeData.viewMode);
  const isEditorVisible = useLinghuiNodeEditorVisibility(id, 'linghui/audio');
  const isGenerateNode = props.mode !== 'import' && !hasUploadedSource;
  const shouldShowAudioGenerator = isGenerateNode && (selected || isEditorVisible);
  const isConnectTarget = useLinghuiConnectTarget(id);
  const portInputs = props.mode === 'import' ? [] : nodeData.inputs;

  return (
    <div
      className={`linghuiCompactNode nopan is-${status} ${selected ? 'isSelected' : ''} ${viewMode === 'collapsed' ? 'isCollapsed' : ''} ${isEditorVisible ? 'hasInlineEditor' : ''} ${isConnectTarget ? 'isConnectTarget' : ''}`}
      data-view-mode={viewMode}
      data-audio-view={viewState}
      style={nodeStyle}
      {...interactionHandlers}
    >
      {viewState === 'empty_generate' || viewState === 'pending' ? (
        <LinghuiAudioNodeUploadFloat nodeId={id} />
      ) : null}
      <LinghuiNodePorts accent={nodeData.accent} inputs={portInputs} outputs={nodeData.outputs} />

      <div className="linghuiCompactThumb linghuiCompactAudioThumb">
        {viewState === 'empty_generate' ? (
          <LinghuiAudioNodeEmptyState nodeId={id} />
        ) : viewState === 'pending' ? null : audioSource ? (
          <div className="linghuiCompactAudioResourceStage">
            <div className="linghuiCompactAudioDisc" aria-hidden="true">
              <Disc3 size={58} strokeWidth={1.1} />
            </div>
            <audio
              className="linghuiCompactAudioPlayer nodrag nopan"
              src={audioSource}
              controls
              onMouseDown={event => event.stopPropagation()}
              onPointerDown={event => event.stopPropagation()}
              onClick={event => event.stopPropagation()}
            />
          </div>
        ) : (
          <div className="linghuiTextNodePendingState" aria-label="等待音频生成">
            <Disc3 size={80} strokeWidth={1.1} aria-hidden="true" />
          </div>
        )}
        {viewState === 'resource' || viewState === 'generating' || viewState === 'failed' ? (
          <>
            <div className="linghuiCompactThumbMeta">
              <EditableCompactNodeLabel
                nodeId={id}
                label={nodeData.label}
                fallbackLabel="音频"
              />
              <span className="linghuiCompactNodeKindBadge">音频</span>
            </div>
            <div className="linghuiCompactThumbFooter">
              <span className={`linghuiCompactThumbCaption ${status === 'running' ? 'isRunning' : ''}`}>
                {status === 'running' ? <LoaderCircle size={12} className="linghuiCompactInlineSpinner" aria-hidden="true" /> : null}
                {footerCaption}
              </span>
            </div>
          </>
        ) : null}
        {status === 'running' && (
          <div className="linghuiCompactThumbProgress">
            <div className="linghuiCompactProgressBar" />
          </div>
        )}
        <LinghuiNodeRunError runState={runState} surface="thumb" />
      </div>

      {shouldShowAudioGenerator ? <LinghuiNodeEditor nodeId={id} nodeType="linghui/audio" forceVisible /> : null}
    </div>
  );
}

export const AudioNode = memo(AudioNodeInner);
