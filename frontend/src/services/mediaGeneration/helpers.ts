import type {
  AsyncTask,
  AsyncTaskTargetType,
  MediaAssetSource,
  MediaOwnerRef,
  ProviderAssetInput,
  StoredMediaAsset,
} from '../../types';


import { createLogger } from '../../store/logger';
import { loadSettings } from '../../store/globalStore';
import { resolveProviderAssetInput } from '../mediaAssetResolver';
import { taskHandlerRegistry } from '../taskHandlerRegistry';
import '../taskHandlers'; // 副作用 import：注册内置 TTI/ITV/TTS 任务处理器
import {
  listConfiguredModelSelectOptions,
  resolveConfiguredChannelModel,
  resolveConfiguredChannelModelWithCapabilityFallback,
  serializeMediaSelection,
  type ResolvedChannelModelContext,
} from '../../providers/channel/resolver';
import type { MediaCategory, ModelCapability } from '../../providers/channel/types';
import type { ImageResult } from '../../providers/tti/types';




import { truncateString } from '../../utils/logFormatting';


import { getProjectPath } from '../../store/projectStore';

const logger = createLogger('MediaGeneration');
export { logger };


export function buildExecutionMetadata(
  context: ResolvedChannelModelContext | undefined,
  capability: ModelCapability,
) {
  return {
    channelId: context?.channelConfig.id,
    modelId: context?.model.id,
    capability,
  };
}

export const CAPABILITY_LABELS: Partial<Record<ModelCapability, string>> = {
  'llm.chat': '对话',
  'image.text-to-image': '文生图',
  'image.image-to-image': '图生图',
  'video.text-to-video': '文生视频',
  'video.image-to-video': '图生视频',
  'video.reference-to-video': '参考生视频',
  'video.start-end-to-video': '首尾帧视频',
  'speech.text-to-speech': '语音合成',
};

export function buildMissingCapabilityError(params: {
  category: MediaCategory;
  capability: ModelCapability;
  selectionKey?: string;
  hasCapableModels: boolean;
  fallbackMessage: string;
}): string {
  const capabilityLabel = CAPABILITY_LABELS[params.capability] || params.capability;
  if (params.hasCapableModels && params.selectionKey) {
    return `当前选择的模型不支持${capabilityLabel}，请切换模型`;
  }
  if (!params.hasCapableModels) {
    return `当前没有配置支持${capabilityLabel}的模型`;
  }
  return params.fallbackMessage;
}

export async function resolveProviderAndContext<T>(params: {
  category: MediaCategory;
  selectionKey?: string;
  capability: ModelCapability;
  getProvider: (
    selectionKey?: string,
    capability?: ModelCapability,
    settingsSnapshot?: Awaited<ReturnType<typeof loadSettings>>,
  ) => Promise<T | null>;
  missingError: string;
  allowCapabilityFallback?: boolean;
}): Promise<{ provider: T; resolvedContext?: ResolvedChannelModelContext }> {
  let resolvedContext: ResolvedChannelModelContext | undefined;
  let resolvedSelectionKey = params.selectionKey;
  let capabilityError: string | undefined;
  let settingsSnapshot: Awaited<ReturnType<typeof loadSettings>> | undefined;
  try {
    const canReadSettings = typeof window !== 'undefined'
      ? typeof window.localStorage !== 'undefined'
      : typeof localStorage !== 'undefined';
    if (canReadSettings) {
      const settings = await loadSettings();
      settingsSnapshot = settings;
      const resolved = params.allowCapabilityFallback
        ? resolveConfiguredChannelModelWithCapabilityFallback(
            settings,
            params.category,
            params.selectionKey,
            params.capability,
          )
        : {
            context: resolveConfiguredChannelModel(
              settings,
              params.category,
              params.selectionKey,
              params.capability,
            ),
            effectiveSelectionKey: params.selectionKey,
          };
      resolvedContext = resolved.context;
      resolvedSelectionKey = resolved.effectiveSelectionKey || resolvedSelectionKey;
      if (!resolvedContext) {
        const capableModels = listConfiguredModelSelectOptions(
          settings,
          params.category,
          params.capability,
        );
        capabilityError = buildMissingCapabilityError({
          category: params.category,
          capability: params.capability,
          selectionKey: params.selectionKey,
          hasCapableModels: capableModels.length > 0,
          fallbackMessage: params.missingError,
        });
      }
    }
  } catch (error) {
    logger.warn('Failed to resolve media execution context metadata', {
      category: params.category,
      capability: params.capability,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const provider = await params.getProvider(
    resolvedSelectionKey,
    params.capability,
    settingsSnapshot,
  );
  if (!provider) {
    throw new Error(capabilityError || params.missingError);
  }

  return { provider, resolvedContext };
}

export function inferTargetType(ownerRef: MediaOwnerRef): AsyncTaskTargetType {
  switch (ownerRef.ownerType) {
    case 'character':
      return 'character';
    case 'scene':
      return 'scene';
    case 'prop':
      return 'prop';
    case 'shot':
    case 'shot-version':
      return 'shot';
    default:
      return 'shot';
  }
}

export async function ensureProviderAssetInput(
  source: MediaAssetSource | ProviderAssetInput | undefined
): Promise<ProviderAssetInput | undefined> {
  if (!source) return undefined;
  if (typeof source === 'object' && 'transport' in source && 'value' in source) {
    return source as ProviderAssetInput;
  }
  // TTI 参考图统一走 local-first：项目内角色/场景/道具/分镜的预览图都已落盘，
  // 没必要再让 provider 去远端拉一次（CSP / fs allowed-path / 速度都是问题）。
  // 只有当 asset 没有 localPath 时才退到 remote-url。
  return resolveProviderAssetInput(source as MediaAssetSource, { preferLocalFile: true });
}

export async function ensureProviderAssetInputs(
  sources: Array<MediaAssetSource | ProviderAssetInput | undefined>
): Promise<ProviderAssetInput[]> {
  const resolved = await Promise.all(sources.map(ensureProviderAssetInput));
  return resolved.filter(Boolean) as ProviderAssetInput[];
}

export function mergeMediaMetadata(
  base: StoredMediaAsset,
  patch: Partial<StoredMediaAsset>
): StoredMediaAsset {
  return {
    ...base,
    ...patch,
    metadata: {
      ...(base.metadata || {}),
      ...(patch.metadata || {}),
    },
  };
}

export function durationSecToMs(value?: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.round(value * 1000);
}

export function getOptionNumber(
  options: Record<string, unknown> | undefined,
  key: string
): number | undefined {
  const value = options?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function summarizeImageSource(source: string | undefined): Record<string, unknown> {
  if (!source) return { present: false };
  if (source.startsWith('data:')) {
    return {
      present: true,
      kind: 'data-url',
      length: source.length,
      preview: truncateString(source, 120),
    };
  }
  return {
    present: true,
    kind: /^https?:\/\//i.test(source) ? 'remote-url' : 'path',
    value: truncateString(source, 500),
  };
}

export function summarizeImageAsset(asset: StoredMediaAsset): Record<string, unknown> {
  return {
    kind: asset.kind,
    localPath: asset.localPath,
    remoteUrl: asset.remoteUrl,
    mimeType: asset.mimeType,
    provider: asset.provider,
    providerTaskId: asset.providerTaskId,
    channelId: asset.channelId,
    modelId: asset.modelId,
    width: asset.width,
    height: asset.height,
    capability: asset.capability,
  };
}

export type ImageDestPathResolver = string | ((index: number, output: ImageResult) => string | undefined | Promise<string | undefined>);

export async function buildVersionedVideoDestPath(
  projectId: string,
  ownerRef: MediaOwnerRef,
): Promise<string | undefined> {
  if (ownerRef.ownerType !== 'shot-version' || ownerRef.slot !== 'video' || !ownerRef.versionId) {
    return undefined;
  }
  const projectPath = await getProjectPath(projectId);
  return `${projectPath}/shots/${ownerRef.ownerId}/versions/${ownerRef.versionId}/video.mp4`;
}

export function getImmediateImageOutputs(output: ImageResult): ImageResult[] {
  const batchImages = output.metadata?.batchImages;
  if (Array.isArray(batchImages) && batchImages.length > 0) {
    return batchImages;
  }
  return [output];
}

export function appendImageIndexToPath(destPath: string, index: number): string {
  if (index <= 0) {
    return destPath;
  }
  const extensionIndex = destPath.lastIndexOf('.');
  const slashIndex = Math.max(destPath.lastIndexOf('/'), destPath.lastIndexOf('\\'));
  if (extensionIndex <= slashIndex) {
    return `${destPath}-${index + 1}`;
  }
  return `${destPath.slice(0, extensionIndex)}-${index + 1}${destPath.slice(extensionIndex)}`;
}

export async function resolveImageDestPath(
  destPath: ImageDestPathResolver | undefined,
  index: number,
  output: ImageResult,
  total: number,
): Promise<string | undefined> {
  if (!destPath) {
    return undefined;
  }
  if (typeof destPath === 'function') {
    return destPath(index, output);
  }
  if (total <= 1) {
    return destPath;
  }
  return appendImageIndexToPath(destPath, index);
}

export function resolveImageMetadata(params: {
  executionMetadata: ReturnType<typeof buildExecutionMetadata>;
  originalPrompt: string;
  protocol?: string;
  compiledPrompt?: string;
  compilationDebug?: any;
  optionWidth?: number;
  optionHeight?: number;
  optionSeed?: number;
  output: ImageResult;
  index: number;
  total: number;
}): Record<string, unknown> {
  const {
    executionMetadata,
    originalPrompt,
    protocol,
    compiledPrompt,
    compilationDebug,
    optionWidth,
    optionHeight,
    optionSeed,
    output,
    index,
    total,
  } = params;
  const resolvedSeed = output.seed ?? optionSeed;
  return {
    ...executionMetadata,
    prompt: originalPrompt,
    ...(protocol ? { promptProtocol: protocol } : undefined),
    ...(compilationDebug ? { compiledPrompt, compilationDebug } : undefined),
    ...(optionWidth ? { width: optionWidth } : undefined),
    ...(optionHeight ? { height: optionHeight } : undefined),
    ...(resolvedSeed !== undefined ? { seed: resolvedSeed } : undefined),
    ...(total > 1 ? { batchIndex: index, batchCount: total } : undefined),
    ...(output.metadata ? { providerOutput: output.metadata } : undefined),
  };
}

export function resolveTaskSelectionKey(task: AsyncTask, fallbackSelection?: string): string | undefined {
  if (task.channelId && task.modelId) {
    return serializeMediaSelection({
      channelId: task.channelId,
      modelId: task.modelId,
    });
  }
  return fallbackSelection;
}

export function resolveTaskCapability(task: AsyncTask): ModelCapability {
  if (task.capability) {
    return task.capability as ModelCapability;
  }
  return taskHandlerRegistry.get(task.type)?.defaultCapability ?? 'image.text-to-image';
}
