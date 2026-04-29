import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App } from 'antd';
import type {
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiVideoCapability,
  LinghuiVideoNodeProperties,
  LinghuiVideoToolKey,
} from '../../../../types/linghui';
import { getLinghuiResultPrimaryMedia } from '../../../../types/linghui';
import { loadSettings } from '../../../../store/settings/core';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import { electronService } from '../../../../services/electronService';
import {
  getDefaultMediaSelection,
  listConfiguredModelSelectOptions,
  serializeMediaSelection,
} from '../../../../providers/channel/resolver';
import type { LinghuiPromptReferenceItem } from '../state/linghuiPromptReferences';
import { useLinghuiNodeEditorApi, useLinghuiNodeMutation } from '../../nodes/state/LinghuiNodeRunsContext';
import {
  VideoGeneratePanel,
  VideoPassThroughPanel,
  VideoToolSection,
} from './VideoNodeEditorPanels';
import {
  VIDEO_TOOL_PRESETS,
  formatVideoParameterSummary,
  getVideoFileExtensionFromSource,
  type ProviderOption,
  mergePromptSnippet,
  sanitizeFileSegment,
  writeVideoSourceToPath,
} from '../state/videoNodeEditorShared';
import {
  getVideoCapabilityDescriptor,
  listVideoCapabilities,
  resolveSupportedVideoCapability,
} from '../state/videoCapabilityUtils';

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
  workspaceId: _workspaceId = null,
  activeTool,
  onToolChange,
  onRun,
}) => {
  const { message } = App.useApp();
  const { executionQueue } = useLinghuiNodeEditorApi();
  const { clearNodeRunState, updateNodeData } = useLinghuiNodeMutation();
  const props = nodeData.properties as unknown as LinghuiVideoNodeProperties;
  const source = String(props.source ?? '').trim();
  const prompt = String(props.prompt ?? '');
  const itvSelection = String(props.itvSelection ?? '');
  const rawVideoCapability = props.videoCapability as LinghuiVideoCapability | undefined;
  const aspectRatio = String(props.aspectRatio ?? '16:9');
  const resolution = String(props.resolution ?? '720p');
  const duration = Number(props.duration ?? 5);
  const isPassThroughNode = Boolean(source);
  const passThroughPosterSource = String(props.posterSource ?? '').trim();
  const primaryVideo = getLinghuiResultPrimaryMedia(nodeRun?.result);
  const currentVideoSource = String(primaryVideo?.source ?? source ?? '').trim();
  const currentVideoMimeType = String(primaryVideo?.mimeType ?? '').trim();
  const currentVideoLabel = String(primaryVideo?.label ?? nodeData.label ?? 'video').trim() || 'video';
  const hasCurrentVideo = Boolean(currentVideoSource);
  const isExecutionQueueActive = executionQueue?.status === 'running' || executionQueue?.status === 'canceling';
  const isNodeQueuedByExecutionQueue = Boolean(isExecutionQueueActive && executionQueue?.queuedNodeIds.includes(nodeId));
  const isNodeRunningByExecutionQueue = Boolean(isExecutionQueueActive && executionQueue?.runningNodeIds.includes(nodeId));
  const isVideoGenerating = nodeRun?.status === 'running' || isNodeRunningByExecutionQueue || isNodeQueuedByExecutionQueue;
  const generateProgressText = nodeRun?.status === 'running'
    && typeof nodeRun.progress === 'number'
    && Number.isFinite(nodeRun.progress)
    && nodeRun.progress > 0
    ? ` ${Math.max(0, Math.min(100, Math.round(nodeRun.progress)))}%`
    : '';
  const normalizedRunMessage = String(nodeRun?.message ?? '').trim();
  const generateStateLabel = isNodeQueuedByExecutionQueue && nodeRun?.status !== 'running'
    ? '等待视频生成…'
    : normalizedRunMessage && normalizedRunMessage !== '准备执行'
      ? normalizedRunMessage
      : isVideoGenerating
        ? '生成中…'
        : '生成';
  const generateButtonText = isVideoGenerating ? `${generateStateLabel}${generateProgressText}` : '生成';

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
    if (isPassThroughNode || rawVideoCapability === videoCapability) {
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
    isPassThroughNode,
    message,
    nodeId,
    rawVideoCapability,
    updateNodeData,
    videoCapability,
  ]);

  useEffect(() => {
    if ((isPassThroughNode || !hasCurrentVideo) && activeTool) {
      onToolChange(null);
    }
  }, [activeTool, hasCurrentVideo, isPassThroughNode, onToolChange]);

  const updateProp = useCallback((key: string, value: unknown) => {
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: { ...prev.properties, [key]: value },
    }));
  }, [nodeId, updateNodeData]);

  const handlePromptChange = useCallback((value: string) => {
    updateProp('prompt', value);
  }, [updateProp]);

  const applyToolPreset = useCallback((preset: { label: string; promptSnippet?: string; properties?: Partial<LinghuiVideoNodeProperties> }) => {
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
  }, [clearNodeRunState, message, nodeId, updateNodeData]);

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

  const handleDownloadCurrentVideo = useCallback(async () => {
    if (!currentVideoSource) {
      message.info('当前还没有可下载的视频');
      return;
    }

    const extension = getVideoFileExtensionFromSource(currentVideoSource, currentVideoMimeType);
    const filename = `${sanitizeFileSegment(currentVideoLabel || nodeData.label || 'video', 'video')}.${extension}`;

    try {
      if (!electronService.isElectron()) {
        const anchor = document.createElement('a');
        anchor.href = toFileSystemDisplayUrl(currentVideoSource) || currentVideoSource;
        anchor.download = filename;
        anchor.click();
        message.success('视频已开始下载');
        return;
      }

      const result = await electronService.dialog.saveFile({
        title: '保存视频',
        defaultPath: filename,
        filters: [{ name: '视频', extensions: [extension] }],
      });

      if (!result.filePath) {
        return;
      }

      await writeVideoSourceToPath(currentVideoSource, result.filePath);
      message.success('视频已保存');
    } catch (error: any) {
      message.error(error?.message || '下载视频失败');
    }
  }, [
    currentVideoLabel,
    currentVideoMimeType,
    currentVideoSource,
    message,
    nodeData.label,
  ]);

  const handleRun = useCallback(() => {
    if (isVideoGenerating) {
      return;
    }
    onRun();
  }, [isVideoGenerating, onRun]);

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
            {isPassThroughNode
              ? '透传输出'
              : isVideoGenerating
                ? generateButtonText
                : hasCurrentVideo
                  ? `当前输出 · ${formatVideoParameterSummary({ aspectRatio, resolution, duration })}`
                  : capabilityDescriptor.label}
          </div>
        </div>
      </div>

      {!isPassThroughNode && hasCurrentVideo && (
        <VideoToolSection
          activeTool={activeTool}
          onClose={() => onToolChange(null)}
          onApplyPreset={applyToolPreset}
          presets={activeToolPresets}
        />
      )}

      {isPassThroughNode ? (
        <VideoPassThroughPanel
          source={source}
          posterSource={passThroughPosterSource}
          onDownload={handleDownloadCurrentVideo}
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
          prompt={prompt}
          onPromptChange={handlePromptChange}
          promptReferences={promptReferences}
          providers={providers}
          selectedProviderValue={resolvedSelectionKey}
          aspectRatio={aspectRatio}
          resolution={resolution}
          duration={duration}
          hasCurrentVideo={hasCurrentVideo}
          isGenerating={isVideoGenerating}
          generateButtonText={generateButtonText}
          onDownloadCurrentVideo={handleDownloadCurrentVideo}
          onUpdateProvider={handleProviderChange}
          onUpdateAspectRatio={value => updateProp('aspectRatio', value)}
          onUpdateResolution={value => updateProp('resolution', value)}
          onUpdateDuration={value => updateProp('duration', value)}
          onRun={handleRun}
        />
      )}
    </div>
  );
};
