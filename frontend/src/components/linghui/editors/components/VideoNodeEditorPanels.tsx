import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Dropdown, InputNumber, Popover } from 'antd';
import type { MenuProps } from 'antd';
import { ArrowUp, Download, FileAudio, Film, Image as ImageIcon, Settings2 } from 'lucide-react';
import {
  type LinghuiVideoCapability,
  type LinghuiVideoToolKey,
} from '../../../../types/linghui';
import type { LinghuiPromptReferenceItem } from '../state/linghuiPromptReferences';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import {
  VIDEO_TOOL_PRESETS,
  type ProviderOption,
  type VideoToolPreset,
  formatVideoParameterSummary,
} from '../state/videoNodeEditorShared';
import {
  getVideoCapabilityDescriptor,
  type VideoCapabilityDescriptor,
} from '../state/videoCapabilityUtils';
import {
  type VideoDurationSpec,
} from '../../../../providers/itv/durationSpec';
import { TooltipLabel } from './VideoAccessCard';
import { VideoParameterPanel } from './VideoParameterPanel';

interface VideoToolSectionProps {
  activeTool: LinghuiVideoToolKey | null;
  onClose: () => void;
  onApplyPreset: (preset: VideoToolPreset) => void;
  onExtractFrames?: (mode: 'first' | 'middle' | 'last' | 'triple') => void;
  onUpscaleVideo?: (factor: 2 | 4) => void;
  onCreateVideoAnalysis?: () => void;
  upscalingVideo?: boolean;
  clipRange: { start: number; end: number; duration: number };
  onClipRangeChange: (range: { start: number; end: number }) => void;
  onTrimVideo?: () => void;
  trimmingVideo?: boolean;
  extractingFrames?: boolean;
  presets: VideoToolPreset[];
}

export function VideoToolSection({
  activeTool,
  onClose,
  onApplyPreset,
  onExtractFrames,
  onUpscaleVideo,
  onCreateVideoAnalysis,
  upscalingVideo = false,
  clipRange,
  onClipRangeChange,
  onTrimVideo,
  trimmingVideo = false,
  extractingFrames = false,
  presets,
}: VideoToolSectionProps) {
  if (!activeTool) return null;

  const toolDef = VIDEO_TOOL_PRESETS[activeTool];

  return (
    <div className="linghuiEditorSection linghuiEditorToolSection">
      <div className="linghuiEditorToolPanel">
        <div className="linghuiEditorToolPanelHeader">
          <TooltipLabel
            label={toolDef.title}
            tooltip={toolDef.description}
          />
          <Button size="small" onClick={onClose}>
            收起
          </Button>
        </div>

        {activeTool === 'upscale' ? (
          <div className="linghuiEditorToolPresetList">
            {[
              { factor: 2 as const, label: '高清 2x', description: '本地放大视频宽高，适合快速提升参考素材清晰度。' },
              { factor: 4 as const, label: '高清 4x', description: '更高倍率放大，耗时更长，适合短视频片段。' },
            ].map(item => (
              <div key={item.factor} className="linghuiEditorToolPresetCard">
                <div className="linghuiEditorToolPresetBody">
                  <TooltipLabel label={item.label} tooltip={item.description} />
                  <div className="linghuiEditorToolPresetDesc">{item.description}</div>
                </div>
                <Button
                  type="primary"
                  size="small"
                  aria-label={`放大${item.factor}倍`}
                  loading={upscalingVideo}
                  disabled={!onUpscaleVideo || upscalingVideo}
                  onClick={() => onUpscaleVideo?.(item.factor)}
                >
                  放大
                </Button>
              </div>
            ))}
          </div>
        ) : activeTool === 'clip' ? (
          <div className="linghuiEditorToolPresetList">
            <div className="linghuiEditorToolPresetCard isVideoClipRange">
              <div className="linghuiEditorToolPresetBody">
                <TooltipLabel label="片段范围" tooltip="从当前视频裁出一个独立片段，并派生为新的视频节点。" />
                <div className="linghuiEditorToolPresetDesc">
                  视频时长 {clipRange.duration.toFixed(1)}s
                </div>
              </div>
              <div className="linghuiVideoClipRangeControls">
                <label>
                  <span>开始</span>
                  <InputNumber
                    size="small"
                    min={0}
                    max={Math.max(0, clipRange.duration - 0.1)}
                    step={0.1}
                    value={clipRange.start}
                    controls={false}
                    onChange={value => onClipRangeChange({ start: Number(value ?? 0), end: clipRange.end })}
                  />
                  <em>s</em>
                </label>
                <label>
                  <span>结束</span>
                  <InputNumber
                    size="small"
                    min={0.1}
                    max={Math.max(0.1, clipRange.duration)}
                    step={0.1}
                    value={clipRange.end}
                    controls={false}
                    onChange={value => onClipRangeChange({ start: clipRange.start, end: Number(value ?? clipRange.end) })}
                  />
                  <em>s</em>
                </label>
                <Button
                  type="primary"
                  size="small"
                  aria-label="裁剪"
                  loading={trimmingVideo}
                  disabled={!onTrimVideo || trimmingVideo || clipRange.end <= clipRange.start}
                  onClick={onTrimVideo}
                >
                  裁剪
                </Button>
              </div>
            </div>
          </div>
        ) : activeTool === 'screenshot' ? (
          <div className="linghuiEditorToolPresetList">
            {[
              { key: 'first' as const, label: '首帧', description: '抽取视频开头画面，适合继续做图生视频首帧。' },
              { key: 'middle' as const, label: '中帧', description: '抽取视频中段关键画面，适合生成封面或延展构图。' },
              { key: 'last' as const, label: '尾帧', description: '抽取视频结尾画面，适合做首尾帧视频的末帧。' },
              { key: 'triple' as const, label: '首中尾', description: '一次抽取 3 张关键帧，派生成图片节点组。' },
            ].map(item => (
              <div key={item.key} className="linghuiEditorToolPresetCard">
                <div className="linghuiEditorToolPresetBody">
                  <TooltipLabel label={item.label} tooltip={item.description} />
                  <div className="linghuiEditorToolPresetDesc">{item.description}</div>
                </div>
                <Button
                  type="primary"
                  size="small"
                  aria-label={`抽取${item.label}`}
                  loading={extractingFrames}
                  disabled={!onExtractFrames || extractingFrames}
                  onClick={() => onExtractFrames?.(item.key)}
                >
                  抽取
                </Button>
              </div>
            ))}
          </div>
        ) : activeTool === 'analyze' ? (
          <div className="linghuiEditorToolPresetList">
            <div className="linghuiEditorToolPresetCard">
              <div className="linghuiEditorToolPresetBody">
                <TooltipLabel
                  label="生成解析节点"
                  tooltip="基于当前视频、时长、上游参考和提示词派生一个文本节点，继续整理镜头解析与生成提示词。"
                />
                <div className="linghuiEditorToolPresetDesc">
                  派生可编辑文本节点，不覆盖当前视频提示词。
                </div>
              </div>
              <Button
                type="primary"
                size="small"
                aria-label="生成视频解析节点"
                disabled={!onCreateVideoAnalysis}
                onClick={onCreateVideoAnalysis}
              >
                生成
              </Button>
            </div>
          </div>
        ) : (
        <div className="linghuiEditorToolPresetList">
          {presets.map(preset => (
            <div key={preset.label} className="linghuiEditorToolPresetCard">
              <div className="linghuiEditorToolPresetBody">
                <TooltipLabel
                  label={preset.label}
                  tooltip={preset.description}
                />
                <div className="linghuiEditorToolPresetDesc">{preset.description}</div>
              </div>
              <Button
                type="primary"
                size="small"
                onClick={() => onApplyPreset(preset)}
              >
                应用
              </Button>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}

interface VideoPassThroughPanelProps {
  source: string;
  posterSource?: string;
  onDownload?: () => void;
}

export function VideoPassThroughPanel({
  source,
  posterSource,
  onDownload,
}: VideoPassThroughPanelProps) {
  // LibTV 1:1：视频参考节点本身已经在画布上显示视频 + 节点上方"上传"浮按钮，
  // 编辑器面板不再重复渲染大预览图（反人类的"上下两张视频"）。
  // 只保留轻量的"在播放器打开 / 打开所在位置 / 下载"单行操作，
  // 复用 VideoAccessCard 但通过 emptyDescription 把 placeholder 收成 24px icon。
  const sourceLabel = source.split(/[\\/]/).pop() || '视频文件';

  return (
    <div className="linghuiEditorSection linghuiEditorSection--passThroughCompact">
      <div className="linghuiEditorControlRow">
        <span className="linghuiEditorSummaryPill" title={source}>
          {sourceLabel}
        </span>
        {onDownload ? (
          <div className="linghuiEditorActionGroup">
            <Button size="small" onClick={onDownload} icon={<Download size={14} />}>
              下载
            </Button>
          </div>
        ) : null}
      </div>
      {/* posterSource 暂时不渲染——节点缩略图已经能看到首帧。 */}
      {posterSource ? null : null}
    </div>
  );
}

interface VideoGeneratePanelProps {
  videoCapability: LinghuiVideoCapability;
  supportedCapabilities: LinghuiVideoCapability[];
  capabilityDescriptor: VideoCapabilityDescriptor;
  onVideoCapabilityChange: (capability: LinghuiVideoCapability) => void;
  referenceImages: Array<{ source?: string; label?: string }>;
  referenceVideos: Array<{ source?: string; posterSource?: string; label?: string }>;
  referenceAudios: Array<{ source?: string; label?: string }>;
  prompt: string;
  onPromptChange: (value: string) => void;
  promptReferences: LinghuiPromptReferenceItem[];
  providers: ProviderOption[];
  selectedProviderValue: string;
  aspectRatio: string;
  resolution: string;
  duration: number;
  durationSpec: VideoDurationSpec;
  hasCurrentVideo: boolean;
  isGenerating: boolean;
  isRunActionLocked: boolean;
  generateButtonText: string;
  onDownloadCurrentVideo: () => void;
  onUpdateProvider: (value: string) => void;
  onUpdateAspectRatio: (value: string) => void;
  onUpdateResolution: (value: string) => void;
  onUpdateDuration: (value: number) => void;
  onRun: () => void;
  canvasInteractionVersion?: number;
}

const DROPDOWN_ROOT_CLASS_NAME = 'linghuiNodeEditorDropdownMenu linghuiEditorModelDropdownMenu linghuiVideoEditorDropdownMenu';
const NODE_EDITOR_POPUP_Z_INDEX = 1500;
const POPUP_ROOT_STYLE = { zIndex: NODE_EDITOR_POPUP_Z_INDEX } as const;

export function VideoGeneratePanel({
  videoCapability,
  supportedCapabilities,
  capabilityDescriptor,
  onVideoCapabilityChange,
  referenceImages,
  referenceVideos,
  referenceAudios,
  prompt,
  onPromptChange,
  promptReferences,
  providers,
  selectedProviderValue,
  aspectRatio,
  resolution,
  duration,
  durationSpec,
  hasCurrentVideo,
  isGenerating,
  isRunActionLocked,
  generateButtonText,
  onDownloadCurrentVideo,
  onUpdateProvider,
  onUpdateAspectRatio,
  onUpdateResolution,
  onUpdateDuration,
  onRun,
  canvasInteractionVersion = 0,
}: VideoGeneratePanelProps) {
  const [openPanel, setOpenPanel] = useState<'model' | 'params' | null>(null);
  const showCapabilitySwitcher = supportedCapabilities.length > 1;
  const selectedProvider = providers.find(option => option.value === selectedProviderValue) ?? providers[0];
  const modelSummary = selectedProvider?.label || '未配置视频模型';
  const parameterSummary = formatVideoParameterSummary({ aspectRatio, resolution, duration });
  const referenceCards = useMemo(() => {
    const promptCards = promptReferences.map((reference, index) => ({
      id: reference.id,
      kind: reference.kind,
      name: reference.name,
      badge: String(index + 1),
      preview: reference.previewSource || (typeof reference.source === 'string' ? reference.source : ''),
    }));
    if (promptCards.length > 0) return promptCards;
    return [
      ...referenceImages.map((reference, index) => ({
        id: `image-${index}`,
        kind: 'image' as const,
        name: reference.label || `图片 ${index + 1}`,
        badge: String(index + 1),
        preview: reference.source || '',
      })),
      ...referenceVideos.map((reference, index) => ({
        id: `video-${index}`,
        kind: 'video' as const,
        name: reference.label || `视频 ${index + 1}`,
        badge: String(index + 1),
        preview: reference.posterSource || reference.source || '',
      })),
      ...referenceAudios.map((reference, index) => ({
        id: `audio-${index}`,
        kind: 'audio' as const,
        name: reference.label || `音频 ${index + 1}`,
        badge: String(index + 1),
        preview: reference.source || '',
      })),
    ];
  }, [promptReferences, referenceAudios, referenceImages, referenceVideos]);

  const modelMenuItems = useMemo<MenuProps['items']>(() => (
    providers.map(provider => ({
      key: provider.value,
      label: (
        <div className="linghuiNodeEditorDropdownOption isModelOption">
          <span className="linghuiNodeEditorDropdownIcon" aria-hidden="true">视</span>
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
        setOpenPanel(null);
        onUpdateProvider(provider.value);
      },
    }))
  ), [onUpdateProvider, providers]);
  const modelMenu = useMemo<MenuProps>(() => ({
    items: modelMenuItems,
    selectable: true,
    selectedKeys: selectedProvider ? [selectedProvider.value] : [],
  }), [modelMenuItems, selectedProvider]);
  const resolvePopupContainer = useCallback((triggerNode: HTMLElement) => triggerNode.ownerDocument.body, []);
  const handleModelOpenChange = useCallback((nextOpen: boolean) => {
    setOpenPanel(nextOpen ? 'model' : null);
  }, []);
  const handleParamsOpenChange = useCallback((nextOpen: boolean) => {
    setOpenPanel(nextOpen ? 'params' : null);
  }, []);
  const handleModelTriggerClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setOpenPanel(current => current === 'model' ? null : 'model');
  }, []);
  const handleParamsTriggerClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setOpenPanel(current => current === 'params' ? null : 'params');
  }, []);
  const handleActionGroupEvent = useCallback((event: React.SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  useEffect(() => {
    setOpenPanel(null);
  }, [
    canvasInteractionVersion,
    selectedProviderValue,
    videoCapability,
  ]);

  const parameterContent = useMemo(() => (
    <VideoParameterPanel
      aspectRatio={aspectRatio}
      resolution={resolution}
      duration={duration}
      durationSpec={durationSpec}
      onUpdateAspectRatio={onUpdateAspectRatio}
      onUpdateResolution={onUpdateResolution}
      onUpdateDuration={onUpdateDuration}
      onClose={() => setOpenPanel(null)}
    />
  ), [aspectRatio, resolution, duration, durationSpec, onUpdateAspectRatio, onUpdateResolution, onUpdateDuration]);

  return (
    <div
      className="linghuiEditorPanel linghuiVideoGeneratorPanel"
      onMouseDown={event => event.stopPropagation()}
    >
      {showCapabilitySwitcher ? (
        <div className="linghuiVideoGeneratorModes" aria-label="视频生成方式">
          {supportedCapabilities.map(capability => (
            <button
              key={capability}
              type="button"
              className={`linghuiVideoGeneratorModeTab ${videoCapability === capability ? 'isActive' : ''}`}
              onClick={() => onVideoCapabilityChange(capability)}
            >
              {getVideoCapabilityDescriptor(capability).label}
            </button>
          ))}
        </div>
      ) : null}

      {!showCapabilitySwitcher ? (
        <div className="linghuiVideoGeneratorStatusRow">
          <span className="linghuiVideoGeneratorStatusPill">{capabilityDescriptor.label}</span>
          {hasCurrentVideo ? <span className="linghuiVideoGeneratorStatusPill">已有成片</span> : null}
          {isGenerating ? <span className="linghuiVideoGeneratorStatusPill">{generateButtonText}</span> : null}
        </div>
      ) : null}

      {referenceCards.length > 0 ? (
        <div className="linghuiVideoGeneratorRefs" aria-label="上游参考">
          {referenceCards.map(reference => (
            <div className="linghuiVideoGeneratorRefCard" key={reference.id} title={reference.name}>
              <div className="linghuiVideoGeneratorRefThumb">
                {reference.kind === 'image' && reference.preview ? (
                  <img src={reference.preview} alt="" draggable={false} />
                ) : reference.kind === 'video' && reference.preview ? (
                  <img src={reference.preview} alt="" draggable={false} />
                ) : reference.kind === 'video' ? (
                  <Film size={14} />
                ) : reference.kind === 'audio' ? (
                  <FileAudio size={14} />
                ) : (
                  <ImageIcon size={14} />
                )}
                <span className="linghuiVideoGeneratorRefBadge">{reference.badge}</span>
              </div>
              <span className="linghuiVideoGeneratorRefName">{reference.name}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="linghuiEditorPrompt linghuiVideoGeneratorPrompt">
        <LinghuiPromptEditor
          value={prompt}
          onChange={onPromptChange}
          references={promptReferences}
          placeholder="描述你想要生成的画面内容，@ 引用素材"
          surfaceStyle="fusion"
          minHeight="82px"
          maxHeight="168px"
        />
      </div>

      <div className="linghuiEditorControlRow linghuiVideoGeneratorControlRow">
        <Dropdown
          open={providers.length > 0 && openPanel === 'model'}
          trigger={[]}
          menu={modelMenu}
          classNames={{ root: DROPDOWN_ROOT_CLASS_NAME }}
          getPopupContainer={resolvePopupContainer}
          styles={{ root: POPUP_ROOT_STYLE }}
          onOpenChange={handleModelOpenChange}
        >
          <button
            type="button"
            className={`linghuiVideoGeneratorChip ${providers.length === 0 ? 'isDisabled' : ''}`}
            title={modelSummary}
            onClick={handleModelTriggerClick}
            disabled={providers.length === 0}
          >
            {modelSummary}
          </button>
        </Dropdown>

        <div className="linghuiVideoGeneratorSpacer" />

        {hasCurrentVideo ? (
          <button
            type="button"
            className="linghuiVideoGeneratorIconButton"
            onClick={onDownloadCurrentVideo}
            aria-label="下载视频"
            title="下载视频"
          >
            <Download size={14} />
          </button>
        ) : null}

        <Popover
          open={openPanel === 'params'}
          trigger={[]}
          placement="bottomRight"
          content={parameterContent}
          overlayClassName="linghuiVideoEditorPopover"
          getPopupContainer={resolvePopupContainer}
          zIndex={NODE_EDITOR_POPUP_Z_INDEX}
          onOpenChange={handleParamsOpenChange}
        >
          <button
            type="button"
            className="linghuiVideoGeneratorIconButton"
            title={parameterSummary}
            aria-label={parameterSummary}
            onClick={handleParamsTriggerClick}
          >
            <Settings2 size={14} />
          </button>
        </Popover>

        <div
          className="linghuiEditorActionGroup nodrag nopan nowheel"
          onClick={handleActionGroupEvent}
          onMouseDown={handleActionGroupEvent}
          onPointerDown={handleActionGroupEvent}
          onPointerMove={handleActionGroupEvent}
        >
          <button
            type="button"
            className="linghuiVideoGeneratorSubmit nodrag nopan nowheel"
            onClick={onRun}
            disabled={isGenerating || isRunActionLocked}
            aria-label={generateButtonText}
            title={generateButtonText}
          >
            {isGenerating ? (
              <span className="linghuiVideoGeneratorSpinner" />
            ) : (
              <ArrowUp size={13} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
