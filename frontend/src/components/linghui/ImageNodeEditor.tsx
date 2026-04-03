import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Select } from 'antd';
import { nanoid } from 'nanoid';
import { ArrowUp, Image as ImageIcon, Trash2, UploadCloud } from 'lucide-react';
import type {
  LinghuiExecuteMultiAngleOptions,
  LinghuiImageAssetItem,
  LinghuiImageNodeMode,
  LinghuiImageNodeProperties,
  LinghuiImageToolKey,
  LinghuiNodeData,
  LinghuiNodeRunState,
} from '../../types/linghui';
import {
  DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG,
  IMAGE_ASPECT_RATIOS,
  IMAGE_RESOLUTIONS,
  LINGHUI_IMAGE_BATCH_COUNTS,
  normalizeLinghuiMultiAngleConfig,
} from '../../types/linghui';
import { electronService, openFileDialog } from '../../services/electronService';
import {
  importLinghuiWorkspaceAsset,
} from '../../store/linghuiStorage';
import { loadSettings } from '../../store/settings/core';
import { listConfiguredModelSelectOptions } from '../../providers/channel/resolver';
import type { LinghuiPromptReferenceItem } from './linghuiPromptReferences';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import { LinghuiMultiAngleModal } from './LinghuiMultiAngleModal';
import { useLinghuiNodeMutation } from './nodes/LinghuiNodeRunsContext';
import {
  createLinghuiImageImportProperties,
  resolveLinghuiImageCollection,
  resolveImageAspectRatioLabel,
} from './linghuiImageCollections';

function getPreviewSource(source?: string): string {
  if (!source) return '';
  if (source.startsWith('http') || source.startsWith('data:') || source.startsWith('blob:') || source.startsWith('koma-local://')) return source;
  return electronService.fs.toLocalUrl(source);
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
  onCreateDerivedImportImages?: (items: LinghuiImageAssetItem[]) => void;
  onExecuteMultiAngle?: (options?: LinghuiExecuteMultiAngleOptions) => void;
  onRun: () => void;
}

async function createSingleImageAssetItem(params: {
  source: string;
  filenameHint?: string;
  label?: string;
}): Promise<LinghuiImageAssetItem> {
  const previewSource = getPreviewSource(params.source);
  const metadata = await new Promise<{ width: number; height: number; aspectRatio: string }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({
      width: image.naturalWidth,
      height: image.naturalHeight,
      aspectRatio: resolveImageAspectRatioLabel(image.naturalWidth, image.naturalHeight),
    });
    image.onerror = () => reject(new Error('读取图片尺寸失败'));
    image.src = previewSource;
  });
  return {
    id: nanoid(10),
    source: params.source,
    label: params.label || params.filenameHint?.replace(/\.[^.]+$/, '') || undefined,
    width: metadata.width,
    height: metadata.height,
    aspectRatio: metadata.aspectRatio,
  };
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
  onCreateDerivedImportImages,
  onExecuteMultiAngle,
  onRun,
}) => {
  const { message } = App.useApp();
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

        const newItem = await createSingleImageAssetItem({
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

  if (isImportMode) {
    return (
      <div className="linghuiEditorPanel" onMouseDown={event => event.stopPropagation()}>
        <div className="linghuiEditorToolbar">
          <div className="linghuiEditorToolbarLeft">
            <Button size="small" icon={<UploadCloud size={14} />} onClick={() => void handleReplaceImage()}>
              替换图片
            </Button>
            <Button size="small" icon={<Trash2 size={14} />} danger disabled={!hasImportSource} onClick={handleClearImage}>
              清空
            </Button>
          </div>

          <div className="linghuiEditorToolbarRight">
            <Button
              type="primary"
              size="small"
              shape="circle"
              icon={<ArrowUp size={16} />}
              onClick={onRun}
            />
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

      <div className="linghuiEditorToolbar">
        <div className="linghuiEditorToolbarLeft">
          <Select
            size="small"
            className="linghuiEditorSelect"
            value={ttiSelection || undefined}
            placeholder="选择生图渠道"
            onChange={value => updateProp('ttiSelection', value)}
            options={providers}
            popupMatchSelectWidth={false}
            style={{ minWidth: 140 }}
          />

          <Select
            size="small"
            className="linghuiEditorSelect"
            value={aspectRatio}
            onChange={value => updateProp('aspectRatio', value)}
            options={IMAGE_ASPECT_RATIOS}
            popupMatchSelectWidth={false}
            style={{ minWidth: 72 }}
          />

          <Select
            size="small"
            className="linghuiEditorSelect"
            value={resolution}
            onChange={value => updateProp('resolution', value)}
            options={IMAGE_RESOLUTIONS}
            popupMatchSelectWidth={false}
            style={{ minWidth: 80 }}
          />
        </div>

        <div className="linghuiEditorToolbarRight">
          <Select
            size="small"
            value={batchCount}
            onChange={value => updateProp('batchCount', value)}
            options={LINGHUI_IMAGE_BATCH_COUNTS.map(value => ({ value, label: `${value}张` }))}
            popupMatchSelectWidth={false}
            style={{ width: 72 }}
          />

          <Button
            type="primary"
            size="small"
            shape="circle"
            icon={<ArrowUp size={16} />}
            onClick={onRun}
          />
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
