import { useCallback, useEffect } from 'react';
import type {
  LinghuiExecuteMultiAngleOptions,
  LinghuiImageNodeProperties,
  LinghuiImageRelightConfig,
  LinghuiImageToolKey,
  LinghuiMultiAngleMode,
  LinghuiNodeData,
} from '../../../../types/linghui';
import {
  DEFAULT_LINGHUI_IMAGE_RELIGHT_CONFIG,
  normalizeLinghuiImageRelightConfig,
  normalizeLinghuiMultiAngleConfig,
} from '../../../../types/linghui';
import {
  LINGHUI_IMAGE_TOOL_PRESETS,
  type LinghuiImageToolPresetDef,
} from '../state/linghuiImageToolPresets';
import {
  LIBTV_MULTI_ANGLE_PRESETS,
  mergePromptSnippet,
} from '../components/ImageNodeEditorUtils';
import {
  applyImageToolPresetOrRun,
  buildOutpaintPromptSnippet,
} from '../state/imageNodeEditorLibTVToolApply';
import { useImageNodeEditorLibTVToolState } from './useImageNodeEditorLibTVToolState';

interface ImageNodeEditorProviderOption {
  value: string;
}

interface UseImageNodeEditorLibTVToolsArgs {
  nodeId: string;
  props: LinghuiImageNodeProperties;
  aspectRatio: string;
  resolution: string;
  batchCount: number;
  activeTool: LinghuiImageToolKey | null;
  hasCurrentImage: boolean;
  multiAngleProviders: ImageNodeEditorProviderOption[];
  message: { info: (content: string) => void };
  onToolChange: (tool: LinghuiImageToolKey | null) => void;
  onExecuteMultiAngle?: (options?: LinghuiExecuteMultiAngleOptions) => void;
  onApplyImageToolPreset?: (preset: {
    label?: string;
    promptSnippet: string;
    properties?: Partial<LinghuiImageNodeProperties>;
  }) => void;
  onExecuteImageCrop?: (nodeId: string, options: { aspectRatio: string; label?: string }) => void;
  handleRun: () => void;
  updateNodeData: (
    nodeId: string,
    updater: (previous: LinghuiNodeData) => LinghuiNodeData,
    options?: { markStale?: boolean },
  ) => void;
  updateProp: (key: string, value: unknown, options?: { markStale?: boolean }) => void;
}

export function useImageNodeEditorLibTVTools({
  nodeId,
  props,
  aspectRatio,
  resolution,
  batchCount,
  activeTool,
  hasCurrentImage,
  multiAngleProviders,
  message,
  onToolChange,
  onExecuteMultiAngle,
  onApplyImageToolPreset,
  onExecuteImageCrop,
  handleRun,
  updateNodeData,
  updateProp,
}: UseImageNodeEditorLibTVToolsArgs) {
  const state = useImageNodeEditorLibTVToolState({
    activeTool,
    aspectRatio,
    batchCount,
    hasCurrentImage,
    props,
    resolution,
  });
  const {
    genericAspectRatio,
    genericPresetLabel,
    genericPrompt,
    genericResolution,
    genericTool,
    isGenericToolOpen,
    isMultiAngleToolOpen,
    isOutpaintToolOpen,
    isRelightToolOpen,
    isRepaintToolOpen,
    multiAngleConfig,
    multiAnglePreset,
    multiAngleTTISelection,
    outpaintAspectRatio,
    outpaintBatchCount,
    outpaintPresetLabel,
    outpaintPresets,
    outpaintRatio,
    outpaintResolution,
    relightBrightnessActive,
    relightColorActive,
    relightAspectRatio,
    relightPresetLabel,
    relightPresets,
    relightPrompt,
    relightReferenceImage,
    relightResolution,
    relightSceneActive,
    relightValues,
    repaintAspectRatio,
    repaintBatchCount,
    repaintPresetLabel,
    repaintPresets,
    repaintPrompt,
    repaintResolution,
    setGenericAspectRatio,
    setGenericPresetLabel,
    setGenericPrompt,
    setGenericResolution,
    setOutpaintAspectRatio,
    setOutpaintPresetLabel,
    setOutpaintRatio,
    setOutpaintResolution,
    setRelightAspectRatio,
    setRelightBrightnessActive,
    setRelightColorActive,
    setRelightPrompt,
    setRelightPresetLabel,
    setRelightReferenceImage,
    setRelightResolution,
    setRelightSceneActive,
    setRelightValues,
    setRepaintAspectRatio,
    setRepaintPresetLabel,
    setRepaintPrompt,
  } = state;

  const handleCloseLibTVToolPanel = useCallback(() => {
    onToolChange(null);
  }, [onToolChange]);

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

    applyImageToolPresetOrRun({
      handleRun,
      label: preset.label,
      nodeId,
      onApplyImageToolPreset,
      onToolChange,
      promptSnippet,
      properties: nextProperties,
      updateNodeData,
    });
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

  const handleSelectGenericPreset = useCallback((preset: LinghuiImageToolPresetDef) => {
    setGenericPresetLabel(preset.label);
    // 选 preset 时同步当前比例（保持 LibTV 同源体验）
    if (preset.properties?.aspectRatio) {
      setGenericAspectRatio(String(preset.properties.aspectRatio));
    }
    if (preset.properties?.resolution) {
      setGenericResolution(String(preset.properties.resolution));
    }
  }, []);

  const handleApplyOutpaintPreset = useCallback(() => {
    const preset = outpaintPresets.find(item => item.label === outpaintPresetLabel) ?? outpaintPresets[0];
    if (!preset) {
      message.info('暂无可用扩图预设');
      return;
    }

    const mergedSnippet = buildOutpaintPromptSnippet(preset.promptSnippet, outpaintRatio);

    const nextProperties: Partial<LinghuiImageNodeProperties> = {
      ...(preset.properties ?? {}),
      aspectRatio: outpaintAspectRatio,
      resolution: outpaintResolution,
      batchCount: outpaintBatchCount,
      outpaintRatio,
    };

    applyImageToolPresetOrRun({
      handleRun,
      label: preset.label,
      nodeId,
      onApplyImageToolPreset,
      onToolChange,
      promptSnippet: mergedSnippet,
      properties: nextProperties,
      updateNodeData,
    });
  }, [
    handleRun,
    message,
    nodeId,
    onApplyImageToolPreset,
    onToolChange,
    outpaintAspectRatio,
    outpaintBatchCount,
    outpaintPresetLabel,
    outpaintRatio,
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

    applyImageToolPresetOrRun({
      handleRun,
      label: preset.label,
      nodeId,
      onApplyImageToolPreset,
      onToolChange,
      promptSnippet,
      properties: nextProperties,
      updateNodeData,
    });
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

  const handleApplyGenericPreset = useCallback(() => {
    if (!genericTool) return;
    const presets = LINGHUI_IMAGE_TOOL_PRESETS[genericTool].presets;
    const preset = presets.find(item => item.label === genericPresetLabel) ?? presets[0];
    if (!preset) {
      message.info(`暂无可用 ${LINGHUI_IMAGE_TOOL_PRESETS[genericTool].title} 预设`);
      return;
    }

    if (preset.localAction === 'crop' && onExecuteImageCrop) {
      onExecuteImageCrop(nodeId, {
        aspectRatio: String(preset.properties?.aspectRatio ?? genericAspectRatio),
        label: preset.label,
      });
      onToolChange(null);
      return;
    }

    const promptSnippet = genericPrompt.trim()
      ? mergePromptSnippet(preset.promptSnippet, genericPrompt)
      : preset.promptSnippet;

    const nextProperties: Partial<LinghuiImageNodeProperties> = {
      ...(preset.properties ?? {}),
      aspectRatio: genericAspectRatio,
      resolution: genericResolution,
    };

    applyImageToolPresetOrRun({
      handleRun,
      label: preset.label,
      nodeId,
      onApplyImageToolPreset,
      onToolChange,
      promptSnippet,
      properties: nextProperties,
      updateNodeData,
    });
  }, [
    genericAspectRatio,
    genericPresetLabel,
    genericPrompt,
    genericResolution,
    genericTool,
    handleRun,
    message,
    nodeId,
    onApplyImageToolPreset,
    onExecuteImageCrop,
    onToolChange,
    updateNodeData,
  ]);

  return {
    applyMultiAnglePreset,
    applyRelightPreset,
    genericAspectRatio,
    genericPresetLabel,
    genericPrompt,
    genericResolution,
    genericTool,
    handleApplyGenericPreset,
    handleApplyOutpaintPreset,
    handleApplyRelightPreset,
    handleApplyRepaintPreset,
    handleCloseLibTVToolPanel,
    handleConfirmMultiAngle,
    handleSelectGenericPreset,
    handleSelectOutpaintPreset,
    isGenericToolOpen,
    isMultiAngleToolOpen,
    isOutpaintToolOpen,
    isRelightToolOpen,
    isRepaintToolOpen,
    multiAngleConfig,
    outpaintAspectRatio,
    outpaintPresetLabel,
    outpaintPresets,
    outpaintRatio,
    outpaintResolution,
    relightBrightnessActive,
    relightColorActive,
    relightPresetLabel,
    relightPresets,
    relightPrompt,
    relightReferenceImage,
    relightSceneActive,
    relightValues,
    repaintAspectRatio,
    repaintPresetLabel,
    repaintPresets,
    repaintPrompt,
    setGenericAspectRatio,
    setGenericPrompt,
    setGenericResolution,
    setMultiAngleMode,
    setOutpaintAspectRatio,
    setOutpaintRatio,
    setOutpaintResolution,
    setRelightBrightnessActive,
    setRelightColorActive,
    setRelightPrompt,
    setRelightReferenceImage,
    setRelightSceneActive,
    setRepaintAspectRatio,
    setRepaintPresetLabel,
    setRepaintPrompt,
    updateMultiAngle,
    updateRelightValues,
  };
}

export type ImageNodeEditorLibTVTools = ReturnType<typeof useImageNodeEditorLibTVTools>;
