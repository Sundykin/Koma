import React from 'react';
import { InfoCircleOutlined } from '@ant-design/icons';
import { Button, Select, Tooltip } from 'antd';
import { ArrowUp, Film, Image as ImageIcon, Music4 } from 'lucide-react';
import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_RESOLUTIONS,
  type LinghuiVideoCapability,
  type LinghuiVideoToolKey,
} from '../../types/linghui';
import type { LinghuiPromptReferenceItem } from './linghuiPromptReferences';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import {
  DURATION_OPTIONS,
  VIDEO_TOOL_PRESETS,
  type ProviderOption,
  type VideoToolPreset,
  getPreviewSource,
} from './videoNodeEditorShared';
import {
  getVideoCapabilityDescriptor,
  getVisualReferenceRoleLabel,
  type LinghuiVisualReferenceRole,
  type VideoCapabilityDescriptor,
} from './videoCapabilityUtils';
import { StagePlayer } from '../video/StagePlayer';

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
}

export function VideoPassThroughPanel({
  source,
  posterSource,
}: VideoPassThroughPanelProps) {
  const sourceLabel = source.split(/[\\/]/).pop() || '已导入视频';

  return (
    <div className="linghuiEditorSection">
      <div className="linghuiEditorSectionHeader">
        <TooltipLabel
          label="透传输出"
          tooltip="该节点直接输出导入到画布的视频，不参与模型生成，也不需要执行。"
        />
      </div>

      <div className="linghuiEditorPassThroughCard">
        <div className="linghuiEditorPlayerCard">
          <div className="linghuiEditorPlayerSurface">
            <StagePlayer
              source={source}
              poster={posterSource}
              showStopButton
              emptyDescription="当前没有可播放的视频"
            />
          </div>
        </div>
        <div className="linghuiEditorPassThroughTitle">{sourceLabel}</div>
        <div className="linghuiEditorPassThroughMeta">{source}</div>
        <div className="linghuiEditorSummaryRow">
          <span className="linghuiEditorSummaryPill">已挂载视频</span>
          <span className="linghuiEditorSummaryPill">直接给下游</span>
          <span className="linghuiEditorSummaryPill">不进入生成</span>
        </div>
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
  visualReferenceRoles: Map<string, LinghuiVisualReferenceRole>;
  prompt: string;
  onPromptChange: (value: string) => void;
  promptReferences: LinghuiPromptReferenceItem[];
  mentionHint: string;
  providers: ProviderOption[];
  selectedProviderValue: string;
  aspectRatio: string;
  resolution: string;
  duration: number;
  outputSource?: string;
  outputPosterSource?: string;
  outputLabel?: string;
  onUpdateProvider: (value: string) => void;
  onUpdateAspectRatio: (value: string) => void;
  onUpdateResolution: (value: string) => void;
  onUpdateDuration: (value: number) => void;
  onRun: () => void;
}

export function VideoGeneratePanel({
  videoCapability,
  supportedCapabilities,
  capabilityDescriptor,
  onVideoCapabilityChange,
  referenceImages,
  referenceVideos,
  referenceAudios,
  visualReferenceRoles,
  prompt,
  onPromptChange,
  promptReferences,
  mentionHint,
  providers,
  selectedProviderValue,
  aspectRatio,
  resolution,
  duration,
  outputSource,
  outputPosterSource,
  outputLabel,
  onUpdateProvider,
  onUpdateAspectRatio,
  onUpdateResolution,
  onUpdateDuration,
  onRun,
}: VideoGeneratePanelProps) {
  const upstreamSummary = [
    referenceImages.length > 0 ? `${referenceImages.length} 张图片` : '',
    referenceVideos.length > 0 ? `${referenceVideos.length} 条视频` : '',
    referenceAudios.length > 0 ? `${referenceAudios.length} 条音频` : '',
  ].filter(Boolean);
  const showCapabilitySwitcher = supportedCapabilities.length > 1;

  const renderRoleHint = (role?: LinghuiVisualReferenceRole) => {
    switch (role) {
      case 'primary':
        return '主图';
      case 'reference':
        return '参考';
      case 'start':
        return '首帧';
      case 'end':
        return '尾帧';
      case 'prompt-only':
        return '仅引用';
      case 'unused':
        return '当前忽略';
      default:
        return '参考';
    }
  };

  return (
    <>
      <div className="linghuiEditorSection">
        <div className="linghuiEditorSectionHeader">
          <TooltipLabel
            label="视频能力"
            tooltip={capabilityDescriptor.shortDescription}
          />
        </div>

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
        ) : (
          <div className="linghuiEditorSummaryRow">
            <span className="linghuiEditorSummaryPill">{capabilityDescriptor.label}</span>
          </div>
        )}
      </div>

      {outputSource ? (
        <div className="linghuiEditorSection">
          <div className="linghuiEditorSectionHeader">
            <TooltipLabel
              label="生成结果"
              tooltip="这里提供当前节点最新一次生成出的视频预览与播放控制。"
            />
          </div>

          <div className="linghuiEditorPlayerCard">
            <div className="linghuiEditorPlayerSurface">
              <StagePlayer
                source={outputSource}
                poster={outputPosterSource}
                showStopButton
                emptyDescription="当前还没有可播放的生成结果"
              />
            </div>
            <div className="linghuiEditorPlayerMetaRow">
              <span className="linghuiEditorSummaryPill">{outputLabel || '最新结果'}</span>
              <span className="linghuiEditorSummaryPill">可拖动进度</span>
              <span className="linghuiEditorSummaryPill">支持音量与全屏</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="linghuiEditorSection">
        <div className="linghuiEditorSectionHeader">
          <TooltipLabel
            label="输入"
            tooltip={capabilityDescriptor.inputHint}
          />
        </div>

        {upstreamSummary.length > 0 ? (
          <div className="linghuiEditorSummaryRow">
            {upstreamSummary.map(item => (
              <span key={item} className="linghuiEditorSummaryPill">
                {item}
              </span>
            ))}
          </div>
        ) : (
          <div className="linghuiEditorEmptyState">
            <TooltipLabel
              label="当前无上游输入"
              tooltip={capabilityDescriptor.emptyStateHint}
            />
          </div>
        )}
      </div>

      {referenceImages.length > 0 ? (
        <div className="linghuiEditorAssetGroup">
          <div className="linghuiEditorAssetTitle">
            <TooltipLabel
              label="图片参考"
              tooltip="连接到图片输入槽的内容会按当前视频能力参与执行。"
            />
          </div>
          <div className="linghuiEditorRefs">
            {referenceImages.map((ref, index) => {
              const src = getPreviewSource(ref.source);
              const role = visualReferenceRoles.get(`image:${ref.source || ref.label || ''}`);
              const roleLabel = role ? getVisualReferenceRoleLabel(role) : undefined;
              return (
                <div key={`${ref.source || ref.label || index}`} className="linghuiEditorRefThumb">
                  {src ? <img src={src} alt={ref.label || `参考 ${index + 1}`} /> : <ImageIcon size={16} />}
                  <span className="linghuiEditorRefBadge">{index + 1}</span>
                  {roleLabel && (
                    <span className="linghuiEditorRefBadge isRole">
                      {roleLabel}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {referenceVideos.length > 0 ? (
        <div className="linghuiEditorAssetGroup">
          <div className="linghuiEditorAssetTitle">
            <TooltipLabel
              label="视频参考"
              tooltip="上游视频会以封面或参考帧的形式参与当前视频能力。"
            />
          </div>
          <div className="linghuiEditorAssetList">
            {referenceVideos.map((ref, index) => {
              const poster = getPreviewSource(ref.posterSource || ref.source);
              const role = visualReferenceRoles.get(`video:${ref.posterSource || ref.source || ref.label || ''}`);
              return (
                <div key={`${ref.posterSource || ref.source || ref.label || index}`} className="linghuiEditorAssetCard">
                  <div className="linghuiEditorAssetCardThumb">
                    {poster ? <img src={poster} alt={ref.label || `视频参考 ${index + 1}`} /> : <Film size={18} />}
                    <span className="linghuiEditorAssetCardBadge">▶</span>
                  </div>
                  <div className="linghuiEditorAssetCardMeta">
                    <div className="linghuiEditorAssetCardTitle">{ref.label || `视频参考 ${index + 1}`}</div>
                    <div className="linghuiEditorAssetCardHint">{renderRoleHint(role)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {referenceAudios.length > 0 ? (
        <div className="linghuiEditorAssetGroup">
          <div className="linghuiEditorAssetTitle">
            <TooltipLabel
              label="音频输入"
              tooltip="音频输入会以描述文本或节奏约束的方式参与视频生成。"
            />
          </div>
          <div className="linghuiEditorAssetList">
            {referenceAudios.map((ref, index) => (
              <div key={`${ref.source || ref.label || index}`} className="linghuiEditorAssetCard isAudio">
                <div className="linghuiEditorAssetCardThumb isAudio">
                  <Music4 size={18} />
                </div>
                <div className="linghuiEditorAssetCardMeta">
                  <div className="linghuiEditorAssetCardTitle">{ref.label || `音频 ${index + 1}`}</div>
                  <div className="linghuiEditorAssetCardHint">已接入当前节点</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="linghuiEditorSection">
        <div className="linghuiEditorSectionHeader">
          <TooltipLabel
            label="提示词"
            tooltip={mentionHint}
          />
        </div>
      </div>

      <div className="linghuiEditorPrompt">
        <LinghuiPromptEditor
          value={prompt}
          onChange={onPromptChange}
          references={promptReferences}
          placeholder="描述镜头动作、节奏和风格，输入 @ 引用上游产物"
          darkTheme
          surfaceStyle="fusion"
          minHeight="96px"
          maxHeight="188px"
        />
      </div>

      <div className="linghuiEditorSection">
        <div className="linghuiEditorSectionHeader">
          <TooltipLabel
            label="模型与参数"
            tooltip="模型、比例、分辨率和时长会直接参与本次视频请求。"
          />
        </div>

        <div className="linghuiEditorFieldGrid">
          <div className="linghuiEditorSelectField">
            <TooltipLabel
              label="模型"
              tooltip="这里显示当前已配置的视频渠道模型，只展示真实可用的模型。"
            />
            <Select
              size="small"
              className="linghuiEditorSelect"
              value={selectedProviderValue || undefined}
              placeholder="选择视频模型"
              onChange={onUpdateProvider}
              options={providers}
              popupMatchSelectWidth={false}
            />
          </div>

          <div className="linghuiEditorSelectField">
            <TooltipLabel
              label="比例"
              tooltip="决定视频画面的宽高比例。"
            />
            <Select
              size="small"
              className="linghuiEditorSelect"
              value={aspectRatio}
              onChange={onUpdateAspectRatio}
              options={VIDEO_ASPECT_RATIOS.map(option => ({
                value: option.value,
                label: option.label,
              }))}
              popupMatchSelectWidth={false}
            />
          </div>

          <div className="linghuiEditorSelectField">
            <TooltipLabel
              label="分辨率"
              tooltip="决定输出清晰度。"
            />
            <Select
              size="small"
              className="linghuiEditorSelect"
              value={resolution}
              onChange={onUpdateResolution}
              options={VIDEO_RESOLUTIONS.map(option => ({
                value: option.value,
                label: option.label,
              }))}
              popupMatchSelectWidth={false}
            />
          </div>

          <div className="linghuiEditorSelectField">
            <TooltipLabel
              label="时长"
              tooltip="决定单次生成的视频长度。"
            />
            <Select
              size="small"
              className="linghuiEditorSelect"
              value={duration}
              onChange={value => onUpdateDuration(Number(value))}
              options={DURATION_OPTIONS}
              popupMatchSelectWidth={false}
            />
          </div>
        </div>
      </div>

      <div className="linghuiEditorToolbar">
        <div className="linghuiEditorToolbarRight">
          <Button
            type="primary"
            icon={<ArrowUp size={14} />}
            onClick={onRun}
          >
            生成
          </Button>
        </div>
      </div>
    </>
  );
}
