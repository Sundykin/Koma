import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { InfoCircleOutlined } from '@ant-design/icons';
import { App, Button, Dropdown, Popover, Slider, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { ArrowUp, Download, Film } from 'lucide-react';
import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_RESOLUTIONS,
  type LinghuiVideoCapability,
  type LinghuiVideoToolKey,
} from '../../../../types/linghui';
import { electronService } from '../../../../services/electronService';
import { fromKomaLocalUrl } from '../../../../utils/urlUtils';
import type { LinghuiPromptReferenceItem } from '../state/linghuiPromptReferences';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import {
  VIDEO_TOOL_PRESETS,
  type ProviderOption,
  type VideoToolPreset,
  formatVideoParameterSummary,
  getPreviewSource,
} from '../state/videoNodeEditorShared';
import {
  getVideoCapabilityDescriptor,
  type VideoCapabilityDescriptor,
} from '../state/videoCapabilityUtils';
import {
  clampDurationToSpec,
  specToInputBounds,
  type VideoDurationSpec,
} from '../../../../providers/itv/durationSpec';

const decodeKomaLocalSource = fromKomaLocalUrl;

function isRemoteSource(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

function isLocalSource(source: string): boolean {
  return Boolean(source) && !isRemoteSource(source) && !source.startsWith('data:') && !source.startsWith('blob:');
}

interface VideoAccessCardProps {
  source: string;
  posterSource?: string;
  emptyDescription: string;
  pills?: string[];
  onDownload?: () => void;
}

function VideoAccessCard({
  source,
  posterSource,
  emptyDescription,
  pills = [],
  onDownload,
}: VideoAccessCardProps) {
  const { message } = App.useApp();
  const rawSource = source.startsWith('koma-local://') ? decodeKomaLocalSource(source) : source;
  const previewSource = posterSource ? getPreviewSource(posterSource) : '';
  const sourceLabel = rawSource.split(/[\\/]/).pop() || '视频文件';
  const canOpen = Boolean(rawSource) && (isRemoteSource(rawSource) || isLocalSource(rawSource));
  const canReveal = isLocalSource(rawSource);

  const handleOpen = async () => {
    if (!canOpen) return;
    try {
      if (isRemoteSource(rawSource)) {
        await electronService.shell.openExternal(rawSource);
      } else {
        await electronService.shell.openPath(rawSource);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '打开视频失败');
    }
  };

  const handleReveal = async () => {
    if (!canReveal) return;
    try {
      await electronService.shell.showItemInFolder(rawSource);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '定位视频文件失败');
    }
  };

  return (
    <div className="linghuiEditorPlayerCard">
      <div className="linghuiEditorPlayerSurface isStatic">
        {previewSource ? (
          <img
            className="linghuiEditorPlayerPoster"
            src={previewSource}
            alt={sourceLabel}
          />
        ) : (
          <div className="linghuiEditorPlayerPlaceholder">
            <Film size={24} />
            <span>{emptyDescription}</span>
          </div>
        )}
        <div className="linghuiEditorPlayerOverlay">
          <span className="linghuiEditorSummaryPill">弹框内不嵌入播放器</span>
          {onDownload ? (
            <Button size="small" onClick={onDownload} icon={<Download size={14} />}>
              下载
            </Button>
          ) : null}
          {canOpen ? (
            <Button size="small" type="primary" onClick={handleOpen}>
              {isRemoteSource(rawSource) ? '在浏览器打开' : '在系统播放器打开'}
            </Button>
          ) : null}
          {canReveal ? (
            <Button size="small" onClick={handleReveal}>
              打开所在位置
            </Button>
          ) : null}
        </div>
      </div>
      <div className="linghuiEditorPassThroughTitle">{sourceLabel}</div>
      <div className="linghuiEditorPassThroughMeta">{rawSource}</div>
      {pills.length > 0 ? (
        <div className="linghuiEditorPlayerMetaRow">
          {pills.map(item => (
            <span key={item} className="linghuiEditorSummaryPill">{item}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TooltipLabel({
  label,
  tooltip,
}: {
  label: React.ReactNode;
  tooltip: React.ReactNode;
}) {
  return (
    <div className="linghuiEditorLabelWithTooltip">
      <span>{label}</span>
      <Tooltip title={tooltip}>
        <span className="linghuiEditorInfoIcon" aria-label="查看说明">
          <InfoCircleOutlined />
        </span>
      </Tooltip>
    </div>
  );
}

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
  return (
    <div className="linghuiEditorSection">
      <div className="linghuiEditorSectionHeader">
        <TooltipLabel
          label="透传输出"
          tooltip="该节点直接输出导入到画布的视频，不参与模型生成，也不需要执行。"
        />
      </div>

      <div className="linghuiEditorPassThroughCard">
        <VideoAccessCard
          source={source}
          posterSource={posterSource}
          emptyDescription="当前没有可展示的封面"
          pills={['已挂载视频', '直接给下游', '不进入生成']}
          onDownload={onDownload}
        />
      </div>
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

const DROPDOWN_ROOT_CLASS_NAME = 'linghuiNodeEditorDropdownMenu linghuiVideoEditorDropdownMenu';
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
  const durationBounds = specToInputBounds(durationSpec);
  const durationMarks = useMemo(() => {
    if (durationSpec.kind === 'enum') {
      return durationSpec.values.reduce<Record<number, string>>((marks, value) => {
        marks[value] = `${value}s`;
        return marks;
      }, {});
    }

    return {
      [durationSpec.min]: `${durationSpec.min}s`,
      [durationSpec.default]: `${durationSpec.default}s`,
      [durationSpec.max]: `${durationSpec.max}s`,
    };
  }, [durationSpec]);
  const durationHint = durationSpec.kind === 'enum'
    ? `当前模型仅支持 ${durationSpec.values.map(value => `${value}s`).join(' / ')}`
    : `当前模型支持 ${durationSpec.min}-${durationSpec.max}s`;

  const modelMenuItems = useMemo<MenuProps['items']>(() => (
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
    <div
      className="linghuiVideoEditorParamsPopover"
      onClick={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <div className="linghuiVideoEditorParamGroup">
        <div className="linghuiVideoEditorParamLabel">比例</div>
        <div className="linghuiVideoEditorOptionGrid">
          {VIDEO_ASPECT_RATIOS.map(option => (
            <button
              key={option.value}
              type="button"
              className={`linghuiVideoEditorOptionTile ${aspectRatio === option.value ? 'isActive' : ''}`}
              onClick={() => {
                setOpenPanel(null);
                onUpdateAspectRatio(option.value);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="linghuiVideoEditorParamGroup">
        <div className="linghuiVideoEditorParamLabel">分辨率</div>
        <div className="linghuiVideoEditorOptionGrid isCompact">
          {VIDEO_RESOLUTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              className={`linghuiVideoEditorOptionTile ${resolution === option.value ? 'isActive' : ''}`}
              onClick={() => {
                setOpenPanel(null);
                onUpdateResolution(option.value);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="linghuiVideoEditorParamGroup">
        <div className="linghuiVideoEditorDurationHeader">
          <span className="linghuiVideoEditorParamLabel">视频时长</span>
          <span className="linghuiVideoEditorDurationValue">{duration}s</span>
        </div>
        {durationSpec.kind === 'enum' ? (
          <div className="linghuiVideoEditorDurationChoices">
            {durationSpec.values.map(value => (
              <button
                key={value}
                type="button"
                className={`linghuiVideoEditorOptionTile ${duration === value ? 'isActive' : ''}`}
                onClick={() => {
                  setOpenPanel(null);
                  onUpdateDuration(value);
                }}
              >
                {value}s
              </button>
            ))}
          </div>
        ) : (
          <Slider
            className="linghuiVideoEditorDurationSlider"
            min={durationBounds.min}
            max={durationBounds.max}
            step={durationBounds.step}
            marks={durationMarks}
            value={clampDurationToSpec(duration, durationSpec)}
            onChange={value => onUpdateDuration(Number(value))}
            onChangeComplete={() => setOpenPanel(null)}
          />
        )}
        <div className="linghuiVideoEditorDurationHint">{durationHint}</div>
      </div>
    </div>
  ), [
    aspectRatio,
    duration,
    durationBounds.max,
    durationBounds.min,
    durationBounds.step,
    durationHint,
    durationMarks,
    durationSpec,
    onUpdateAspectRatio,
    onUpdateDuration,
    onUpdateResolution,
    resolution,
  ]);

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
          minHeight="76px"
          maxHeight="176px"
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
            onClick={handleParamsTriggerClick}
          >
            {parameterSummary}
          </button>
        </Popover>
        <div
          className="linghuiVideoEditorActionGroup nodrag nopan nowheel"
          onClick={handleActionGroupEvent}
          onMouseDown={handleActionGroupEvent}
          onPointerDown={handleActionGroupEvent}
          onPointerMove={handleActionGroupEvent}
        >
          {hasCurrentVideo ? (
            <Button
              size="middle"
              className="linghuiVideoEditorActionButton nodrag nopan nowheel"
              icon={<Download size={14} />}
              onClick={onDownloadCurrentVideo}
            >
              下载
            </Button>
          ) : null}
          <Button
            type="primary"
            className="linghuiVideoEditorActionButton nodrag nopan nowheel"
            icon={isGenerating ? undefined : <ArrowUp size={14} />}
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
