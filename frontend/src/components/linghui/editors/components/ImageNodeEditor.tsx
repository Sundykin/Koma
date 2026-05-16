import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Dropdown, Popover } from 'antd';
import type { MenuProps } from 'antd';
import { ArrowUp, Camera, Image as ImageIcon, RotateCcw, Trash2, UploadCloud, X } from 'lucide-react';
import type {
  LinghuiExecuteMultiAngleOptions,
  LinghuiImageFocusRegion,
  LinghuiImageMarkPoint,
  LinghuiImageNodeMode,
  LinghuiImageNodeProperties,
  LinghuiImageRelightConfig,
  LinghuiImageToolKey,
  LinghuiMultiAngleConfig,
  LinghuiMultiAngleMode,
  LinghuiMultiAnglePresetKey,
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiRelightDirection,
} from '../../../../types/linghui';
import {
  DEFAULT_LINGHUI_IMAGE_CINEMATIC_CONFIG,
  DEFAULT_LINGHUI_IMAGE_FOCUS_REGION,
  DEFAULT_LINGHUI_IMAGE_RELIGHT_CONFIG,
  DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG,
  IMAGE_ASPECT_RATIOS,
  IMAGE_RESOLUTIONS,
  LINGHUI_IMAGE_APERTURE_PRESETS,
  LINGHUI_IMAGE_FOCAL_LENGTH_PRESETS,
  LINGHUI_IMAGE_MARK_POINT_LIMIT,
  LINGHUI_IMAGE_BATCH_COUNTS,
  normalizeLinghuiImageCinematicConfig,
  normalizeLinghuiImageFocusRegion,
  normalizeLinghuiImageMarkPoints,
  normalizeLinghuiImageRelightConfig,
  normalizeLinghuiMultiAngleConfig,
} from '../../../../types/linghui';
import { electronService, openFileDialog } from '../../../../services/electronService';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import {
  importLinghuiWorkspaceAsset,
} from '../../../../store/linghuiStorage';
import { loadSettings } from '../../../../store/settings/core';
import { listConfiguredModelSelectOptions } from '../../../../providers/channel/resolver';
import {
  LINGHUI_IMAGE_TOOL_PRESETS,
  type LinghuiImageToolPresetDef,
} from '../state/linghuiImageToolPresets';
import type { LinghuiPromptReferenceItem } from '../state/linghuiPromptReferences';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import { LinghuiMultiAngle3DViewport } from './LinghuiMultiAngle3DViewport';
import { LinghuiLightingSpherePreview } from './LinghuiLightingSpherePreview';
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

const LIBTV_MULTI_ANGLE_PRESETS: Array<{
  key: LinghuiMultiAnglePresetKey;
  label: string;
  values: Pick<LinghuiMultiAngleConfig, 'rotation' | 'tilt' | 'scale'> | null;
  isWideAngle?: boolean;
  prompt: string;
}> = [
  { key: 'custom', label: '自定义', values: null, prompt: '' },
  { key: 'fisheye', label: '鱼眼视角', values: { rotation: 0, tilt: 30, scale: 100 }, isWideAngle: true, prompt: '极度特写镜头，广角镜头，边缘带有鱼眼畸变效果' },
  { key: 'tilted', label: '倾斜视角', values: { rotation: 45, tilt: -30, scale: 50 }, prompt: 'dutch angle，tilted frame' },
  { key: 'front-down', label: '正面俯拍', values: { rotation: 0, tilt: 60, scale: 50 }, prompt: '' },
  { key: 'front-up', label: '正面仰拍', values: { rotation: 0, tilt: -30, scale: 50 }, prompt: '' },
  { key: 'panoramic-down', label: '全景俯拍', values: { rotation: 45, tilt: 30, scale: 0 }, prompt: '' },
  { key: 'back', label: '背面视角', values: { rotation: 180, tilt: 0, scale: 50 }, prompt: '' },
];

const LIBTV_RELIGHT_MAIN_DIRECTIONS: Array<{ value: LinghuiRelightDirection; label: string }> = [
  { value: 'left', label: '左侧' },
  { value: 'top', label: '顶部' },
  { value: 'right', label: '右侧' },
  { value: 'front', label: '前方' },
  { value: 'bottom', label: '底部' },
  { value: 'back', label: '后方' },
];

const LIBTV_RELIGHT_BACK_DIRECTIONS: ReadonlySet<LinghuiRelightDirection> = new Set([
  'back-left',
  'back',
  'back-right',
  'high-back-left',
  'high-back',
  'high-back-right',
  'low-back-left',
  'low-back',
  'low-back-right',
]);

const LIBTV_RELIGHT_BRIGHTNESS_STEPS = [10, 25, 50, 75, 100] as const;

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
  onApplyImageToolPreset?: (preset: {
    label?: string;
    promptSnippet: string;
    properties?: Partial<LinghuiImageNodeProperties>;
  }) => void;
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
  onApplyImageToolPreset,
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
  const cameraSummary = useMemo(() => {
    const labels: string[] = [];
    const focal = LINGHUI_IMAGE_FOCAL_LENGTH_PRESETS.find(option => option.value === cinematicConfig.focalLength);
    if (focal && focal.value !== 'auto') labels.push(focal.label);
    const aperture = LINGHUI_IMAGE_APERTURE_PRESETS.find(option => option.value === cinematicConfig.aperture);
    if (aperture && aperture.value !== 'auto') labels.push(aperture.label);
    return labels.join(' · ');
  }, [cinematicConfig]);
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
  const isOutpaintToolOpen = activeTool === 'outpaint' && hasCurrentImage;
  const isRelightToolOpen = activeTool === 'relight' && hasCurrentImage;
  const isRepaintToolOpen = activeTool === 'repaint' && hasCurrentImage;
  const multiAngleConfig = normalizeLinghuiMultiAngleConfig(props.multiAngle ?? DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG);
  const multiAngleTTISelection = String(props.multiAngle?.ttiSelection ?? props.ttiSelection ?? '');
  const normalizedRelightConfig = useMemo(() => (
    normalizeLinghuiImageRelightConfig(props.relight ?? DEFAULT_LINGHUI_IMAGE_RELIGHT_CONFIG)
  ), [props.relight]);

  const displayReferenceImages: DisplayReferenceImage[] = referenceImages.map((ref, index) => ({
    ...ref,
    badge: String(index + 1),
  }));

  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [multiAngleProviders, setMultiAngleProviders] = useState<ProviderOption[]>([]);
  const relightPresets = LINGHUI_IMAGE_TOOL_PRESETS.relight.presets;
  const repaintPresets = LINGHUI_IMAGE_TOOL_PRESETS.repaint.presets;
  const outpaintPresets = LINGHUI_IMAGE_TOOL_PRESETS.outpaint.presets;
  const [outpaintPresetLabel, setOutpaintPresetLabel] = useState(outpaintPresets[0]?.label ?? '');
  const [outpaintAspectRatio, setOutpaintAspectRatio] = useState(String(outpaintPresets[0]?.properties?.aspectRatio ?? aspectRatio));
  const [outpaintResolution, setOutpaintResolution] = useState(String(outpaintPresets[0]?.properties?.resolution ?? resolution));
  const [outpaintBatchCount, setOutpaintBatchCount] = useState(batchCount);
  const [relightPresetLabel, setRelightPresetLabel] = useState(relightPresets[0]?.label ?? '');
  const [relightAspectRatio, setRelightAspectRatio] = useState(aspectRatio);
  const [relightResolution, setRelightResolution] = useState(resolution);
  const [relightValues, setRelightValues] = useState<LinghuiImageRelightConfig>(normalizedRelightConfig);
  const [relightPrompt, setRelightPrompt] = useState(normalizedRelightConfig.prompt);
  const [relightReferenceImage, setRelightReferenceImage] = useState<string | null>(normalizedRelightConfig.referenceImage ?? null);
  const [relightSceneActive, setRelightSceneActive] = useState(Boolean(normalizedRelightConfig.sceneActive));
  const [relightBrightnessActive, setRelightBrightnessActive] = useState(Boolean(normalizedRelightConfig.brightnessActive));
  const [relightColorActive, setRelightColorActive] = useState(Boolean(normalizedRelightConfig.colorActive));
  const [repaintPresetLabel, setRepaintPresetLabel] = useState(repaintPresets[0]?.label ?? '');
  const [repaintAspectRatio, setRepaintAspectRatio] = useState(aspectRatio);
  const [repaintResolution, setRepaintResolution] = useState(resolution);
  const [repaintBatchCount, setRepaintBatchCount] = useState(batchCount);
  const [repaintPrompt, setRepaintPrompt] = useState('');
  const multiAnglePreset = useMemo(() => (
    LIBTV_MULTI_ANGLE_PRESETS.find(preset => preset.key === multiAngleConfig.presetKey)
    ?? LIBTV_MULTI_ANGLE_PRESETS[0]
  ), [multiAngleConfig.presetKey]);

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

  useEffect(() => {
    if (!isOutpaintToolOpen) return;
    const preset = outpaintPresets.find(item => item.label === outpaintPresetLabel) ?? outpaintPresets[0];
    setOutpaintPresetLabel(previous => (
      outpaintPresets.some(item => item.label === previous)
        ? previous
        : outpaintPresets[0]?.label ?? ''
    ));
    setOutpaintAspectRatio(String(preset?.properties?.aspectRatio ?? aspectRatio));
    setOutpaintResolution(String(preset?.properties?.resolution ?? resolution));
    setOutpaintBatchCount(batchCount);
  }, [aspectRatio, batchCount, isOutpaintToolOpen, outpaintPresetLabel, outpaintPresets, resolution]);

  useEffect(() => {
    if (!isRelightToolOpen) return;
    const nextRelight = normalizeLinghuiImageRelightConfig(props.relight ?? DEFAULT_LINGHUI_IMAGE_RELIGHT_CONFIG);
    setRelightValues(nextRelight);
    setRelightPrompt(nextRelight.prompt);
    setRelightReferenceImage(nextRelight.referenceImage ?? null);
    setRelightSceneActive(Boolean(nextRelight.sceneActive));
    setRelightBrightnessActive(Boolean(nextRelight.brightnessActive));
    setRelightColorActive(Boolean(nextRelight.colorActive));
    setRelightPresetLabel(previous => (
      relightPresets.some(preset => preset.label === previous)
        ? previous
        : relightPresets[0]?.label ?? ''
    ));
    setRelightAspectRatio(aspectRatio);
    setRelightResolution(resolution);
  }, [aspectRatio, isRelightToolOpen, props.relight, relightPresets, resolution]);

  useEffect(() => {
    if (!isRepaintToolOpen) return;
    setRepaintPresetLabel(previous => (
      repaintPresets.some(preset => preset.label === previous)
        ? previous
        : repaintPresets[0]?.label ?? ''
    ));
    setRepaintAspectRatio(aspectRatio);
    setRepaintResolution(resolution);
    setRepaintBatchCount(batchCount);
  }, [aspectRatio, batchCount, isRepaintToolOpen, repaintPresets, resolution]);

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

  const setMultiAngleMode = useCallback((mode: LinghuiMultiAngleMode) => {
    updateMultiAngle({ mode });
  }, [updateMultiAngle]);

  const applyMultiAnglePreset = useCallback((preset: typeof LIBTV_MULTI_ANGLE_PRESETS[number]) => {
    updateMultiAngle({
      ...(preset.values ?? {}),
      presetKey: preset.key,
      isWideAngle: preset.isWideAngle === true,
      prompt: preset.prompt,
      promptEnabled: Boolean(preset.prompt),
    });
  }, [updateMultiAngle]);

  const updateRelightValues = useCallback((patch: Partial<LinghuiImageRelightConfig>) => {
    setRelightValues(previous => normalizeLinghuiImageRelightConfig({
      ...previous,
      ...patch,
    }));
  }, []);

  const applyRelightPreset = useCallback((preset: LinghuiImageToolPresetDef) => {
    const relight = normalizeLinghuiImageRelightConfig(preset.properties?.relight ?? DEFAULT_LINGHUI_IMAGE_RELIGHT_CONFIG);
    setRelightPresetLabel(preset.label);
    setRelightValues(relight);
    setRelightPrompt(relight.prompt);
    setRelightReferenceImage(relight.referenceImage ?? null);
    setRelightSceneActive(Boolean(preset.properties?.relight?.direction));
    setRelightBrightnessActive(typeof preset.properties?.relight?.brightness === 'number');
    setRelightColorActive(Boolean(preset.properties?.relight?.lightColor && preset.properties.relight.lightColor !== DEFAULT_LINGHUI_IMAGE_RELIGHT_CONFIG.lightColor));
  }, []);

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
      label: multiAnglePreset?.label,
    });
    onToolChange(null);
  }, [
    message,
    multiAngleConfig,
    multiAngleProviders,
    multiAnglePreset?.label,
    multiAngleTTISelection,
    onExecuteMultiAngle,
    onToolChange,
    updateMultiAngle,
  ]);

  const handleApplyRelightPreset = useCallback(() => {
    const preset = relightPresets.find(item => item.label === relightPresetLabel) ?? relightPresets[0];
    if (!preset) {
      message.info('暂无可用打光预设');
      return;
    }

    const nextRelight = normalizeLinghuiImageRelightConfig({
      ...relightValues,
      prompt: relightPrompt,
      referenceImage: relightReferenceImage,
      sceneActive: relightSceneActive,
      brightnessActive: relightBrightnessActive,
      colorActive: relightColorActive,
    });
    const promptSnippet = relightPrompt.trim() || preset.promptSnippet || preset.label;
    const nextProperties: Partial<LinghuiImageNodeProperties> = {
      ...(preset.properties ?? {}),
      relight: nextRelight,
      aspectRatio: relightAspectRatio,
      resolution: relightResolution,
      batchCount,
    };

    if (onApplyImageToolPreset) {
      onApplyImageToolPreset({
        label: preset.label,
        promptSnippet,
        properties: nextProperties,
      });
      onToolChange(null);
      return;
    }

    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: {
        ...prev.properties,
        ...nextProperties,
        prompt: mergePromptSnippet(String((prev.properties as Partial<LinghuiImageNodeProperties>).prompt ?? ''), promptSnippet),
      },
    }));
    onToolChange(null);
    handleRun();
  }, [
    batchCount,
    handleRun,
    message,
    nodeId,
    onApplyImageToolPreset,
    onToolChange,
    relightAspectRatio,
    relightBrightnessActive,
    relightColorActive,
    relightPrompt,
    relightPresetLabel,
    relightPresets,
    relightReferenceImage,
    relightResolution,
    relightSceneActive,
    relightValues,
    updateNodeData,
  ]);

  const handleSelectOutpaintPreset = useCallback((preset: LinghuiImageToolPresetDef) => {
    setOutpaintPresetLabel(preset.label);
    setOutpaintAspectRatio(String(preset.properties?.aspectRatio ?? aspectRatio));
    setOutpaintResolution(String(preset.properties?.resolution ?? resolution));
  }, [aspectRatio, resolution]);

  const handleApplyOutpaintPreset = useCallback(() => {
    const preset = outpaintPresets.find(item => item.label === outpaintPresetLabel) ?? outpaintPresets[0];
    if (!preset) {
      message.info('暂无可用扩图预设');
      return;
    }

    const nextProperties: Partial<LinghuiImageNodeProperties> = {
      ...(preset.properties ?? {}),
      aspectRatio: outpaintAspectRatio,
      resolution: outpaintResolution,
      batchCount: outpaintBatchCount,
    };

    if (onApplyImageToolPreset) {
      onApplyImageToolPreset({
        label: preset.label,
        promptSnippet: preset.promptSnippet,
        properties: nextProperties,
      });
      onToolChange(null);
      return;
    }

    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: {
        ...prev.properties,
        ...nextProperties,
        prompt: mergePromptSnippet(String((prev.properties as Partial<LinghuiImageNodeProperties>).prompt ?? ''), preset.promptSnippet),
      },
    }));
    onToolChange(null);
    handleRun();
  }, [
    handleRun,
    message,
    nodeId,
    onApplyImageToolPreset,
    onToolChange,
    outpaintAspectRatio,
    outpaintBatchCount,
    outpaintPresetLabel,
    outpaintPresets,
    outpaintResolution,
    updateNodeData,
  ]);

  const handleApplyRepaintPreset = useCallback(() => {
    const preset = repaintPresets.find(item => item.label === repaintPresetLabel) ?? repaintPresets[0];
    if (!preset) {
      message.info('暂无可用重绘预设');
      return;
    }

    const promptSnippet = repaintPrompt.trim()
      ? mergePromptSnippet(preset.promptSnippet, repaintPrompt)
      : preset.promptSnippet;
    const nextProperties: Partial<LinghuiImageNodeProperties> = {
      ...(preset.properties ?? {}),
      aspectRatio: repaintAspectRatio,
      resolution: repaintResolution,
      batchCount: repaintBatchCount,
    };

    if (onApplyImageToolPreset) {
      onApplyImageToolPreset({
        label: preset.label,
        promptSnippet,
        properties: nextProperties,
      });
      onToolChange(null);
      return;
    }

    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: {
        ...prev.properties,
        ...nextProperties,
        prompt: mergePromptSnippet(String((prev.properties as Partial<LinghuiImageNodeProperties>).prompt ?? ''), promptSnippet),
      },
    }));
    onToolChange(null);
    handleRun();
  }, [
    handleRun,
    message,
    nodeId,
    onApplyImageToolPreset,
    onToolChange,
    repaintAspectRatio,
    repaintBatchCount,
    repaintPresetLabel,
    repaintPresets,
    repaintPrompt,
    repaintResolution,
    updateNodeData,
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

  const handlePickRelightReferenceImage = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        multiple: false,
        title: '选择打光参考图',
      });
      if (result.canceled || result.filePaths.length === 0) return;
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
      setRelightReferenceImage(resolvedSource);
    } catch (error: any) {
      message.error(error?.message || '选择打光参考图失败');
    }
  }, [message, workspaceId]);

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
  const parameterSummary = hideBatchCount
    ? `${aspectRatio} · ${resolution}`
    : `${aspectRatio} · ${resolution} · ${batchCount}张`;
  const cameraButtonSummary = cameraSummary ? `镜头 · ${cameraSummary}` : '镜头 自动';
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

  const cameraSettingsContent = (
    <div
      className="linghuiEditorSettingsPopover isCameraMenu"
      onClick={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <div className="linghuiEditorSettingsBlock">
        <div className="linghuiEditorSettingsLabel">焦距 / 镜头</div>
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
        <div className="linghuiEditorSettingsLabel">光圈 / 景深</div>
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

  const renderLibTVToolFooter = (onGenerate: () => void, disabled = false) => (
    <div className="linghuiImageLibTVPanelFooter">
      <button
        type="button"
        className="linghuiImageLibTVResetButton"
        onClick={() => onToolChange(null)}
      >
        <RotateCcw size={14} />
        <span>重置参数</span>
      </button>
      <div className="linghuiImageLibTVFooterRight">
        <button
          type="button"
          className="linghuiImageLibTVGenerateButton"
          aria-label="生成"
          disabled={disabled}
          onClick={onGenerate}
        >
          <ArrowUp size={18} />
        </button>
      </div>
    </div>
  );

  const renderLibTVToolShell = (params: {
    title: string;
    className?: string;
    children: React.ReactNode;
  }) => (
    <div className={`linghuiImageLibTVPanel ${params.className ?? ''}`} role="dialog" aria-label={params.title}>
      <div className="linghuiImageLibTVPanelHeader">
        <h3>{params.title}</h3>
        <button
          type="button"
          className="linghuiImageLibTVCloseButton"
          aria-label="关闭"
          onClick={() => onToolChange(null)}
        >
          <X size={16} />
        </button>
      </div>
      {params.children}
    </div>
  );

  const renderImagePreviewStage = (className = '') => (
    <div className={`linghuiImageLibTVPreviewStage ${className}`}>
      {currentImagePreview ? (
        <img src={currentImagePreview} alt={currentImage?.label || nodeData.label} draggable={false} />
      ) : (
        <ImageIcon size={30} />
      )}
    </div>
  );

  const multiAngleToolPanel = isMultiAngleToolOpen ? renderLibTVToolShell({
    title: '多角度编辑器',
    className: 'isMultiAngle',
    children: (
      <>
        <div className="linghuiImageLibTVTabRow">
          {LIBTV_MULTI_ANGLE_PRESETS.map(tab => (
            <button
              key={tab.key}
              type="button"
              className={multiAngleConfig.presetKey === tab.key ? 'isActive' : ''}
              onClick={() => applyMultiAnglePreset(tab)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="linghuiImageLibTVPanelBody isTwoColumn">
          <div className="linghuiImageLibTVPreviewStage isMultiAngleScene linghuiImageLibTVOrbitStage">
            <LinghuiMultiAngle3DViewport
              imageUrl={currentImagePreview}
              mode={multiAngleConfig.mode}
              rotation={multiAngleConfig.rotation}
              tilt={multiAngleConfig.tilt}
              scale={multiAngleConfig.scale}
              isWideAngle={multiAngleConfig.isWideAngle}
              onRotationTiltChange={(rotation, tilt) => updateMultiAngle({ rotation, tilt, presetKey: 'custom' })}
              onScaleChange={(scale) => updateMultiAngle({ scale, presetKey: 'custom' })}
            />
          </div>
          <div className="linghuiImageLibTVControlStack">
            <div className="linghuiImageLibTVModeSwitcher" role="tablist" aria-label="多角度模式">
              <button type="button" className={multiAngleConfig.mode === 'object' ? 'isActive' : ''} onClick={() => setMultiAngleMode('object')}>
                Object
              </button>
              <button type="button" className={multiAngleConfig.mode === 'camera' ? 'isActive' : ''} onClick={() => setMultiAngleMode('camera')}>
                Camera
              </button>
            </div>
            {multiAngleConfig.mode === 'camera' ? (
              <>
                <div className="linghuiImageLibTVSliderRow">
                  <span>水平环绕</span>
                  <input
                    type="range"
                    min={0}
                    max={315}
                    step={45}
                    value={((Math.round(multiAngleConfig.rotation / 45) * 45) % 360 + 360) % 360}
                    onChange={event => updateMultiAngle({ rotation: Number(event.target.value), presetKey: 'custom' })}
                  />
                  <strong>{((Math.round(multiAngleConfig.rotation / 45) * 45) % 360 + 360) % 360}°</strong>
                </div>
                <div className="linghuiImageLibTVSliderRow">
                  <span>垂直俯仰</span>
                  <input
                    type="range"
                    min={-30}
                    max={60}
                    step={30}
                    value={Math.max(-30, Math.min(60, Math.round(multiAngleConfig.tilt / 30) * 30))}
                    onChange={event => updateMultiAngle({ tilt: Number(event.target.value), presetKey: 'custom' })}
                  />
                  <strong>{Math.max(-30, Math.min(60, Math.round(multiAngleConfig.tilt / 30) * 30))}°</strong>
                </div>
                <div className="linghuiImageLibTVSliderRow">
                  <span>景别缩放</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={5}
                    value={Math.round(multiAngleConfig.scale / 10)}
                    onChange={event => updateMultiAngle({ scale: Number(event.target.value) * 10, presetKey: 'custom' })}
                  />
                  <strong>{multiAngleConfig.scale <= 30 ? '全景' : multiAngleConfig.scale <= 60 ? '中景' : '特写'}</strong>
                </div>
              </>
            ) : (
              <>
                <div className="linghuiImageLibTVSliderRow">
                  <span>旋转</span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={1}
                    value={multiAngleConfig.rotation}
                    onChange={event => updateMultiAngle({ rotation: Number(event.target.value), presetKey: 'custom' })}
                  />
                  <strong>{Math.round(multiAngleConfig.rotation)}°</strong>
                </div>
                <div className="linghuiImageLibTVSliderRow">
                  <span>倾斜</span>
                  <input
                    type="range"
                    min={-90}
                    max={90}
                    step={1}
                    value={multiAngleConfig.tilt}
                    onChange={event => updateMultiAngle({ tilt: Number(event.target.value), presetKey: 'custom' })}
                  />
                  <strong>{Math.round(multiAngleConfig.tilt)}°</strong>
                </div>
                <div className="linghuiImageLibTVSliderRow">
                  <span>缩放</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={Math.round(multiAngleConfig.scale / 10)}
                    onChange={event => updateMultiAngle({ scale: Number(event.target.value) * 10, presetKey: 'custom' })}
                  />
                  <strong>{Math.round(multiAngleConfig.scale / 10)}</strong>
                </div>
                <div className="linghuiImageLibTVSwitchRow">
                  <span>广角镜头</span>
                  <button
                    type="button"
                    className={multiAngleConfig.isWideAngle ? 'isOn' : ''}
                    aria-label="广角镜头"
                    onClick={() => updateMultiAngle({ isWideAngle: !multiAngleConfig.isWideAngle, presetKey: 'custom' })}
                  />
                </div>
              </>
            )}
            <div className="linghuiImageLibTVSwitchRow">
              <span>提示词</span>
              <button
                type="button"
                className={multiAngleConfig.promptEnabled ? 'isOn' : ''}
                aria-label="提示词开关"
                onClick={() => updateMultiAngle({ promptEnabled: !multiAngleConfig.promptEnabled })}
              />
            </div>
            {multiAngleConfig.promptEnabled && (
              <textarea
                className="linghuiImageLibTVPromptBox"
                value={multiAngleConfig.prompt}
                placeholder="输入提示词..."
                onChange={event => updateMultiAngle({ prompt: event.target.value, presetKey: multiAngleConfig.prompt ? multiAngleConfig.presetKey : 'custom' })}
              />
            )}
          </div>
        </div>
        {renderLibTVToolFooter(handleConfirmMultiAngle)}
      </>
    ),
  }) : null;

  const relightToolPanel = isRelightToolOpen ? renderLibTVToolShell({
    title: '打光效果',
    className: 'isRelight',
    children: (
      <>
        <div className="linghuiImageLibTVPanelBody isRelightGrid">
          <div className="linghuiImageLibTVPreviewStage isLightingSphere linghuiImageLibTVLightingStage">
            <LinghuiLightingSpherePreview
              imageUrl={currentImagePreview}
              direction={relightValues.direction}
              brightness={relightValues.brightness}
              lightColor={relightValues.lightColor}
              rimLight={relightValues.rimLight}
              onDirectionChange={(direction) => {
                setRelightSceneActive(true);
                updateRelightValues({
                  direction,
                  rimLight: LIBTV_RELIGHT_BACK_DIRECTIONS.has(direction) ? false : relightValues.rimLight,
                });
              }}
            />
          </div>
          <div className="linghuiImageLibTVControlStack">
            <div className="linghuiImageLibTVSmartHeader">
              <span>全局</span>
              <span className={`linghuiImageLibTVActiveMark ${relightSceneActive ? 'isActive' : ''}`}>
                {relightSceneActive ? '已启用' : '默认'}
              </span>
            </div>
            <div className="linghuiImageLibTVSliderRow">
              <span>亮度</span>
              <input
                type="range"
                min={0}
                max={LIBTV_RELIGHT_BRIGHTNESS_STEPS.length - 1}
                step={1}
                value={Math.max(0, LIBTV_RELIGHT_BRIGHTNESS_STEPS.indexOf(relightValues.brightness as typeof LIBTV_RELIGHT_BRIGHTNESS_STEPS[number]))}
                onMouseDown={() => setRelightBrightnessActive(true)}
                onChange={event => {
                  setRelightBrightnessActive(true);
                  updateRelightValues({ brightness: LIBTV_RELIGHT_BRIGHTNESS_STEPS[Number(event.target.value)] ?? 50 });
                }}
              />
              <strong>{relightValues.brightness} %</strong>
            </div>
            <div className="linghuiImageLibTVColorRow">
              <span>颜色</span>
              <input
                type="color"
                aria-label="颜色"
                value={relightValues.lightColor}
                onChange={event => {
                  setRelightColorActive(true);
                  updateRelightValues({ lightColor: event.target.value });
                }}
              />
            </div>
            <div className="linghuiImageLibTVButtonGrid">
              {LIBTV_RELIGHT_MAIN_DIRECTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={relightValues.direction === value ? 'isActive' : ''}
                  onClick={() => {
                    setRelightSceneActive(true);
                    updateRelightValues({
                      direction: value,
                      rimLight: LIBTV_RELIGHT_BACK_DIRECTIONS.has(value) ? false : relightValues.rimLight,
                    });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="linghuiImageLibTVSwitchRow">
              <span>轮廓光</span>
              <button
                type="button"
                className={relightValues.rimLight ? 'isOn' : ''}
                aria-label="轮廓光"
                disabled={LIBTV_RELIGHT_BACK_DIRECTIONS.has(relightValues.direction)}
                onClick={() => updateRelightValues({ rimLight: !relightValues.rimLight })}
              />
            </div>
          </div>
          <div className="linghuiImageLibTVPresetColumn">
            <div className="linghuiImageLibTVSmartHeader">
              <span>智能模式</span>
              <button
                type="button"
                className={relightValues.smartMode ? 'isOn' : ''}
                aria-label="智能模式"
                onClick={() => updateRelightValues({ smartMode: !relightValues.smartMode })}
              />
            </div>
            {relightValues.smartMode && (
              <>
                <textarea
                  className="linghuiImageLibTVPromptBox"
                  placeholder="简单描述你想实现的打光效果，或者情绪风格"
                  value={relightPrompt}
                  onChange={event => setRelightPrompt(event.target.value)}
                />
                {relightReferenceImage ? (
                  <div className="linghuiImageLibTVReferencePreview">
                    <img src={getPreviewSource(relightReferenceImage)} alt="打光参考图" />
                    <button type="button" onClick={() => setRelightReferenceImage(null)} aria-label="移除参考图">
                      移除
                    </button>
                  </div>
                ) : (
                  <button type="button" className="linghuiImageLibTVReferenceButton" onClick={() => void handlePickRelightReferenceImage()}>
                    打光参考图
                  </button>
                )}
              </>
            )}
            <div className="linghuiImageLibTVSectionTitle">预设</div>
            <div className="linghuiImageLibTVPresetGrid">
              {relightPresets.map((preset: LinghuiImageToolPresetDef) => (
                <button
                  key={preset.label}
                  type="button"
                  className={relightPresetLabel === preset.label ? 'isActive' : ''}
                  onClick={() => applyRelightPreset(preset)}
                >
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        {renderLibTVToolFooter(handleApplyRelightPreset)}
      </>
    ),
  }) : null;

  const outpaintToolPanel = isOutpaintToolOpen ? renderLibTVToolShell({
    title: '扩图',
    className: 'isCompactTool',
    children: (
      <>
        <div className="linghuiImageLibTVPanelBody isTwoColumn">
          <div className="linghuiImageLibTVOutpaintStage">
            <div
              className={`linghuiImageToolOutpaintFrame ${
                outpaintAspectRatio === '16:9'
                  ? 'isWide'
                  : outpaintAspectRatio === '9:16'
                    ? 'isTall'
                    : ''
              }`}
            >
              {currentImagePreview ? (
                <img src={currentImagePreview} alt={currentImage?.label || nodeData.label} draggable={false} />
              ) : (
                <ImageIcon size={22} />
              )}
            </div>
          </div>
          <div className="linghuiImageLibTVControlStack">
            <div className="linghuiImageLibTVSectionTitle">扩图方式</div>
            <div className="linghuiImageLibTVPresetButtons">
              {outpaintPresets.map((preset: LinghuiImageToolPresetDef) => (
                <button
                  key={preset.label}
                  type="button"
                  className={outpaintPresetLabel === preset.label ? 'isActive' : ''}
                  onClick={() => handleSelectOutpaintPreset(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="linghuiImageLibTVSectionTitle">比例</div>
            <div className="linghuiImageLibTVPresetButtons">
              {aspectRatioChoices.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={outpaintAspectRatio === option.value ? 'isActive' : ''}
                  onClick={() => setOutpaintAspectRatio(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="linghuiImageLibTVSectionTitle">分辨率</div>
            <div className="linghuiImageLibTVPresetButtons">
              {IMAGE_RESOLUTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={outpaintResolution === option.value ? 'isActive' : ''}
                  onClick={() => setOutpaintResolution(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {renderLibTVToolFooter(handleApplyOutpaintPreset)}
      </>
    ),
  }) : null;

  const repaintToolPanel = isRepaintToolOpen ? renderLibTVToolShell({
    title: '重绘',
    className: 'isCompactTool',
    children: (
      <>
        <div className="linghuiImageLibTVPanelBody isTwoColumn">
          {renderImagePreviewStage()}
          <div className="linghuiImageLibTVControlStack">
            <div className="linghuiImageLibTVSectionTitle">重绘方式</div>
            <div className="linghuiImageLibTVPresetButtons">
              {repaintPresets.map((preset: LinghuiImageToolPresetDef) => (
                <button
                  key={preset.label}
                  type="button"
                  className={repaintPresetLabel === preset.label ? 'isActive' : ''}
                  onClick={() => setRepaintPresetLabel(preset.label)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <textarea
              className="linghuiImageLibTVPromptBox"
              value={repaintPrompt}
              placeholder="补充要修复、替换或迁移的具体方向"
              onChange={event => setRepaintPrompt(event.target.value)}
            />
            <div className="linghuiImageLibTVSectionTitle">比例</div>
            <div className="linghuiImageLibTVPresetButtons">
              {aspectRatioChoices.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={repaintAspectRatio === option.value ? 'isActive' : ''}
                  onClick={() => setRepaintAspectRatio(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {renderLibTVToolFooter(handleApplyRepaintPreset)}
      </>
    ),
  }) : null;

  const activeLibTVToolPanel = multiAngleToolPanel || relightToolPanel || outpaintToolPanel || repaintToolPanel;

  if (isImportMode) {
    // LibTV 1:1：素材节点本身已经展示图片 + 节点上方上传/工具浮按钮，编辑器面板不再重复显示大预览图，
    // 只保留"文件名 + 替换/清空"轻量操作行，避免反人类的"上下两张图"重复。
    return (
      <div className="linghuiEditorPanel" onMouseDown={event => event.stopPropagation()}>
        {activeLibTVToolPanel ?? (
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
        )}
      </div>
    );
  }

  return (
    <div className="linghuiEditorPanel" onMouseDown={event => event.stopPropagation()}>
      {activeLibTVToolPanel ?? (
        <>
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
            minHeight="64px"
            maxHeight="152px"
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
            classNames={{ root: 'linghuiNodeEditorDropdownMenu linghuiEditorModelDropdownMenu' }}
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

          <Popover
            trigger="click"
            placement="bottomRight"
            content={cameraSettingsContent}
            overlayClassName="linghuiEditorPopover"
            getPopupContainer={triggerNode => triggerNode.ownerDocument.body}
            zIndex={1200}
          >
            <button
              type="button"
              className="linghuiEditorInlineTrigger isCameraTrigger"
              title="选择镜头参数"
              onClick={event => event.stopPropagation()}
            >
              <Camera size={13} />
              <span>{cameraButtonSummary}</span>
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
        </>
      )}
    </div>
  );
};
