import React, { useCallback, useEffect, useMemo } from 'react';
import { App, Button } from 'antd';
import type { MenuProps } from 'antd';
import type {
  LinghuiExecuteMultiAngleOptions,
  LinghuiImageNodeProperties,
  LinghuiImageToolKey,
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiProductionAsset,
} from '../../../../types/linghui';
import {
  DEFAULT_LINGHUI_IMAGE_CINEMATIC_CONFIG,
  IMAGE_ASPECT_RATIOS,
  normalizeLinghuiImageCinematicConfig,
  normalizeLinghuiImageFocusRegion,
  normalizeLinghuiImageMarkPoints,
} from '../../../../types/linghui';
import type { LinghuiPromptReferenceItem } from '../state/linghuiPromptReferences';
import {
  ImageNodeEditorFocusPanel,
  ImageNodeEditorMarkPanel,
} from './ImageNodeEditorFocusMarkPanels';
import {
  ImageNodeEditorCameraSettingsContent,
  ImageNodeEditorImageSettingsContent,
  type ImageNodeEditorExtraSettingsBlock,
} from './ImageNodeEditorSettingsPopovers';
import {
  ImageNodeEditorGeneratePanel,
  ImageNodeEditorImportPanel,
  type ImageNodeEditorDisplayReferenceImage,
} from './ImageNodeEditorMainPanel';
import { useLinghuiNodeEditorApi, useLinghuiNodeMutation } from '../../nodes/state/LinghuiNodeRunsContext';
import { useLinghuiActionLock } from '../hooks/useLinghuiActionLock';
import { useImageNodeEditorProviders } from '../hooks/useImageNodeEditorProviders';
import { useImageNodeEditorFocusMarks } from '../hooks/useImageNodeEditorFocusMarks';
import { useImageNodeEditorFileActions } from '../hooks/useImageNodeEditorFileActions';
import { useImageNodeEditorLibTVTools } from '../hooks/useImageNodeEditorLibTVTools';
import { syncLinghuiProductionAssets } from '../../../../store/linghuiStorage';
import {
  addLinghuiProductionAssetReferenceVersion,
  canEditLinghuiProductionAsset,
  resolveLinghuiProductionAssetStatus,
} from '../state/linghuiProductionAssets';
import { renderImageNodeEditorLibTVToolPanel } from './ImageNodeEditorLibTVToolPanelHost';
import {
  resolveLinghuiImageCollection,
} from '../state/linghuiImageCollections';
import {
  getPreviewSource,
  resolveImageNodeMode,
} from './ImageNodeEditorUtils';
import {
  resolveImageNodeRunState,
  resolveImageNodeSummaries,
} from './ImageNodeEditorState';

export type { ImageNodeEditorExtraSettingsBlock } from './ImageNodeEditorSettingsPopovers';
export { mergePromptSnippet } from './ImageNodeEditorUtils';

export interface ImageNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  nodeRun?: LinghuiNodeRunState;
  referenceImages: Array<{ source?: string; label?: string }>;
  promptReferences?: LinghuiPromptReferenceItem[];
  workspaceId?: string | null;
  productionAssetSourceNodeData?: LinghuiNodeData | null;
  activeTool: LinghuiImageToolKey | null;
  onToolChange: (tool: LinghuiImageToolKey | null) => void;
  onExecuteMultiAngle?: (options?: LinghuiExecuteMultiAngleOptions) => void;
  onApplyImageToolPreset?: (preset: {
    label?: string;
    promptSnippet: string;
    properties?: Partial<LinghuiImageNodeProperties>;
  }) => void;
  onAssetLibraryMutate?: () => void;
  onRun: () => void;
  /** 覆盖默认 IMAGE_ASPECT_RATIOS，用于全景节点这类只允许子集（16:9/21:9）的场景 */
  aspectRatioOptions?: Array<{ value: string; label: string }>;
  /** 是否隐藏「出图数量」（全景节点单图为主，避免一次出多张全景） */
  hideBatchCount?: boolean;
  /**
   * 设置弹层底部追加的额外配置块；可以传单段或多段，依次渲染。
   * 全景节点用这个挂"投影模式 + 场景类型"两段。
   */
  extraSettings?: ImageNodeEditorExtraSettingsBlock | ImageNodeEditorExtraSettingsBlock[];
}

export const ImageNodeEditor: React.FC<ImageNodeEditorProps> = ({
  nodeId,
  nodeData,
  nodeRun,
  referenceImages,
  promptReferences = [],
  workspaceId = null,
  productionAssetSourceNodeData = null,
  activeTool,
  onToolChange,
  onExecuteMultiAngle,
  onApplyImageToolPreset,
  onAssetLibraryMutate,
  onRun,
  aspectRatioOptions,
  hideBatchCount = false,
  extraSettings,
}) => {
  const aspectRatioChoices = aspectRatioOptions ?? IMAGE_ASPECT_RATIOS;
  const { message } = App.useApp();
  const { executionQueue, onExecuteImageCrop } = useLinghuiNodeEditorApi();
  const { clearNodeRunState, updateNodeData } = useLinghuiNodeMutation();
  const props = nodeData.properties as unknown as LinghuiImageNodeProperties;
  const sourceNodeId = String(props.scriptSourceNodeId ?? '').trim();
  const sourceNodeData = productionAssetSourceNodeData ?? undefined;
  const sourceNodeType = sourceNodeData?.linghuiType;
  const sourceProperties = sourceNodeData?.properties as unknown as {
    productionAssets?: LinghuiProductionAsset[];
  } | undefined;
  const mode = resolveImageNodeMode(props);
  const isImportMode = mode === 'import';
  const prompt = String(props.prompt ?? '');
  const ttiSelection = String(props.ttiSelection ?? '');
  const aspectRatio = String(props.aspectRatio ?? '3:4');
  const resolution = String(props.resolution ?? 'auto');
  const batchCount = Number(props.batchCount ?? 1);
  const hasImportSource = Boolean(String(props.source ?? '').trim());
  const imageCollection = useMemo(() => resolveLinghuiImageCollection(props, nodeRun?.result), [nodeRun?.result, props]);
  const currentImage = imageCollection.primary;
  const currentImageSource = String(currentImage?.source ?? props.source ?? '').trim();
  const currentImagePreview = getPreviewSource(currentImageSource);
  const hasCurrentImage = Boolean(currentImageSource);
  const productionAssetId = String(props.productionAssetId ?? '').trim();
  const linkedProductionAsset = sourceProperties?.productionAssets?.find(asset => (
    asset.id === productionAssetId || asset.mergedAssetIds?.includes(productionAssetId)
  ));
  const linkedProductionAssetStatus = linkedProductionAsset
    ? resolveLinghuiProductionAssetStatus(linkedProductionAsset)
    : null;
  const canAdoptProductionAssetReference = Boolean(
    workspaceId
    && hasCurrentImage
    && sourceNodeId
    && (sourceNodeType === 'linghui/script' || sourceNodeType === 'linghui/storyboard')
    && linkedProductionAsset
    && canEditLinghuiProductionAsset(linkedProductionAsset),
  );
  const normalizedFocusRegion = normalizeLinghuiImageFocusRegion(props.focusRegion);
  const activeFocusRegion = normalizedFocusRegion?.enabled ? normalizedFocusRegion : null;
  const normalizedMarkPoints = normalizeLinghuiImageMarkPoints(props.markPoints);
  const activeMarkPoints = normalizedMarkPoints.filter(point => point.enabled);
  const cinematicConfig = useMemo(() => (
    normalizeLinghuiImageCinematicConfig(props.cinematic ?? DEFAULT_LINGHUI_IMAGE_CINEMATIC_CONFIG)
  ), [props.cinematic]);
  const generatedFromNodeId = String(props.generatedFromNodeId ?? '').trim();
  const generatedSequence = Number(props.generatedSequence);
  const {
    isImageGenerating,
    generateButtonText,
    derivedBannerText,
    isDerivedFromController,
  } = resolveImageNodeRunState({
    nodeId,
    nodeRun,
    executionQueue,
    generatedFromNodeId,
    generatedSequence,
  });
  const { locked: isRunActionLocked, runWithActionLock } = useLinghuiActionLock(isImageGenerating);

  const displayReferenceImages: ImageNodeEditorDisplayReferenceImage[] = referenceImages.map((ref, index) => ({
    ...ref,
    badge: String(index + 1),
  }));

  const { providers, multiAngleProviders } = useImageNodeEditorProviders();

  const handleRun = useCallback(() => {
    runWithActionLock(onRun);
  }, [onRun, runWithActionLock]);

  const handleAdoptProductionAssetReference = useCallback(async () => {
    if (!workspaceId || !sourceNodeId || !sourceNodeData || !linkedProductionAsset || !currentImageSource) {
      return;
    }
    if (!canEditLinghuiProductionAsset(linkedProductionAsset)) {
      message.info('该生产资产已锁定，请先在制作台解锁编辑');
      return;
    }

    const currentAssets = sourceProperties?.productionAssets ?? [];
    const nextAssets = addLinghuiProductionAssetReferenceVersion(
      currentAssets,
      linkedProductionAsset.id,
      currentImageSource,
      { label: nodeData.label || '生成结果' },
    );
    if (nextAssets.every((asset, index) => asset === currentAssets[index])) {
      message.info('当前图片已经是该资产的参考图');
      return;
    }

    updateNodeData(sourceNodeId, previous => ({
      ...previous,
      properties: {
        ...previous.properties,
        productionAssets: nextAssets,
      },
    }), { markStale: false });

    try {
      await syncLinghuiProductionAssets({
        workspaceId,
        nodeId: sourceNodeId,
        nodeType: sourceNodeData.linghuiType,
        assets: nextAssets,
      });
      onAssetLibraryMutate?.();
      message.success(`已将图片采用为「${linkedProductionAsset.name}」参考图`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '回写资产参考图失败');
    }
  }, [
    currentImageSource,
    linkedProductionAsset,
    message,
    onAssetLibraryMutate,
    sourceNodeData,
    sourceNodeId,
    sourceProperties?.productionAssets,
    nodeData.label,
    updateNodeData,
    workspaceId,
  ]);

  const productionAssetAction = linkedProductionAsset && hasCurrentImage ? (
    <div className="linghuiProductionAssetReferenceAction" role="note">
      <div className="linghuiProductionAssetReferenceCopy">
        <strong>生产资产 · {linkedProductionAsset.name}</strong>
        <span>
          {linkedProductionAssetStatus === 'locked'
            ? '资产已锁定，解锁后才能替换参考图'
            : '把当前生成结果回写为该资产的统一参考图'}
        </span>
      </div>
      <Button
        size="small"
        type="primary"
        onClick={() => void handleAdoptProductionAssetReference()}
        disabled={!canAdoptProductionAssetReference}
      >
        {linkedProductionAssetStatus === 'locked' ? '已锁定' : '采用为资产参考图'}
      </Button>
    </div>
  ) : null;

  const updateProp = useCallback((key: string, value: unknown, options?: { markStale?: boolean }) => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, [key]: value },
    }), options);
  }, [nodeId, updateNodeData]);

  useEffect(() => {
    if (!aspectRatioOptions || aspectRatioOptions.length === 0) return;
    if (!aspectRatioOptions.some(option => option.value === aspectRatio)) {
      updateProp('aspectRatio', aspectRatioOptions[0].value, { markStale: false });
    }
  }, [aspectRatio, aspectRatioOptions, updateProp]);

  const libTVTools = useImageNodeEditorLibTVTools({
    activeTool,
    aspectRatio,
    batchCount,
    handleRun,
    hasCurrentImage,
    message,
    multiAngleProviders,
    nodeId,
    onApplyImageToolPreset,
    onExecuteImageCrop,
    onExecuteMultiAngle,
    onToolChange,
    props,
    resolution,
    updateNodeData,
    updateProp,
  });

  const {
    handleClearImage,
    handlePickRelightReferenceImage,
    handleReplaceImage,
  } = useImageNodeEditorFileActions({
    clearNodeRunState,
    message,
    nodeId,
    setRelightReferenceImage: libTVTools.setRelightReferenceImage,
    updateNodeData,
    workspaceId,
  });

  const {
    handleAddCenterMarkPoint,
    handleClearMarkPoints,
    handleDisableFocusRegion,
    handleEnableFocusRegion,
    handleMarkStageClick,
    handleRemoveMarkPoint,
    updateFocusRegion,
    updateFocusRegionAxis,
  } = useImageNodeEditorFocusMarks({
    currentImageSource,
    focusRegion: props.focusRegion,
    message,
    normalizedMarkPoints,
    onToolChange,
    updateProp,
  });

  const selectedProvider = useMemo(() => (
    providers.find(option => option.value === ttiSelection) ?? providers[0]
  ), [providers, ttiSelection]);
  const { modelSummary, parameterSummary, cameraButtonSummary } = resolveImageNodeSummaries({
    props,
    cinematicConfig,
    selectedProvider,
    hideBatchCount,
  });
  const providerMenuItems = useMemo<MenuProps['items']>(() => (
    providers.map(provider => ({
      key: provider.value,
      label: (
        <div className="linghuiNodeEditorDropdownOption isModelOption">
          <span className="linghuiNodeEditorDropdownIcon" aria-hidden="true">图</span>
          <div className="linghuiNodeEditorDropdownBody">
            <div className="linghuiNodeEditorDropdownTitle">{provider.modelLabel || provider.label}</div>
            <div className="linghuiNodeEditorDropdownDesc">
              {provider.channelLabel && provider.modelLabel
                ? `${provider.channelLabel} / ${provider.modelLabel}`
                : provider.channelLabel || provider.label}
            </div>
          </div>
        </div>
      ),
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        updateProp('ttiSelection', provider.value);
      },
    }))
  ), [providers, updateProp]);

  const imageSettingsContent = (
    <ImageNodeEditorImageSettingsContent
      aspectRatioChoices={aspectRatioChoices}
      aspectRatio={aspectRatio}
      resolution={resolution}
      batchCount={batchCount}
      hideBatchCount={hideBatchCount}
      extraSettings={extraSettings}
      onAspectRatioChange={value => updateProp('aspectRatio', value)}
      onResolutionChange={value => updateProp('resolution', value)}
      onBatchCountChange={value => updateProp('batchCount', value)}
    />
  );

  const cameraSettingsContent = (
    <ImageNodeEditorCameraSettingsContent
      cinematicConfig={cinematicConfig}
      onCinematicChange={value => updateProp('cinematic', value)}
    />
  );

  const imagePanelAlt = currentImage?.label || nodeData.label;
  const focusRegionPanel = activeTool === 'focus' && hasCurrentImage ? (
    <ImageNodeEditorFocusPanel
      currentImagePreview={currentImagePreview}
      imageAlt={imagePanelAlt}
      activeFocusRegion={activeFocusRegion}
      normalizedFocusRegion={normalizedFocusRegion}
      onUpdateFocusRegion={updateFocusRegion}
      onUpdateFocusRegionAxis={updateFocusRegionAxis}
      onEnableFocusRegion={handleEnableFocusRegion}
      onDisableFocusRegion={handleDisableFocusRegion}
    />
  ) : null;

  const markPointPanel = activeTool === 'mark' && hasCurrentImage ? (
    <ImageNodeEditorMarkPanel
      currentImagePreview={currentImagePreview}
      imageAlt={imagePanelAlt}
      activeMarkPoints={activeMarkPoints}
      normalizedMarkPointCount={normalizedMarkPoints.length}
      onStageClick={handleMarkStageClick}
      onStageKeyboardAdd={handleAddCenterMarkPoint}
      onRemoveMarkPoint={handleRemoveMarkPoint}
      onClearMarkPoints={handleClearMarkPoints}
    />
  ) : null;

  const activeLibTVToolPanel = renderImageNodeEditorLibTVToolPanel({
    aspectRatioChoices,
    currentImagePreview,
    imageAlt: imagePanelAlt,
    onPickRelightReferenceImage: () => void handlePickRelightReferenceImage(),
    tools: libTVTools,
  });

  if (isImportMode) {
    // LibTV 1:1：素材节点本身已经展示图片 + 节点上方上传/工具浮按钮，编辑器面板不再重复显示大预览图，
    // 只保留"文件名 + 替换/清空"轻量操作行，避免反人类的"上下两张图"重复。
    return (
      <ImageNodeEditorImportPanel
        activeLibTVToolPanel={activeLibTVToolPanel}
        productionAssetAction={productionAssetAction}
        currentImageLabel={currentImage?.label}
        hasCurrentImage={hasCurrentImage}
        hasImportSource={hasImportSource}
        nodeLabel={nodeData.label}
        onClearImage={handleClearImage}
        onReplaceImage={() => void handleReplaceImage()}
      />
    );
  }

  return (
    <ImageNodeEditorGeneratePanel
      activeLibTVToolPanel={activeLibTVToolPanel}
      productionAssetAction={productionAssetAction}
      cameraButtonSummary={cameraButtonSummary}
      cameraSettingsContent={cameraSettingsContent}
      derivedBannerText={derivedBannerText}
      displayReferenceImages={displayReferenceImages}
      focusRegionPanel={focusRegionPanel}
      generateButtonText={generateButtonText}
      getPreviewSource={getPreviewSource}
      imageSettingsContent={imageSettingsContent}
      isDerivedFromController={isDerivedFromController}
      isImageGenerating={isImageGenerating}
      isRunActionLocked={isRunActionLocked}
      markPointPanel={markPointPanel}
      modelSummary={modelSummary}
      parameterSummary={parameterSummary}
      prompt={prompt}
      promptReferences={promptReferences}
      providerMenuItems={providerMenuItems}
      providerSelectedKey={selectedProvider?.value}
      providersAvailable={providers.length > 0}
      onPromptChange={value => updateProp('prompt', value)}
      onRun={handleRun}
    />
  );
};
