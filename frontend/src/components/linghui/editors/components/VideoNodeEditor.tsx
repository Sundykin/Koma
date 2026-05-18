import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App } from 'antd';
import type {
  LinghuiNodeData,
  LinghuiImageAssetItem,
  LinghuiMediaItem,
  LinghuiNodeRunState,
  LinghuiVideoCapability,
  LinghuiVideoNodeProperties,
  LinghuiVideoToolKey,
} from '../../../../types/linghui';
import { getLinghuiResultPrimaryMedia } from '../../../../types/linghui';
import { loadSettings } from '../../../../store/settings/core';
import { toFileSystemDisplayUrl } from '../../../../services/fileSystemPort';
import { electronService } from '../../../../services/electronService';
import { ffmpegManager } from '../../../../services/ffmpegManager';
import { base64ToBytes, stripDataHeader } from '../../../../utils/encoding';
import { fromKomaLocalUrl } from '../../../../utils/urlUtils';
import {
  getDefaultMediaSelection,
  listConfiguredModelSelectOptions,
  serializeMediaSelection,
} from '../../../../providers/channel/resolver';
import {
  DEFAULT_VIDEO_DURATION_SPEC,
  clampDurationToSpec,
  getDurationSpecForITVSelection,
  getDurationSpecForModel,
  isAllowedDurationForSpec,
  type VideoDurationSpec,
} from '../../../../providers/itv/durationSpec';
import type { LinghuiPromptReferenceItem } from '../state/linghuiPromptReferences';
import { useLinghuiNodeEditorApi, useLinghuiNodeMutation } from '../../nodes/state/LinghuiNodeRunsContext';
import { useLinghuiActionLock } from '../hooks/useLinghuiActionLock';
import {
  VideoGeneratePanel,
  VideoPassThroughPanel,
  VideoToolSection,
} from './VideoNodeEditorPanels';
import {
  VIDEO_TOOL_PRESETS,
  decodeLinghuiMediaSource,
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
import { nanoid } from 'nanoid';

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
  onCreateDerivedFrames?: (nodeId: string, items: LinghuiImageAssetItem[]) => void;
  onCreateDerivedVideos?: (nodeId: string, items: LinghuiMediaItem[]) => void;
  onCreateDerivedAnalysis?: (
    nodeId: string,
    draft: { label?: string; content: string; source?: string; durationSec?: number },
  ) => string | null;
  onRun: () => void;
}

function inferVideoFrameMime(source: string): string {
  const normalized = source.toLowerCase();
  if (normalized.includes('.webm')) return 'video/webm';
  if (normalized.includes('.mov')) return 'video/quicktime';
  return 'video/mp4';
}

async function resolveVideoElementSource(source: string): Promise<{ url: string; dispose?: () => void }> {
  const displayUrl = toFileSystemDisplayUrl(source);
  if (displayUrl || /^https?:\/\//i.test(source) || /^data:/i.test(source) || /^blob:/i.test(source)) {
    return { url: displayUrl || source };
  }

  const rawPath = decodeLinghuiMediaSource(source);
  const base64 = await electronService.fs.readFileAsBase64(rawPath);
  const objectUrl = URL.createObjectURL(new Blob([base64ToBytes(base64)], { type: inferVideoFrameMime(rawPath) }));
  return {
    url: objectUrl,
    dispose: () => URL.revokeObjectURL(objectUrl),
  };
}

async function materializeVideoForFfmpeg(source: string, outputDir: string, filenameHint: string): Promise<string> {
  const decoded = fromKomaLocalUrl(decodeLinghuiMediaSource(source));
  if (/^https?:\/\//i.test(decoded)) {
      const targetPath = `${outputDir}/${sanitizeFileSegment(filenameHint, 'video-source')}.${getVideoFileExtensionFromSource(decoded)}`;
      await electronService.fs.downloadFile(decoded, targetPath);
      return targetPath;
    }
  if (/^data:/i.test(decoded)) {
    const targetPath = `${outputDir}/${sanitizeFileSegment(filenameHint, 'video-source')}.${getVideoFileExtensionFromSource(decoded, inferVideoFrameMime(decoded))}`;
    await electronService.fs.writeFile(targetPath, stripDataHeader(decoded).base64, true);
    return targetPath;
  }
  if (/^blob:/i.test(decoded)) {
    const response = await fetch(decoded);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const targetPath = `${outputDir}/${sanitizeFileSegment(filenameHint, 'video-source')}.mp4`;
    await electronService.fs.writeFileBuffer(targetPath, bytes);
    return targetPath;
  }
  return decoded;
}

function waitForVideoEvent(video: HTMLVideoElement, eventName: keyof HTMLMediaElementEventMap): Promise<void> {
  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('无法读取视频内容'));
    };
    const cleanup = () => {
      video.removeEventListener(eventName, onReady);
      video.removeEventListener('error', onError);
    };
    video.addEventListener(eventName, onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

async function extractFrameAt(video: HTMLVideoElement, timeSec: number, label: string): Promise<LinghuiImageAssetItem> {
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  const targetTime = duration > 0 ? Math.max(0, Math.min(duration - 0.05, timeSec)) : 0;
  if (Math.abs(video.currentTime - targetTime) > 0.01) {
    video.currentTime = targetTime;
    await waitForVideoEvent(video, 'seeked');
  }

  const width = Math.max(1, Math.round(video.videoWidth || 1280));
  const height = Math.max(1, Math.round(video.videoHeight || 720));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前环境不支持视频截图');
  context.drawImage(video, 0, 0, width, height);

  return {
    id: `video-frame-${nanoid(8)}`,
    source: canvas.toDataURL('image/png'),
    label,
    width,
    height,
    mimeType: 'image/png',
    aspectRatio: `${width}:${height}`,
  };
}

async function extractVideoFrameItems({
  source,
  mode,
  labelPrefix,
}: {
  source: string;
  mode: 'first' | 'middle' | 'last' | 'triple';
  labelPrefix: string;
}): Promise<LinghuiImageAssetItem[]> {
  const resolved = await resolveVideoElementSource(source);
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = resolved.url;

  try {
    await waitForVideoEvent(video, 'loadedmetadata');
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const specs = mode === 'triple'
      ? [
          { time: 0.05, suffix: '首帧' },
          { time: duration > 0 ? duration / 2 : 0.05, suffix: '中帧' },
          { time: duration > 0 ? Math.max(0.05, duration - 0.05) : 0.05, suffix: '尾帧' },
        ]
      : [{
          time: mode === 'middle'
            ? duration > 0 ? duration / 2 : 0.05
            : mode === 'last'
              ? duration > 0 ? Math.max(0.05, duration - 0.05) : 0.05
              : 0.05,
          suffix: mode === 'middle' ? '中帧' : mode === 'last' ? '尾帧' : '首帧',
        }];

    const items: LinghuiImageAssetItem[] = [];
    for (const spec of specs) {
      items.push(await extractFrameAt(video, spec.time, `${labelPrefix}-${spec.suffix}`));
    }
    return items;
  } finally {
    video.removeAttribute('src');
    video.load();
    resolved.dispose?.();
  }
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
  onCreateDerivedFrames,
  onCreateDerivedVideos,
  onCreateDerivedAnalysis,
  onRun,
}) => {
  const { message } = App.useApp();
  const { canvasInteractionVersion, executionQueue } = useLinghuiNodeEditorApi();
  const { clearNodeRunState, updateNodeData } = useLinghuiNodeMutation();
  const props = nodeData.properties as unknown as LinghuiVideoNodeProperties;
  const source = String(props.source ?? '').trim();
  const prompt = String(props.prompt ?? '');
  const itvSelection = String(props.itvSelection ?? '');
  const rawVideoCapability = props.videoCapability as LinghuiVideoCapability | undefined;
  const aspectRatio = String(props.aspectRatio ?? '16:9');
  const resolution = String(props.resolution ?? '720p');
  // 对齐 LibTV "视频参考"：mode='import' 时即使没上传 source 也走纯素材分支，不展示 prompt / 生成按钮。
  const videoNodeMode = props.mode === 'import' ? 'import' : 'generate';
  const isPassThroughNode = videoNodeMode === 'import' || Boolean(source);
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
  const { locked: isRunActionLocked, runWithActionLock } = useLinghuiActionLock(isVideoGenerating);
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
  const [durationSpec, setDurationSpec] = useState<VideoDurationSpec | null>(null);
  const [extractingFrames, setExtractingFrames] = useState(false);
  const [trimmingVideo, setTrimmingVideo] = useState(false);
  const [upscalingVideo, setUpscalingVideo] = useState(false);
  const currentVideoDurationSec = Math.max(0.1, Number(primaryVideo?.durationSec ?? props.duration ?? 5) || 5);
  const [clipRange, setClipRange] = useState(() => ({
    start: 0,
    end: currentVideoDurationSec,
  }));

  const resolvedSelectionKey = itvSelection || fallbackSelectionKey || providers[0]?.value || '';
  const activeProvider = useMemo(
    () => providers.find(option => option.value === resolvedSelectionKey) || providers[0],
    [providers, resolvedSelectionKey],
  );
  const selectionModelDurationSpec = useMemo(() => {
    const sepIndex = resolvedSelectionKey.indexOf('::');
    return getDurationSpecForModel(sepIndex > 0 ? resolvedSelectionKey.slice(sepIndex + 2) : undefined);
  }, [resolvedSelectionKey]);
  const activeDurationSpec = activeProvider?.durationSpec
    ?? selectionModelDurationSpec
    ?? durationSpec
    ?? DEFAULT_VIDEO_DURATION_SPEC;
  const hasResolvedDurationSpec = Boolean(activeProvider?.durationSpec || durationSpec || selectionModelDurationSpec);
  const duration = clampDurationToSpec(props.duration, activeDurationSpec);
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
      const channelSpecs = (settings.channelConfigs || [])
        .filter(channel => channel.category === 'itv')
        .map(channel => ({
          id: channel.id,
          providerType: channel.providerType,
          models: channel.models,
        }));
      const nextProviders = listConfiguredModelSelectOptions(settings, 'itv').map(option => ({
        value: option.value,
        label: `${option.channelLabel} / ${option.modelLabel}`,
        capabilities: listVideoCapabilities(option.capabilities),
        providerType: option.providerType,
        durationSpec: getDurationSpecForITVSelection(option.value, channelSpecs),
        channelLabel: option.channelLabel,
        modelLabel: option.modelLabel,
      }));
      setProviders(nextProviders);
      const fallbackKey = serializeMediaSelection(getDefaultMediaSelection(settings, 'itv')) || nextProviders[0]?.value || '';
      setFallbackSelectionKey(fallbackKey);
      setDurationSpec(getDurationSpecForITVSelection(fallbackKey, channelSpecs));
    });
  }, []);

  useEffect(() => {
    if (isPassThroughNode || !hasResolvedDurationSpec) {
      return;
    }
    if (isAllowedDurationForSpec(Number(props.duration), activeDurationSpec)) {
      return;
    }
    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: {
        ...prev.properties,
        duration,
      },
    }));
  }, [activeDurationSpec, duration, hasResolvedDurationSpec, isPassThroughNode, nodeId, props.duration, updateNodeData]);

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
    if (!hasCurrentVideo && activeTool) {
      onToolChange(null);
    }
  }, [activeTool, hasCurrentVideo, onToolChange]);

  useEffect(() => {
    setClipRange(previous => {
      const end = Math.min(Math.max(0.1, previous.end || currentVideoDurationSec), currentVideoDurationSec);
      const start = Math.min(Math.max(0, previous.start), Math.max(0, end - 0.1));
      return { start, end };
    });
  }, [currentVideoDurationSec]);

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
    const nextDurationSpec = nextProvider?.durationSpec ?? durationSpec ?? DEFAULT_VIDEO_DURATION_SPEC;
    const nextDuration = clampDurationToSpec(props.duration, nextDurationSpec);

    updateNodeData(nodeId, prev => ({
      ...prev,
      properties: {
        ...prev.properties,
        itvSelection: value,
        videoCapability: nextCapability,
        duration: nextDuration,
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
    durationSpec,
    rawVideoCapability,
    props.duration,
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

  const handleExtractFrames = useCallback(async (mode: 'first' | 'middle' | 'last' | 'triple') => {
    if (!currentVideoSource) {
      message.info('当前还没有可截图的视频');
      return;
    }
    if (!onCreateDerivedFrames) {
      message.error('当前画布无法派生视频截图');
      return;
    }

    setExtractingFrames(true);
    try {
      const items = await extractVideoFrameItems({
        source: currentVideoSource,
        mode,
        labelPrefix: currentVideoLabel || nodeData.label || '视频截图',
      });
      onCreateDerivedFrames(nodeId, items);
      onToolChange(null);
      message.success(`已抽取 ${items.length} 张视频截图`);
    } catch (error: any) {
      message.error(error?.message || '视频截图失败');
    } finally {
      setExtractingFrames(false);
    }
  }, [currentVideoLabel, currentVideoSource, message, nodeData.label, nodeId, onCreateDerivedFrames, onToolChange]);

  const handleClipRangeChange = useCallback((range: { start: number; end: number }) => {
    const end = Math.min(Math.max(0.1, Number(range.end) || 0.1), currentVideoDurationSec);
    const start = Math.min(Math.max(0, Number(range.start) || 0), Math.max(0, end - 0.1));
    setClipRange({ start, end });
  }, [currentVideoDurationSec]);

  const handleTrimVideo = useCallback(async () => {
    if (!currentVideoSource) {
      message.info('当前还没有可剪辑的视频');
      return;
    }
    if (!onCreateDerivedVideos) {
      message.error('当前画布无法派生视频片段');
      return;
    }
    if (clipRange.end <= clipRange.start) {
      message.warning('结束时间必须大于开始时间');
      return;
    }

    setTrimmingVideo(true);
    try {
      const cacheDir = await ffmpegManager.getCacheDir('linghui-video-trim');
      const safeLabel = sanitizeFileSegment(currentVideoLabel || nodeData.label || '视频片段', 'video-clip');
      const sourcePath = await materializeVideoForFfmpeg(currentVideoSource, cacheDir, safeLabel);
      const outputPath = `${cacheDir}/${safeLabel}-${Math.round(clipRange.start * 10)}-${Math.round(clipRange.end * 10)}-${nanoid(6)}.mp4`;
      const trimmedPath = await ffmpegManager.trimVideo({
        input: sourcePath,
        output: outputPath,
        startTime: clipRange.start,
        endTime: clipRange.end,
      });
      onCreateDerivedVideos(nodeId, [{
        kind: 'video',
        source: trimmedPath,
        posterSource: passThroughPosterSource,
        label: `${currentVideoLabel || nodeData.label || '视频'}-剪辑`,
        durationSec: clipRange.end - clipRange.start,
        mimeType: 'video/mp4',
        metadata: {
          sourceNodeId: nodeId,
          trim: {
            startTime: clipRange.start,
            endTime: clipRange.end,
            source: currentVideoSource,
          },
        },
      }]);
      onToolChange(null);
      message.success('已裁剪视频片段');
    } catch (error: any) {
      message.error(error?.message || '视频剪辑失败');
    } finally {
      setTrimmingVideo(false);
    }
  }, [
    clipRange.end,
    clipRange.start,
    currentVideoLabel,
    currentVideoSource,
    message,
    nodeData.label,
    nodeId,
    onCreateDerivedVideos,
    onToolChange,
    passThroughPosterSource,
  ]);

  const handleUpscaleVideo = useCallback(async (factor: 2 | 4) => {
    if (!currentVideoSource) {
      message.info('当前还没有可高清处理的视频');
      return;
    }
    if (!onCreateDerivedVideos) {
      message.error('当前画布无法派生高清视频');
      return;
    }

    setUpscalingVideo(true);
    try {
      const cacheDir = await ffmpegManager.getCacheDir('linghui-video-upscale');
      const safeLabel = sanitizeFileSegment(currentVideoLabel || nodeData.label || '高清视频', 'video-upscale');
      const sourcePath = await materializeVideoForFfmpeg(currentVideoSource, cacheDir, safeLabel);
      const outputPath = `${cacheDir}/${safeLabel}-${factor}x-${nanoid(6)}.mp4`;
      const upscaledPath = await ffmpegManager.upscaleVideo({
        input: sourcePath,
        output: outputPath,
        factor,
        sharpenAmount: factor === 4 ? 0.35 : 0.45,
      });
      onCreateDerivedVideos(nodeId, [{
        kind: 'video',
        source: upscaledPath,
        posterSource: passThroughPosterSource,
        label: `${currentVideoLabel || nodeData.label || '视频'}-高清${factor}x`,
        durationSec: currentVideoDurationSec,
        mimeType: 'video/mp4',
        metadata: {
          sourceNodeId: nodeId,
          upscale: {
            factor,
            source: currentVideoSource,
          },
        },
      }]);
      onToolChange(null);
      message.success(`已生成高清 ${factor}x 视频`);
    } catch (error: any) {
      message.error(error?.message || '视频高清处理失败');
    } finally {
      setUpscalingVideo(false);
    }
  }, [
    currentVideoDurationSec,
    currentVideoLabel,
    currentVideoSource,
    message,
    nodeData.label,
    nodeId,
    onCreateDerivedVideos,
    onToolChange,
    passThroughPosterSource,
  ]);

  const handleCreateVideoAnalysis = useCallback(() => {
    if (!currentVideoSource) {
      message.info('当前还没有可解析的视频');
      return;
    }
    if (!onCreateDerivedAnalysis) {
      message.error('当前画布无法派生视频解析');
      return;
    }

    const basePrompt = prompt.trim();
    const durationText = currentVideoDurationSec > 0
      ? `${Number(currentVideoDurationSec.toFixed(1))}s`
      : '未知';
    const referenceSummary = [
      referenceImages.length > 0 ? `图片参考：${referenceImages.length} 张` : '',
      referenceVideos.length > 0 ? `视频参考：${referenceVideos.length} 条` : '',
      referenceAudios.length > 0 ? `音频参考：${referenceAudios.length} 条` : '',
    ].filter(Boolean).join(' / ') || '无额外上游参考';
    const content = [
      `# ${currentVideoLabel || nodeData.label || '视频解析'}`,
      '',
      `- 视频来源：${currentVideoSource}`,
      `- 估计时长：${durationText}`,
      `- 参考素材：${referenceSummary}`,
      '',
      '## 用户提示词',
      basePrompt || '未填写',
      '',
      '## 镜头解析草稿',
      '1. 开场：建立主体、空间关系和画面基调。',
      '2. 推进：保持主体清晰，延续当前视频的运动方向与节奏。',
      '3. 收束：形成明确视觉落点，避免跳切和主体漂移。',
      '',
      '## 可继续生成的提示词',
      [
        basePrompt || '延续当前视频主体与场景',
        `参考视频时长约 ${durationText}`,
        '镜头运动稳定，动作连贯，主体边缘清晰，画面节奏自然。',
      ].join('，'),
    ].join('\n');

    const createdId = onCreateDerivedAnalysis(nodeId, {
      label: `${currentVideoLabel || nodeData.label || '视频'}-解析`,
      content,
      source: currentVideoSource,
      durationSec: currentVideoDurationSec,
    });
    if (createdId) {
      onToolChange(null);
      message.success('已创建视频解析文本节点');
    } else {
      message.error('创建视频解析失败');
    }
  }, [
    currentVideoDurationSec,
    currentVideoLabel,
    currentVideoSource,
    message,
    nodeData.label,
    nodeId,
    onCreateDerivedAnalysis,
    onToolChange,
    prompt,
    referenceAudios.length,
    referenceImages.length,
    referenceVideos.length,
  ]);

  const handleRun = useCallback(() => {
    if (isVideoGenerating) {
      return;
    }
    runWithActionLock(onRun);
  }, [isVideoGenerating, onRun, runWithActionLock]);

  const activeToolPresets = activeTool
    ? VIDEO_TOOL_PRESETS[activeTool].buildPresets({
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
        videoCapability,
      })
    : [];

  if (!isPassThroughNode) {
    return (
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
        durationSpec={activeDurationSpec}
        hasCurrentVideo={hasCurrentVideo}
        isGenerating={isVideoGenerating}
        isRunActionLocked={isRunActionLocked}
        generateButtonText={generateButtonText}
        onDownloadCurrentVideo={handleDownloadCurrentVideo}
        onUpdateProvider={handleProviderChange}
        onUpdateAspectRatio={value => updateProp('aspectRatio', value)}
        onUpdateResolution={value => updateProp('resolution', value)}
        onUpdateDuration={value => updateProp('duration', clampDurationToSpec(value, activeDurationSpec))}
        onRun={handleRun}
        canvasInteractionVersion={canvasInteractionVersion}
      />
    );
  }

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

      {hasCurrentVideo && (
        <VideoToolSection
          activeTool={activeTool}
          onClose={() => onToolChange(null)}
          onApplyPreset={applyToolPreset}
          onExtractFrames={handleExtractFrames}
          onUpscaleVideo={handleUpscaleVideo}
          upscalingVideo={upscalingVideo}
          onCreateVideoAnalysis={handleCreateVideoAnalysis}
          clipRange={{ ...clipRange, duration: currentVideoDurationSec }}
          onClipRangeChange={handleClipRangeChange}
          onTrimVideo={handleTrimVideo}
          trimmingVideo={trimmingVideo}
          extractingFrames={extractingFrames}
          presets={activeToolPresets}
        />
      )}

      {isPassThroughNode ? (
        <VideoPassThroughPanel
          source={currentVideoSource || source}
          posterSource={passThroughPosterSource}
          onDownload={handleDownloadCurrentVideo}
        />
      ) : null}
    </div>
  );
};
