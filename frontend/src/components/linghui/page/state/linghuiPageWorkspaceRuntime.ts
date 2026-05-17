import {
  EMPTY_LINGHUI_EXECUTION_LOGS,
  EMPTY_LINGHUI_NODE_RUNS,
  type LinghuiNodeRunState,
  type LinghuiWorkspaceDocument,
} from '../../../../types/linghui';

export type LinghuiWorkspaceRuntimeState = Pick<LinghuiWorkspaceDocument, 'nodeRuns' | 'executionLogs'>;

export const EMPTY_WORKSPACE_RUNTIME: LinghuiWorkspaceRuntimeState = {
  nodeRuns: EMPTY_LINGHUI_NODE_RUNS,
  executionLogs: EMPTY_LINGHUI_EXECUTION_LOGS,
};

export function ensureWorkspaceRuntime(
  workspace: LinghuiWorkspaceDocument | null | undefined,
  options?: { resetInterruptedRuns?: boolean },
): LinghuiWorkspaceDocument {
  if (!workspace) {
    throw new Error('灵绘工作区数据异常：未返回工作区文档');
  }

  const baseNodeRuns = workspace.nodeRuns ?? EMPTY_LINGHUI_NODE_RUNS;
  const nodeRuns = options?.resetInterruptedRuns
    ? Object.fromEntries(
        Object.entries(baseNodeRuns).map(([nodeId, runState]) => {
          if (runState?.status !== 'running') {
            return [nodeId, runState];
          }
          return [nodeId, {
            ...runState,
            status: 'stale',
            progress: undefined,
            message: '上次执行已中断，可重新运行。',
            updatedAt: Date.now(),
          } satisfies LinghuiNodeRunState];
        }),
      )
    : baseNodeRuns;

  return {
    ...workspace,
    nodeRuns,
    executionLogs: workspace.executionLogs ?? EMPTY_LINGHUI_EXECUTION_LOGS,
  };
}
