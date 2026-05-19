import type { ReactNode } from 'react';
import type { LinghuiImageRelightConfig } from '../../../../types/linghui';
import {
  ImageNodeEditorMultiAnglePanel,
  ImageNodeEditorRelightPanel,
} from './ImageNodeEditorAngleRelightPanels';
import {
  ImageNodeEditorGenericPanel,
  ImageNodeEditorOutpaintPanel,
  ImageNodeEditorRepaintPanel,
} from './ImageNodeEditorLibTVPanels';
import type { ImageNodeEditorLibTVTools } from '../hooks/useImageNodeEditorLibTVTools';
import {
  getPreviewSource,
  LIBTV_MULTI_ANGLE_PRESETS,
  LIBTV_RELIGHT_BACK_DIRECTIONS,
  LIBTV_RELIGHT_BRIGHTNESS_STEPS,
  LIBTV_RELIGHT_MAIN_DIRECTIONS,
} from './ImageNodeEditorUtils';

interface ImageNodeEditorLibTVToolPanelHostProps {
  currentImagePreview: string;
  imageAlt: string;
  aspectRatioChoices: Array<{ value: string; label: string }>;
  tools: ImageNodeEditorLibTVTools;
  onPickRelightReferenceImage: () => void;
}

export function renderImageNodeEditorLibTVToolPanel({
  currentImagePreview,
  imageAlt,
  aspectRatioChoices,
  tools,
  onPickRelightReferenceImage,
}: ImageNodeEditorLibTVToolPanelHostProps): ReactNode {
  if (tools.isMultiAngleToolOpen) {
    return (
      <ImageNodeEditorMultiAnglePanel
        currentImagePreview={currentImagePreview}
        presets={LIBTV_MULTI_ANGLE_PRESETS}
        multiAngleConfig={tools.multiAngleConfig}
        onApplyPreset={tools.applyMultiAnglePreset}
        onSetMode={tools.setMultiAngleMode}
        onUpdateMultiAngle={tools.updateMultiAngle}
        onGenerate={tools.handleConfirmMultiAngle}
        onClose={tools.handleCloseLibTVToolPanel}
      />
    );
  }

  if (tools.isRelightToolOpen) {
    return (
      <ImageNodeEditorRelightPanel
        currentImagePreview={currentImagePreview}
        relightValues={tools.relightValues as LinghuiImageRelightConfig}
        relightSceneActive={tools.relightSceneActive}
        relightPrompt={tools.relightPrompt}
        relightReferenceImage={tools.relightReferenceImage}
        relightPresetLabel={tools.relightPresetLabel}
        relightPresets={tools.relightPresets}
        mainDirections={LIBTV_RELIGHT_MAIN_DIRECTIONS}
        backDirections={LIBTV_RELIGHT_BACK_DIRECTIONS}
        brightnessSteps={LIBTV_RELIGHT_BRIGHTNESS_STEPS}
        getPreviewSource={getPreviewSource}
        onSetRelightSceneActive={tools.setRelightSceneActive}
        onSetRelightBrightnessActive={tools.setRelightBrightnessActive}
        onSetRelightColorActive={tools.setRelightColorActive}
        onUpdateRelightValues={tools.updateRelightValues}
        onSetRelightPrompt={tools.setRelightPrompt}
        onSetRelightReferenceImage={tools.setRelightReferenceImage}
        onPickRelightReferenceImage={onPickRelightReferenceImage}
        onApplyRelightPreset={tools.applyRelightPreset}
        onGenerate={tools.handleApplyRelightPreset}
        onClose={tools.handleCloseLibTVToolPanel}
      />
    );
  }

  if (tools.isOutpaintToolOpen) {
    return (
      <ImageNodeEditorOutpaintPanel
        currentImagePreview={currentImagePreview}
        imageAlt={imageAlt}
        aspectRatioChoices={aspectRatioChoices}
        outpaintPresets={tools.outpaintPresets}
        outpaintPresetLabel={tools.outpaintPresetLabel}
        outpaintAspectRatio={tools.outpaintAspectRatio}
        outpaintResolution={tools.outpaintResolution}
        outpaintRatio={tools.outpaintRatio}
        setOutpaintAspectRatio={tools.setOutpaintAspectRatio}
        setOutpaintResolution={tools.setOutpaintResolution}
        setOutpaintRatio={tools.setOutpaintRatio}
        onSelectOutpaintPreset={tools.handleSelectOutpaintPreset}
        onGenerate={tools.handleApplyOutpaintPreset}
        onClose={tools.handleCloseLibTVToolPanel}
      />
    );
  }

  if (tools.isRepaintToolOpen) {
    return (
      <ImageNodeEditorRepaintPanel
        currentImagePreview={currentImagePreview}
        imageAlt={imageAlt}
        aspectRatioChoices={aspectRatioChoices}
        repaintPresets={tools.repaintPresets}
        repaintPresetLabel={tools.repaintPresetLabel}
        repaintPrompt={tools.repaintPrompt}
        repaintAspectRatio={tools.repaintAspectRatio}
        setRepaintPresetLabel={tools.setRepaintPresetLabel}
        setRepaintPrompt={tools.setRepaintPrompt}
        setRepaintAspectRatio={tools.setRepaintAspectRatio}
        onGenerate={tools.handleApplyRepaintPreset}
        onClose={tools.handleCloseLibTVToolPanel}
      />
    );
  }

  if (tools.isGenericToolOpen && tools.genericTool) {
    return (
      <ImageNodeEditorGenericPanel
        tool={tools.genericTool}
        currentImagePreview={currentImagePreview}
        imageAlt={imageAlt}
        aspectRatioChoices={aspectRatioChoices}
        genericPresetLabel={tools.genericPresetLabel}
        genericCropAnchor={tools.genericCropAnchor}
        genericPrompt={tools.genericPrompt}
        genericAspectRatio={tools.genericAspectRatio}
        genericResolution={tools.genericResolution}
        onSelectGenericPreset={tools.handleSelectGenericPreset}
        setGenericCropAnchor={tools.setGenericCropAnchor}
        setGenericPrompt={tools.setGenericPrompt}
        setGenericAspectRatio={tools.setGenericAspectRatio}
        setGenericResolution={tools.setGenericResolution}
        onGenerate={tools.handleApplyGenericPreset}
        onClose={tools.handleCloseLibTVToolPanel}
      />
    );
  }

  return null;
}
