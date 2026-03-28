import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Select } from 'antd';
import { ArrowUp, Film, Image as ImageIcon, Music4, Trash2, UploadCloud } from 'lucide-react';
import type {
  LinghuiNodeData,
  LinghuiVideoNodeProperties,
  LinghuiVideoRefMode,
  LinghuiVideoToolKey,
} from '../../types/linghui';
import { VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS } from '../../types/linghui';
import { loadSettings } from '../../store/settings/core';
import { electronService, openFileDialog } from '../../services/electronService';
import { importLinghuiWorkspaceAsset } from '../../store/linghuiStorage';
import { useLinghuiNodeMutation } from './nodes/LinghuiNodeRunsContext';
import { LinghuiPromptEditor } from './LinghuiPromptEditor';
import type { LinghuiPromptReferenceItem } from './linghuiPromptReferences';

function getPreviewSource(source?: string): string {
  if (!source) return '';
  if (source.startsWith('http') || source.startsWith('data:') || source.startsWith('blob:') || source.startsWith('koma-local://')) return source;
  return electronService.fs.toLocalUrl(source);
}

interface ProviderOption {
  value: string;
  label: string;
}

const REF_MODES: Array<{ key: LinghuiVideoRefMode; label: string }> = [
  { key: 'all-ref', label: '全能参考' },
  { key: 'first-last-frame', label: '首尾帧' },
];

const DURATION_OPTIONS = [
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
];

interface VideoNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  referenceImages: Array<{ source?: string; label?: string }>;
  referenceVideos: Array<{ source?: string; posterSource?: string; label?: string }>;
  referenceAudios: Array<{ source?: string; label?: string }>;
  promptReferences?: LinghuiPromptReferenceItem[];
  workspaceId?: string | null;
  activeTool: LinghuiVideoToolKey | null;
  onToolChange: (tool: LinghuiVideoToolKey | null) => void;
  onRun: () => void;
}

interface VideoToolPreset {
  label: string;
  description: string;
  promptSnippet?: string;
  properties?: Partial<LinghuiVideoNodeProperties>;
}

const VIDEO_TOOLBAR_ITEMS: Array<{ key: LinghuiVideoToolKey; label: string }> = [
  { key: 'upscale', label: '高清' },
  { key: 'analyze', label: '解析' },
  { key: 'compose', label: '合成' },
];

const VIDEO_TOOL_PRESETS: Record<LinghuiVideoToolKey, {
  title: string;
  description: string;
  buildPresets: (context: {
    imageCount: number;
    videoCount: number;
    audioCount: number;
    refMode: LinghuiVideoRefMode;
  }) => VideoToolPreset[];
}> = {
  upscale: {
    title: '高清',
    description: '提升视频节点的画质预期与输出规格。',
    buildPresets: () => [
      {
        label: '1080P 电影质感',
        description: '提升清晰度、材质细节和边缘锐度。',
        promptSnippet: '高细节、高动态范围、电影级清晰度，主体边缘锐利，材质纹理完整。',
        properties: { resolution: '1080P' },
      },
      {
        label: '广告级精修',
        description: '偏商业广告与高质感镜头。',
        promptSnippet: '广告级成片质感，主体细节精修，反光和纹理清晰，画面稳定且高级。',
        properties: { resolution: '1080P' },
      },
    ],
  },
  analyze: {
    title: '解析',
    description: '根据当前参考输入自动组织一份可继续细化的提示词骨架。',
    buildPresets: ({ imageCount, videoCount, audioCount, refMode }) => [
      {
        label: '写入镜头解析骨架',
        description: '把当前输入结构整理成一份更适合继续润色的提示词。',
        promptSnippet: [
          `基于当前输入制作一段${refMode === 'first-last-frame' ? '首尾帧过渡' : '多参考融合'}视频。`,
          imageCount > 0 ? `保留 ${imageCount} 张图片参考中的主体和视觉风格。` : '',
          videoCount > 0 ? `吸收 ${videoCount} 条视频参考中的运动节奏和镜头语言。` : '',
          audioCount > 0 ? `让画面动作与 ${audioCount} 条音频输入的节奏保持同步。` : '',
          '镜头运动稳定，主体清晰，动作连贯，转场自然。',
        ].filter(Boolean).join(' '),
      },
      {
        label: '写入分镜节奏骨架',
        description: '更强调开场、推进和收束的镜头节奏。',
        promptSnippet: '镜头节奏清晰：开场建立环境，中段推进主体动作，结尾收束到视觉高潮，整体连贯不跳切。',
      },
    ],
  },
  compose: {
    title: '合成',
    description: '把图片、视频和音频输入重新编排成更明确的合成方式。',
    buildPresets: () => [
      {
        label: '融合全部参考',
        description: '优先整合所有视觉参考和音频氛围。',
        promptSnippet: '融合全部参考输入，统一主体风格、镜头节奏与氛围细节，避免素材割裂。',
        properties: { refMode: 'all-ref' },
      },
      {
        label: '首尾帧过渡',
        description: '以首帧到尾帧的方式组织镜头演化。',
        promptSnippet: '以首帧到尾帧的明确变化来组织镜头推进，中间过程连贯自然，过渡平滑。',
        properties: { refMode: 'first-last-frame' },
      },
    ],
  },
};

function mergePromptSnippet(currentPrompt: string, snippet?: string): string {
  const normalizedCurrent = currentPrompt.trim();
  const normalizedSnippet = String(snippet ?? '').trim();
  if (!normalizedSnippet) return normalizedCurrent;
  if (normalizedCurrent.includes(normalizedSnippet)) return normalizedCurrent;
  return normalizedCurrent ? `${normalizedCurrent}\n${normalizedSnippet}` : normalizedSnippet;
}

export const VideoNodeEditor: React.FC<VideoNodeEditorProps> = ({
  nodeId,
  nodeData,
  referenceImages,
  referenceVideos,
  referenceAudios,
  promptReferences = [],
  workspaceId = null,
  activeTool,
  onToolChange,
  onRun,
}) => {
  const { message } = App.useApp();
  const { clearNodeRunState, updateNodeData } = useLinghuiNodeMutation();
  const props = nodeData.properties as unknown as LinghuiVideoNodeProperties;
  const source = String(props.source ?? '');
  const posterSource = String(props.posterSource ?? '');
  const prompt = String(props.prompt ?? '');
  const itvConfigId = String(props.itvConfigId ?? '');
  const refMode = (props.refMode ?? 'all-ref') as LinghuiVideoRefMode;
  const aspectRatio = String(props.aspectRatio ?? '16:9');
  const resolution = String(props.resolution ?? '720P');
  const duration = Number(props.duration ?? 5);
  const previewSource = getPreviewSource(source);
  const uploadedPoster = getPreviewSource(posterSource);
  const isUploadMode = Boolean(source.trim());
  const upstreamSummary = [
    referenceImages.length > 0 ? `${referenceImages.length} 张图片` : '',
    referenceVideos.length > 0 ? `${referenceVideos.length} 条视频` : '',
    referenceAudios.length > 0 ? `${referenceAudios.length} 条音频` : '',
  ].filter(Boolean);

  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const mentionHint = isUploadMode
    ? '当前节点已挂载本地视频，会以导入模式输出；清空后可切回生成模式'
    : promptReferences.length > 0
      ? '输入 @ 可直接引用上游图片、视频封面、音频描述和文本产物，执行时会自动完成替换'
      : '连接图片、文本、音频或上游视频节点后，才会出现可引用的上游产物';

  useEffect(() => {
    loadSettings().then(settings => {
      const builtins = (settings.itvConfigs ?? []).map(c => ({
        value: c.id,
        label: c.name || c.provider,
      }));
      const channels = (settings.channelConfigs ?? [])
        .filter(c => c.enabled && c.capabilities?.includes('itv'))
        .map(c => ({
          value: c.id,
          label: c.name || c.id,
        }));
      setProviders([...builtins, ...channels]);
    });
  }, []);

  const updateProp = useCallback((key: string, value: unknown) => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, [key]: value },
    }));
  }, [nodeId, updateNodeData]);

  const handlePromptChange = useCallback((value: string) => {
    updateProp('prompt', value);
  }, [updateProp]);

  const applyUploadedVideo = useCallback(async (nextSource: string, filenameHint?: string) => {
    let resolvedSource = nextSource;

    if (
      workspaceId &&
      electronService.isElectron() &&
      nextSource &&
      !nextSource.startsWith('http://') &&
      !nextSource.startsWith('https://') &&
      !nextSource.startsWith('data:') &&
      !nextSource.startsWith('blob:')
    ) {
      resolvedSource = await importLinghuiWorkspaceAsset(workspaceId, nextSource, filenameHint);
    }

    updateNodeData(nodeId, prev => ({
      ...prev,
      label: prev.label.startsWith('视频') ? (filenameHint?.replace(/\.[^.]+$/, '') || prev.label) : prev.label,
      properties: {
        ...prev.properties,
        source: resolvedSource,
        posterSource: '',
      },
    }));
    clearNodeRunState(nodeId);
  }, [clearNodeRunState, nodeId, updateNodeData, workspaceId]);

  const handleSelectVideo = useCallback(async () => {
    try {
      const result = await openFileDialog({
        filters: [{ name: '视频', extensions: ['mp4', 'mov', 'webm', 'avi', 'mkv'] }],
        multiple: false,
        title: '选择视频素材',
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const filename = filePath.split(/[\\/]/).pop();
        await applyUploadedVideo(filePath, filename);
      }
    } catch (error: any) {
      message.error(error?.message || '选择视频失败');
    }
  }, [applyUploadedVideo, message]);

  const handleDropVideo = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const file = event.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('video/')) {
      message.warning('请拖入视频文件');
      return;
    }

    try {
      const filePath = (file as File & { path?: string }).path;
      if (filePath) {
        await applyUploadedVideo(filePath, file.name);
        return;
      }

      message.info('当前浏览器模式下暂不支持直接拖入本地视频，请在桌面端使用上传按钮。');
    } catch (error: any) {
      message.error(error?.message || '导入视频失败');
    }
  }, [applyUploadedVideo, message]);

  const handleClearVideo = useCallback(() => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: {
        ...prev.properties,
        source: '',
        posterSource: '',
      },
    }));
    clearNodeRunState(nodeId);
  }, [clearNodeRunState, nodeId, updateNodeData]);

  const applyToolPreset = useCallback((preset: VideoToolPreset) => {
    if (isUploadMode) {
      message.info('当前节点处于导入模式，视频工具预设会在切回生成模式后生效。');
      return;
    }

    updateNodeData(nodeId, prev => {
      const previousProps = prev.properties as unknown as LinghuiVideoNodeProperties;
      return {
        ...prev,
        properties: {
          ...prev.properties,
          ...preset.properties,
          prompt: mergePromptSnippet(String(previousProps.prompt ?? ''), preset.promptSnippet),
        },
      };
    });
    clearNodeRunState(nodeId);
    message.success(`已应用 ${preset.label} 预设`);
  }, [clearNodeRunState, isUploadMode, message, nodeId, updateNodeData]);

  const activeToolPresets = activeTool
    ? VIDEO_TOOL_PRESETS[activeTool].buildPresets({
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
        refMode,
      })
    : [];

  return (
    <div className="linghuiEditorPanel" onMouseDown={e => e.stopPropagation()}>
      <div className="linghuiEditorHeader">
        <div>
          <div className="linghuiEditorTitle">视频节点</div>
          <div className="linghuiEditorSubtitle">
            {isUploadMode
              ? '当前处于导入模式，会直接输出挂载的视频产物'
              : upstreamSummary.length > 0
                ? `当前已注入 ${upstreamSummary.join('、')}；首个视觉输入会作为主参考，文本与音频描述会并入提示上下文`
                : '可上传本地视频，或连接图片 / 文本 / 音频 / 视频节点后生成视频'}
          </div>
        </div>
      </div>

      <div className="linghuiEditorToolBar">
        {VIDEO_TOOLBAR_ITEMS.map(item => (
          <button
            key={item.key}
            type="button"
            className={`linghuiEditorToolChip ${activeTool === item.key ? 'isActive' : ''}`}
            onClick={() => onToolChange(activeTool === item.key ? null : item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {activeTool && (
        <div className="linghuiEditorToolPanel">
          <div className="linghuiEditorToolPanelHeader">
            <div>
              <div className="linghuiEditorToolPanelTitle">{VIDEO_TOOL_PRESETS[activeTool].title}</div>
              <div className="linghuiEditorToolPanelDesc">
                {isUploadMode
                  ? '当前节点是导入模式，工具预设仅供参考；切回生成模式后再应用会更有效。'
                  : VIDEO_TOOL_PRESETS[activeTool].description}
              </div>
            </div>
            <Button size="small" onClick={() => onToolChange(null)}>
              收起
            </Button>
          </div>

          <div className="linghuiEditorToolPresetList">
            {activeToolPresets.map(preset => (
              <div key={preset.label} className="linghuiEditorToolPresetCard">
                <div className="linghuiEditorToolPresetBody">
                  <div className="linghuiEditorToolPresetTitle">{preset.label}</div>
                  <div className="linghuiEditorToolPresetDesc">{preset.description}</div>
                </div>
                <Button
                  type="primary"
                  size="small"
                  disabled={isUploadMode}
                  onClick={() => applyToolPreset(preset)}
                >
                  应用
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        className={`linghuiReferenceDropzone linghuiVideoDropzone ${previewSource ? 'hasPreview' : ''}`}
        onDragOver={event => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onDrop={handleDropVideo}
        onClick={handleSelectVideo}
        role="button"
        tabIndex={0}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            void handleSelectVideo();
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
            <UploadCloud size={28} />
            <div>拖入视频到这里</div>
            <div className="linghuiReferencePlaceholderHint">或点击选择本地视频素材</div>
          </div>
        )}
      </div>

      <div className="linghuiEditorRefModes">
        {REF_MODES.map(mode => (
          <button
            key={mode.key}
            className={`linghuiEditorRefModeTab ${refMode === mode.key ? 'isActive' : ''}`}
            onClick={() => updateProp('refMode', mode.key)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {referenceImages.length > 0 && !isUploadMode && (
        <div className="linghuiEditorAssetGroup">
          <div className="linghuiEditorAssetTitle">图片参考</div>
          <div className="linghuiEditorRefs">
            {referenceImages.map((ref, i) => {
              const src = getPreviewSource(ref.source);
              return (
                <div key={`${ref.source || ref.label || i}`} className="linghuiEditorRefThumb">
                  {src ? <img src={src} alt={ref.label || `参考 ${i + 1}`} /> : <ImageIcon size={16} />}
                  <span className="linghuiEditorRefBadge">{i + 1}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {referenceVideos.length > 0 && !isUploadMode && (
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
                      {index === 0 && referenceImages.length === 0 ? '可作为主视觉参考' : '作为补充视觉参考'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {referenceAudios.length > 0 && !isUploadMode && (
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
      )}

      <div className="linghuiEditorPrompt">
        <LinghuiPromptEditor
          value={prompt}
          onChange={handlePromptChange}
          references={promptReferences}
          placeholder={isUploadMode ? '导入模式下这里可先保留镜头备注，清空素材后会继续作为生成提示词使用' : '描述镜头动作、节奏和风格，输入 @ 引用上游产物'}
          darkTheme
          minHeight="80px"
          maxHeight="160px"
        />
        <div className="linghuiEditorPromptHint">{mentionHint}</div>
      </div>

      <div className="linghuiEditorToolbar">
        <div className="linghuiEditorToolbarLeft">
          <Button size="small" icon={<UploadCloud size={14} />} onClick={handleSelectVideo}>
            上传视频
          </Button>
          <Button size="small" icon={<Trash2 size={14} />} danger disabled={!source} onClick={handleClearVideo}>
            清空素材
          </Button>
          <Select
            size="small"
            className="linghuiEditorSelect"
            value={itvConfigId || undefined}
            placeholder="选择视频渠道"
            onChange={v => updateProp('itvConfigId', v)}
            options={providers}
            popupMatchSelectWidth={false}
            style={{ minWidth: 140 }}
            disabled={isUploadMode}
          />

          <Select
            size="small"
            className="linghuiEditorSelect"
            value={`${aspectRatio}·${resolution}·${duration}s`}
            onChange={v => {
              const parts = v.split('·');
              updateProp('aspectRatio', parts[0]);
              updateProp('resolution', parts[1]);
              updateProp('duration', Number(parts[2]?.replace('s', '') ?? 5));
            }}
            popupMatchSelectWidth={false}
            options={VIDEO_ASPECT_RATIOS.flatMap(ar =>
              VIDEO_RESOLUTIONS.flatMap(res =>
                DURATION_OPTIONS.map(d => ({
                  value: `${ar.value}·${res.value}·${d.label}`,
                  label: `${ar.label} · ${res.label} · ${d.label}`,
                })),
              ),
            )}
            style={{ minWidth: 160 }}
            disabled={isUploadMode}
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
    </div>
  );
};
