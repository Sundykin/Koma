import type {
  AsyncTask,
  MediaKind,
  MediaOwnerRef,
  StoredMediaAsset,
} from '../../types';


import { submitTask, waitForTaskCompletion } from '../tasksIPC';
import { taskHandlerRegistry } from '../taskHandlerRegistry';
import '../taskHandlers'; // 副作用 import：注册内置 TTI/ITV/TTS 任务处理器










import {
  inferTargetType,
  buildVersionedVideoDestPath,
  resolveTaskSelectionKey,
  resolveTaskCapability,
  logger,
} from './helpers';

export async function recoverTask(params: {
  projectId: string;
  task: AsyncTask;
  ttiSelection?: string;
  itvSelection?: string;
  ttsSelection?: string;
  /** @deprecated 进度现在通过 main 广播；UI 用 useTasks/useActiveTask 投影 */
  onProgress?: (task: AsyncTask, progress: number) => void;
}): Promise<StoredMediaAsset | null> {
  const { projectId, task, ttiSelection, itvSelection, ttsSelection } = params;
  if (!task.remoteTaskId) return null;
  if (!task.ownerRef) {
    logger.warn('recoverTask: 任务缺少 ownerRef，跳过');
    return null;
  }

  const handler = taskHandlerRegistry.get(task.type);
  if (!handler) throw new Error(`未知任务类型: ${task.type}`);

  const kind = handler.kind;
  const taskCapability = resolveTaskCapability(task);

  const selectionByKind: Record<MediaKind, string | undefined> = {
    image: ttiSelection,
    video: itvSelection,
    audio: ttsSelection,
  };
  const handlerSelection = resolveTaskSelectionKey(task, selectionByKind[kind]);

  return pollAndFinalizeViaMain({
    projectId,
    kind,
    ownerRef: task.ownerRef,
    taskName: task.targetName || `恢复任务 ${task.id}`,
    remoteTaskId: task.remoteTaskId,
    selection: handlerSelection,
    channelId: task.channelId,
    modelId: task.modelId,
    capability: taskCapability,
    assetMetadataPatch: {
      providerTaskId: task.remoteTaskId,
      channelId: task.channelId,
      modelId: task.modelId,
      capability: task.capability,
    },
  });
}

/**
 * 主进程主导的轮询：submitTask 进 main 队列；handler 通过 delegateToRenderer
 * 反向调 renderer 的 provider.getTaskSnapshot 与 persistMediaAsset。
 *
 * 不再需要传 getSnapshot / extractSource / enrichAsset 闭包 ——
 * 这些都在 fulfiller 里通过 taskHandlerRegistry 反查。caller 只传可序列化数据。
 *
 * 关窗口/切项目都不会让 polling 挂掉（main 状态权威）。
 */
export async function pollAndFinalizeViaMain(params: {
  projectId: string;
  kind: MediaKind;
  ownerRef: MediaOwnerRef;
  taskName: string;
  remoteTaskId: string;
  selection?: string;
  channelId?: string;
  modelId?: string;
  capability?: string;
  /** 业务侧 enrichAsset 固化为可序列化 metadata patch（数据，无闭包） */
  assetMetadataPatch?: Partial<StoredMediaAsset>;
  bindOwner?: boolean;
  destPath?: string;
}): Promise<StoredMediaAsset> {
  const handler = taskHandlerRegistry.findByKind(params.kind);
  if (!handler) throw new Error(`未知 kind: ${params.kind}`);
  const rendererHandlerType = handler.type as 'tti' | 'itv' | 'tts';
  const resolvedDestPath = params.destPath
    ?? (params.kind === 'video' ? await buildVersionedVideoDestPath(params.projectId, params.ownerRef) : undefined);

  const submitted = await submitTask({
    type: rendererHandlerType,
    scope: `project:${params.projectId}`,
    targetKind: inferTargetType(params.ownerRef),
    targetId: params.ownerRef.ownerId,
    input: {
      kind: params.kind,
      remoteTaskId: params.remoteTaskId,
      rendererHandlerType,
      channelId: params.channelId,
      modelId: params.modelId,
      capability: params.capability,
      selection: params.selection,
      ownerRef: params.ownerRef,
      projectId: params.projectId,
      extra: {
        assetMetadataPatch: params.assetMetadataPatch,
        bindOwner: params.bindOwner ?? true,
        destPath: resolvedDestPath,
      },
    },
    initialPayload: {
      // TaskStatusBar 直接读 payload.targetName，按 ManagerTask 形状对齐
      targetName: params.taskName,
      ownerRef: params.ownerRef,
      remoteTaskId: params.remoteTaskId,
      channelId: params.channelId,
      modelId: params.modelId,
      capability: params.capability,
    },
  });
  const final = await waitForTaskCompletion(submitted.id);
  const asset = (final.payload as { output?: StoredMediaAsset } | undefined)?.output;
  if (!asset) throw new Error('任务完成但缺少结果资产');
  return asset;
}

