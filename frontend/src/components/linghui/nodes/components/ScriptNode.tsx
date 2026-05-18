import React, { memo, useMemo, useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { Maximize2, Table2, LayoutGrid, Image as ImageIcon, Video, X } from 'lucide-react';
import type {
  LinghuiNodeData,
  LinghuiNodeType,
  LinghuiRunStatus,
  LinghuiScriptNodeProperties,
} from '../../../../types/linghui';
import {
  useLinghuiNodeEditorApi,
  useLinghuiNodeEditorVisibility,
  useLinghuiNodeInteraction,
  useLinghuiNodeInteractionApi,
  useNodeRunState,
} from '../state/LinghuiNodeRunsContext';
import { LinghuiNodeEditor } from '../../editors/components/LinghuiNodeEditor';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';
import { parseLinghuiScriptContent } from '../../editors/state/linghuiScriptNodeUtils';
import { resolveLinghuiNodeViewMode } from '../../editors/state/linghuiNodeViewMode';
import { resolveDefaultCompactNodeStyle } from '../state/linghuiNodeCardSizing';
import { cssVars } from '../../../../theme/runtime';
import { LinghuiNodeRunError } from './LinghuiNodeRunError';
import { LinghuiNodePorts } from './LinghuiNodeHandle';
import { ScriptShotCards, ScriptShotTable } from '../../editors/components/ScriptShotViews';

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: 'var(--token-text-muted)',
  running: 'var(--token-status-info)',
  succeeded: 'var(--token-status-success)',
  failed: 'var(--token-status-error)',
  stale: 'var(--token-status-warning)',
};

function ScriptNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as unknown as LinghuiScriptNodeProperties;
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const interactionApi = useLinghuiNodeInteractionApi();
  const editorApi = useLinghuiNodeEditorApi();
  const status = runState?.status ?? 'idle';
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  const nodeStyle = cssVars({
    ...resolveDefaultCompactNodeStyle({ thumbHeight: 214, minHeight: 368 }),
    '--linghui-node-border': status !== 'idle' ? statusColor : (selected ? nodeData.accent : 'var(--token-border-base)'),
    '--linghui-accent': nodeData.accent,
    '--linghui-progress': `${runState?.progress ?? 0}%`,
  });

  const linghuiType: LinghuiNodeType = nodeData.linghuiType === 'linghui/storyboard'
    ? 'linghui/storyboard'
    : 'linghui/script';
  const isStoryboard = linghuiType === 'linghui/storyboard';
  const [nodeViewMode, setNodeViewMode] = useState<'cards' | 'table'>(props.viewMode === 'table' ? 'table' : 'cards');
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);
  const fallbackShots = useMemo(() => (
    !isStoryboard && props.mode === 'manual'
      ? parseLinghuiScriptContent(String(props.content ?? '')).shots
      : []
  ), [isStoryboard, props.content, props.mode]);
  const shots = runState?.result?.kind === 'storyboard'
    ? (runState.result.shots ?? [])
    : fallbackShots;
  const availableShotIds = useMemo(() => new Set(shots.map(shot => shot.id)), [shots]);
  const effectiveSelectedShotIds = useMemo(() => {
    return selectedShotIds.filter(shotId => availableShotIds.has(shotId));
  }, [availableShotIds, selectedShotIds, shots]);
  const previewLine = shots[0]?.description
    || shots[0]?.title
    || (runState?.result?.kind === 'storyboard' ? String(runState.result.text ?? '').trim() : '')
    || String(props.prompt ?? '').trim();
  const modeLabel = isStoryboard
    ? '故事板'
    : props.mode === 'generate' ? '脚本生成' : '结构化脚本';
  const viewLabel = nodeViewMode === 'table' ? '表格视图' : '卡片视图';
  const viewMode = resolveLinghuiNodeViewMode(nodeData.viewMode);
  const isEditorVisible = useLinghuiNodeEditorVisibility(id, linghuiType);
  const handleToggleShot = (shotId: string, checked: boolean) => {
    setSelectedShotIds(prev => {
      const base = prev.filter(id => availableShotIds.has(id));
      if (checked) return base.includes(shotId) ? base : [...base, shotId];
      return base.filter(id => id !== shotId);
    });
  };
  const selectedShots = shots.filter(shot => effectiveSelectedShotIds.includes(shot.id));
  const canUseShotActions = selectedShots.length > 0;

  return (
    <div
      className={`linghuiCompactNode nopan is-${status} ${selected ? 'isSelected' : ''} ${viewMode === 'collapsed' ? 'isCollapsed' : ''} ${isEditorVisible ? 'hasInlineEditor' : ''}`}
      data-view-mode={viewMode}
      style={nodeStyle}
      {...interactionHandlers}
    >
      <LinghuiNodePorts accent={nodeData.accent} inputs={nodeData.inputs} outputs={nodeData.outputs} />

      <div className={`linghuiCompactThumb linghuiCompactScriptThumb ${shots.length > 0 ? 'hasStoryboardRows' : ''}`}>
        <div className="linghuiCompactScriptNodeBar">
          <span className="linghuiCompactScriptNodeCount">{shots.length > 0 ? `${shots.length}镜头` : '暂无数据'}</span>
          <div className="linghuiCompactScriptNodeActions">
            <button
              type="button"
              className={nodeViewMode === 'cards' ? 'isActive' : ''}
              aria-label="卡片视图"
              title="卡片视图"
              onClick={event => {
                event.stopPropagation();
                setNodeViewMode('cards');
              }}
            >
              <LayoutGrid size={12} />
            </button>
            <button
              type="button"
              className={nodeViewMode === 'table' ? 'isActive' : ''}
              aria-label="表格视图"
              title="表格视图"
              onClick={event => {
                event.stopPropagation();
                setNodeViewMode('table');
              }}
            >
              <Table2 size={12} />
            </button>
            <button
              type="button"
              aria-label="全屏展开"
              title="全屏展开"
              onClick={event => {
                event.stopPropagation();
                interactionApi.openNodeEditor(id);
              }}
            >
              <Maximize2 size={12} />
            </button>
          </div>
        </div>
        <div className="linghuiCompactScriptNodeBody nodrag nowheel">
          {shots.length > 0 ? (
            nodeViewMode === 'table' ? (
              <ScriptShotTable
                shots={shots}
                selectedShotIds={effectiveSelectedShotIds}
                onToggleShot={handleToggleShot}
              />
            ) : (
              <ScriptShotCards
                shots={shots}
                selectedShotIds={effectiveSelectedShotIds}
                onToggleShot={handleToggleShot}
              />
            )
          ) : (
            <div className="linghuiCompactScriptEmpty">运行后在节点内展示故事板</div>
          )}
        </div>
      </div>

      <div className="linghuiCompactInfo">
        <EditableCompactNodeLabel
          nodeId={id}
          label={nodeData.label}
          fallbackLabel={isStoryboard ? '故事板' : '脚本'}
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

      {isEditorVisible ? <LinghuiNodeEditor nodeId={id} nodeType={linghuiType} /> : null}
      {canUseShotActions ? (
        <div className="linghuiCompactScriptGenerator nodrag nopan nowheel">
          <button
            type="button"
            className="linghuiCompactScriptGeneratorIcon"
            aria-label="关闭分镜生成器"
            title="关闭分镜生成器"
            onClick={event => {
              event.stopPropagation();
              setSelectedShotIds([]);
            }}
          >
            <X size={12} />
          </button>
          <span className="linghuiCompactScriptGeneratorDivider" />
          <span className="linghuiCompactScriptGeneratorCount">
            已选 {selectedShots.length}/{shots.length}
          </span>
          <span className="linghuiCompactScriptGeneratorDivider" />
          <button
            type="button"
            className="linghuiCompactScriptGeneratorAction"
            onClick={event => {
              event.stopPropagation();
              editorApi.onGenerateScriptImages(id, selectedShots);
            }}
          >
            <ImageIcon size={13} />
            生成分镜
          </button>
          <button
            type="button"
            className="linghuiCompactScriptGeneratorAction"
            onClick={event => {
              event.stopPropagation();
              editorApi.onGenerateScriptVideos(id, selectedShots);
            }}
          >
            <Video size={13} />
            生成视频组
          </button>
        </div>
      ) : null}
    </div>
  );
}

export const ScriptNode = memo(ScriptNodeInner);
