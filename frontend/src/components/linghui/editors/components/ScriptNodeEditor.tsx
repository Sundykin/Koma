import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Dropdown, Modal, Popover } from 'antd';
import type { MenuProps } from 'antd';
import { ArrowUp, Expand, FileAudio, FileText, Image as ImageIcon, Languages, LayoutGrid, Loader2, Rows3, Settings2, Video, Wand2 } from 'lucide-react';
import type { ModelConfig } from '../../../../types';
import type {
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiProductionAsset,
  LinghuiProductionStage,
  LinghuiScriptNodeMode,
  LinghuiScriptNodeProperties,
  LinghuiStoryboardFrame,
} from '../../../../types/linghui';
import { loadSettings } from '../../../../store/settings/core';
import { buildLLMConfigFromContext, listConfiguredModelSelectOptions, resolveConfiguredChannelModel } from '../../../../providers/channel/resolver';
import { createLLMProvider } from '../../../../providers/llm';
import { useLinghuiNodeMutation } from '../../nodes/state/LinghuiNodeRunsContext';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import type { LinghuiPromptReferenceItem } from '../state/linghuiPromptReferences';
import { parseLinghuiScriptContent, serializeLinghuiScriptShots } from '../state/linghuiScriptNodeUtils';
import {
  LINGHUI_SCRIPT_PROMPT_PRESETS,
  mergeLinghuiScriptPresetPrompt,
  mergeLinghuiScriptPresetSystemPrompt,
  type LinghuiScriptPromptPreset,
} from '../state/linghuiScriptPromptPresets';
import { useLinghuiActionLock } from '../hooks/useLinghuiActionLock';
import { ScriptShotCards, ScriptShotTable } from './ScriptShotViews';
import { ScriptProductionWorkbench } from './ScriptProductionWorkbench';
import { useLinghuiProductionAssetSync } from '../hooks/useLinghuiProductionAssetSync';
import {
  buildLinghuiProductionAssetFrames,
  extractLinghuiProductionAssets,
} from '../state/linghuiProductionAssets';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';

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
  workspaceId?: string;
  onAssetLibraryMutate?: () => void;
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
  workspaceId,
  onAssetLibraryMutate,
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
  // 条件表达式在每次 render 都新建引用，下游 useCallback 的依赖会跟着抖——先钉住。
  const productionAssets = useMemo(
    () => (Array.isArray(props.productionAssets) ? props.productionAssets : []),
    [props.productionAssets],
  );
  const productionAssetSync = useLinghuiProductionAssetSync({
    workspaceId,
    nodeId,
    nodeType: 'linghui/script',
    assets: productionAssets,
    onAssetLibraryMutate,
  });
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);
  const [immersiveOpen, setImmersiveOpen] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateError, setTranslateError] = useState('');
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
  const productionStage: LinghuiProductionStage = props.productionStage
    ?? (previewState.shots.length > 0 ? 'storyboard' : 'script');

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

  const updateProductionProps = useCallback((patch: {
    productionStage?: LinghuiProductionStage;
    productionAssets?: LinghuiProductionAsset[];
    focusedProductionAssetId?: string;
    acknowledgedProductionConsistencyIssueIds?: string[];
  }) => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, ...patch },
    }), { markStale: false });
  }, [nodeId, updateNodeData]);

  useEffect(() => {
    if (
      mode !== 'generate'
      || nodeRun?.status !== 'succeeded'
      || previewState.shots.length === 0
      || productionAssets.length > 0
      || productionStage !== 'script'
    ) return;
    updateProductionProps({
      productionStage: 'assets',
      productionAssets: extractLinghuiProductionAssets(previewState.shots),
    });
  }, [mode, nodeRun?.status, previewState.shots, productionAssets.length, productionStage, updateProductionProps]);

  const handleRefreshProductionAssets = useCallback(() => {
    updateProductionProps({
      productionAssets: extractLinghuiProductionAssets(previewState.shots, productionAssets),
    });
  }, [previewState.shots, productionAssets, updateProductionProps]);

  const handleRun = useCallback(() => {
    runWithActionLock(onRun);
  }, [onRun, runWithActionLock]);

  const handlePromptChange = useCallback((value: string) => {
    setTranslateError('');
    updateProp('prompt', value);
  }, [updateProp]);

  const handleApplyPromptPreset = useCallback((preset: LinghuiScriptPromptPreset) => {
    setTranslateError('');
    updateNodeData(nodeId, prev => {
      const prevProps = prev.properties as Partial<LinghuiScriptNodeProperties>;
      return {
        ...prev,
        properties: {
          ...prev.properties,
          mode: 'generate',
          prompt: mergeLinghuiScriptPresetPrompt(String(prevProps.prompt ?? ''), preset),
          systemPrompt: mergeLinghuiScriptPresetSystemPrompt(String(prevProps.systemPrompt ?? ''), preset),
        },
      };
    }, { markStale: false });
  }, [nodeId, updateNodeData]);

  const handleGenerateImages = useCallback((shots: LinghuiStoryboardFrame[]) => {
    runGenerateImagesWithLock(() => onGenerateImages(shots));
  }, [onGenerateImages, runGenerateImagesWithLock]);

  const handleGenerateProductionAssets = useCallback((assets: LinghuiProductionAsset[]) => {
    const frames = buildLinghuiProductionAssetFrames(assets);
    if (!frames.length) return;
    handleGenerateImages(frames);
    updateProductionProps({ productionStage: 'storyboard' });
  }, [handleGenerateImages, updateProductionProps]);

  const handleGenerateVideos = useCallback((shots: LinghuiStoryboardFrame[]) => {
    runGenerateVideosWithLock(() => onGenerateVideos(shots));
  }, [onGenerateVideos, runGenerateVideosWithLock]);

  const handleOpenProductionAsset = useCallback((assetId: string) => {
    updateProductionProps({
      productionStage: 'assets',
      focusedProductionAssetId: assetId,
    });
  }, [updateProductionProps]);

  const handleToggleShot = useCallback((shotId: string, checked: boolean) => {
    setSelectedShotIds(prev => {
      if (checked) {
        return prev.includes(shotId) ? prev : [...prev, shotId];
      }
      return prev.filter(id => id !== shotId);
    });
  }, []);

  const handleSelectShotScope = useCallback((shotIds: string[]) => {
    const requestedIds = new Set(shotIds);
    setSelectedShotIds(previewState.shots
      .filter(shot => requestedIds.has(shot.id))
      .map(shot => shot.id));
  }, [previewState.shots]);

  const handleChangeManualShot = useCallback((shotId: string, patch: Partial<LinghuiStoryboardFrame>) => {
    if (mode !== 'manual') return;
    const nextShots = previewState.shots.map(shot => (
      shot.id === shotId ? { ...shot, ...patch } : shot
    ));
    updateProp('content', serializeLinghuiScriptShots(nextShots));
  }, [mode, previewState.shots, updateProp]);

  const selectedCount = selectedShotIds.length;
  const shotCount = previewState.shots.length;
  const selectedProvider = useMemo(() => (
    providers.find(option => option.value === llmSelection) ?? providers[0]
  ), [llmSelection, providers]);
  const modelSummary = selectedProvider?.label || '未配置 LLM';
  const scriptSettingsSummary = systemPrompt.trim() ? '系统提示 · 已设置' : '系统提示';
  const canGenerateScript = Boolean(prompt.trim() || promptReferences.length > 0);
  const buildSelectedLLMConfig = useCallback(async (): Promise<ModelConfig | null> => {
    const settings = await loadSettings();
    const context = resolveConfiguredChannelModel(settings, 'llm', llmSelection || undefined, 'llm.chat');
    if (!context) return null;
    return buildLLMConfigFromContext(context);
  }, [llmSelection]);

  const handleTranslatePrompt = useCallback(async () => {
    const sourcePrompt = prompt.trim();
    if (!sourcePrompt || isTranslating) return;

    setIsTranslating(true);
    setTranslateError('');
    try {
      const config = await buildSelectedLLMConfig();
      if (!config) {
        throw new Error('未配置可用的 LLM 模型');
      }
      const provider = createLLMProvider(config);
      const translated = await provider.generateText(
        [
          'Translate the following storyboard/script generation prompt between Chinese and English.',
          'Keep @ref_ references, {{...}} tokens, shot numbers, and line breaks unchanged.',
          'Return only the translated prompt.',
          '',
          sourcePrompt,
        ].join('\n'),
        undefined,
        {
          source: 'linghui',
          operation: 'script-node-prompt-translate',
          taskKind: 'rewrite',
          timeoutMs: 60000,
        },
      );
      const nextPrompt = translated.trim();
      if (nextPrompt && nextPrompt !== sourcePrompt) {
        updateProp('prompt', nextPrompt);
      }
    } catch (error) {
      setTranslateError(error instanceof Error ? error.message : '翻译失败');
    } finally {
      setIsTranslating(false);
    }
  }, [buildSelectedLLMConfig, isTranslating, prompt, updateProp]);
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
  const referenceCards = useMemo(() => (
    promptReferences.map((reference, index) => {
      const raw = reference.previewSource || (typeof reference.source === 'string' ? reference.source : '');
      // 上游 source/previewSource 多为本地路径，必须经 toFileSystemDisplayUrl 转成 koma-local:// 才能加载
      return {
        ...reference,
        badge: String(index + 1),
        preview: raw ? toFileSystemDisplayUrl(raw) ?? raw : '',
      };
    })
  ), [promptReferences]);

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
          </div>
        </div>

        {viewMode === 'table' ? (
          <ScriptShotTable
            shots={previewState.shots}
            selectedShotIds={selectedShotIds}
            onToggleShot={handleToggleShot}
            editable={mode === 'manual'}
            onChangeShot={handleChangeManualShot}
            productionAssets={productionAssets}
            onOpenProductionAsset={handleOpenProductionAsset}
          />
        ) : (
          <ScriptShotCards
            shots={previewState.shots}
            selectedShotIds={selectedShotIds}
            onToggleShot={handleToggleShot}
            productionAssets={productionAssets}
            onOpenProductionAsset={handleOpenProductionAsset}
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
        className={`linghuiEditorPanel ${mode === 'generate' ? 'linghuiScriptGeneratorPanel' : 'linghuiScriptManualPanel'}`}
        onMouseDown={event => event.stopPropagation()}
      >
        {mode === 'manual' ? <div className="linghuiEditorHeader">
          <div>
            <div className="linghuiEditorTitle">脚本节点</div>
            <div className="linghuiEditorSubtitle">
              {mode === 'manual' ? '直接输入结构化镜头文本或 JSON，实时解析成可勾选镜头' : '通过 LLM 把剧情描述整理成结构化分镜脚本'}
            </div>
          </div>
        </div> : null}

        <ScriptProductionWorkbench
          stage={productionStage}
          shotCount={previewState.shots.length}
          shots={previewState.shots}
          assets={productionAssets}
          selectedShotIds={selectedShotIds}
          acknowledgedConsistencyIssueIds={props.acknowledgedProductionConsistencyIssueIds}
          focusedAssetId={props.focusedProductionAssetId}
          syncStatus={productionAssetSync.status}
          syncError={productionAssetSync.error}
          onRetrySync={() => {
            void productionAssetSync.retry();
          }}
          onStageChange={nextStage => updateProductionProps({ productionStage: nextStage })}
          onAssetsChange={nextAssets => updateProductionProps({ productionAssets: nextAssets })}
          onRefreshAssets={handleRefreshProductionAssets}
          onGenerateAssets={handleGenerateProductionAssets}
          onFocusAsset={handleOpenProductionAsset}
          onSelectShots={handleSelectShotScope}
          onAcknowledgedConsistencyIssueIdsChange={issueIds => updateProductionProps({
            acknowledgedProductionConsistencyIssueIds: issueIds,
          })}
        />

        {productionStage === 'script' ? (
          <>
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
                onChange={handlePromptChange}
                references={promptReferences}
                placeholder="描述剧情推进、角色关系、镜头节奏和画面风格，输入 @ 引用上游产物"
                surfaceStyle="fusion"
                minHeight="76px"
                maxHeight="176px"
              />
            </div>
            <div className="linghuiScriptPresetStrip" aria-label="脚本生成模板">
              {LINGHUI_SCRIPT_PROMPT_PRESETS.map(preset => (
                <button
                  key={preset.key}
                  type="button"
                  className="linghuiScriptPresetChip"
                  onClick={event => {
                    event.stopPropagation();
                    handleApplyPromptPreset(preset);
                  }}
                  title={preset.description}
                >
                  <Wand2 size={12} />
                  {preset.label}
                </button>
              ))}
            </div>
          </>
        )}

        {mode === 'generate' ? (
          <>
          {translateError ? (
            <div className="linghuiScriptGeneratorError">{translateError}</div>
          ) : null}
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

            <div className="linghuiScriptGeneratorSpacer" />

            <button
              type="button"
              className="linghuiScriptGeneratorIconButton"
              onClick={handleTranslatePrompt}
              disabled={!prompt.trim() || isTranslating}
              aria-label="翻译提示词"
              title="翻译提示词"
            >
              {isTranslating ? <Loader2 size={14} className="linghuiScriptGeneratorSpinIcon" /> : <Languages size={14} />}
            </button>

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
                className="linghuiScriptGeneratorIconButton"
                onClick={event => event.stopPropagation()}
                aria-label={scriptSettingsSummary}
                title={scriptSettingsSummary}
              >
                <Settings2 size={14} />
              </button>
            </Popover>

            <div className="linghuiEditorActionGroup">
              <button
                type="button"
                className="linghuiScriptGeneratorSubmit"
                onClick={handleRun}
                disabled={isRunActionLocked || isScriptGenerating || !canGenerateScript}
                aria-label="生成脚本"
                title={canGenerateScript ? '生成脚本' : '请先输入剧情提示'}
              >
                {isScriptGenerating ? (
                  <span className="linghuiScriptGeneratorSpinner" />
                ) : (
                  <ArrowUp size={13} />
                )}
              </button>
            </div>
          </div>
          </>
        ) : null}
          </>
        ) : null}

        {productionStage === 'storyboard' ? (
          <div className="linghuiScriptPanel">
            {renderShotView()}
          </div>
        ) : null}
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
