import { useCallback, type RefObject } from 'react';
import type { MessageInstance } from 'antd/es/message/interface';
import type {
  LinghuiExecutionLogEntry,
  LinghuiNodeRunState,
  LinghuiWorkspaceDocument,
} from '../../../../types/linghui';
import type { LinghuiCanvasHandle } from '../../canvas/components/LinghuiCanvas';
import {
  createLinghuiPageExecutionLog,
  mergeLinghuiPageExecutionLogs,
} from '../state/linghuiPageExecutionLogs';
import type { LinghuiWorkspaceRuntimeState } from '../state/linghuiPageWorkspaceRuntime';

interface LinghuiPageRunHandlersParams {
  activeWorkspaceRef: RefObject<LinghuiWorkspaceDocument | null>;
  canvasRef: RefObject<LinghuiCanvasHandle | null>;
  message: MessageInstance;
  openExecutionPlan: (
    scopeLabel: string,
    targetNodeIds?: string[],
    options?: {
      resolveTargetsOnly?: boolean;
      successMessage?: string;
    },
  ) => Promise<void>;
  runWorkflow: (targetNodeIds?: string[], options?: {
    resolveTargetsOnly?: boolean;
    successMessage?: string;
  }) => Promise<void>;
  updateWorkspaceExecution: (
    nextRuns: Record<string, LinghuiNodeRunState>,
    nextLogs: LinghuiExecutionLogEntry[],
  ) => void;
  workflowLogger: {
    info: (message: string, meta?: Record<string, unknown>) => void;
  };
  workspaceRuntimeRef: RefObject<LinghuiWorkspaceRuntimeState>;
}

export function useLinghuiPageRunHandlers({
  activeWorkspaceRef,
  canvasRef,
  message,
  openExecutionPlan,
  runWorkflow,
  updateWorkspaceExecution,
  workflowLogger,
  workspaceRuntimeRef,
}: LinghuiPageRunHandlersParams) {
  const handleRunAll = useCallback(async () => {
    await openExecutionPlan('全部工作流');
  }, [openExecutionPlan]);

  const handleRunSingleNode = useCallback(async (nodeId: string) => {
    workflowLogger.info('灵绘触发单节点执行', {
      nodeId,
    });
    await runWorkflow([nodeId], {
      resolveTargetsOnly: true,
      successMessage: '已执行当前节点',
    });
  }, [runWorkflow, workflowLogger]);

  const handleRunSelection = useCallback(async (selectionIds?: string[]) => {
    const rawSelectionIds = selectionIds?.length
      ? selectionIds
      : (canvasRef.current?.getSelectionIds() ?? []);
    const runnableIds = canvasRef.current?.resolveExecutionTargetIds(rawSelectionIds) ?? [];

    workflowLogger.info('灵绘触发批量执行', {
      rawSelectionIds,
      runnableIds,
    });

    if (!rawSelectionIds.length || !runnableIds.length) {
      message.info('请先选中需要执行的节点或工作流块');
      return;
    }

    const isWorkflowBlockRun = rawSelectionIds.length === 1 && runnableIds.length > 0 && rawSelectionIds[0] !== runnableIds[0];
    await openExecutionPlan(isWorkflowBlockRun ? '工作流块执行计划' : '选中节点执行计划', runnableIds, {
      successMessage: isWorkflowBlockRun ? '已执行工作流块' : '已执行选中节点',
    });
  }, [canvasRef, message, openExecutionPlan, workflowLogger]);

  const handleConnectionError = useCallback((content: string) => {
    const currentWorkspace = activeWorkspaceRef.current;
    message.warning(content);
    if (!currentWorkspace) {
      return;
    }

    updateWorkspaceExecution(
      workspaceRuntimeRef.current.nodeRuns,
      mergeLinghuiPageExecutionLogs(
        workspaceRuntimeRef.current.executionLogs,
        createLinghuiPageExecutionLog('error', `连接失败：${content}`),
      ),
    );
  }, [activeWorkspaceRef, message, updateWorkspaceExecution, workspaceRuntimeRef]);

  return {
    handleConnectionError,
    handleRunAll,
    handleRunSelection,
    handleRunSingleNode,
  };
}
