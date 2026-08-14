import type {
  MediaAssetSource,
  MediaKind,
  MediaOwnerRef,
  ProviderAssetInput,
  StoredMediaAsset,
  TTIRequest,
} from '../../types';


import { runWithConcurrency } from '../../utils/concurrency';
import { persistMediaAsset } from '../mediaPersistenceService';
import { bindOwnerRefMedia } from '../mediaTaskBindingService';
import { getProjectTTIProvider } from '../../providers';
import '../taskHandlers'; // 副作用 import：注册内置 TTI/ITV/TTS 任务处理器


import type { PromptCompilationInput } from '../promptCompilation/types';
import { compileGrokTTI } from '../promptCompilation/grokImageIndexCompiler';
import {
  getPromptProtocol,
} from '../promptCompilation/videoRequestCompiler';
import { parseMentions } from '../../editor/mentionTypes';
import { sanitizeBodyForLog, truncateString } from '../../utils/logFormatting';




import {
  buildExecutionMetadata,
  resolveProviderAndContext,
  ensureProviderAssetInputs,
  mergeMediaMetadata,
  getOptionNumber,
  summarizeImageSource,
  summarizeImageAsset,
  getImmediateImageOutputs,
  resolveImageDestPath,
  resolveImageMetadata,
  logger,
  type ImageDestPathResolver,
} from './helpers';
import { pollAndFinalizeViaMain } from './tasks';

export async function generateImages(params: {
  projectId: string;
  ownerRef: MediaOwnerRef;
  request: TTIRequest<MediaAssetSource | ProviderAssetInput>;
  promptCompilation?: PromptCompilationInput;
  ttiSelection?: string;
  taskName?: string;
  destPath?: ImageDestPathResolver;
  bindOwner?: boolean;
  /**
   * 进度回调：把 immediate 路径中"调用 provider / 下载 / 持久化 / 绑定"分阶段
   * 暴露给外层（runWithTask 的 ctx.progress / character workflow 的 onProgress）。
   * percent 是 [0,100] 范围。stage 仅日志用。
   */
  onProgress?: (percent: number, stage: string) => void;
}): Promise<StoredMediaAsset[]> {
  const {
    projectId,
    ownerRef,
    request,
    ttiSelection,
    taskName,
    promptCompilation,
    destPath,
    bindOwner = true,
    onProgress,
  } = params;
  const { provider, resolvedContext } = await resolveProviderAndContext({
    category: 'tti',
    selectionKey: ttiSelection,
    capability: 'image.text-to-image',
    getProvider: getProjectTTIProvider,
    missingError: '未配置 TTI 服务',
  });
  const executionMetadata = buildExecutionMetadata(resolvedContext, 'image.text-to-image');

  const protocol = getPromptProtocol(provider);
  logger.info('TTI generateImages entry', {
    ownerRef,
    provider: provider.config?.provider,
    protocol: protocol || 'none',
    count: request.count ?? 1,
    hasPromptCompilation: Boolean(promptCompilation?.selectedAssets?.length),
    referencesCount: (request.references || []).length,
  });
  const originalPrompt = request.prompt;
  let compiledPrompt = originalPrompt;
  let compilationDebug: any = null;
  let compileReferences = request.references || [];

  if (protocol === 'grok-image-index' && promptCompilation?.selectedAssets?.length) {
    const { compiledPrompt: cp, compiledReferences, debug } = compileGrokTTI({
      prompt: originalPrompt,
      selectedAssets: promptCompilation.selectedAssets,
      // Keep any manual refs as trailing extras (do not shift @Image N indices).
      extraReferences: (request.references || []),
    });
    compiledPrompt = cp;
    compilationDebug = debug;
    compileReferences = compiledReferences;

    logger.info('TTI prompt compiled (grok-image-index)', {
      ownerRef,
      protocol,
      originalPrompt: truncateString(originalPrompt, 800),
      compiledPrompt: truncateString(compiledPrompt, 800),
      mentions: parseMentions(originalPrompt),
      debug,
    });
  }

  let references: ProviderAssetInput[];
  try {
    references = await ensureProviderAssetInputs(compileReferences);
    logger.info('TTI references resolved', sanitizeBodyForLog({
      ownerRef,
      provider: provider.config?.provider,
      protocol: protocol || 'none',
      requestedReferences: compileReferences.length,
      resolvedReferences: references.map(r => ({ transport: r.transport, value: r.value, mimeType: r.mimeType })),
    }));
  } catch (error) {
    logger.error('TTI reference resolve failed', {
      ownerRef,
      provider: provider.config?.provider,
      protocol: protocol || 'none',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  logger.info('TTI provider.start payload', sanitizeBodyForLog({
    ownerRef,
    provider: provider.config?.provider,
    channelId: executionMetadata.channelId,
    modelId: executionMetadata.modelId,
    promptProtocol: protocol || 'none',
    prompt: compiledPrompt,
    count: request.count ?? 1,
    references: references.map(r => ({ transport: r.transport, value: r.value, mimeType: r.mimeType })),
    options: request.options,
  }));

  onProgress?.(15, '调用 provider');
  let started: Awaited<ReturnType<typeof provider.start>>;
  try {
    started = await provider.start({
      prompt: compiledPrompt,
      references,
      options: request.options,
      count: request.count,
    });
    onProgress?.(40, 'provider 已返回');
    logger.info('TTI provider.start succeeded', {
      ownerRef,
      provider: provider.config?.provider,
      mode: started.mode,
      requestedCount: request.count ?? 1,
      taskId: started.mode === 'async' ? started.taskId : (started.output as any).taskId,
      outputSource: started.mode === 'immediate'
        ? summarizeImageSource(started.output.url || started.output.path)
        : undefined,
      outputWidth: started.mode === 'immediate' ? started.output.width : undefined,
      outputHeight: started.mode === 'immediate' ? started.output.height : undefined,
    });
  } catch (error) {
    logger.error('TTI provider.start failed', {
      ownerRef,
      provider: provider.config?.provider,
      channelId: executionMetadata.channelId,
      modelId: executionMetadata.modelId,
      protocol: protocol || 'none',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  const kind: MediaKind = 'image';
  const options = request.options as Record<string, unknown> | undefined;
  const optionWidth = getOptionNumber(options, 'width');
  const optionHeight = getOptionNumber(options, 'height');
  const optionSeed = getOptionNumber(options, 'seed');

  if (started.mode === 'immediate') {
    const outputs = getImmediateImageOutputs(started.output);

    logger.info('TTI immediate outputs resolved', {
      ownerRef,
      provider: provider.config?.provider,
      requestedCount: request.count ?? 1,
      outputCount: outputs.length,
    });

    // 串行 persist 在 batch=9 时是阻塞主路径的元凶：
    // 每张要 IPC 下载远端 URL + 写文件 + bindOwner SQLite。一张卡住整个循环不推进，
    // runWithTask 的外层 ctx.progress(100) 永远不调，任务卡 10%、UI 永远不展示。
    // 改成并发持久化（最多 4 路并行，避免一次性发起 9 个 IPC 抢占主线程）。
    const persistTasks = outputs.map((output, index) => async (): Promise<StoredMediaAsset> => {
      const source = output.url || output.path;
      if (!source) {
        logger.error('TTI immediate output missing source', {
          ownerRef,
          provider: provider.config?.provider,
          index,
          output: sanitizeBodyForLog(output as any),
        });
        throw new Error('图片生成完成但未返回结果地址');
      }
      const outputDestPath = await resolveImageDestPath(destPath, index, output, outputs.length);
      logger.info('TTI immediate persist start', {
        ownerRef,
        provider: provider.config?.provider,
        index,
        source: summarizeImageSource(source),
        destPath: outputDestPath,
      });
      const persisted = await persistMediaAsset({
        projectId,
        kind,
        source,
        destPath: outputDestPath,
        ownerRef,
        provider: provider.config?.provider,
        providerTaskId: (started.output as any).taskId,
        channelId: executionMetadata.channelId,
        modelId: executionMetadata.modelId,
        capability: executionMetadata.capability,
        metadata: resolveImageMetadata({
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
          total: outputs.length,
        }),
      });
      logger.info('TTI immediate persisted', {
        ownerRef,
        index,
        asset: summarizeImageAsset(persisted),
      });

      // 生成完直接落盘即用：图床已移除，下游 provider 一律读本地字节。
      return mergeMediaMetadata(persisted, {
        provider: provider.config?.provider,
        width: optionWidth ?? output.width ?? persisted.width,
        height: optionHeight ?? output.height ?? persisted.height,
      });
    });

    // 并发跑（最多 4 路），任一失败抛出（保留 Promise.all 语义）。
    // 失败时已 persist 的图保留在落盘目录里，下游决定是否清理。
    // 包一层 progress 反馈：每张完成都把进度往前推，避免外层 task 长时间停留在 40%。
    let completedCount = 0;
    const persistTasksWithProgress = persistTasks.map((task) => async () => {
      try {
        return await task();
      } finally {
        completedCount += 1;
        // 40% (provider 已返回) → 90% (全部 persist 完)
        const span = 90 - 40;
        const next = 40 + Math.round(span * (completedCount / outputs.length));
        onProgress?.(next, `持久化 ${completedCount}/${outputs.length}`);
      }
    });
    const settled = await runWithConcurrency(persistTasksWithProgress, 4);
    const finalAssets: StoredMediaAsset[] = [];
    const failures: Array<{ index: number; error: unknown }> = [];
    settled.forEach((res, index) => {
      if (res.status === 'fulfilled') {
        finalAssets.push(res.value);
      } else {
        failures.push({ index, error: res.reason });
      }
    });
    if (failures.length > 0) {
      logger.error('TTI immediate persist partial failure', {
        ownerRef,
        provider: provider.config?.provider,
        totalCount: outputs.length,
        successCount: finalAssets.length,
        failureCount: failures.length,
        firstError: failures[0].error instanceof Error
          ? failures[0].error.message
          : String(failures[0].error),
      });
      // 全失败抛错；部分成功只警告（保留已落盘的）
      if (finalAssets.length === 0) {
        throw failures[0].error instanceof Error
          ? failures[0].error
          : new Error(String(failures[0].error));
      }
    }

    if (finalAssets.length === 0) {
      throw new Error('图片生成完成但未返回结果地址');
    }

    logger.info('TTI immediate bind owner start', {
      ownerRef,
      assetCount: finalAssets.length,
      asset: summarizeImageAsset(finalAssets[0]),
    });
    if (bindOwner) {
      await bindOwnerRefMedia(projectId, ownerRef, finalAssets[0]);
      logger.info('TTI immediate bind owner done', {
        ownerRef,
        assetCount: finalAssets.length,
        asset: summarizeImageAsset(finalAssets[0]),
      });
    } else {
      logger.info('TTI immediate bind owner skipped', {
        ownerRef,
        assetCount: finalAssets.length,
        asset: summarizeImageAsset(finalAssets[0]),
      });
    }
    onProgress?.(100, '完成');
    return finalAssets;
  }

  if ((request.count ?? 1) > 1) {
    logger.warn('TTI async batch request fell back to single finalized asset handling', {
      ownerRef,
      provider: provider.config?.provider,
      requestedCount: request.count,
    });
  }

  logger.info('TTI async submit (main-driven polling)', {
    remoteTaskId: started.taskId,
    ownerRef,
    provider: provider.config?.provider,
    channelId: executionMetadata.channelId,
    modelId: executionMetadata.modelId,
  });

  const finalAsset = await pollAndFinalizeViaMain({
    projectId,
    kind,
    ownerRef,
    taskName: taskName || ((request.count ?? 1) > 1 ? '批量图片生成' : '图片生成'),
    remoteTaskId: started.taskId,
    selection: ttiSelection,
    ...executionMetadata,
    assetMetadataPatch: {
      provider: provider.config?.provider,
      providerTaskId: started.taskId,
      channelId: executionMetadata.channelId,
      modelId: executionMetadata.modelId,
      capability: executionMetadata.capability,
      ...(optionWidth !== undefined ? { width: optionWidth } : undefined),
      ...(optionHeight !== undefined ? { height: optionHeight } : undefined),
      metadata: {
        ...executionMetadata,
        prompt: originalPrompt,
        ...(protocol ? { promptProtocol: protocol } : undefined),
        ...(compilationDebug ? { compiledPrompt, compilationDebug } : undefined),
        ...(optionSeed !== undefined ? { seed: optionSeed } : undefined),
        ...((request.count ?? 1) > 1 ? { batchCount: request.count } : undefined),
      },
    },
    bindOwner,
  });

  // asyncDestPath 已在 fulfiller 里固化处理；
  // TTI 也始终 normalize（这是 generateImages 的默认行为，旧实现也走这个分支）

  return [finalAsset];
}

export async function generateImage(params: {
  projectId: string;
  ownerRef: MediaOwnerRef;
  request: TTIRequest<MediaAssetSource | ProviderAssetInput>;
  promptCompilation?: PromptCompilationInput;
  ttiSelection?: string;
  taskName?: string;
  destPath?: string;
  bindOwner?: boolean;
  onProgress?: (percent: number, stage: string) => void;
}): Promise<StoredMediaAsset> {
  const assets = await generateImages({
    ...params,
    request: {
      ...params.request,
      count: params.request.count ?? 1,
    },
  });
  const firstAsset = assets[0];
  if (!firstAsset) {
    throw new Error('图片生成完成但未返回结果地址');
  }
  return firstAsset;
}

