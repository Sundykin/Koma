import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App } from 'antd';
import type {
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiVideoCapability,
  LinghuiVideoNodeProperties,
  LinghuiVideoToolKey,
} from '../../types/linghui';
import { electronService, openFileDialog } from '../../services/electronService';
import { importLinghuiWorkspaceAsset } from '../../store/linghuiStorage';
import { loadSettings } from '../../store/settings/core';
import {
  getDefaultMediaSelection,
  listConfiguredModelSelectOptions,
  serializeMediaSelection,
} from '../../providers/channel/resolver';
import type { LinghuiPromptReferenceItem } from './linghuiPromptReferences';
import { useLinghuiNodeMutation } from './nodes/LinghuiNodeRunsContext';
import {
  VideoGeneratePanel,
  VideoImportPanel,
  VideoToolSection,
} from './VideoNodeEditorPanels';
import {
  VIDEO_TOOL_PRESETS,
  type ProviderOption,
  type VideoToolPreset,
  getPreviewSource,
  mergePromptSnippet,
} from './videoNodeEditorShared';
import {
  getVideoCapabilityDescriptor,
  listVideoCapabilities,
  resolveSupportedVideoCapability,
  type LinghuiVisualReferenceRole,
} from './videoCapabilityUtils';

interface VideoNodeEditorProps {
  nodeId: string;
  nodeData: LinghuiNodeData;
  nodeRun?: LinghuiNodeRunState;
  referenceImages: Array<{ source?: string; label?: string }>;
  referenceVideos: Array<{ source?: string; posterSource?: string; label?: string }>;
  referenceAudios: Array<{ source?: string; label?: string }>;
  promptReferences?: LinghuiPromptReferenceItem[];
  workspaceId?: string | null;
  activeTool: LinghuiVideoToolKey | null;
  onToolChange: (tool: LinghuiVideoToolKey | null) => void;
  onRun: () => void;
}

export const VideoNodeEditor: React.FC<VideoNodeEditorProps> = ({
  nodeId,
  nodeData,
  nodeRun,
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
  const itvSelection = String(props.itvSelection ?? '');
  const rawVideoCapability = props.videoCapability as LinghuiVideoCapability | undefined;
  const aspectRatio = String(props.aspectRatio ?? '16:9');
  const resolution = String(props.resolution ?? '720p');
  const duration = Number(props.duration ?? 5);
  const previewSource = getPreviewSource(source);
  const uploadedPoster = getPreviewSource(posterSource);
  const isUploadMode = Boolean(source.trim());
  const rawResultVideoSource = String(nodeRun?.result?.primary?.source ?? '').trim();
  const rawResultPosterSource = String(nodeRun?.result?.primary?.posterSource ?? '').trim();
  const resultVideoSource = getPreviewSource(rawResultVideoSource);
  const resultPosterSource = getPreviewSource(rawResultPosterSource);

  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [fallbackSelectionKey, setFallbackSelectionKey] = useState('');

  const resolvedSelectionKey = itvSelection || fallbackSelectionKey || providers[0]?.value || '';
  const activeProvider = useMemo(
    () => providers.find(option => option.value === resolvedSelectionKey) || providers[0],
    [providers, resolvedSelectionKey],
  );
  const supportedCapabilities = useMemo(() => {
    if (activeProvider?.capabilities?.length) {
      return listVideoCapabilities(activeProvider.capabilities);
    }
    if (rawVideoCapability) {
      return listVideoCapabilities([rawVideoCapability]);
    }
    return ['video.text-to-video'] as LinghuiVideoCapability[];
  }, [activeProvider, rawVideoCapability]);
  const videoCapability = useMemo(
    () => resolveSupportedVideoCapability(rawVideoCapability, supportedCapabilities),
    [rawVideoCapability, supportedCapabilities],
  );
  const capabilityDescriptor = useMemo(
    () => getVideoCapabilityDescriptor(videoCapability),
    [videoCapability],
  );

  const visualReferenceRoles = useMemo(() => {
    const sequence = [
      ...referenceImages.map(ref => ({ key: `image:${ref.source || ref.label || ''}` })),
      ...referenceVideos.map(ref => ({ key: `video:${ref.posterSource || ref.source || ref.label || ''}` })),
    ].filter(item => item.key.split(':')[1]);
    const roleMap = new Map<string, LinghuiVisualReferenceRole>();

    sequence.forEach(item => {
      roleMap.set(item.key, 'reference');
    });

    if (!sequence.length) {
      return roleMap;
    }

    if (videoCapability === 'video.text-to-video') {
      sequence.forEach(item => {
        roleMap.set(item.key, 'prompt-only');
      });
      return roleMap;
    }

    if (videoCapability === 'video.image-to-video') {
      roleMap.set(sequence[0].key, 'primary');
      return roleMap;
    }

    if (videoCapability === 'video.start-end-to-video') {
      sequence.forEach(item => {
        roleMap.set(item.key, 'unused');
      });
      roleMap.set(sequence[0].key, 'start');
      roleMap.set(sequence[sequence.length - 1].key, sequence.length === 1 ? 'start' : 'end');
    }

    return roleMap;
  }, [videoCapability, referenceImages, referenceVideos]);

  const mentionHint = isUploadMode
    ? '当前节点已挂载本地视频，会以导入模式输出；清空后可切回生成模式。'
    : promptReferences.length > 0
      ? `输入 @ 可直接引用上游图片、视频封面、音频描述和文本产物。${capabilityDescriptor.inputHint}`
      : `连接图片、文本、音频或上游视频节点后，才会出现可引用的上游产物。${capabilityDescriptor.inputHint}`;

  useEffect(() => {
    loadSettings().then(settings => {
      const nextProviders = listConfiguredModelSelectOptions(settings, 'itv').map(option => ({
        value: option.value,
        label: `${option.channelLabel} / ${option.modelLabel}`,
        capabilities: listVideoCapabilities(option.capabilities),
        channelLabel: option.channelLabel,
        modelLabel: option.modelLabel,
      }));
      setProviders(nextProviders);
      setFallbackSelectionKey(
        serializeMediaSelection(getDefaultMediaSelection(settings, 'itv')) || nextProviders[0]?.value || '',
      );
    });
  }, []);

  useEffect(() => {
    if (isUploadMode || rawVideoCapability === videoCapability) {
      return;
    }

    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: {
        ...prev.properties,
        videoCapability,
      },
    }));
    clearNodeRunState(nodeId);

    if (activeProvider && rawVideoCapability) {
      const previousLabel = getVideoCapabilityDescriptor(rawVideoCapability).label;
      message.info(`当前模型不支持${previousLabel}，已切换为${capabilityDescriptor.label}`);
    }
  }, [
    activeProvider,
    capabilityDescriptor.label,
    clearNodeRunState,
    isUploadMode,
    message,
    nodeId,
    rawVideoCapability,
    updateNodeData,
    videoCapability,
  ]);

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

  const handleVideoCapabilityChange = useCallback((nextCapability: LinghuiVideoCapability) => {
    if (nextCapability === videoCapability) {
      return;
    }

    updateProp('videoCapability', nextCapability);
    clearNodeRunState(nodeId);
  }, [clearNodeRunState, nodeId, updateProp, videoCapability]);

  const handleProviderChange = useCallback((value: string) => {
    const nextProvider = providers.find(option => option.value === value);
    const previousCapability = rawVideoCapability || videoCapability;
    const nextCapability = resolveSupportedVideoCapability(previousCapability, nextProvider?.capabilities);

    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: {
        ...prev.properties,
        itvSelection: value,
        videoCapability: nextCapability,
      },
    }));
    clearNodeRunState(nodeId);

    if (nextProvider && nextCapability !== previousCapability) {
      const previousLabel = getVideoCapabilityDescriptor(previousCapability).label;
      const nextLabel = getVideoCapabilityDescriptor(nextCapability).label;
      message.info(`当前模型不支持${previousLabel}，已切换为${nextLabel}`);
    }
  }, [
    clearNodeRunState,
    message,
    nodeId,
    providers,
    rawVideoCapability,
    updateNodeData,
    videoCapability,
  ]);

  const switchToGenerateMode = useCallback(() => {
    handleClearVideo();
    message.success('已切回生成模式');
  }, [handleClearVideo, message]);

  const activeToolPresets = activeTool
    ? VIDEO_TOOL_PRESETS[activeTool].buildPresets({
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
        videoCapability,
      })
    : [];

  return (
    <div className="linghuiEditorPanel" onMouseDown={event => event.stopPropagation()}>
      <div className="linghuiEditorHeader">
        <div>
          <div className="linghuiEditorTitle">视频节点</div>
          <div className="linghuiEditorSubtitle">
            {isUploadMode
              ? '当前处于导入模式，会直接输出挂载的视频产物。'
              : referenceImages.length + referenceVideos.length + referenceAudios.length > 0
                ? '当前会综合上游图片、视频、音频和文本输入来组织镜头。'
                : '当前以生成模式工作，可组合图片、视频、音频和文本输入来组织镜头。'}
          </div>
          {!isUploadMode && (
            <div className="linghuiEditorPromptHint">
              {capabilityDescriptor.shortDescription}
            </div>
          )}
        </div>
      </div>

      <VideoToolSection
        activeTool={activeTool}
        isUploadMode={isUploadMode}
        onClose={() => onToolChange(null)}
        onSwitchToGenerateMode={switchToGenerateMode}
        onApplyPreset={applyToolPreset}
        presets={activeToolPresets}
      />

      <div className="linghuiEditorRefModes">
        <button
          className={`linghuiEditorRefModeTab ${!isUploadMode ? 'isActive' : ''}`}
          onClick={() => {
            if (isUploadMode) {
              switchToGenerateMode();
            }
          }}
        >
          生成视频
        </button>
        <button
          className={`linghuiEditorRefModeTab ${isUploadMode ? 'isActive' : ''}`}
          onClick={() => {
            if (!isUploadMode) {
              void handleSelectVideo();
            }
          }}
        >
          导入输出
        </button>
      </div>

      {isUploadMode ? (
        <VideoImportPanel
          previewSource={previewSource}
          uploadedPoster={uploadedPoster}
          hasSource={Boolean(source)}
          nodeLabel={nodeData.label}
          onSelectVideo={() => {
            void handleSelectVideo();
          }}
          onDropVideo={handleDropVideo}
          onClearVideo={handleClearVideo}
          onRun={onRun}
        />
      ) : (
        <VideoGeneratePanel
          videoCapability={videoCapability}
          supportedCapabilities={supportedCapabilities}
          capabilityDescriptor={capabilityDescriptor}
          onVideoCapabilityChange={handleVideoCapabilityChange}
          referenceImages={referenceImages}
          referenceVideos={referenceVideos}
          referenceAudios={referenceAudios}
          visualReferenceRoles={visualReferenceRoles}
          prompt={prompt}
          onPromptChange={handlePromptChange}
          promptReferences={promptReferences}
          mentionHint={mentionHint}
          resultVideoSource={resultVideoSource}
          resultPosterSource={resultPosterSource}
          providers={providers}
          selectedProviderValue={resolvedSelectionKey}
          aspectRatio={aspectRatio}
          resolution={resolution}
          duration={duration}
          onUpdateProvider={handleProviderChange}
          onUpdateCompositeOptions={value => {
            const parts = value.split('·');
            updateProp('aspectRatio', parts[0]);
            updateProp('resolution', parts[1]);
            updateProp('duration', Number(parts[2]?.replace('s', '') ?? 5));
          }}
          onRun={onRun}
          onSelectVideo={() => {
            void handleSelectVideo();
          }}
        />
      )}
    </div>
  );
};
