import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Dropdown, Popover } from 'antd';
import type { MenuProps } from 'antd';
import { ArrowUp, Image as ImageIcon, Trash2, UploadCloud } from 'lucide-react';
import type {
  LinghuiExecuteMultiAngleOptions,
  LinghuiImageFocusRegion,
  LinghuiImageMarkPoint,
  LinghuiImageNodeMode,
  LinghuiImageNodeProperties,
  LinghuiImageToolKey,
  LinghuiNodeData,
  LinghuiNodeRunState,
} from '../../../../types/linghui';
import {
  DEFAULT_LINGHUI_IMAGE_CINEMATIC_CONFIG,
  DEFAULT_LINGHUI_IMAGE_FOCUS_REGION,
  DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG,
  IMAGE_ASPECT_RATIOS,
  IMAGE_RESOLUTIONS,
  LINGHUI_IMAGE_APERTURE_PRESETS,
  LINGHUI_IMAGE_FOCAL_LENGTH_PRESETS,
  LINGHUI_IMAGE_LIGHTING_PRESETS,
  LINGHUI_IMAGE_MARK_POINT_LIMIT,
  LINGHUI_IMAGE_BATCH_COUNTS,
  normalizeLinghuiImageCinematicConfig,
  normalizeLinghuiImageFocusRegion,
  normalizeLinghuiImageMarkPoints,
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
import { useLinghuiActionLock } from '../hooks/useLinghuiActionLock';
import { cssVars } from '../../../../theme/runtime';
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

function buildFocusRegionPatch(
  previous: LinghuiImageFocusRegion | null,
  patch: Partial<LinghuiImageFocusRegion>,
  source: string,
): LinghuiImageFocusRegion {
  return normalizeLinghuiImageFocusRegion({
    ...DEFAULT_LINGHUI_IMAGE_FOCUS_REGION,
    ...(previous ?? {}),
    ...patch,
    enabled: patch.enabled ?? previous?.enabled ?? true,
    source: source || previous?.source,
    updatedAt: Date.now(),
  }) ?? {
    ...DEFAULT_LINGHUI_IMAGE_FOCUS_REGION,
    enabled: true,
    source,
    updatedAt: Date.now(),
  };
}

function formatFocusRegionPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatMarkPointPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
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

type LinghuiFocusRegionAxis = 'x' | 'y' | 'width' | 'height';

const IMAGE_FOCUS_REGION_STEP = 0.01;
const IMAGE_FOCUS_REGION_PRESETS: Array<{
  key: string;
  label: string;
  region: Pick<LinghuiImageFocusRegion, 'x' | 'y' | 'width' | 'height'>;
}> = [
  { key: 'center', label: '中心', region: { x: 0.28, y: 0.22, width: 0.44, height: 0.42 } },
  { key: 'portrait', label: '脸部', region: { x: 0.32, y: 0.12, width: 0.36, height: 0.32 } },
  { key: 'upper', label: '上半身', region: { x: 0.2, y: 0.1, width: 0.6, height: 0.58 } },
  { key: 'full', label: '全图', region: { x: 0.04, y: 0.04, width: 0.92, height: 0.92 } },
];

function createLinghuiImageMarkPoint(params: {
  x: number;
  y: number;
  source: string;
  index: number;
}): LinghuiImageMarkPoint {
  const pointIndex = params.index + 1;
  return {
    id: `mark-${Date.now().toString(36)}-${pointIndex}`,
    enabled: true,
    x: Math.max(0, Math.min(1, params.x)),
    y: Math.max(0, Math.min(1, params.y)),
    source: params.source,
    label: `标记 ${pointIndex}`,
    prompt: `请重点关注标记 ${pointIndex} 附近的主体、动作或细节，并保持画面其它区域稳定。`,
    updatedAt: Date.now(),
  };
}

export interface ImageNodeEditorExtraSettingsBlock {
  /** 渲染在设置弹层里的标题（与原生 比例 / 分辨率 / 出图数量 等并列） */
  label: string;
  /** 当前选中的 value */
  value: string;
  /** 候选项；label 显示，value 写回 */
  options: Array<{ value: string; label: string; hint?: string }>;
  onChange: (next: string) => void;
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
  activeTool,
  onToolChange,
  onExecuteMultiAngle,
  onRun,
  aspectRatioOptions,
  hideBatchCount = false,
  extraSettings,
}) => {
  const aspectRatioChoices = aspectRatioOptions ?? IMAGE_ASPECT_RATIOS;
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
  const { locked: isRunActionLocked, runWithActionLock } = useLinghuiActionLock(isImageGenerating);
  const normalizedFocusRegion = normalizeLinghuiImageFocusRegion(props.focusRegion);
  const activeFocusRegion = normalizedFocusRegion?.enabled ? normalizedFocusRegion : null;
  const normalizedMarkPoints = normalizeLinghuiImageMarkPoints(props.markPoints);
  const activeMarkPoints = normalizedMarkPoints.filter(point => point.enabled);
  const cinematicConfig = useMemo(() => (
    normalizeLinghuiImageCinematicConfig(props.cinematic ?? DEFAULT_LINGHUI_IMAGE_CINEMATIC_CONFIG)
  ), [props.cinematic]);
  const cinematicSummary = useMemo(() => {
    const labels: string[] = [];
    const lighting = LINGHUI_IMAGE_LIGHTING_PRESETS.find(option => option.value === cinematicConfig.lighting);
    if (lighting && lighting.value !== 'auto') labels.push(lighting.label);
    const focal = LINGHUI_IMAGE_FOCAL_LENGTH_PRESETS.find(option => option.value === cinematicConfig.focalLength);
    if (focal && focal.value !== 'auto') labels.push(focal.label);
    const aperture = LINGHUI_IMAGE_APERTURE_PRESETS.find(option => option.value === cinematicConfig.aperture);
    if (aperture && aperture.value !== 'auto') labels.push(aperture.label);
    return labels.join(' · ');
  }, [cinematicConfig]);
  const hasCinematicDirective = Boolean(cinematicSummary);
  const generatedFromNodeId = String(props.generatedFromNodeId ?? '').trim();
  const generatedSequence = Number(props.generatedSequence);
  const isDerivedFromController = Boolean(generatedFromNodeId);
  const derivedBannerText = isDerivedFromController
    ? `这是控制器节点派生的结果${Number.isFinite(generatedSequence) && generatedSequence > 0 ? ` · 第 ${generatedSequence} 次` : ''}。修改 prompt / 参数请回到上游控制器节点重新生成。`
    : '';
  const focusRegionStyle = activeFocusRegion
    ? cssVars({
        '--linghui-focus-x': `${activeFocusRegion.x * 100}%`,
        '--linghui-focus-y': `${activeFocusRegion.y * 100}%`,
        '--linghui-focus-w': `${activeFocusRegion.width * 100}%`,
        '--linghui-focus-h': `${activeFocusRegion.height * 100}%`,
      })
    : undefined;
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
  const generateButtonText = isImageGenerating
    ? `${generateStateLabel}${generateProgressText}`
    : isDerivedFromController
      ? '再次生成'
      : '生成';
  const isMultiAngleToolOpen = activeTool === 'multi-angle' && hasCurrentImage;
  const multiAngleConfig = normalizeLinghuiMultiAngleConfig(props.multiAngle ?? DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG);
  const multiAngleTTISelection = String(props.multiAngle?.ttiSelection ?? props.ttiSelection ?? '');

  const displayReferenceImages: DisplayReferenceImage[] = referenceImages.map((ref, index) => ({
    ...ref,
    badge: String(index + 1),
  }));

  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [multiAngleProviders, setMultiAngleProviders] = useState<ProviderOption[]>([]);

  const handleRun = useCallback(() => {
    runWithActionLock(onRun);
  }, [onRun, runWithActionLock]);

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

  // 当外部把比例可选集合收紧时（如全景节点只许 16:9/21:9），如果当前 aspectRatio 不在子集里，
  // 自动校正到子集的第一项，避免 popover 选不到 active 状态、生成时仍走到不允许的比例。
  useEffect(() => {
    if (!aspectRatioOptions || aspectRatioOptions.length === 0) return;
    if (!aspectRatioOptions.some(option => option.value === aspectRatio)) {
      updateProp('aspectRatio', aspectRatioOptions[0].value, { markStale: false });
    }
  }, [aspectRatio, aspectRatioOptions, updateProp]);

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

  const updateFocusRegion = useCallback((patch: Partial<LinghuiImageFocusRegion>) => {
    if (!currentImageSource) {
      message.info('请先导入或生成一张图片');
      return;
    }

    const nextFocusRegion = buildFocusRegionPatch(
      normalizeLinghuiImageFocusRegion(props.focusRegion),
      patch,
      currentImageSource,
    );
    updateProp('focusRegion', nextFocusRegion);
  }, [currentImageSource, message, props.focusRegion, updateProp]);

  const updateFocusRegionAxis = useCallback((axis: LinghuiFocusRegionAxis, rawValue: number) => {
    const numeric = Math.max(0, Math.min(1, rawValue));
    updateFocusRegion({ [axis]: numeric });
  }, [updateFocusRegion]);

  const handleEnableFocusRegion = useCallback(() => {
    updateFocusRegion({ enabled: true });
  }, [updateFocusRegion]);

  const handleDisableFocusRegion = useCallback(() => {
    const previous = normalizeLinghuiImageFocusRegion(props.focusRegion);
    updateProp('focusRegion', previous ? { ...previous, enabled: false } : null);
    onToolChange(null);
  }, [onToolChange, props.focusRegion, updateProp]);

  const updateMarkPoints = useCallback((nextPoints: LinghuiImageMarkPoint[]) => {
    updateProp('markPoints', nextPoints);
  }, [updateProp]);

  const handleMarkStageClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!currentImageSource) {
      message.info('请先导入或生成一张图片');
      return;
    }
    if (normalizedMarkPoints.length >= LINGHUI_IMAGE_MARK_POINT_LIMIT) {
      message.warning(`焦点选择最多支持 ${LINGHUI_IMAGE_MARK_POINT_LIMIT} 个标记点`);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const nextPoint = createLinghuiImageMarkPoint({
      x,
      y,
      source: currentImageSource,
      index: normalizedMarkPoints.length,
    });
    updateMarkPoints([...normalizedMarkPoints, nextPoint]);
  }, [currentImageSource, message, normalizedMarkPoints, updateMarkPoints]);

  const handleRemoveMarkPoint = useCallback((pointId: string) => {
    updateMarkPoints(normalizedMarkPoints.filter(point => point.id !== pointId));
  }, [normalizedMarkPoints, updateMarkPoints]);

  const handleClearMarkPoints = useCallback(() => {
    updateMarkPoints([]);
    onToolChange(null);
  }, [onToolChange, updateMarkPoints]);

  const selectedProvider = useMemo(() => (
    providers.find(option => option.value === ttiSelection) ?? providers[0]
  ), [providers, ttiSelection]);
  const modelSummary = selectedProvider?.label || '未配置生图模型';
  const parameterSummary = hasCinematicDirective
    ? `${aspectRatio} · ${resolution} · ${batchCount}张 · ${cinematicSummary}`
    : `${aspectRatio} · ${resolution} · ${batchCount}张`;
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
          {aspectRatioChoices.map(option => (
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

      {!hideBatchCount && (
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
      )}

      <div className="linghuiEditorSettingsBlock">
        <div className="linghuiEditorSettingsLabel">打光</div>
        <div className="linghuiEditorOptionGrid">
          {LINGHUI_IMAGE_LIGHTING_PRESETS.map(option => (
            <button
              key={option.value}
              type="button"
              className={`linghuiEditorOptionTile ${cinematicConfig.lighting === option.value ? 'isActive' : ''}`}
              onClick={() => updateProp('cinematic', normalizeLinghuiImageCinematicConfig({
                ...cinematicConfig,
                lighting: option.value,
              }))}
              title={option.prompt}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="linghuiEditorSettingsBlock">
        <div className="linghuiEditorSettingsLabel">焦距</div>
        <div className="linghuiEditorOptionGrid">
          {LINGHUI_IMAGE_FOCAL_LENGTH_PRESETS.map(option => (
            <button
              key={option.value}
              type="button"
              className={`linghuiEditorOptionTile ${cinematicConfig.focalLength === option.value ? 'isActive' : ''}`}
              onClick={() => updateProp('cinematic', normalizeLinghuiImageCinematicConfig({
                ...cinematicConfig,
                focalLength: option.value,
              }))}
              title={option.prompt}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="linghuiEditorSettingsBlock">
        <div className="linghuiEditorSettingsLabel">景深 / 光圈</div>
        <div className="linghuiEditorOptionGrid isCompact">
          {LINGHUI_IMAGE_APERTURE_PRESETS.map(option => (
            <button
              key={option.value}
              type="button"
              className={`linghuiEditorOptionTile ${cinematicConfig.aperture === option.value ? 'isActive' : ''}`}
              onClick={() => updateProp('cinematic', normalizeLinghuiImageCinematicConfig({
                ...cinematicConfig,
                aperture: option.value,
              }))}
              title={option.prompt}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {extraSettings && (Array.isArray(extraSettings) ? extraSettings : [extraSettings]).map((block, index) => (
        <div key={`${block.label}-${index}`} className="linghuiEditorSettingsBlock">
          <div className="linghuiEditorSettingsLabel">{block.label}</div>
          <div className="linghuiEditorOptionGrid">
            {block.options.map(option => (
              <button
                key={option.value}
                type="button"
                className={`linghuiEditorOptionTile ${block.value === option.value ? 'isActive' : ''}`}
                onClick={() => block.onChange(option.value)}
                title={option.hint}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const focusRegionPanel = activeTool === 'focus' && hasCurrentImage ? (
    <div className="linghuiEditorSection linghuiImageFocusPanel">
      <div className="linghuiImageFocusHeader">
        <div>
          <div className="linghuiEditorSectionTitle">聚焦</div>
          <div className="linghuiImageFocusHint">红框区域会作为下一次局部补全重点</div>
        </div>
        <div className="linghuiEditorSummaryRow">
          {activeFocusRegion ? (
            <span className="linghuiEditorSummaryPill">
              {formatFocusRegionPercent(activeFocusRegion.width)} × {formatFocusRegionPercent(activeFocusRegion.height)}
            </span>
          ) : (
            <span className="linghuiEditorSummaryPill isMuted">未启用</span>
          )}
        </div>
      </div>

      <div className="linghuiImageFocusStage">
        {currentImagePreview ? (
          <img src={currentImagePreview} alt={currentImage?.label || nodeData.label} draggable={false} />
        ) : (
          <ImageIcon size={22} />
        )}
        {activeFocusRegion && <div className="linghuiImageFocusBox" style={focusRegionStyle} />}
      </div>

      <div className="linghuiImageFocusPresetRow">
        {IMAGE_FOCUS_REGION_PRESETS.map(preset => (
          <button
            key={preset.key}
            type="button"
            className="linghuiImageFocusPresetButton"
            onClick={() => updateFocusRegion({ ...preset.region, enabled: true })}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="linghuiImageFocusControls">
        {([
          ['x', '横向'],
          ['y', '纵向'],
          ['width', '宽度'],
          ['height', '高度'],
        ] as Array<[LinghuiFocusRegionAxis, string]>).map(([axis, label]) => {
          const value = activeFocusRegion?.[axis] ?? DEFAULT_LINGHUI_IMAGE_FOCUS_REGION[axis];
          return (
            <label key={axis} className="linghuiImageFocusSlider">
              <span>{label}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={IMAGE_FOCUS_REGION_STEP}
                value={value}
                onChange={event => updateFocusRegionAxis(axis, Number(event.target.value))}
              />
              <strong>{formatFocusRegionPercent(value)}</strong>
            </label>
          );
        })}
      </div>

      <div className="linghuiImageFocusActions">
        <Button size="small" type="primary" onClick={handleEnableFocusRegion}>
          标记区域
        </Button>
        <Button size="small" onClick={handleDisableFocusRegion} disabled={!normalizedFocusRegion}>
          清除聚焦
        </Button>
      </div>
    </div>
  ) : null;

  const markPointPanel = activeTool === 'mark' && hasCurrentImage ? (
    <div className="linghuiEditorSection linghuiImageMarkPanel">
      <div className="linghuiImageFocusHeader">
        <div>
          <div className="linghuiEditorSectionTitle">标记</div>
          <div className="linghuiImageFocusHint">点击图片添加焦点，标记会写入下一次生成提示</div>
        </div>
        <span className={`linghuiEditorSummaryPill ${activeMarkPoints.length ? '' : 'isMuted'}`}>
          {activeMarkPoints.length}/{LINGHUI_IMAGE_MARK_POINT_LIMIT}
        </span>
      </div>

      <div
        className="linghuiImageMarkStage"
        role="button"
        aria-label="添加标记点"
        tabIndex={0}
        onClick={handleMarkStageClick}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            const target = event.currentTarget;
            const rect = target.getBoundingClientRect();
            const point = createLinghuiImageMarkPoint({
              x: 0.5,
              y: 0.5,
              source: currentImageSource,
              index: normalizedMarkPoints.length,
            });
            if (rect.width > 0 && rect.height > 0 && normalizedMarkPoints.length < LINGHUI_IMAGE_MARK_POINT_LIMIT) {
              updateMarkPoints([...normalizedMarkPoints, point]);
            }
          }
        }}
      >
        {currentImagePreview ? (
          <img src={currentImagePreview} alt={currentImage?.label || nodeData.label} draggable={false} />
        ) : (
          <ImageIcon size={22} />
        )}
        {activeMarkPoints.map((point, index) => (
          <span
            key={point.id}
            className="linghuiImageMarkPoint"
            style={cssVars({
              '--linghui-mark-x': `${point.x * 100}%`,
              '--linghui-mark-y': `${point.y * 100}%`,
            })}
          >
            {index + 1}
          </span>
        ))}
      </div>

      {activeMarkPoints.length > 0 && (
        <div className="linghuiImageMarkList">
          {activeMarkPoints.map((point, index) => (
            <div key={point.id} className="linghuiImageMarkListItem">
              <span>{point.label || `标记 ${index + 1}`}</span>
              <strong>
                {formatMarkPointPercent(point.x)}, {formatMarkPointPercent(point.y)}
              </strong>
              <button type="button" onClick={() => handleRemoveMarkPoint(point.id)}>
                删除
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="linghuiImageFocusActions">
        <Button size="small" onClick={handleClearMarkPoints} disabled={normalizedMarkPoints.length === 0}>
          清除标记
        </Button>
      </div>
    </div>
  ) : null;

  if (isImportMode) {
    // LibTV 1:1：素材节点本身已经展示图片 + 节点上方上传/工具浮按钮，编辑器面板不再重复显示大预览图，
    // 只保留"文件名 + 替换/清空"轻量操作行，避免反人类的"上下两张图"重复。
    return (
      <div className="linghuiEditorPanel" onMouseDown={event => event.stopPropagation()}>
        <div className="linghuiEditorControlRow">
          {hasCurrentImage ? (
            <span className="linghuiEditorSummaryPill">{currentImage?.label || nodeData.label}</span>
          ) : (
            <span className="linghuiEditorSummaryPill">尚未上传图片</span>
          )}
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

      {isDerivedFromController && (
        <div className="linghuiEditorDerivedBanner" role="note">
          <span className="linghuiEditorDerivedBannerBadge">派生</span>
          <span className="linghuiEditorDerivedBannerText">{derivedBannerText}</span>
        </div>
      )}

      <div className="linghuiEditorPrompt">
        <LinghuiPromptEditor
          value={prompt}
          onChange={value => updateProp('prompt', value)}
          references={promptReferences}
          placeholder="输入 @ 引用上游产物"
          surfaceStyle="fusion"
          minHeight="76px"
          maxHeight="176px"
        />
      </div>

      {focusRegionPanel}
      {markPointPanel}

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
            size="small"
            icon={<ArrowUp size={12} />}
            onClick={handleRun}
            disabled={isImageGenerating || isRunActionLocked}
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
