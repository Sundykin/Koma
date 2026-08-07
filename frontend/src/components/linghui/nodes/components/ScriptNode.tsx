import React, { memo, useMemo, useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { ArrowUp, LoaderCircle, Maximize2, Minimize2, PanelRightOpen, Table2, LayoutGrid, Image as ImageIcon, Video, Wand2, X } from 'lucide-react';
import type {
  LinghuiNodeData,
  LinghuiNodeType,
  LinghuiProductionAsset,
  LinghuiRunStatus,
  LinghuiScriptNodeProperties,
  LinghuiStoryboardFrame,
} from '../../../../types/linghui';
import {
  useLinghuiNodeEditorApi,
  useLinghuiNodeEditorVisibility,
  useLinghuiNodeInteraction,
  useLinghuiNodeInteractionApi,
  useLinghuiNodeMutation,
  useNodeRunState,
} from '../state/LinghuiNodeRunsContext';
import { EditableCompactNodeLabel } from './EditableCompactNodeLabel';
import { parseLinghuiScriptContent } from '../../editors/state/linghuiScriptNodeUtils';
import { resolveLinghuiNodeViewMode } from '../../editors/state/linghuiNodeViewMode';
import { resolveDefaultCompactNodeStyle } from '../state/linghuiNodeCardSizing';
import { cssVars } from '../../../../theme/runtime';
import { LinghuiNodeRunError } from './LinghuiNodeRunError';
import { LinghuiNodePorts } from './LinghuiNodeHandle';
import { ScriptShotCards, ScriptShotTable } from '../../editors/components/ScriptShotViews';
import { LinghuiNodeEditor } from '../../editors/components/LinghuiNodeEditor';

const STATUS_COLORS: Record<LinghuiRunStatus, string> = {
  idle: 'var(--token-text-muted)',
  running: 'var(--token-status-info)',
  succeeded: 'var(--token-status-success)',
  failed: 'var(--token-status-error)',
  stale: 'var(--token-status-warning)',
};

function getScriptNodePreviewScale(shotCount: number, viewMode: 'cards' | 'table', expanded: boolean): number {
  if (expanded) return 1;
  if (viewMode === 'table') return shotCount > 8 ? 0.62 : 0.7;
  if (shotCount >= 20) return 0.42;
  if (shotCount >= 12) return 0.48;
  if (shotCount >= 8) return 0.56;
  if (shotCount >= 4) return 0.68;
  return 0.82;
}

function ScriptNodeInner({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as LinghuiNodeData;
  const props = nodeData.properties as unknown as LinghuiScriptNodeProperties;
  const runState = useNodeRunState(id);
  const interactionHandlers = useLinghuiNodeInteraction(id);
  const interactionApi = useLinghuiNodeInteractionApi();
  const editorApi = useLinghuiNodeEditorApi();
  const { updateNodeData } = useLinghuiNodeMutation();
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
  const isEditorVisible = useLinghuiNodeEditorVisibility(id, linghuiType);
  const [nodeViewMode, setNodeViewMode] = useState<'cards' | 'table'>(props.viewMode === 'table' ? 'table' : 'cards');
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);
  const [isStoryExpanded, setIsStoryExpanded] = useState(false);
  const fallbackShots = useMemo(() => (
    !isStoryboard && props.mode === 'manual'
      ? parseLinghuiScriptContent(String(props.content ?? '')).shots
      : []
  ), [isStoryboard, props.content, props.mode]);
  const sourceShots = runState?.result?.kind === 'storyboard'
    ? (runState.result.shots ?? [])
    : fallbackShots;
  const editedShots = Array.isArray(props.editedShots) ? props.editedShots : [];
  const productionAssets: LinghuiProductionAsset[] = Array.isArray(props.productionAssets) ? props.productionAssets : [];
  const shots = editedShots.length > 0 ? editedShots : sourceShots;
  const availableShotIds = useMemo(() => new Set(shots.map(shot => shot.id)), [shots]);
  const effectiveSelectedShotIds = useMemo(() => {
    return selectedShotIds.filter(shotId => availableShotIds.has(shotId));
  }, [availableShotIds, selectedShotIds]);
  const previewLine = shots[0]?.description
    || shots[0]?.title
    || (runState?.result?.kind === 'storyboard' ? String(runState.result.text ?? '').trim() : '')
    || String(props.prompt ?? '').trim();
  const modeLabel = isStoryboard
    ? '故事板'
    : props.mode === 'generate' ? '脚本生成' : '结构化脚本';
  const viewLabel = nodeViewMode === 'table' ? '表格视图' : '卡片视图';
  const viewMode = resolveLinghuiNodeViewMode(nodeData.viewMode);
  const handleToggleShot = (shotId: string, checked: boolean) => {
    setSelectedShotIds(prev => {
      const base = prev.filter(id => availableShotIds.has(id));
      if (checked) return base.includes(shotId) ? base : [...base, shotId];
      return base.filter(id => id !== shotId);
    });
  };
  const handleChangeShot = (shotId: string, patch: Partial<LinghuiStoryboardFrame>) => {
    updateNodeData(id, prev => {
      const prevProps = prev.properties as Partial<LinghuiScriptNodeProperties>;
      const baseShots = Array.isArray(prevProps.editedShots) && prevProps.editedShots.length > 0
        ? prevProps.editedShots
        : shots;
      return {
        ...prev,
        properties: {
          ...prev.properties,
          editedShots: baseShots.map(shot => (shot.id === shotId ? { ...shot, ...patch } : shot)),
        } as unknown as Record<string, unknown>,
      };
    }, { markStale: false });
  };
  const handlePromptChange = (value: string) => {
    updateNodeData(id, prev => ({
      ...prev,
      properties: {
        ...prev.properties,
        prompt: value,
      } as unknown as Record<string, unknown>,
    }));
  };
  const handleOpenProductionAsset = (assetId: string) => {
    updateNodeData(id, prev => ({
      ...prev,
      properties: {
        ...prev.properties,
        productionStage: 'assets',
        focusedProductionAssetId: assetId,
      } as unknown as Record<string, unknown>,
    }), { markStale: false });
    interactionApi.openNodeEditor(id);
  };
  const handleRunStoryboard = () => {
    if (!String(props.prompt ?? '').trim() || status === 'running') return;
    editorApi.onRunNode(id);
  };
  const selectedShots = shots.filter(shot => effectiveSelectedShotIds.includes(shot.id));
  const canUseShotActions = selectedShots.length > 0;
  const areAllShotsSelected = shots.length > 0 && effectiveSelectedShotIds.length === shots.length;
  const canRunStoryboard = Boolean(String(props.prompt ?? '').trim()) && status !== 'running';
  const previewScale = getScriptNodePreviewScale(shots.length, nodeViewMode, isStoryExpanded);
  const storyNodeStyle = cssVars({
    ...nodeStyle,
    '--linghui-script-preview-scale': String(previewScale),
    '--linghui-script-preview-width': `${Math.round(100 / previewScale)}%`,
    '--linghui-node-width': isStoryExpanded ? '760px' : undefined,
    '--linghui-thumb-height': isStoryExpanded ? '620px' : undefined,
  });

  return (
    <div
      className={`linghuiCompactNode linghuiCompactScriptNode nopan is-${status} ${selected ? 'isSelected' : ''} ${viewMode === 'collapsed' ? 'isCollapsed' : ''} ${isStoryExpanded ? 'isStoryExpanded' : ''}`}
      data-view-mode={viewMode}
      data-story-expanded={isStoryExpanded ? 'true' : undefined}
      style={storyNodeStyle}
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
            {shots.length > 0 ? (
              <button
                type="button"
                className="isText"
                aria-label={areAllShotsSelected ? '清空选择' : '全选镜头'}
                title={areAllShotsSelected ? '清空选择' : '全选镜头'}
                onClick={event => {
                  event.stopPropagation();
                  setSelectedShotIds(areAllShotsSelected ? [] : shots.map(shot => shot.id));
                }}
              >
                {areAllShotsSelected ? '清选' : '全选'}
              </button>
            ) : null}
            <button
              type="button"
              className="isText"
              aria-label="打开制作台"
              title="在统一制作台中编辑剧本、资产和分镜"
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                interactionApi.openNodeEditor(id);
              }}
            >
              <PanelRightOpen size={12} />
              制作台
            </button>
            <button
              type="button"
              aria-label={isStoryExpanded ? '收起节点' : '展开节点'}
              title={isStoryExpanded ? '收起节点' : '展开节点'}
              onClick={event => {
                event.stopPropagation();
                setIsStoryExpanded(value => !value);
              }}
            >
              {isStoryExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          </div>
        </div>
        <div className="linghuiCompactScriptNodeBody nodrag nowheel">
          <div className="linghuiCompactScriptNodeBodyInner">
            {shots.length > 0 ? (
              nodeViewMode === 'table' ? (
                <ScriptShotTable
                  shots={shots}
                  selectedShotIds={effectiveSelectedShotIds}
                  onToggleShot={handleToggleShot}
                  editable
                  onChangeShot={handleChangeShot}
                  productionAssets={productionAssets}
                  onOpenProductionAsset={handleOpenProductionAsset}
                />
              ) : (
                <ScriptShotCards
                  shots={shots}
                  selectedShotIds={effectiveSelectedShotIds}
                  onToggleShot={handleToggleShot}
                  productionAssets={productionAssets}
                  onOpenProductionAsset={handleOpenProductionAsset}
                />
              )
            ) : (
              <div className="linghuiCompactScriptComposer">
                <textarea
                  className="linghuiCompactScriptComposerInput nodrag nowheel"
                  value={String(props.prompt ?? '')}
                  placeholder="写下剧情大纲，节点内生成故事板"
                  onChange={event => handlePromptChange(event.target.value)}
                  onClick={event => event.stopPropagation()}
                  onMouseDown={event => event.stopPropagation()}
                  onKeyDown={event => event.stopPropagation()}
                  aria-label="故事板剧情大纲"
                />
                <button
                  type="button"
                  className="linghuiCompactScriptComposerRun nodrag"
                  disabled={!canRunStoryboard}
                  onClick={event => {
                    event.stopPropagation();
                    handleRunStoryboard();
                  }}
                  aria-label="生成故事板"
                  title={canRunStoryboard ? '生成故事板' : '请先输入剧情大纲'}
                >
                  {status === 'running' ? <LoaderCircle size={13} className="linghuiCompactInlineSpinner" /> : <ArrowUp size={13} />}
                  <span>{status === 'running' ? '生成中' : '生成故事板'}</span>
                </button>
              </div>
            )}
          </div>
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
              editorApi.onDeriveScriptShots(id, selectedShots);
            }}
          >
            <Wand2 size={13} />
            派生文本
          </button>
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

      {isEditorVisible ? <LinghuiNodeEditor nodeId={id} nodeType={linghuiType} /> : null}
    </div>
  );
}

export const ScriptNode = memo(ScriptNodeInner);
