import { useCallback, type RefObject } from 'react';
import { preflightLinghuiTargetNodes } from '../../execution/state/linghuiExecutionPreflight';
import type { MessageInstance } from 'antd/es/message/interface';
import { createLinghuiWorkspaceHistoryRecord } from '../../../../store/linghuiStorage';
import { loadSettings } from '../../../../store/settings/core';
import { createLogger } from '../../../../store/logger';
import type {
  LinghuiExecutionLogEntry,
  LinghuiExecutionQueueState,
  LinghuiNodeRunState,
  LinghuiWorkspaceDocument,
} from '../../../../types/linghui';
import type { LinghuiCanvasHandle } from '../../canvas/components/LinghuiCanvas';
import { cloneSnapshotValue } from '../../canvas/state/linghuiCanvasShared';
import {
  detectLinghuiRunningNodeBlocks,
  executeLinghuiWorkflow,
} from '../../execution/state/linghuiExecution';
import {
  createLinghuiPageExecutionLog,
} from '../state/linghuiPageExecutionLogs';
import type { LinghuiWorkspaceRuntimeState } from '../state/linghuiPageWorkspaceRuntime';

interface LinghuiPageWorkflowRunnerParams {
  activeWorkspaceRef: RefObject<LinghuiWorkspaceDocument | null>;
  canvasRef: RefObject<LinghuiCanvasHandle | null>;
  executionBatchesRef: RefObject<Set<AbortController>>;
  executionQueuesRef: RefObject<Map<AbortController, LinghuiExecutionQueueState>>;
  handleHistoryLibraryMutate: () => void;
  message: MessageInstance;
  patchWorkspaceExecution: (
    runPatches?: Record<string, LinghuiNodeRunState>,
    logEntries?: LinghuiExecutionLogEntry[],
  ) => LinghuiWorkspaceRuntimeState;
  recomputeExecutionQueue: () => void;
  setRunning: (running: boolean) => void;
  updateWorkspaceExecution: (
    nextRuns: Record<string, LinghuiNodeRunState>,
    nextLogs: LinghuiExecutionLogEntry[],
  ) => void;
  workflowLogger: ReturnType<typeof createLogger>;
  workspaceRuntimeRef: RefObject<LinghuiWorkspaceRuntimeState>;
}

export function useLinghuiPageWorkflowRunner({
  activeWorkspaceRef,
  canvasRef,
  executionBatchesRef,
  executionQueuesRef,
  handleHistoryLibraryMutate,
  message,
  patchWorkspaceExecution,
  recomputeExecutionQueue,
  setRunning,
  updateWorkspaceExecution,
  workflowLogger,
  workspaceRuntimeRef,
}: LinghuiPageWorkflowRunnerParams) {
  return useCallback(async (
    targetNodeIds?: string[],
    options?: {
      resolveTargetsOnly?: boolean;
      successMessage?: string;
    },
  ) => {
    workflowLogger.info('灵绘执行入口', {
      targetNodeIds,
      resolveTargetsOnly: options?.resolveTargetsOnly ?? false,
      activeBatchCount: executionBatchesRef.current.size,
      hasCanvasHandle: Boolean(canvasRef.current),
      hasActiveWorkspace: Boolean(activeWorkspaceRef.current),
    });

    const context = canvasRef.current?.getExecutionContext();
    const current = activeWorkspaceRef.current;
    if (!context || !current) {
      workflowLogger.warn('灵绘执行被阻止：缺少执行上下文', {
        hasContext: Boolean(context),
        hasWorkspace: Boolean(current),
        targetNodeIds,
      });
      return;
    }

    try {
      context.settingsSnapshot = cloneSnapshotValue(await loadSettings());
    } catch (error: any) {
      workflowLogger.error('灵绘执行被阻止：读取 settings 快照失败', {
        targetNodeIds,
        error: error?.message || String(error),
      });
      message.error(error?.message || '读取执行配置失败');
      return;
    }

    workflowLogger.info('灵绘执行上下文已就绪', {
      targetNodeIds,
      contextNodeCount: context.nodes.length,
      contextEdgeCount: context.edges.length,
      workspaceId: current.id,
    });

    const requestedTargetNodeIds = targetNodeIds?.length ? [...new Set(targetNodeIds)] : undefined;
    const contextNodeIds = new Set(context.nodes.map(node => node.id));
    const missingTargetNodeIds = requestedTargetNodeIds?.filter(nodeId => !contextNodeIds.has(nodeId)) ?? [];
    const runnableTargetNodeIds = requestedTargetNodeIds?.filter(nodeId => contextNodeIds.has(nodeId));

    if (missingTargetNodeIds.length > 0) {
      workflowLogger.warn('灵绘执行目标节点缺失，可能尚未同步到画布', {
        requestedTargetNodeIds,
        runnableTargetNodeIds,
        missingTargetNodeIds,
        contextNodeCount: context.nodes.length,
      });
    }

    if (requestedTargetNodeIds && runnableTargetNodeIds?.length === 0) {
      workflowLogger.warn('灵绘执行被阻止：目标节点未进入执行上下文', {
        requestedTargetNodeIds,
        missingTargetNodeIds,
      });
      message.error('目标节点尚未同步到画布，请稍后重试');
      return;
    }

    let nextRuns = { ...workspaceRuntimeRef.current.nodeRuns };
    let nextLogs = [...workspaceRuntimeRef.current.executionLogs];

    if (executionBatchesRef.current.size === 0) {
      let sanitizedCount = 0;
      const sanitizedRuns: Record<string, LinghuiNodeRunState> = {};
      for (const [nodeId, runState] of Object.entries(nextRuns)) {
        if (runState?.status === 'running') {
          sanitizedRuns[nodeId] = {
            ...runState,
            status: 'stale',
            progress: undefined,
            message: '上次执行已中断，可重新运行。',
            updatedAt: Date.now(),
          };
          sanitizedCount += 1;
        } else {
          sanitizedRuns[nodeId] = runState;
        }
      }
      if (sanitizedCount > 0) {
        workflowLogger.warn('灵绘执行入口：清理孤儿 running 状态', {
          sanitizedCount,
          orphanedNodeIds: Object.entries(nextRuns)
            .filter(([, state]) => state?.status === 'running')
            .map(([id]) => id),
        });
        nextRuns = sanitizedRuns;
        updateWorkspaceExecution(nextRuns, nextLogs);
      }
    }

    const nodeSnapshotMap = new Map(context.nodes.map(node => [node.id, node]));
    let runningNodeBlocks;
    try {
      runningNodeBlocks = detectLinghuiRunningNodeBlocks({
        context,
        targetNodeIds: runnableTargetNodeIds ?? targetNodeIds,
        previousRuns: nextRuns,
        resolveTargetsOnly: options?.resolveTargetsOnly,
      });
    } catch (error: any) {
      workflowLogger.warn('灵绘执行被阻止：检测运行中节点失败', {
        targetNodeIds: runnableTargetNodeIds ?? targetNodeIds,
        error: error?.message || String(error),
      });
      message.error(error?.message || '检测执行状态失败');
      return;
    }

    if (runningNodeBlocks.length > 0) {
      const firstRunning = runningNodeBlocks[0];
      const content = runningNodeBlocks.length === 1
        ? `「${firstRunning.label}」仍在执行中，请等待当前轮询完成或先取消执行`
        : `${runningNodeBlocks.length} 个节点仍在执行中，请等待当前轮询完成或先取消执行`;
      workflowLogger.warn('灵绘执行被阻止：目标链路仍有运行中节点', {
        targetNodeIds: runnableTargetNodeIds ?? targetNodeIds,
        runningNodeBlocks,
      });
      const patchedRuntime = patchWorkspaceExecution(undefined, [
        createLinghuiPageExecutionLog('warn', content, firstRunning.nodeId),
      ]);
      nextRuns = { ...patchedRuntime.nodeRuns };
      nextLogs = [...patchedRuntime.executionLogs];
      message.warning(content);
      canvasRef.current?.focusNodes([firstRunning.nodeId], { select: true });
      return;
    }

    // 执行前预检：把"确定会失败"的输入缺失一次性列出（不触发 LLM/网络）。
    // 有阻塞问题时不启动执行，聚焦到第一个问题节点，让用户先补齐。
    const preflightTargets = runnableTargetNodeIds ?? targetNodeIds;
    const preflightIssues = preflightLinghuiTargetNodes(context, preflightTargets);
    if (preflightIssues.length > 0) {
      const first = preflightIssues[0];
      const list = preflightIssues
        .slice(0, 4)
        .map(issue => `· ${issue.nodeTitle}：${issue.message}`)
        .join('\n');
      const more = preflightIssues.length > 4 ? `\n… 还有 ${preflightIssues.length - 4} 个问题` : '';
      const content = `以下节点缺少必要输入，无法执行：\n${list}${more}`;
      workflowLogger.warn('灵绘执行前预检发现阻塞问题', {
        targetNodeIds: preflightTargets,
        issues: preflightIssues.map(i => ({ nodeId: i.nodeId, message: i.message })),
      });
      const patchedRuntime = patchWorkspaceExecution(undefined, [
        createLinghuiPageExecutionLog('warn', `执行前预检：${first.nodeTitle} - ${first.message}`, first.nodeId),
      ]);
      nextRuns = { ...patchedRuntime.nodeRuns };
      nextLogs = [...patchedRuntime.executionLogs];
      message.warning(content);
      canvasRef.current?.focusNodes([first.nodeId], { select: true });
      return;
    }

    const abortController = new AbortController();
    executionBatchesRef.current.add(abortController);
    setRunning(true);

    try {
      const batchBaselineRuns = { ...nextRuns };
      const batchTouchedNodeIds = new Set<string>();
      workflowLogger.info('灵绘开始执行工作流', {
        targetNodeIds: runnableTargetNodeIds ?? targetNodeIds,
        resolveTargetsOnly: options?.resolveTargetsOnly ?? false,
        activeBatchCount: executionBatchesRef.current.size,
      });
      const result = await executeLinghuiWorkflow({
        context,
        targetNodeIds: runnableTargetNodeIds ?? targetNodeIds,
        previousRuns: batchBaselineRuns,
        resolveTargetsOnly: options?.resolveTargetsOnly,
        signal: abortController.signal,
        workspaceId: activeWorkspaceRef.current?.id,
        onNodeStateChange(nodeId, nextState) {
          batchTouchedNodeIds.add(nodeId);
          nextRuns = {
            ...nextRuns,
            [nodeId]: nextState,
          };
          const patchedRuntime = patchWorkspaceExecution({ [nodeId]: nextState });
          nextRuns = { ...patchedRuntime.nodeRuns };
          nextLogs = [...patchedRuntime.executionLogs];
        },
        onLog(entry) {
          const patchedRuntime = patchWorkspaceExecution(undefined, [entry]);
          nextRuns = { ...patchedRuntime.nodeRuns };
          nextLogs = [...patchedRuntime.executionLogs];
        },
        onQueueChange(queue) {
          executionQueuesRef.current.set(abortController, queue);
          recomputeExecutionQueue();
        },
      });

      const finalRuns = result.runs;
      workflowLogger.info('灵绘执行工作流结束', {
        queueStatus: result.queue.status,
        completedNodeIds: result.queue.completedNodeIds,
        failedNodeIds: result.queue.failedNodeIds,
        canceledNodeIds: result.queue.canceledNodeIds,
      });
      const finalRunPatches: Record<string, LinghuiNodeRunState> = {};
      for (const nodeId of batchTouchedNodeIds) {
        const runState = finalRuns[nodeId];
        if (runState) {
          finalRunPatches[nodeId] = runState;
        }
      }
      const patchedRuntime = patchWorkspaceExecution(finalRunPatches);
      nextRuns = { ...patchedRuntime.nodeRuns };
      nextLogs = [...patchedRuntime.executionLogs];

      const completedNodeIds = new Set(result.queue.completedNodeIds);
      const historyCandidates = [...completedNodeIds].flatMap(nodeId => {
        const runState = finalRuns[nodeId];
        if (
          runState?.status === 'succeeded' &&
          runState.result &&
          (runState.updatedAt ?? 0) > (batchBaselineRuns[nodeId]?.updatedAt ?? 0)
        ) {
          return [[nodeId, runState] as const];
        }
        return [];
      });

      if (current.id && historyCandidates.length > 0) {
        const historyResults = await Promise.all(historyCandidates.map(async ([nodeId, runState]) => {
          const nodeSnapshot = nodeSnapshotMap.get(nodeId);
          if (!nodeSnapshot) return { status: 'skipped' as const, nodeId };
          try {
            const result = await createLinghuiWorkspaceHistoryRecord({
              workspaceId: current.id,
              nodeId,
              nodeData: nodeSnapshot.data,
              nodeRun: runState,
            });
            return { status: 'fulfilled' as const, nodeId, ...result };
          } catch (error) {
            return {
              status: 'rejected' as const,
              nodeId,
              nodeLabel: nodeSnapshot.data.label,
              nodeType: nodeSnapshot.data.linghuiType,
              error,
            };
          }
        }));

        let hasHistoryMutate = false;
        const materializedRunPatches: Record<string, LinghuiNodeRunState> = {};

        for (const outcome of historyResults) {
          if (outcome.status === 'rejected') {
            const errorMessage = outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
            workflowLogger.warn('灵绘历史结果落盘失败', {
              nodeId: outcome.nodeId,
              nodeLabel: outcome.nodeLabel,
              nodeType: outcome.nodeType,
              error: errorMessage,
            });
            const patchedHistoryErrorRuntime = patchWorkspaceExecution(undefined, [
              createLinghuiPageExecutionLog('warn', `历史结果落盘失败：${outcome.nodeLabel || outcome.nodeId} · ${errorMessage}`, outcome.nodeId),
            ]);
            nextRuns = { ...patchedHistoryErrorRuntime.nodeRuns };
            nextLogs = [...patchedHistoryErrorRuntime.executionLogs];
            continue;
          }
          if (outcome.status !== 'fulfilled') continue;
          hasHistoryMutate = true;
          if (outcome.materializedRun) {
            materializedRunPatches[outcome.nodeId] = outcome.materializedRun;
          }
        }

        if (hasHistoryMutate) {
          handleHistoryLibraryMutate();
        }
        if (Object.keys(materializedRunPatches).length > 0) {
          const patchedMaterializedRuntime = patchWorkspaceExecution(materializedRunPatches);
          nextRuns = { ...patchedMaterializedRuntime.nodeRuns };
          nextLogs = [...patchedMaterializedRuntime.executionLogs];
        }
      }

      if (result.queue.status === 'canceled') {
        message.warning('已取消当前执行队列');
      } else if (result.queue.failedNodeIds.length > 0) {
        const firstFailedNodeId = result.queue.failedNodeIds[0];
        const firstFailedLabel = firstFailedNodeId
          ? nodeSnapshotMap.get(firstFailedNodeId)?.data.label
          : '';
        const firstFailedError = firstFailedNodeId
          ? finalRuns[firstFailedNodeId]?.error
          : '';
        message.warning(
          firstFailedLabel && firstFailedError
            ? `${result.queue.failedNodeIds.length} 个节点失败：${firstFailedLabel} · ${firstFailedError}`
            : `执行完成，但有 ${result.queue.failedNodeIds.length} 个节点失败`,
        );
        if (firstFailedNodeId) {
          window.setTimeout(() => {
            canvasRef.current?.focusNodes([firstFailedNodeId], { select: true });
          }, 120);
        }
      } else {
        message.success(
          options?.successMessage ||
          (targetNodeIds?.length ? '已执行选中节点' : '已执行全部工作流'),
        );
      }
    } catch (error: any) {
      workflowLogger.error('灵绘执行工作流异常', {
        targetNodeIds: runnableTargetNodeIds ?? targetNodeIds,
        error: error?.message || String(error),
      });
      const failureMessage = error?.message || '执行灵绘工作流失败';
      const patchedRuntime = patchWorkspaceExecution(undefined, [
        createLinghuiPageExecutionLog('error', failureMessage),
      ]);
      nextRuns = { ...patchedRuntime.nodeRuns };
      nextLogs = [...patchedRuntime.executionLogs];
      message.error(failureMessage);
    } finally {
      executionBatchesRef.current.delete(abortController);
      executionQueuesRef.current.delete(abortController);
      recomputeExecutionQueue();
      if (executionBatchesRef.current.size === 0) {
        setRunning(false);
      }
      canvasRef.current?.notifyMutation();
    }
  }, [
    activeWorkspaceRef,
    canvasRef,
    executionBatchesRef,
    executionQueuesRef,
    handleHistoryLibraryMutate,
    message,
    patchWorkspaceExecution,
    recomputeExecutionQueue,
    setRunning,
    updateWorkspaceExecution,
    workflowLogger,
    workspaceRuntimeRef,
  ]);
}
