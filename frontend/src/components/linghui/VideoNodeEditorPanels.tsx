import React from 'react';
import { Button, Select } from 'antd';
import { ArrowUp, Film, Image as ImageIcon, Music4, Trash2, UploadCloud } from 'lucide-react';
import { VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS, type LinghuiVideoRefMode, type LinghuiVideoToolKey } from '../../types/linghui';
import type { LinghuiPromptReferenceItem } from './linghuiPromptReferences';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import {
  DURATION_OPTIONS,
  REF_MODES,
  VIDEO_TOOL_PRESETS,
  type ProviderOption,
  type VideoToolPreset,
  getPreviewSource,
} from './videoNodeEditorShared';

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
  refMode: LinghuiVideoRefMode;
  onRefModeChange: (mode: LinghuiVideoRefMode) => void;
  referenceImages: Array<{ source?: string; label?: string }>;
  referenceVideos: Array<{ source?: string; posterSource?: string; label?: string }>;
  referenceAudios: Array<{ source?: string; label?: string }>;
  visualReferenceRoles: Map<string, 'default' | 'first' | 'last' | 'unused'>;
  prompt: string;
  onPromptChange: (value: string) => void;
  promptReferences: LinghuiPromptReferenceItem[];
  mentionHint: string;
  resultVideoSource: string;
  resultPosterSource: string;
  providers: ProviderOption[];
  itvConfigId: string;
  aspectRatio: string;
  resolution: string;
  duration: number;
  onUpdateProvider: (value: string) => void;
  onUpdateCompositeOptions: (value: string) => void;
  onRun: () => void;
  onSelectVideo: () => void;
}

export function VideoGeneratePanel({
  refMode,
  onRefModeChange,
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
  itvConfigId,
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

  return (
    <>
      <div className="linghuiEditorSection">
        <div className="linghuiEditorSectionHeader">
          <div className="linghuiEditorSectionTitle">上游输入</div>
          <div className="linghuiEditorSectionHint">这里会决定实际传给视频模型的视觉参考、音频节奏和文本上下文。</div>
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
          <div className="linghuiEditorSectionTitle">参考组织</div>
        </div>
        <div className="linghuiEditorRefModes">
          {REF_MODES.map(mode => (
            <button
              key={mode.key}
              className={`linghuiEditorRefModeTab ${refMode === mode.key ? 'isActive' : ''}`}
              onClick={() => onRefModeChange(mode.key)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {referenceImages.length > 0 ? (
        <div className="linghuiEditorAssetGroup">
          <div className="linghuiEditorAssetTitle">图片参考</div>
          <div className="linghuiEditorRefs">
            {referenceImages.map((ref, index) => {
              const src = getPreviewSource(ref.source);
              return (
                <div key={`${ref.source || ref.label || index}`} className="linghuiEditorRefThumb">
                  {src ? <img src={src} alt={ref.label || `参考 ${index + 1}`} /> : <ImageIcon size={16} />}
                  <span className="linghuiEditorRefBadge">{index + 1}</span>
                  {refMode === 'first-last-frame' && (
                    <span className="linghuiEditorRefBadge isRole">
                      {visualReferenceRoles.get(`image:${ref.source || ref.label || ''}`) === 'first'
                        ? '首帧'
                        : visualReferenceRoles.get(`image:${ref.source || ref.label || ''}`) === 'last'
                          ? '尾帧'
                          : '忽略'}
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
              return (
                <div key={`${ref.posterSource || ref.source || ref.label || index}`} className="linghuiEditorAssetCard">
                  <div className="linghuiEditorAssetCardThumb">
                    {poster ? <img src={poster} alt={ref.label || `视频参考 ${index + 1}`} /> : <Film size={18} />}
                    <span className="linghuiEditorAssetCardBadge">▶</span>
                  </div>
                  <div className="linghuiEditorAssetCardMeta">
                    <div className="linghuiEditorAssetCardTitle">{ref.label || `视频参考 ${index + 1}`}</div>
                    <div className="linghuiEditorAssetCardHint">
                      {refMode === 'first-last-frame'
                        ? visualReferenceRoles.get(`video:${ref.posterSource || ref.source || ref.label || ''}`) === 'first'
                          ? '当前作为首帧输入'
                          : visualReferenceRoles.get(`video:${ref.posterSource || ref.source || ref.label || ''}`) === 'last'
                            ? '当前作为尾帧输入'
                            : '首尾帧模式下当前不参与执行'
                        : index === 0 && referenceImages.length === 0
                          ? '可作为主视觉参考'
                          : '作为补充视觉参考'}
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
          还没有上游参考输入。你可以连接图片、视频、文本或音频节点，再通过提示词把它们组织成完整镜头。
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
            value={itvConfigId || undefined}
            placeholder="选择视频渠道"
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
