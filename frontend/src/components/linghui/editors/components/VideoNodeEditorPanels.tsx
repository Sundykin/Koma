import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Dropdown, Popover } from 'antd';
import type { MenuProps } from 'antd';
import { ArrowUp, Download } from 'lucide-react';
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
import { VideoAccessCard, TooltipLabel } from './VideoAccessCard';
import { VideoParameterPanel } from './VideoParameterPanel';

interface VideoToolSectionProps {
  activeTool: LinghuiVideoToolKey | null;
  onClose: () => void;
  onApplyPreset: (preset: VideoToolPreset) => void;
  presets: VideoToolPreset[];
}

export function VideoToolSection({
  activeTool,
  onClose,
  onApplyPreset,
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
  const upstreamSummary = [
    referenceImages.length > 0 ? `${referenceImages.length} 张图片` : '',
    referenceVideos.length > 0 ? `${referenceVideos.length} 条视频` : '',
    referenceAudios.length > 0 ? `${referenceAudios.length} 条音频` : '',
  ].filter(Boolean);
  const showCapabilitySwitcher = supportedCapabilities.length > 1;
  const selectedProvider = providers.find(option => option.value === selectedProviderValue) ?? providers[0];
  const modelSummary = selectedProvider?.label || '未配置视频模型';
  const parameterSummary = formatVideoParameterSummary({ aspectRatio, resolution, duration });

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
    <>
      {showCapabilitySwitcher ? (
        <div className="linghuiEditorRefModes">
          {supportedCapabilities.map(capability => (
            <button
              key={capability}
              type="button"
              className={`linghuiEditorRefModeTab ${videoCapability === capability ? 'isActive' : ''}`}
              onClick={() => onVideoCapabilityChange(capability)}
            >
              {getVideoCapabilityDescriptor(capability).label}
            </button>
          ))}
        </div>
      ) : null}

      {(!showCapabilitySwitcher || upstreamSummary.length > 0 || hasCurrentVideo) ? (
        <div className="linghuiEditorSection linghuiVideoEditorMetaSection">
          <div className="linghuiEditorSummaryRow">
            {!showCapabilitySwitcher ? (
              <span className="linghuiEditorSummaryPill">{capabilityDescriptor.label}</span>
            ) : null}
            {upstreamSummary.length > 0 ? upstreamSummary.map(item => (
              <span key={item} className="linghuiEditorSummaryPill">
                {item}
              </span>
            )) : null}
            {hasCurrentVideo ? (
              <span className="linghuiEditorSummaryPill">已有成片</span>
            ) : null}
            {isGenerating ? (
              <span className="linghuiEditorSummaryPill">{generateButtonText}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="linghuiEditorPrompt linghuiVideoEditorPrompt">
        <LinghuiPromptEditor
          value={prompt}
          onChange={onPromptChange}
          references={promptReferences}
          placeholder="描述镜头动作、节奏和风格，输入 @ 引用上游产物"
          surfaceStyle="fusion"
          minHeight="64px"
          maxHeight="152px"
        />
      </div>

      <div className="linghuiVideoEditorControlRow">
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
            className={`linghuiVideoEditorInlineTrigger ${providers.length === 0 ? 'isDisabled' : ''}`}
            title="选择视频模型"
            onClick={handleModelTriggerClick}
            disabled={providers.length === 0}
          >
            {modelSummary}
          </button>
        </Dropdown>

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
            className="linghuiVideoEditorInlineTrigger"
            title="选择视频参数"
            onClick={handleParamsTriggerClick}
          >
            {parameterSummary}
          </button>
        </Popover>
        <div
          className="linghuiEditorActionGroup nodrag nopan nowheel"
          onClick={handleActionGroupEvent}
          onMouseDown={handleActionGroupEvent}
          onPointerDown={handleActionGroupEvent}
          onPointerMove={handleActionGroupEvent}
        >
          {hasCurrentVideo ? (
            <Button
              size="small"
              className="nodrag nopan nowheel"
              icon={<Download size={12} />}
              onClick={onDownloadCurrentVideo}
            >
              下载
            </Button>
          ) : null}
          <Button
            type="primary"
            size="small"
            className="nodrag nopan nowheel"
            icon={isGenerating ? undefined : <ArrowUp size={12} />}
            onClick={onRun}
            loading={isGenerating}
            disabled={isGenerating || isRunActionLocked}
          >
            {generateButtonText}
          </Button>
        </div>
      </div>
    </>
  );
}
