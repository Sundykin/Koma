/**
 * 故事板节点编辑器（剧情→分镜 傻瓜版）。
 *
 * 与脚本节点的差异：
 *  - 没有 mode 切换：只有"生成"路径
 *  - 没有系统提示设置入口：systemPrompt 完全由 executor 内置生成，用户不可改
 *  - 只暴露剧情大纲输入框 + LLM 选择 + 目标镜头数 + 视图模式
 *  - shot 列表渲染、派生镜头文本、生成分镜图、生成视频流程完全复用 ScriptNodeEditor 已有的 UI
 *    （通过同样的 onDeriveShots / onGenerateImages / onGenerateVideos props 透传）
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Dropdown, InputNumber, Modal } from 'antd';
import type { MenuProps } from 'antd';
import { ArrowUp, Expand, FileAudio, FileText, Image as ImageIcon, LayoutGrid, Rows3, Video, Wand2 } from 'lucide-react';
import type {
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiStoryboardFrame,
  LinghuiStoryboardNodeProperties,
} from '../../../../types/linghui';
import { loadSettings } from '../../../../store/settings/core';
import { listConfiguredModelSelectOptions } from '../../../../providers/channel/resolver';
import { useLinghuiNodeMutation } from '../../nodes/state/LinghuiNodeRunsContext';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import type { LinghuiPromptReferenceItem } from '../state/linghuiPromptReferences';
import { useLinghuiActionLock } from '../hooks/useLinghuiActionLock';
import {
  LINGHUI_STORYBOARD_SCENES,
  resolveLinghuiStoryboardScene,
} from '../state/linghuiStoryboardScenes';
import { ScriptShotCards, ScriptShotTable } from './ScriptShotViews';

interface ProviderOption {
  value: string;
  label: string;
  channelLabel?: string;
  modelLabel?: string;
}

interface StoryboardNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  nodeRun?: LinghuiNodeRunState;
  promptReferences?: LinghuiPromptReferenceItem[];
  onRun: () => void;
  onDeriveShots: (shots: LinghuiStoryboardFrame[]) => void;
  onGenerateImages: (shots: LinghuiStoryboardFrame[]) => void;
  onGenerateVideos: (shots: LinghuiStoryboardFrame[]) => void;
}

export const StoryboardNodeEditor: React.FC<StoryboardNodeEditorProps> = ({
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
  const props = nodeData.properties as unknown as LinghuiStoryboardNodeProperties;
  const prompt = String(props.prompt ?? '');
  const llmSelection = String(props.llmSelection ?? '');
  const sceneDef = useMemo(() => resolveLinghuiStoryboardScene(props.scene), [props.scene]);
  const targetShotCount = Math.max(4, Math.min(25, Math.round(Number(props.targetShotCount ?? sceneDef.targetShotCount))));
  const viewMode = props.viewMode === 'table' ? 'table' : 'cards';
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);
  const [immersiveOpen, setImmersiveOpen] = useState(false);
  const isGenerating = nodeRun?.status === 'running';
  const { locked: isRunActionLocked, runWithActionLock } = useLinghuiActionLock(isGenerating);
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
    const editedShots = Array.isArray(props.editedShots) ? props.editedShots : [];
    if (nodeRun?.result?.kind === 'storyboard') {
      return {
        shots: editedShots.length > 0 ? editedShots : (nodeRun.result.shots ?? []),
        formattedText: String(nodeRun.result.text ?? ''),
        source: (nodeRun.status === 'running' ? 'stream' : 'result') as 'stream' | 'result',
      };
    }
    return {
      shots: [] as LinghuiStoryboardFrame[],
      formattedText: '',
      source: 'plain' as const,
    };
  }, [nodeRun, props.editedShots]);

  useEffect(() => {
    const availableIds = new Set(previewState.shots.map(shot => shot.id));
    setSelectedShotIds(prev => {
      const filtered = prev.filter(id => availableIds.has(id));
      if (previewState.shots.length === 0) return [];
      if (filtered.length > 0) return filtered;
      return previewState.shots.map(shot => shot.id);
    });
  }, [previewState.shots]);

  const updateProp = useCallback((key: keyof LinghuiStoryboardNodeProperties, value: unknown) => {
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
      if (checked) return prev.includes(shotId) ? prev : [...prev, shotId];
      return prev.filter(id => id !== shotId);
    });
  }, []);

  const handleChangeShot = useCallback((shotId: string, patch: Partial<LinghuiStoryboardFrame>) => {
    updateNodeData(nodeId, prev => {
      const prevProps = prev.properties as Partial<LinghuiStoryboardNodeProperties>;
      const baseShots = Array.isArray(prevProps.editedShots) && prevProps.editedShots.length > 0
        ? prevProps.editedShots
        : previewState.shots;
      return {
        ...prev,
        properties: {
          ...prev.properties,
          editedShots: baseShots.map(shot => (shot.id === shotId ? { ...shot, ...patch } : shot)),
        } as unknown as Record<string, unknown>,
      };
    }, { markStale: false });
  }, [nodeId, previewState.shots, updateNodeData]);

  const selectedCount = selectedShotIds.length;
  const shotCount = previewState.shots.length;
  const selectedProvider = useMemo(
    () => providers.find(option => option.value === llmSelection) ?? providers[0],
    [llmSelection, providers],
  );
  const modelSummary = selectedProvider?.label || '未配置 LLM';
  const sceneSummary = sceneDef.shortLabel;
  const canGenerateStoryboard = Boolean(prompt.trim() || promptReferences.length > 0);
  const referenceCards = useMemo(() => (
    promptReferences.map((reference, index) => ({
      ...reference,
      badge: String(index + 1),
      preview: reference.previewSource || (typeof reference.source === 'string' ? reference.source : ''),
    }))
  ), [promptReferences]);
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
  const sceneMenuItems = useMemo<MenuProps['items']>(() => (
    LINGHUI_STORYBOARD_SCENES.map(scene => ({
      key: scene.scene,
      label: (
        <div className="linghuiNodeEditorDropdownOption">
          <div className="linghuiNodeEditorDropdownTitle">{scene.label}</div>
          <div className="linghuiNodeEditorDropdownDesc">{scene.description}</div>
        </div>
      ),
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        updateNodeData(nodeId, prev => ({
          ...prev,
          properties: {
            ...prev.properties,
            scene: scene.scene,
            targetShotCount: scene.targetShotCount,
          },
        }), { markStale: false });
      },
    }))
  ), [nodeId, updateNodeData]);

  const handleApplyScene = useCallback((scene: typeof LINGHUI_STORYBOARD_SCENES[number]) => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: {
        ...prev.properties,
        scene: scene.scene,
        targetShotCount: scene.targetShotCount,
      },
    }), { markStale: false });
  }, [nodeId, updateNodeData]);

  const renderShotView = (immersive = false) => {
    if (!previewState.shots.length) {
      if (previewState.formattedText.trim()) {
        return (
          <div className="linghuiEditorField linghuiEditorFieldNoBottomGap">
            <div className="linghuiEditorInlineHeader">
              <span className="linghuiEditorSettingsLabel">{nodeRun?.status === 'running' ? '实时输出' : '生成结果'}</span>
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
          填写左侧"剧情大纲"，点击生成即可自动拆分镜。
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
            <span>故事板</span>
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
          </div>
        </div>

        {viewMode === 'table' ? (
          <ScriptShotTable
            shots={previewState.shots}
            selectedShotIds={selectedShotIds}
            onToggleShot={handleToggleShot}
            editable
            onChangeShot={handleChangeShot}
          />
        ) : (
          <ScriptShotCards
            shots={previewState.shots}
            selectedShotIds={selectedShotIds}
            onToggleShot={handleToggleShot}
          />
        )}
        {selectedCount > 0 ? (
          <div className="linghuiScriptSelectionToolbar">
            <span className="linghuiScriptSelectionToolbarCount">已选 {selectedCount}/{shotCount}</span>
            <span className="linghuiScriptSelectionToolbarDivider" />
            <button
              type="button"
              onClick={() => onDeriveShots(selectedShots)}
            >
              <Wand2 size={14} />
              派生镜头文本
            </button>
            <button
              type="button"
              disabled={isGenerateImagesLocked}
              onClick={() => handleGenerateImages(selectedShots)}
            >
              <ImageIcon size={14} />
              生成分镜图
            </button>
            <button
              type="button"
              disabled={isGenerateVideosLocked}
              onClick={() => handleGenerateVideos(selectedShots)}
            >
              <Video size={14} />
              生成视频流程
            </button>
          </div>
        ) : null}
      </>
    );
  };

  return (
    <>
      <div
        className="linghuiEditorPanel linghuiScriptGeneratorPanel linghuiStoryboardGeneratorPanel"
        onMouseDown={event => event.stopPropagation()}
      >
        {referenceCards.length > 0 ? (
          <div className="linghuiScriptGeneratorRefs" aria-label="上游参考">
            {referenceCards.map(reference => (
              <div className="linghuiScriptGeneratorRefCard" key={reference.id} title={reference.name}>
                <div className="linghuiScriptGeneratorRefThumb">
                  {reference.kind === 'image' && reference.preview ? (
                    <img src={reference.preview} alt="" draggable={false} />
                  ) : reference.kind === 'video' && reference.preview ? (
                    <img src={reference.preview} alt="" draggable={false} />
                  ) : reference.kind === 'video' ? (
                    <Video size={14} />
                  ) : reference.kind === 'audio' ? (
                    <FileAudio size={14} />
                  ) : reference.kind === 'text' ? (
                    <FileText size={14} />
                  ) : (
                    <ImageIcon size={14} />
                  )}
                  <span className="linghuiScriptGeneratorRefBadge">{reference.badge}</span>
                </div>
                <span className="linghuiScriptGeneratorRefName">{reference.name}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="linghuiEditorPrompt linghuiScriptGeneratorPrompt">
          <LinghuiPromptEditor
            value={prompt}
            onChange={value => updateProp('prompt', value)}
            references={promptReferences}
            placeholder="用 1-3 段描述剧情：人物关系、地点、冲突、节奏与情感走向。例如：&#10;暴雨夜的废弃车站，少年与神秘女子第一次相遇，对方留下半枚硬币便消失在月台尽头..."
            surfaceStyle="fusion"
            minHeight="120px"
            maxHeight="260px"
          />
        </div>

        <div className="linghuiScriptPresetStrip linghuiStoryboardSceneStrip" aria-label="故事板场景模板">
          {LINGHUI_STORYBOARD_SCENES.map(scene => (
            <button
              key={scene.scene}
              type="button"
              className={`linghuiScriptPresetChip ${sceneDef.scene === scene.scene ? 'isActive' : ''}`}
              onClick={event => {
                event.stopPropagation();
                handleApplyScene(scene);
              }}
              title={scene.description}
            >
              <LayoutGrid size={12} />
              {scene.shortLabel}
            </button>
          ))}
        </div>

        <div className="linghuiEditorControlRow linghuiScriptGeneratorControlRow">
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
              className={`linghuiScriptGeneratorChip ${providers.length === 0 ? 'isDisabled' : ''}`}
              onClick={event => event.stopPropagation()}
              disabled={providers.length === 0}
              title={modelSummary}
            >
              {modelSummary}
            </button>
          </Dropdown>

          <Dropdown
            trigger={['click']}
            menu={{
              items: sceneMenuItems,
              selectable: true,
              selectedKeys: [sceneDef.scene],
            }}
            classNames={{ root: 'linghuiNodeEditorDropdownMenu' }}
            getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
            overlayClassName="linghuiNodeEditorDropdownOverlay"
          >
            <button
              type="button"
              className="linghuiScriptGeneratorChip linghuiStoryboardGeneratorSceneChip"
              onClick={event => event.stopPropagation()}
              title={sceneDef.label}
            >
              {sceneSummary}
            </button>
          </Dropdown>

          <div className="linghuiStoryboardGeneratorShotCount" onClick={event => event.stopPropagation()} title="目标镜头数">
            <span>镜头</span>
            <InputNumber
              size="small"
              min={4}
              max={25}
              value={targetShotCount}
              onChange={value => updateProp('targetShotCount', typeof value === 'number' ? value : 8)}
              controls
              style={{ width: 58 }}
            />
          </div>

          <div className="linghuiScriptGeneratorSpacer" />

          <div className="linghuiEditorActionGroup">
            <button
              type="button"
              className="linghuiScriptGeneratorSubmit"
              onClick={handleRun}
              disabled={isRunActionLocked || isGenerating || !canGenerateStoryboard}
              aria-label="生成故事板"
              title={canGenerateStoryboard ? '生成故事板' : '请先输入剧情大纲'}
            >
              {isGenerating ? (
                <span className="linghuiScriptGeneratorSpinner" />
              ) : (
                <ArrowUp size={13} />
              )}
            </button>
          </div>
        </div>

        <div className="linghuiScriptPanel">
          {renderShotView()}
        </div>
      </div>

      <Modal
        open={immersiveOpen}
        onCancel={() => setImmersiveOpen(false)}
        footer={null}
        width={1040}
        title={`${nodeData.label} · 沉浸式故事板视图`}
        className="linghuiScriptImmersiveModal"
        destroyOnHidden={false}
      >
        {renderShotView(true)}
      </Modal>
    </>
  );
};

export default StoryboardNodeEditor;
