import type { AppSettings, MediaAssetSource, ProviderAssetInput } from '../../../../../types';
import { getProjectTTIProvider } from '../../../../../providers';
import { listCapabilityFallbackCandidates, resolveConfiguredChannelModel } from '../../../../../providers/channel/resolver';
import type { ImageResult, MultiAngleTTIRequest } from '../../../../../providers/tti/types';
import { compileLinghuiMultiAnglePrompt } from '../../../../../services/promptCompilation/multiAnglePromptCompiler';
import { getPromptProtocol } from '../../../../../services/promptCompilation/videoRequestCompiler';
import { createLogger } from '../../../../../store/logger';
import type { LinghuiImageMediaItem } from '../../../../../types/linghui';
import { sanitizeBodyForLog, truncateString } from '../../../../../utils/logFormatting';
import {
  compileLinghuiPromptReferences,
  type LinghuiPromptReferenceItem,
} from '../../../editors/state/linghuiPromptReferences';
import {
  buildMediaItem,
  createPlaceholderImage,
  throwIfExecutionAborted,
} from '../linghuiExecutionShared';
import {
  executeWithProviderFallback,
  summarizeProviderFallbackMetadata,
  withProviderFallbackMetadata,
} from './fallback';
import {
  createTaskSnapshotGetter,
  ensureProviderAssetInputs,
  resolveAsyncProviderResult,
  resolveExecutionSettings,
} from './shared';

const imageLogger = createLogger('LinghuiImageExecution');

async function executeImageProviderAttempt(
  provider: NonNullable<Awaited<ReturnType<typeof getProjectTTIProvider>>>,
  requestedCapability: 'image.text-to-image' | 'image.image-to-image',
  params: {
    prompt: string;
    referenceSources?: string[];
    silentReferenceSources?: string[];
    steps?: number;
    onProgress?: (progress: number, message?: string) => void;
    placeholderTitle: string;
    placeholderSubtitle?: string;
    accent?: string;
    ttiSelection?: string;
    promptReferences?: LinghuiPromptReferenceItem[];
    settingsSnapshot?: AppSettings;
    multiAngle?: Omit<MultiAngleTTIRequest, 'originalPrompt' | 'anglePrompt' | 'compiledPrompt'> | null;
    signal?: AbortSignal;
  },
): Promise<LinghuiImageMediaItem> {
  let compiledPrompt = params.prompt || params.placeholderTitle;
  let referenceSources: Array<MediaAssetSource | ProviderAssetInput> = params.referenceSources ?? [];
  const silentReferenceSources = params.silentReferenceSources ?? [];
  const replacementStrategy = getPromptProtocol(provider) === 'grok-image-index'
    ? 'image-index'
    : 'readable-name';

  if (!params.multiAngle && (params.promptReferences?.length ?? 0) > 0) {
    const compiled = compileLinghuiPromptReferences({
      prompt: compiledPrompt,
      references: params.promptReferences ?? [],
      extraReferences: referenceSources,
      replacementStrategy,
    });
    compiledPrompt = compiled.compiledPrompt;
    referenceSources = compiled.compiledReferences;
  }

  let multiAngleRequest: MultiAngleTTIRequest | undefined;
  let references = [];
  try {
    if (params.multiAngle) {
      if (provider.supportsMultiAngle === false) {
        throw new Error('当前生图渠道暂不支持多角度接口，请切换到支持多角度的渠道后重试');
      }
      if (!referenceSources.length) {
        throw new Error('多角度生图需要至少一张上游参考图');
      }

      if (provider.supportsMultiAngle !== true) {
        imageLogger.info('灵绘多角度将回退为通用图生图执行', {
          selectionKey: params.ttiSelection,
          capability: requestedCapability,
          provider: provider.config?.provider,
        });
      }

      const compiledMultiAngle = compileLinghuiMultiAnglePrompt({
        prompt: params.prompt,
        config: params.multiAngle,
      });
      compiledPrompt = compiledMultiAngle.compiledPrompt;
      multiAngleRequest = {
        ...params.multiAngle,
        originalPrompt: params.prompt,
        anglePrompt: compiledMultiAngle.anglePrompt,
        compiledPrompt,
      };
    }

    references = [
      ...await ensureProviderAssetInputs(referenceSources),
      ...await ensureProviderAssetInputs(silentReferenceSources),
    ];

    if (params.multiAngle && references.length === 0) {
      throw new Error('多角度生图无法读取上游参考图，请确认当前图片文件仍可访问');
    }
  } catch (error) {
    imageLogger.error('灵绘图片请求编译失败', {
      selectionKey: params.ttiSelection,
      capability: requestedCapability,
      provider: provider.config?.provider,
      requestType: params.multiAngle ? 'multi-angle' : 'text-to-image',
      referenceCount: referenceSources.length,
      silentReferenceCount: silentReferenceSources.length,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  imageLogger.info('灵绘图片请求已编译', {
    selectionKey: params.ttiSelection,
    capability: requestedCapability,
    provider: provider.config?.provider,
    prompt: truncateString(compiledPrompt, 600),
    referenceCount: references.length,
    request: sanitizeBodyForLog({
      requestType: multiAngleRequest ? 'multi-angle' : 'text-to-image',
      multiAngle: multiAngleRequest
        ? {
            azimuth: multiAngleRequest.azimuth,
            elevation: multiAngleRequest.elevation,
            distance: multiAngleRequest.distance,
            promptProtocol: multiAngleRequest.promptProtocol,
            endpointPath: multiAngleRequest.endpointPath,
            anglePrompt: multiAngleRequest.anglePrompt,
            compiledPrompt: multiAngleRequest.compiledPrompt,
            originalPrompt: multiAngleRequest.originalPrompt,
          }
        : undefined,
    }),
  });

  let started;
  try {
    started = await provider.start({
      prompt: compiledPrompt,
      references,
      options: { steps: params.steps },
      ...(multiAngleRequest ? { requestType: 'multi-angle' as const, multiAngle: multiAngleRequest } : undefined),
    });
  } catch (error) {
    imageLogger.error('灵绘图片任务提交失败', {
      selectionKey: params.ttiSelection,
      capability: requestedCapability,
      provider: provider.config?.provider,
      error: error instanceof Error ? error.message : String(error),
      requestType: multiAngleRequest ? 'multi-angle' : 'text-to-image',
    });
    throw error;
  }

  imageLogger.info('灵绘图片任务提交成功', {
    selectionKey: params.ttiSelection,
    capability: requestedCapability,
    provider: provider.config?.provider,
    mode: started.mode,
    taskId: started.mode === 'async' ? started.taskId : undefined,
    requestType: multiAngleRequest ? 'multi-angle' : 'text-to-image',
  });
  throwIfExecutionAborted(params.signal);

  const output = started.mode === 'immediate'
    ? started.output
    : await resolveAsyncProviderResult<ImageResult>(
        started.taskId,
        createTaskSnapshotGetter(provider),
        params.onProgress,
        params.signal,
        {
          mediaKind: 'image',
          provider: provider.config?.provider,
        },
      );
  throwIfExecutionAborted(params.signal);

  return buildMediaItem({
    kind: 'image',
    source: output.url || output.path,
    mimeType: output.mimeType,
    width: output.width,
    height: output.height,
    metadata: output.metadata,
  });
}

export async function generateImageWithProvider(params: {
  prompt: string;
  referenceSources?: string[];
  silentReferenceSources?: string[];
  steps?: number;
  onProgress?: (progress: number, message?: string) => void;
  placeholderTitle: string;
  placeholderSubtitle?: string;
  accent?: string;
  ttiSelection?: string;
  promptReferences?: LinghuiPromptReferenceItem[];
  settingsSnapshot?: AppSettings;
  multiAngle?: Omit<MultiAngleTTIRequest, 'originalPrompt' | 'anglePrompt' | 'compiledPrompt'> | null;
  signal?: AbortSignal;
}): Promise<LinghuiImageMediaItem> {
  throwIfExecutionAborted(params.signal);
  const requestedCapability = params.multiAngle ? 'image.image-to-image' : 'image.text-to-image';
  const settings = await resolveExecutionSettings(params.settingsSnapshot);
  const selectedContext = resolveConfiguredChannelModel(settings, 'tti', params.ttiSelection);
  const capableContext = resolveConfiguredChannelModel(settings, 'tti', params.ttiSelection, requestedCapability);

  imageLogger.info('灵绘图片生成入口', {
    selectionKey: params.ttiSelection,
    capability: requestedCapability,
    requestType: params.multiAngle ? 'multi-angle' : 'text-to-image',
    channelId: capableContext?.channelConfig.id ?? selectedContext?.channelConfig.id,
    modelId: capableContext?.model.id ?? selectedContext?.model.id,
    prompt: truncateString(params.prompt || '', 600),
    referenceCount: params.referenceSources?.length ?? 0,
    silentReferenceCount: params.silentReferenceSources?.length ?? 0,
    promptReferenceCount: params.promptReferences?.length ?? 0,
    multiAngle: params.multiAngle
      ? {
          azimuth: params.multiAngle.azimuth,
          elevation: params.multiAngle.elevation,
          distance: params.multiAngle.distance,
          promptProtocol: params.multiAngle.promptProtocol,
          endpointPath: params.multiAngle.endpointPath,
        }
      : undefined,
  });

  if (params.multiAngle && selectedContext && !selectedContext.model.capabilities.includes('image.image-to-image')) {
    imageLogger.warn('灵绘多角度能力校验失败', {
      selectionKey: params.ttiSelection,
      requestedCapability,
      channelId: selectedContext.channelConfig.id,
      modelId: selectedContext.model.id,
      capabilities: selectedContext.model.capabilities,
    });
    throw new Error('当前生图模型不支持图生图，请切换到支持图生图的渠道后重试');
  }

  const candidates = listCapabilityFallbackCandidates(
    settings,
    'tti',
    requestedCapability,
    params.ttiSelection,
  );

  if (!candidates.length) {
    if (params.multiAngle) {
      imageLogger.error('灵绘多角度未找到可用 TTI Provider', {
        selectionKey: params.ttiSelection,
        requestedCapability,
      });
      throw new Error('当前没有配置支持图生图的生图渠道，请先切换或配置支持图生图的模型');
    }

    imageLogger.warn('灵绘图片未配置 TTI Provider，返回占位结果', {
      selectionKey: params.ttiSelection,
      requestedCapability,
    });
    return buildMediaItem({
      kind: 'image',
      source: createPlaceholderImage({
        title: params.placeholderTitle,
        subtitle: params.placeholderSubtitle ?? (params.prompt || '未配置 TTI 服务，已生成占位预览'),
        accent: params.accent,
      }),
      placeholder: true,
    });
  }

  const execution = await executeWithProviderFallback({
    mediaLabel: '图片',
    category: 'tti',
    capability: requestedCapability,
    settings,
    preferredSelection: params.ttiSelection,
    signal: params.signal,
    loadProvider: selectionKey => getProjectTTIProvider(selectionKey, requestedCapability, settings),
    validateProvider: provider => provider.validate(),
    execute: provider => executeImageProviderAttempt(provider, requestedCapability, params),
  });

  return withProviderFallbackMetadata(
    execution.result,
    summarizeProviderFallbackMetadata(
      'tti',
      requestedCapability,
      execution.attempts,
      execution.finalCandidate,
    ),
  );
}
