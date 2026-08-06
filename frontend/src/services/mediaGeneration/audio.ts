import type {
  MediaKind,
  MediaOwnerRef,
  StoredMediaAsset,
  TTSRequest,
} from '../../types';


import { persistMediaAsset } from '../mediaPersistenceService';
import { bindOwnerRefMedia } from '../mediaTaskBindingService';
import { getProjectTTSProvider } from '../../providers';
import '../taskHandlers'; // 副作用 import：注册内置 TTI/ITV/TTS 任务处理器








import { getProjectPath } from '../../store/projectStore';
import { ffmpegManager } from '../ffmpegManager';
import { electronService } from '../electronService';


import {
  buildExecutionMetadata,
  resolveProviderAndContext,
  mergeMediaMetadata,
  durationSecToMs,
  logger,
} from './helpers';
import { pollAndFinalizeViaMain } from './tasks';

export async function generateAudio(params: {
  projectId: string;
  ownerRef: MediaOwnerRef;
  request: TTSRequest;
  ttsSelection?: string;
  taskName?: string;
}): Promise<StoredMediaAsset> {
  const { projectId, ownerRef, request, ttsSelection, taskName } = params;
  const { provider, resolvedContext } = await resolveProviderAndContext({
    category: 'tts',
    selectionKey: ttsSelection,
    capability: 'speech.text-to-speech',
    getProvider: getProjectTTSProvider,
    missingError: '未配置 TTS 服务',
  });
  const executionMetadata = buildExecutionMetadata(resolvedContext, 'speech.text-to-speech');

  const started = await provider.start(request as any);
  const kind: MediaKind = 'audio';

  if (started.mode === 'immediate') {
    const output = started.output;
    const persisted = await persistMediaAsset({
      projectId,
      kind,
      source: output.path,
      ownerRef,
      provider: provider.config?.provider,
      channelId: executionMetadata.channelId,
      modelId: executionMetadata.modelId,
      capability: executionMetadata.capability,
      metadata: {
        ...executionMetadata,
        voiceId: request.voiceId,
      },
    });

    const finalAsset = mergeMediaMetadata(persisted, {
      provider: provider.config?.provider,
      channelId: executionMetadata.channelId,
      modelId: executionMetadata.modelId,
      capability: executionMetadata.capability,
      durationMs: durationSecToMs(output.duration) ?? persisted.durationMs,
      mimeType: output.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
    });

    await bindOwnerRefMedia(projectId, ownerRef, finalAsset);
    return finalAsset;
  }

  return pollAndFinalizeViaMain({
    projectId,
    kind,
    ownerRef,
    taskName: taskName || '语音合成',
    remoteTaskId: started.taskId,
    selection: ttsSelection,
    ...executionMetadata,
    assetMetadataPatch: {
      provider: provider.config?.provider,
      providerTaskId: started.taskId,
      channelId: executionMetadata.channelId,
      modelId: executionMetadata.modelId,
      capability: executionMetadata.capability,
      metadata: {
        ...executionMetadata,
        voiceId: request.voiceId,
      },
    },
  });
}

/**
 * 剧情模式分镜配音：旁白 + 台词（各带角色音色）多段合成后拼接成一条音频。
 *
 * 每段独立走 TTS（可指定不同 voiceId），再按顺序拼接为一个文件持久化到 ownerRef。
 * 仅 1 段时直接退化为 generateAudio（等价单音色整段）。
 */
export async function generateShotAudioWithSegments(params: {
  projectId: string;
  ownerRef: MediaOwnerRef;
  segments: Array<{ text: string; voiceId: string }>;
  options?: { rate?: number };
  ttsSelection?: string;
  taskName?: string;
}): Promise<StoredMediaAsset> {
  return generateShotAudioWithSegmentsWith(params, generateAudio);
}

/**
 * generateShotAudioWithSegments 的实现，TTS 调用经 audioFn 注入 ——
 * 门面类传 this.generateAudio 以保留实例级 mock 接缝（与原类内 this 调用等价）。
 */
export async function generateShotAudioWithSegmentsWith(
  params: {
    projectId: string;
    ownerRef: MediaOwnerRef;
    segments: Array<{ text: string; voiceId: string }>;
    options?: { rate?: number };
    ttsSelection?: string;
    taskName?: string;
  },
  audioFn: typeof generateAudio,
): Promise<StoredMediaAsset> {
  const { projectId, ownerRef, segments, options, ttsSelection, taskName } = params;
  const usable = segments.filter(seg => seg.text?.trim());
  if (usable.length === 0) {
    throw new Error('没有可配音的文本段');
  }
  const rate = options?.rate ?? 1.2;

  // 单段：等价于整段单音色配音，避免不必要的拼接
  if (usable.length === 1) {
    return audioFn({
      projectId,
      ownerRef,
      request: { text: usable[0].text, voiceId: usable[0].voiceId, options: { rate } },
      ttsSelection,
      taskName: taskName || '分镜配音',
    });
  }

  const partAssets: StoredMediaAsset[] = [];
  for (let i = 0; i < usable.length; i += 1) {
    const seg = usable[i];
    const asset = await audioFn({
      projectId,
      // 分段不绑 owner（避免覆盖同一槽位），最后只把拼接结果绑到 ownerRef
      ownerRef: { projectId, ownerType: 'shot', ownerId: `${ownerRef.ownerId}-voice-part-${i}`, episodeId: ownerRef.episodeId, slot: 'audio' },
      request: { text: seg.text, voiceId: seg.voiceId, options: { rate } },
      ttsSelection,
      taskName: `${taskName || '分镜配音'} · 第${i + 1}段`,
    });
    partAssets.push(asset);
  }

  // 拼接各段为一条音频；失败则回退用第一段（保证有可用配音而不至于整段失败）
  const sources = partAssets
    .map(a => a.localPath || a.remoteUrl)
    .filter((s): s is string => Boolean(s));

  const projectPath = await getProjectPath(projectId);
  const shotDir = `${projectPath}/shots/${ownerRef.ownerId}`;
  const concatOutputPath = `${shotDir}/voice-${Date.now()}.mp3`;

  let finalAsset = partAssets[0];
  let concatenated = false;
  if (sources.length > 1) {
    await electronService.fs.mkdir(shotDir);
    try {
      // 专用纯音频顺序拼接（concatMediaClips 不支持纯音频输入）
      await ffmpegManager.concatAudioClips(sources, concatOutputPath);
      concatenated = true;
    } catch (err) {
      logger.warn('多段配音拼接失败，回退使用第一段', {
        ownerRef,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (concatenated) {
    finalAsset = await persistMediaAsset({
      projectId,
      kind: 'audio',
      source: concatOutputPath,
      ownerRef,
      metadata: { voiceSegments: usable.length },
    });
    await bindOwnerRefMedia(projectId, ownerRef, finalAsset);
  }
  return finalAsset;
}

