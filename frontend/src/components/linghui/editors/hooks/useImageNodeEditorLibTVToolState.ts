import { useEffect, useMemo, useState } from 'react';
import type {
  LinghuiImageNodeProperties,
  LinghuiImageRelightConfig,
  LinghuiImageToolKey,
} from '../../../../types/linghui';
import {
  DEFAULT_LINGHUI_IMAGE_RELIGHT_CONFIG,
  DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG,
  normalizeLinghuiImageRelightConfig,
  normalizeLinghuiMultiAngleConfig,
} from '../../../../types/linghui';
import { LINGHUI_IMAGE_TOOL_PRESETS } from '../state/linghuiImageToolPresets';
import type { LinghuiImageOutpaintRatio } from '../components/ImageNodeEditorLibTVPanels';
import {
  type GenericToolKey,
  isGenericTool,
  LIBTV_MULTI_ANGLE_PRESETS,
} from '../components/ImageNodeEditorUtils';

export interface LinghuiImageCropAnchor {
  key: string;
  label: string;
  x: number;
  y: number;
}

export const LINGHUI_IMAGE_CROP_ANCHORS: LinghuiImageCropAnchor[] = [
  { key: 'top-left', label: '左上', x: 0, y: 0 },
  { key: 'top', label: '上', x: 0.5, y: 0 },
  { key: 'top-right', label: '右上', x: 1, y: 0 },
  { key: 'left', label: '左', x: 0, y: 0.5 },
  { key: 'center', label: '居中', x: 0.5, y: 0.5 },
  { key: 'right', label: '右', x: 1, y: 0.5 },
  { key: 'bottom-left', label: '左下', x: 0, y: 1 },
  { key: 'bottom', label: '下', x: 0.5, y: 1 },
  { key: 'bottom-right', label: '右下', x: 1, y: 1 },
];

interface UseImageNodeEditorLibTVToolStateArgs {
  props: LinghuiImageNodeProperties;
  aspectRatio: string;
  resolution: string;
  batchCount: number;
  activeTool: LinghuiImageToolKey | null;
  hasCurrentImage: boolean;
}

export function useImageNodeEditorLibTVToolState({
  props,
  aspectRatio,
  resolution,
  batchCount,
  activeTool,
  hasCurrentImage,
}: UseImageNodeEditorLibTVToolStateArgs) {
  const isMultiAngleToolOpen = activeTool === 'multi-angle' && hasCurrentImage;
  const isOutpaintToolOpen = activeTool === 'outpaint' && hasCurrentImage;
  const isRelightToolOpen = activeTool === 'relight' && hasCurrentImage;
  const isRepaintToolOpen = activeTool === 'repaint' && hasCurrentImage;
  const isGenericToolOpen = isGenericTool(activeTool) && hasCurrentImage;
  const genericTool: GenericToolKey | null = isGenericToolOpen ? (activeTool as GenericToolKey) : null;
  const multiAngleConfig = normalizeLinghuiMultiAngleConfig(props.multiAngle ?? DEFAULT_LINGHUI_MULTI_ANGLE_CONFIG);
  const multiAngleTTISelection = String(props.multiAngle?.ttiSelection ?? props.ttiSelection ?? '');
  const normalizedRelightConfig = useMemo(() => (
    normalizeLinghuiImageRelightConfig(props.relight ?? DEFAULT_LINGHUI_IMAGE_RELIGHT_CONFIG)
  ), [props.relight]);
  const relightPresets = LINGHUI_IMAGE_TOOL_PRESETS.relight.presets;
  const repaintPresets = LINGHUI_IMAGE_TOOL_PRESETS.repaint.presets;
  const outpaintPresets = LINGHUI_IMAGE_TOOL_PRESETS.outpaint.presets;
  const [outpaintPresetLabel, setOutpaintPresetLabel] = useState(outpaintPresets[0]?.label ?? '');
  const [outpaintAspectRatio, setOutpaintAspectRatio] = useState(String(outpaintPresets[0]?.properties?.aspectRatio ?? aspectRatio));
  const [outpaintResolution, setOutpaintResolution] = useState(String(outpaintPresets[0]?.properties?.resolution ?? resolution));
  const [outpaintBatchCount, setOutpaintBatchCount] = useState(batchCount);
  const [outpaintRatio, setOutpaintRatio] = useState<LinghuiImageOutpaintRatio>(
    () => props.outpaintRatio ?? { top: 0, right: 0.25, bottom: 0, left: 0.25 },
  );
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
  const [genericPresetLabel, setGenericPresetLabel] = useState('');
  const [genericAspectRatio, setGenericAspectRatio] = useState(aspectRatio);
  const [genericResolution, setGenericResolution] = useState(resolution);
  const [genericPrompt, setGenericPrompt] = useState('');
  const [genericCropAnchor, setGenericCropAnchor] = useState<LinghuiImageCropAnchor>(LINGHUI_IMAGE_CROP_ANCHORS[4]!);
  const multiAnglePreset = useMemo(() => (
    LIBTV_MULTI_ANGLE_PRESETS.find(preset => preset.key === multiAngleConfig.presetKey)
    ?? LIBTV_MULTI_ANGLE_PRESETS[0]
  ), [multiAngleConfig.presetKey]);

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

  useEffect(() => {
    if (!genericTool) return;
    const presets = LINGHUI_IMAGE_TOOL_PRESETS[genericTool].presets;
    const firstPreset = presets[0];
    setGenericPresetLabel(firstPreset?.label ?? '');
    setGenericAspectRatio(String(firstPreset?.properties?.aspectRatio ?? aspectRatio));
    setGenericResolution(String(firstPreset?.properties?.resolution ?? resolution));
    setGenericPrompt('');
    setGenericCropAnchor(LINGHUI_IMAGE_CROP_ANCHORS[4]!);
  }, [aspectRatio, genericTool, resolution]);

  return {
    genericAspectRatio,
    genericCropAnchor,
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
    setGenericCropAnchor,
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
  };
}
