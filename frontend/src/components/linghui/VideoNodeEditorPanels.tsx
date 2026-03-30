import React from 'react';
import { Button, Select } from 'antd';
import { ArrowUp, Film, Image as ImageIcon, Music4, Trash2, UploadCloud } from 'lucide-react';
import { VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS, type LinghuiVideoCapability, type LinghuiVideoToolKey } from '../../types/linghui';
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

interface VideoToolSectionProps {
  activeTool: LinghuiVideoToolKey | null;
  isUploadMode: boolean;
  onClose: () => void;
  onSwitchToGenerateMode: () => void;
  onApplyPreset: (preset: VideoToolPreset) => void;
  presets: VideoToolPreset[];
}

export function VideoToolSection({
  activeTool,
  isUploadMode,
  onClose,
  onSwitchToGenerateMode,
  onApplyPreset,
  presets,
}: VideoToolSectionProps) {
  if (!activeTool) return null;

  return (
    <div className="linghuiEditorSection linghuiEditorToolSection">
      <div className="linghuiEditorToolPanel">
        <div className="linghuiEditorToolPanelHeader">
          <div>
            <div className="linghuiEditorToolPanelTitle">{VIDEO_TOOL_PRESETS[activeTool].title}</div>
            <div className="linghuiEditorToolPanelDesc">
              {isUploadMode
                ? '当前节点是导入模式，视频工具需要回到生成模式后才能真正生效。'
                : VIDEO_TOOL_PRESETS[activeTool].description}
            </div>
          </div>
          <Button size="small" onClick={onClose}>
            收起
          </Button>
        </div>

        {isUploadMode && (
          <div className="linghuiEditorToolModeNotice">
            <div className="linghuiEditorToolModeNoticeText">
              当前节点正在直接输出本地视频。要使用高清、解析或合成工具，请先切回生成模式。
            </div>
            <Button size="small" type="primary" onClick={onSwitchToGenerateMode}>
              切到生成模式
            </Button>
          </div>
        )}

        <div className="linghuiEditorToolPresetList">
          {presets.map(preset => (
            <div key={preset.label} className="linghuiEditorToolPresetCard">
              <div className="linghuiEditorToolPresetBody">
                <div className="linghuiEditorToolPresetTitle">{preset.label}</div>
                <div className="linghuiEditorToolPresetDesc">{preset.description}</div>
              </div>
              <Button
                type="primary"
                size="small"
                disabled={isUploadMode}
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

interface VideoImportPanelProps {
  previewSource: string;
  uploadedPoster: string;
  hasSource: boolean;
  nodeLabel: string;
  onSelectVideo: () => void;
  onDropVideo: (event: React.DragEvent<HTMLDivElement>) => void;
  onClearVideo: () => void;
  onRun: () => void;
}

export function VideoImportPanel({
  previewSource,
  uploadedPoster,
  hasSource,
  nodeLabel,
  onSelectVideo,
  onDropVideo,
  onClearVideo,
  onRun,
}: VideoImportPanelProps) {
  return (
    <>
      <div className="linghuiEditorSection">
        <div className="linghuiEditorSectionHeader">
          <div className="linghuiEditorSectionTitle">导入视频</div>
          <div className="linghuiEditorSectionHint">导入模式用于把现有视频结果继续送给下游节点，不再编辑提示词和生成参数。</div>
        </div>
        <div
          className={`linghuiReferenceDropzone linghuiVideoDropzone isCompact ${previewSource ? 'hasPreview' : ''}`}
          onDragOver={event => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onDrop={onDropVideo}
          onClick={onSelectVideo}
          role="button"
          tabIndex={0}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelectVideo();
            }
          }}
        >
          {previewSource ? (
            <video
              className="linghuiReferencePreview"
              src={previewSource}
              poster={uploadedPoster || undefined}
              muted
              loop
              autoPlay
              playsInline
            />
          ) : (
            <div className="linghuiReferencePlaceholder">
              <UploadCloud size={24} />
              <div>拖入视频到这里</div>
              <div className="linghuiReferencePlaceholderHint">或点击选择本地视频素材</div>
            </div>
          )}
        </div>
      </div>

      <div className="linghuiEditorToolbar">
        <div className="linghuiEditorToolbarLeft">
          <Button size="small" icon={<UploadCloud size={14} />} onClick={onSelectVideo}>
            {hasSource ? '替换视频' : '上传视频'}
          </Button>
          <Button size="small" icon={<Trash2 size={14} />} danger disabled={!hasSource} onClick={onClearVideo}>
            清空素材
          </Button>
        </div>

        <div className="linghuiEditorToolbarRight">
          <Button
            type="primary"
            size="small"
            shape="circle"
            icon={<ArrowUp size={16} />}
            onClick={onRun}
            aria-label={`执行 ${nodeLabel}`}
          />
        </div>
      </div>
    </>
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
  resultVideoSource: string;
  resultPosterSource: string;
  providers: ProviderOption[];
  selectedProviderValue: string;
  aspectRatio: string;
  resolution: string;
  duration: number;
  onUpdateProvider: (value: string) => void;
  onUpdateCompositeOptions: (value: string) => void;
  onRun: () => void;
  onSelectVideo: () => void;
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
  resultVideoSource,
  resultPosterSource,
  providers,
  selectedProviderValue,
  aspectRatio,
  resolution,
  duration,
  onUpdateProvider,
  onUpdateCompositeOptions,
  onRun,
  onSelectVideo,
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
        return '当前作为主图输入';
      case 'reference':
        return '当前作为视觉参考参与执行';
      case 'start':
        return '当前作为首帧输入';
      case 'end':
        return '当前作为尾帧输入';
      case 'prompt-only':
        return '当前不会直接提交给模型，仅供提示词引用';
      case 'unused':
        return '当前模式下不参与执行';
      default:
        return '当前作为视觉参考参与执行';
    }
  };

  return (
    <>
      <div className="linghuiEditorSection">
        <div className="linghuiEditorSectionHeader">
          <div className="linghuiEditorSectionTitle">上游输入</div>
          <div className="linghuiEditorSectionHint">{capabilityDescriptor.inputHint}</div>
        </div>

        <div className="linghuiEditorInlineActions">
          <div
            className="linghuiEditorCompactActionCard"
            onClick={onSelectVideo}
            role="button"
            tabIndex={0}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectVideo();
              }
            }}
          >
            <div className="linghuiEditorCompactActionThumb">
              <Film size={18} />
            </div>
            <div className="linghuiEditorCompactActionMeta">
              <div className="linghuiEditorCompactActionTitle">导入本地视频</div>
              <div className="linghuiEditorCompactActionHint">如果想直接把现成视频继续送给下游，可随时切到导入输出模式。</div>
            </div>
            <UploadCloud size={16} />
          </div>
        </div>
      </div>

      <div className="linghuiEditorSection">
        <div className="linghuiEditorSectionHeader">
          <div className="linghuiEditorSectionTitle">生成模式</div>
          <div className="linghuiEditorSectionHint">{capabilityDescriptor.shortDescription}</div>
        </div>
        {showCapabilitySwitcher ? (
          <div className="linghuiEditorRefModes">
            {supportedCapabilities.map(capability => (
              <button
                key={capability}
                className={`linghuiEditorRefModeTab ${videoCapability === capability ? 'isActive' : ''}`}
                onClick={() => onVideoCapabilityChange(capability)}
              >
                {getVideoCapabilityDescriptor(capability).label}
              </button>
            ))}
          </div>
        ) : (
          <div className="linghuiEditorPromptHint">
            当前模型仅支持 {capabilityDescriptor.label}
          </div>
        )}
      </div>

      {referenceImages.length > 0 ? (
        <div className="linghuiEditorAssetGroup">
          <div className="linghuiEditorAssetTitle">图片参考</div>
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
          <div className="linghuiEditorAssetTitle">视频参考</div>
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
                    <div className="linghuiEditorAssetCardHint">
                      {renderRoleHint(role)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {referenceAudios.length > 0 ? (
        <div className="linghuiEditorAssetGroup">
          <div className="linghuiEditorAssetTitle">音频输入</div>
          <div className="linghuiEditorAssetList">
            {referenceAudios.map((ref, index) => (
              <div key={`${ref.source || ref.label || index}`} className="linghuiEditorAssetCard isAudio">
                <div className="linghuiEditorAssetCardThumb isAudio">
                  <Music4 size={18} />
                </div>
                <div className="linghuiEditorAssetCardMeta">
                  <div className="linghuiEditorAssetCardTitle">{ref.label || `音频 ${index + 1}`}</div>
                  <div className="linghuiEditorAssetCardHint">执行时记录为视频节点的音频输入</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {upstreamSummary.length === 0 && (
        <div className="linghuiEditorEmptyState">
          {capabilityDescriptor.emptyStateHint}
        </div>
      )}

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
        <div className="linghuiEditorPromptHint">{mentionHint}</div>
      </div>

      {resultVideoSource && (
        <div className="linghuiEditorAssetGroup">
          <div className="linghuiEditorAssetTitle">生成结果</div>
          <video
            className="linghuiPreviewVideo"
            src={resultVideoSource}
            poster={resultPosterSource || undefined}
            controls
            playsInline
          />
          <div className="linghuiEditorPromptHint">生成完成后可继续连接脚本、历史或资产流程复用这段视频。</div>
        </div>
      )}

      <div className="linghuiEditorToolbar">
        <div className="linghuiEditorToolbarLeft">
          <Select
            size="small"
            className="linghuiEditorSelect"
            value={selectedProviderValue || undefined}
            placeholder="选择视频模型"
            onChange={onUpdateProvider}
            options={providers}
            popupMatchSelectWidth={false}
            style={{ minWidth: 140 }}
          />

          <Select
            size="small"
            className="linghuiEditorSelect"
            value={`${aspectRatio}·${resolution}·${duration}s`}
            onChange={onUpdateCompositeOptions}
            popupMatchSelectWidth={false}
            options={VIDEO_ASPECT_RATIOS.flatMap(ar =>
              VIDEO_RESOLUTIONS.flatMap(res =>
                DURATION_OPTIONS.map(option => ({
                  value: `${ar.value}·${res.value}·${option.label}`,
                  label: `${ar.label} · ${res.label} · ${option.label}`,
                })),
              ),
            )}
            style={{ minWidth: 164 }}
          />
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
    </>
  );
}
