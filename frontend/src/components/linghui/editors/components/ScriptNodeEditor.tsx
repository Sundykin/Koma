import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Dropdown, Modal, Popover } from 'antd';
import type { MenuProps } from 'antd';
import { ArrowUp, Expand, Image as ImageIcon, LayoutGrid, Rows3, Video, Wand2 } from 'lucide-react';
import type {
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiScriptNodeMode,
  LinghuiScriptNodeProperties,
  LinghuiStoryboardFrame,
} from '../../../../types/linghui';
import { loadSettings } from '../../../../store/settings/core';
import { listConfiguredModelSelectOptions } from '../../../../providers/channel/resolver';
import { useLinghuiNodeMutation } from '../../nodes/state/LinghuiNodeRunsContext';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import type { LinghuiPromptReferenceItem } from '../state/linghuiPromptReferences';
import { parseLinghuiScriptContent } from '../state/linghuiScriptNodeUtils';
import { useLinghuiActionLock } from '../hooks/useLinghuiActionLock';
import { ScriptShotCards, ScriptShotTable } from './ScriptShotViews';

interface ProviderOption {
  value: string;
  label: string;
  channelLabel?: string;
  modelLabel?: string;
}

interface ScriptNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  nodeRun?: LinghuiNodeRunState;
  promptReferences?: LinghuiPromptReferenceItem[];
  onRun: () => void;
  onDeriveShots: (shots: LinghuiStoryboardFrame[]) => void;
  onGenerateImages: (shots: LinghuiStoryboardFrame[]) => void;
  onGenerateVideos: (shots: LinghuiStoryboardFrame[]) => void;
}

const SCRIPT_MODES: Array<{ key: LinghuiScriptNodeMode; label: string }> = [
  { key: 'manual', label: '手动脚本' },
  { key: 'generate', label: 'LLM 生成' },
];

export const ScriptNodeEditor: React.FC<ScriptNodeEditorProps> = ({
  nodeId,
  nodeData,
  nodeRun,
  promptReferences = [],
  onRun,
  onDeriveShots,
  onGenerateImages,
  onGenerateVideos,
}) => {
  const { updateNodeData } = useLinghuiNodeMutation();
  const props = nodeData.properties as unknown as LinghuiScriptNodeProperties;
  const mode = (props.mode ?? 'manual') as LinghuiScriptNodeMode;
  const content = String(props.content ?? '');
  const prompt = String(props.prompt ?? '');
  const systemPrompt = String(props.systemPrompt ?? '');
  const llmSelection = String(props.llmSelection ?? '');
  const viewMode = props.viewMode === 'table' ? 'table' : 'cards';
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);
  const [immersiveOpen, setImmersiveOpen] = useState(false);
  const isScriptGenerating = nodeRun?.status === 'running' && mode === 'generate';
  const { locked: isRunActionLocked, runWithActionLock } = useLinghuiActionLock(isScriptGenerating);
  const { locked: isGenerateImagesLocked, runWithActionLock: runGenerateImagesWithLock } = useLinghuiActionLock();
  const { locked: isGenerateVideosLocked, runWithActionLock: runGenerateVideosWithLock } = useLinghuiActionLock();

  useEffect(() => {
    loadSettings().then(settings => {
      setProviders(listConfiguredModelSelectOptions(settings, 'llm', 'llm.chat').map(option => ({
        value: option.value,
        label: `${option.channelLabel} / ${option.modelLabel}`,
        channelLabel: option.channelLabel,
        modelLabel: option.modelLabel,
      })));
    });
  }, []);

  const previewState = useMemo(() => {
    if (mode === 'manual') {
      return parseLinghuiScriptContent(content);
    }

    if (nodeRun?.result?.kind === 'storyboard') {
      return {
        shots: nodeRun.result.shots ?? [],
        formattedText: String(nodeRun.result.text ?? ''),
        source: (nodeRun.status === 'running' ? 'stream' : 'result') as 'stream' | 'result',
      };
    }

    return {
      shots: [] as LinghuiStoryboardFrame[],
      formattedText: '',
      source: 'plain' as const,
    };
  }, [content, mode, nodeRun]);

  useEffect(() => {
    const availableIds = new Set(previewState.shots.map(shot => shot.id));
    setSelectedShotIds(prev => {
      const filtered = prev.filter(id => availableIds.has(id));
      if (previewState.shots.length === 0) {
        return [];
      }
      if (filtered.length > 0) {
        return filtered;
      }
      return previewState.shots.map(shot => shot.id);
    });
  }, [previewState.shots]);

  const updateProp = useCallback((key: string, value: unknown) => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, [key]: value },
    }));
  }, [nodeId, updateNodeData]);

  const handleRun = useCallback(() => {
    runWithActionLock(onRun);
  }, [onRun, runWithActionLock]);

  const handleGenerateImages = useCallback((shots: LinghuiStoryboardFrame[]) => {
    runGenerateImagesWithLock(() => onGenerateImages(shots));
  }, [onGenerateImages, runGenerateImagesWithLock]);

  const handleGenerateVideos = useCallback((shots: LinghuiStoryboardFrame[]) => {
    runGenerateVideosWithLock(() => onGenerateVideos(shots));
  }, [onGenerateVideos, runGenerateVideosWithLock]);

  const handleToggleShot = useCallback((shotId: string, checked: boolean) => {
    setSelectedShotIds(prev => {
      if (checked) {
        return prev.includes(shotId) ? prev : [...prev, shotId];
      }
      return prev.filter(id => id !== shotId);
    });
  }, []);

  const selectedCount = selectedShotIds.length;
  const shotCount = previewState.shots.length;
  const selectedProvider = useMemo(() => (
    providers.find(option => option.value === llmSelection) ?? providers[0]
  ), [llmSelection, providers]);
  const modelSummary = selectedProvider?.label || '未配置 LLM';
  const scriptSettingsSummary = systemPrompt.trim() ? '系统提示 · 已设置' : '系统提示';
  const providerMenuItems = useMemo<MenuProps['items']>(() => (
    providers.map(provider => ({
      key: provider.value,
      label: (
        <div className="linghuiNodeEditorDropdownOption">
          <div className="linghuiNodeEditorDropdownTitle">{provider.modelLabel || provider.label}</div>
          <div className="linghuiNodeEditorDropdownDesc">
            {provider.channelLabel ? `${provider.channelLabel} / ${provider.label}` : provider.label}
          </div>
        </div>
      ),
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        updateProp('llmSelection', provider.value);
      },
    }))
  ), [providers, updateProp]);

  const scriptSettingsContent = (
    <div
      className="linghuiEditorSettingsPopover"
      onClick={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <div className="linghuiEditorSettingsBlock">
        <div className="linghuiEditorSettingsLabel">系统提示</div>
        <textarea
          className="linghuiNodeTextarea linghuiEditorSettingsTextarea"
          placeholder="可选。约束输出格式、镜头粒度或风格口径"
          value={systemPrompt}
          onChange={event => updateProp('systemPrompt', event.target.value)}
          onMouseDown={event => event.stopPropagation()}
          onKeyDown={event => event.stopPropagation()}
        />
      </div>
    </div>
  );

  const renderShotView = (immersive = false) => {
    if (!previewState.shots.length) {
      if (mode === 'generate' && previewState.formattedText.trim()) {
        return (
          <div className="linghuiEditorField linghuiEditorFieldNoBottomGap">
            <div className="linghuiEditorInlineHeader">
              <span className="linghuiEditorSettingsLabel">{nodeRun?.status === 'running' ? '实时脚本输出' : '生成结果'}</span>
              <span className="linghuiEditorSummaryPill">{previewState.formattedText.trim().length} 字</span>
            </div>
            <div
              className="linghuiNodeTextarea linghuiEditorOutputText"
              style={{ '--linghui-output-min-height': `${immersive ? 420 : 260}px` } as React.CSSProperties}
            >
              {previewState.formattedText}
            </div>
          </div>
        );
      }

      return (
        <div className="linghuiEditorEmptyState">
          {mode === 'manual' ? '输入脚本后会在这里自动解析镜头。' : '运行后会在这里出现结构化镜头列表。'}
        </div>
      );
    }

    const selectedShots = previewState.shots.filter(shot => selectedShotIds.includes(shot.id));

    return (
      <>
        <div className="linghuiScriptPanelHeader">
          <div className="linghuiScriptPanelMeta">
            <span>{shotCount} 个镜头</span>
            <span>{selectedCount} 个已选</span>
            <span>{previewState.source === 'json' ? 'JSON 结构' : previewState.source === 'stream' ? '实时输出' : previewState.source === 'result' ? '运行结果' : '文本解析'}</span>
          </div>
          <div className="linghuiScriptPanelActions">
            <button
              type="button"
              className={`linghuiEditorToolChip ${viewMode === 'cards' ? 'isActive' : ''}`}
              onClick={() => updateProp('viewMode', 'cards')}
            >
              <LayoutGrid size={14} />
              卡片
            </button>
            <button
              type="button"
              className={`linghuiEditorToolChip ${viewMode === 'table' ? 'isActive' : ''}`}
              onClick={() => updateProp('viewMode', 'table')}
            >
              <Rows3 size={14} />
              表格
            </button>
            <Button size="small" onClick={() => setSelectedShotIds(previewState.shots.map(shot => shot.id))}>
              全选
            </Button>
            {!immersive && (
              <Button size="small" icon={<Expand size={14} />} onClick={() => setImmersiveOpen(true)}>
                全屏
              </Button>
            )}
            <Button
              size="small"
              icon={<Wand2 size={14} />}
              disabled={!selectedCount}
              onClick={() => onDeriveShots(selectedShots)}
            >
              派生镜头文本
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<ImageIcon size={14} />}
              disabled={!selectedCount || isGenerateImagesLocked}
              onClick={() => handleGenerateImages(selectedShots)}
            >
              生成分镜图
            </Button>
            <Button
              size="small"
              icon={<Video size={14} />}
              disabled={!selectedCount || isGenerateVideosLocked}
              onClick={() => handleGenerateVideos(selectedShots)}
            >
              生成视频流程
            </Button>
          </div>
        </div>

        {viewMode === 'table' ? (
          <ScriptShotTable
            shots={previewState.shots}
            selectedShotIds={selectedShotIds}
            onToggleShot={handleToggleShot}
          />
        ) : (
          <ScriptShotCards
            shots={previewState.shots}
            selectedShotIds={selectedShotIds}
            onToggleShot={handleToggleShot}
          />
        )}
      </>
    );
  };

  return (
    <>
      <div className="linghuiEditorPanel" onMouseDown={event => event.stopPropagation()}>
        <div className="linghuiEditorHeader">
          <div>
            <div className="linghuiEditorTitle">脚本节点</div>
            <div className="linghuiEditorSubtitle">
              {mode === 'manual' ? '直接输入结构化镜头文本或 JSON，实时解析成可勾选镜头' : '通过 LLM 把剧情描述整理成结构化分镜脚本'}
            </div>
          </div>
        </div>

        <div className="linghuiEditorRefModes">
          {SCRIPT_MODES.map(item => (
            <button
              key={item.key}
              className={`linghuiEditorRefModeTab ${mode === item.key ? 'isActive' : ''}`}
              onClick={() => updateProp('mode', item.key)}
            >
            {item.label}
          </button>
        ))}
      </div>

        {mode === 'manual' ? (
          <div className="linghuiEditorField">
            <textarea
              className="linghuiNodeTextarea"
              placeholder={'支持两种格式：\n1. JSON / ```json``` 结构\n2. 每段一个镜头，或使用 标题 | 描述 | 时长'}
              value={content}
              onChange={event => updateProp('content', event.target.value)}
              onMouseDown={event => event.stopPropagation()}
              onKeyDown={event => event.stopPropagation()}
              style={{ '--linghui-textarea-min-height': '220px' } as React.CSSProperties}
            />
          </div>
        ) : (
          <>
            <div className="linghuiEditorPrompt linghuiEditorCompactPrompt">
              <LinghuiPromptEditor
                value={prompt}
                onChange={value => updateProp('prompt', value)}
                references={promptReferences}
                placeholder="描述剧情推进、角色关系、镜头节奏和画面风格，输入 @ 引用上游产物"
                surfaceStyle="fusion"
                minHeight="76px"
                maxHeight="176px"
              />
            </div>
          </>
        )}

        {mode === 'generate' ? (
          <div className="linghuiEditorControlRow">
            <Dropdown
              trigger={providers.length > 0 ? ['click'] : []}
              menu={{
                items: providerMenuItems,
                selectable: true,
                selectedKeys: selectedProvider ? [selectedProvider.value] : [],
              }}
              classNames={{ root: 'linghuiNodeEditorDropdownMenu' }}
              getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
              overlayClassName="linghuiNodeEditorDropdownOverlay"
            >
              <button
                type="button"
                className={`linghuiEditorInlineTrigger ${providers.length === 0 ? 'isDisabled' : ''}`}
                onClick={event => event.stopPropagation()}
                disabled={providers.length === 0}
              >
                {modelSummary}
              </button>
            </Dropdown>

            <Popover
              trigger="click"
              placement="bottomRight"
              content={scriptSettingsContent}
              overlayClassName="linghuiEditorPopover"
              getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
              zIndex={1200}
            >
              <button
                type="button"
                className="linghuiEditorInlineTrigger"
                onClick={event => event.stopPropagation()}
              >
                {scriptSettingsSummary}
              </button>
            </Popover>

            <div className="linghuiEditorActionGroup">
              <Button
                type="primary"
                size="small"
                icon={<ArrowUp size={12} />}
                onClick={handleRun}
                disabled={isRunActionLocked || isScriptGenerating}
                loading={isScriptGenerating}
              >
                生成
              </Button>
            </div>
          </div>
        ) : null}

        <div className="linghuiScriptPanel">
          {renderShotView()}
        </div>
      </div>

      <Modal
        open={immersiveOpen}
        onCancel={() => setImmersiveOpen(false)}
        footer={null}
        width={1040}
        title={`${nodeData.label} · 沉浸式脚本视图`}
        className="linghuiScriptImmersiveModal"
        destroyOnHidden={false}
      >
        {renderShotView(true)}
      </Modal>
    </>
  );
};
