import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App } from 'antd';
import type {
  LinghuiNodeData,
  LinghuiNodeRunState,
  LinghuiVideoCapability,
  LinghuiVideoNodeProperties,
  LinghuiVideoToolKey,
} from '../../types/linghui';
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
  VideoPassThroughPanel,
  VideoToolSection,
} from './VideoNodeEditorPanels';
import {
  VIDEO_TOOL_PRESETS,
  type ProviderOption,
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
  workspaceId: _workspaceId = null,
  activeTool,
  onToolChange,
  onRun,
}) => {
  const { message } = App.useApp();
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
  const generatedVideoSource = String(nodeRun?.result?.kind === 'video' ? nodeRun.result.primary?.source ?? '' : '').trim();
  const generatedPosterSource = String(nodeRun?.result?.kind === 'video' ? nodeRun.result.primary?.posterSource ?? '' : '').trim();
  const generatedVideoLabel = String(nodeRun?.result?.kind === 'video' ? nodeRun.result.primary?.label ?? '' : '').trim();

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

  const mentionHint = promptReferences.length > 0
    ? `输入 @ 可直接引用上游图片、视频封面、音频描述和文本产物。${capabilityDescriptor.inputHint}`
    : `连接图片、文本、音频或上游视频节点后，可在提示词中通过 @ 引用。${capabilityDescriptor.inputHint}`;

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
    if (isPassThroughNode && activeTool) {
      onToolChange(null);
    }
  }, [activeTool, isPassThroughNode, onToolChange]);

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
            {isPassThroughNode ? '透传输出' : capabilityDescriptor.label}
          </div>
        </div>
      </div>

      {!isPassThroughNode && (
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
          providers={providers}
          selectedProviderValue={resolvedSelectionKey}
          aspectRatio={aspectRatio}
          resolution={resolution}
          duration={duration}
          outputSource={generatedVideoSource}
          outputPosterSource={generatedPosterSource}
          outputLabel={generatedVideoLabel}
          onUpdateProvider={handleProviderChange}
          onUpdateAspectRatio={value => updateProp('aspectRatio', value)}
          onUpdateResolution={value => updateProp('resolution', value)}
          onUpdateDuration={value => updateProp('duration', value)}
          onRun={onRun}
        />
      )}
    </div>
  );
};
