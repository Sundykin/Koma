import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Dropdown, Popover } from 'antd';
import type { MenuProps } from 'antd';
import { ArrowUp, Image as ImageIcon, Trash2, UploadCloud } from 'lucide-react';
import type {
  LinghuiExecuteMultiAngleOptions,
  LinghuiImageNodeMode,
  LinghuiImageNodeProperties,
  LinghuiImageToolKey,
  LinghuiNodeData,
  LinghuiNodeRunState,
} from '../../../../types/linghui';
import {
  DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG,
  IMAGE_ASPECT_RATIOS,
  IMAGE_RESOLUTIONS,
  LINGHUI_IMAGE_BATCH_COUNTS,
  normalizeLinghuiMultiAngleConfig,
} from '../../../../types/linghui';
import { electronService, openFileDialog } from '../../../../services/electronService';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import {
  importLinghuiWorkspaceAsset,
} from '../../../../store/linghuiStorage';
import { loadSettings } from '../../../../store/settings/core';
import { listConfiguredModelSelectOptions } from '../../../../providers/channel/resolver';
import type { LinghuiPromptReferenceItem } from '../state/linghuiPromptReferences';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import { LinghuiMultiAngleModal } from './LinghuiMultiAngleModal';
import { useLinghuiNodeEditorApi, useLinghuiNodeMutation } from '../../nodes/state/LinghuiNodeRunsContext';
import {
  createLinghuiImageAssetItemFromSource,
  createLinghuiImageImportProperties,
  resolveLinghuiImageCollection,
} from '../state/linghuiImageCollections';

function getPreviewSource(source?: string): string {
  return toFileSystemDisplayUrl(source) || '';
}

function resolveImageNodeMode(props: LinghuiImageNodeProperties): LinghuiImageNodeMode {
  if (props.mode === 'import' || props.mode === 'generate') {
    return props.mode;
  }
  return String(props.source ?? '').trim() ? 'import' : 'generate';
}

export function mergePromptSnippet(currentPrompt: string, snippet: string): string {
  const normalizedCurrent = currentPrompt.trim();
  const normalizedSnippet = snippet.trim();
  if (!normalizedSnippet) return normalizedCurrent;
  if (normalizedCurrent.includes(normalizedSnippet)) return normalizedCurrent;
  return normalizedCurrent ? `${normalizedCurrent}\n${normalizedSnippet}` : normalizedSnippet;
}

interface ProviderOption {
  value: string;
  label: string;
  channelLabel?: string;
  modelLabel?: string;
}

interface DisplayReferenceImage {
  source?: string;
  label?: string;
  badge: string;
}

export interface ImageNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  nodeRun?: LinghuiNodeRunState;
  referenceImages: Array<{ source?: string; label?: string }>;
  promptReferences?: LinghuiPromptReferenceItem[];
  workspaceId?: string | null;
  activeTool: LinghuiImageToolKey | null;
  onToolChange: (tool: LinghuiImageToolKey | null) => void;
  onExecuteMultiAngle?: (options?: LinghuiExecuteMultiAngleOptions) => void;
  onRun: () => void;
}

export const ImageNodeEditor: React.FC<ImageNodeEditorProps> = ({
  nodeId,
  nodeData,
  nodeRun,
  referenceImages,
  promptReferences = [],
  workspaceId = null,
  activeTool,
  onToolChange,
  onExecuteMultiAngle,
  onRun,
}) => {
  const { message } = App.useApp();
  const { executionQueue } = useLinghuiNodeEditorApi();
  const { clearNodeRunState, updateNodeData } = useLinghuiNodeMutation();
  const props = nodeData.properties as unknown as LinghuiImageNodeProperties;
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
  const isExecutionQueueActive = executionQueue?.status === 'running' || executionQueue?.status === 'canceling';
  const isNodeQueuedByExecutionQueue = Boolean(isExecutionQueueActive && executionQueue?.queuedNodeIds.includes(nodeId));
  const isNodeRunningByExecutionQueue = Boolean(isExecutionQueueActive && executionQueue?.runningNodeIds.includes(nodeId));
  const isImageGenerating = nodeRun?.status === 'running' || isNodeRunningByExecutionQueue || isNodeQueuedByExecutionQueue;
  const generateProgressText = nodeRun?.status === 'running'
    && typeof nodeRun.progress === 'number'
    && Number.isFinite(nodeRun.progress)
    && nodeRun.progress > 0
    ? ` ${Math.max(0, Math.min(100, Math.round(nodeRun.progress)))}%`
    : '';
  const normalizedRunMessage = String(nodeRun?.message ?? '').trim();
  const generateStateLabel = isNodeQueuedByExecutionQueue && nodeRun?.status !== 'running'
    ? '等待图片生成…'
    : normalizedRunMessage && normalizedRunMessage !== '准备执行'
      ? normalizedRunMessage
      : isImageGenerating
        ? '图片生成中'
        : '生成';
  const generateButtonText = isImageGenerating ? `${generateStateLabel}${generateProgressText}` : '生成';
  const isMultiAngleToolOpen = activeTool === 'multi-angle' && hasCurrentImage;
  const multiAngleConfig = normalizeLinghuiMultiAngleConfig(props.multiAngle ?? DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG);
  const multiAngleTTISelection = String(props.multiAngle?.ttiSelection ?? props.ttiSelection ?? '');

  const displayReferenceImages: DisplayReferenceImage[] = referenceImages.map((ref, index) => ({
    ...ref,
    badge: String(index + 1),
  }));

  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [multiAngleProviders, setMultiAngleProviders] = useState<ProviderOption[]>([]);

  useEffect(() => {
    loadSettings().then(settings => {
      setProviders(listConfiguredModelSelectOptions(settings, 'tti', 'image.text-to-image').map(option => ({
        value: option.value,
        label: `${option.channelLabel} / ${option.modelLabel}`,
        channelLabel: option.channelLabel,
        modelLabel: option.modelLabel,
      })));
      setMultiAngleProviders(listConfiguredModelSelectOptions(settings, 'tti', 'image.image-to-image').map(option => ({
        value: option.value,
        label: `${option.channelLabel} / ${option.modelLabel}`,
      })));
    });
  }, []);

  const updateProp = useCallback((key: string, value: unknown, options?: { markStale?: boolean }) => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, [key]: value },
    }), options);
  }, [nodeId, updateNodeData]);

  const updateMultiAngle = useCallback((patch: Partial<typeof multiAngleConfig>) => {
    updateProp('multiAngle', normalizeLinghuiMultiAngleConfig({
      ...multiAngleConfig,
      ...patch,
    }));
  }, [multiAngleConfig, updateProp]);

  useEffect(() => {
    if (multiAngleTTISelection || multiAngleProviders.length === 0) {
      return;
    }
    updateMultiAngle({ ttiSelection: multiAngleProviders[0].value });
  }, [multiAngleProviders, multiAngleTTISelection, updateMultiAngle]);

  const handleConfirmMultiAngle = useCallback(() => {
    const selectionKey = String(multiAngleTTISelection || multiAngleProviders[0]?.value || '').trim();
    if (!selectionKey) {
      message.info('请先配置或选择支持图生图的生图渠道');
      return;
    }

    const nextMultiAngleConfig = normalizeLinghuiMultiAngleConfig({
      ...multiAngleConfig,
      ttiSelection: selectionKey,
    });

    if (selectionKey !== multiAngleTTISelection) {
      updateMultiAngle({ ttiSelection: selectionKey });
    }

    onExecuteMultiAngle?.({
      ttiSelection: selectionKey,
      multiAngle: nextMultiAngleConfig,
    });
    onToolChange(null);
  }, [
    message,
    multiAngleConfig,
    multiAngleProviders,
    multiAngleTTISelection,
    onExecuteMultiAngle,
    onToolChange,
    updateMultiAngle,
  ]);

  const handleReplaceImage = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
        multiple: false,
        title: '选择图片素材',
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        let resolvedSource = filePath;
        if (
          workspaceId &&
          electronService.isElectron() &&
          filePath &&
          !filePath.startsWith('http://') &&
          !filePath.startsWith('https://') &&
          !filePath.startsWith('data:') &&
          !filePath.startsWith('blob:')
        ) {
          resolvedSource = await importLinghuiWorkspaceAsset(workspaceId, filePath, filePath.split(/[\\/]/).pop());
        }

        const newItem = await createLinghuiImageAssetItemFromSource({
          source: resolvedSource,
          filenameHint: filePath.split(/[\\/]/).pop(),
        });

        updateNodeData(nodeId, prev => {
          const previousProps = prev.properties as unknown as LinghuiImageNodeProperties;
          const nextProperties = createLinghuiImageImportProperties(previousProps, [newItem], newItem.id);
          const nextLabel = prev.label.startsWith('图片') && newItem.label
            ? newItem.label
            : prev.label;
          return {
            ...prev,
            label: nextLabel,
            properties: nextProperties as unknown as Record<string, unknown>,
          };
        }, { markStale: false });
        clearNodeRunState(nodeId);
      }
    } catch (error: any) {
      message.error(error?.message || '选择图片失败');
    }
  }, [clearNodeRunState, message, nodeId, updateNodeData, workspaceId]);

  const handleClearImage = useCallback(() => {
    updateNodeData(nodeId, prev => {
      const previousProps = prev.properties as unknown as LinghuiImageNodeProperties;
      const nextProperties = createLinghuiImageImportProperties(previousProps, [], '');
      return {
        ...prev,
        properties: nextProperties as unknown as Record<string, unknown>,
      };
    }, { markStale: false });
    clearNodeRunState(nodeId);
  }, [clearNodeRunState, nodeId, updateNodeData]);

  const selectedProvider = useMemo(() => (
    providers.find(option => option.value === ttiSelection) ?? providers[0]
  ), [providers, ttiSelection]);
  const modelSummary = selectedProvider?.label || '未配置生图模型';
  const parameterSummary = `${aspectRatio} · ${resolution} · ${batchCount}张`;
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
        updateProp('ttiSelection', provider.value);
      },
    }))
  ), [providers, updateProp]);

  const imageSettingsContent = (
    <div
      className="linghuiEditorSettingsPopover"
      onClick={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <div className="linghuiEditorSettingsBlock">
        <div className="linghuiEditorSettingsLabel">比例</div>
        <div className="linghuiEditorOptionGrid">
          {IMAGE_ASPECT_RATIOS.map(option => (
            <button
              key={option.value}
              type="button"
              className={`linghuiEditorOptionTile ${aspectRatio === option.value ? 'isActive' : ''}`}
              onClick={() => updateProp('aspectRatio', option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="linghuiEditorSettingsBlock">
        <div className="linghuiEditorSettingsLabel">分辨率</div>
        <div className="linghuiEditorOptionGrid isCompact">
          {IMAGE_RESOLUTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              className={`linghuiEditorOptionTile ${resolution === option.value ? 'isActive' : ''}`}
              onClick={() => updateProp('resolution', option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="linghuiEditorSettingsBlock">
        <div className="linghuiEditorSettingsLabel">出图数量</div>
        <div className="linghuiEditorOptionGrid">
          {LINGHUI_IMAGE_BATCH_COUNTS.map(value => (
            <button
              key={value}
              type="button"
              className={`linghuiEditorOptionTile ${batchCount === value ? 'isActive' : ''}`}
              onClick={() => updateProp('batchCount', value)}
            >
              {value}张
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  if (isImportMode) {
    return (
      <div className="linghuiEditorPanel" onMouseDown={event => event.stopPropagation()}>
        <div className="linghuiEditorSection">
          <div
            className={`linghuiReferenceDropzone linghuiImageImportSurface isCompact ${hasCurrentImage ? 'hasPreview' : ''}`}
            onClick={() => void handleReplaceImage()}
            role="button"
            tabIndex={0}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                void handleReplaceImage();
              }
            }}
          >
            {hasCurrentImage ? (
              <>
                <img
                  className="linghuiReferencePreview"
                  src={currentImagePreview}
                  alt={currentImage?.label || nodeData.label}
                />
                <div className="linghuiEditorPlayerOverlay">
                  <span className="linghuiEditorSummaryPill">点击更换图片</span>
                  <span className="linghuiEditorSummaryPill">{currentImage?.label || nodeData.label}</span>
                </div>
              </>
            ) : (
              <div className="linghuiReferencePlaceholder">
                <UploadCloud size={28} />
                <div>点击导入图片</div>
                <div className="linghuiReferencePlaceholderHint">导入后节点会直接输出当前图片</div>
              </div>
            )}
          </div>
        </div>

        <div className="linghuiEditorControlRow">
          {hasCurrentImage ? (
            <span className="linghuiEditorSummaryPill">{currentImage?.label || nodeData.label}</span>
          ) : null}
          <div className="linghuiEditorActionGroup">
            <Button size="small" icon={<UploadCloud size={14} />} onClick={() => void handleReplaceImage()}>
              {hasCurrentImage ? '替换图片' : '导入图片'}
            </Button>
            <Button size="small" icon={<Trash2 size={14} />} danger disabled={!hasImportSource} onClick={handleClearImage}>
              清空
            </Button>
          </div>
        </div>
        <LinghuiMultiAngleModal
          open={isMultiAngleToolOpen}
          sourceImage={currentImagePreview}
          sourceLabel={currentImage?.label || nodeData.label}
          config={multiAngleConfig}
          providerOptions={multiAngleProviders}
          ttiSelection={multiAngleTTISelection}
          onChangeConfig={updateMultiAngle}
          onChangeTTISelection={value => updateMultiAngle({ ttiSelection: value })}
          onCancel={() => onToolChange(null)}
          onConfirm={handleConfirmMultiAngle}
        />
      </div>
    );
  }

  return (
    <div className="linghuiEditorPanel" onMouseDown={event => event.stopPropagation()}>
      {displayReferenceImages.length > 0 && (
        <div className="linghuiEditorSection">
          <div className="linghuiEditorRefs">
            {displayReferenceImages.map((ref, index) => {
              const src = getPreviewSource(ref.source);
              return (
                <div key={`${ref.source || ref.label || index}-${ref.badge}`} className="linghuiEditorRefThumb">
                  {src ? <img src={src} alt={ref.label || `参考 ${index + 1}`} /> : <ImageIcon size={16} />}
                  <span className="linghuiEditorRefBadge">{ref.badge}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="linghuiEditorPrompt">
        <LinghuiPromptEditor
          value={prompt}
          onChange={value => updateProp('prompt', value)}
          references={promptReferences}
          placeholder="输入 @ 引用上游产物"
          darkTheme
          surfaceStyle="fusion"
          minHeight="72px"
          maxHeight="144px"
        />
      </div>

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
          styles={{ root: { zIndex: 1200 } }}
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
          content={imageSettingsContent}
          overlayClassName="linghuiEditorPopover"
          getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
          zIndex={1200}
        >
          <button
            type="button"
            className="linghuiEditorInlineTrigger"
            onClick={event => event.stopPropagation()}
          >
            {parameterSummary}
          </button>
        </Popover>

        <div className="linghuiEditorActionGroup">
          <Button
            type="primary"
            icon={<ArrowUp size={14} />}
            onClick={onRun}
            disabled={isImageGenerating}
            loading={isImageGenerating}
          >
            {generateButtonText}
          </Button>
        </div>
      </div>

      <LinghuiMultiAngleModal
        open={isMultiAngleToolOpen}
        sourceImage={currentImagePreview}
        sourceLabel={currentImage?.label || nodeData.label}
        config={multiAngleConfig}
        providerOptions={multiAngleProviders}
        ttiSelection={multiAngleTTISelection}
        onChangeConfig={updateMultiAngle}
        onChangeTTISelection={value => updateMultiAngle({ ttiSelection: value })}
        onCancel={() => onToolChange(null)}
        onConfirm={handleConfirmMultiAngle}
      />
    </div>
  );
};
