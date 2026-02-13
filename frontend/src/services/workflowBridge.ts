/**
 * 工作流桥接层
 * 前端通过此模块操作后端 WorkflowOrchestrator
 */

type WorkflowEventCallback = (data: any) => void;

function getAPI(): any {
  if (typeof window !== 'undefined' && (window as any).electronAPI?.workflow) {
    return (window as any).electronAPI.workflow;
  }
  return null;
}

/** 启动工作流 */
export async function workflowStart(
  definition: any,
  context?: Record<string, unknown>
): Promise<string | null> {
  const api = getAPI();
  if (!api) return null;
  try {
    const result = await api.start(definition, context);
    return result.runId;
  } catch (err) {
    console.error('[workflowBridge] start failed:', err);
    return null;
  }
}

/** 暂停工作流 */
export async function workflowPause(runId: string): Promise<boolean> {
  const api = getAPI();
  if (!api) return false;
  try {
    await api.pause(runId);
    return true;
  } catch {
    return false;
  }
}

/** 恢复工作流 */
export async function workflowResume(runId: string): Promise<boolean> {
  const api = getAPI();
  if (!api) return false;
  try {
    await api.resume(runId);
    return true;
  } catch {
    return false;
  }
}

/** 取消工作流 */
export async function workflowCancel(runId: string): Promise<boolean> {
  const api = getAPI();
  if (!api) return false;
  try {
    await api.cancel(runId);
    return true;
  } catch {
    return false;
  }
}

/** 批准 HITL 门控节点 */
export async function workflowApprove(
  runId: string,
  nodeId: string
): Promise<boolean> {
  const api = getAPI();
  if (!api) return false;
  try {
    await api.approve(runId, nodeId);
    return true;
  } catch {
    return false;
  }
}

/** 获取运行状态 */
export async function workflowGetRun(runId: string): Promise<any | null> {
  const api = getAPI();
  if (!api) return null;
  try {
    return await api.getRun(runId);
  } catch {
    return null;
  }
}

/** 列出所有运行 */
export async function workflowListRuns(): Promise<any[]> {
  const api = getAPI();
  if (!api) return [];
  try {
    return await api.listRuns();
  } catch {
    return [];
  }
}

/** 监听工作流事件 */
export function onWorkflowEvent(
  event: string,
  callback: WorkflowEventCallback
): () => void {
  const api = getAPI();
  if (!api) return () => {};
  return api.onEvent(event, (_: any, data: any) => callback(data));
}

type DelegateHandler = (
  params: Record<string, unknown>,
  context: Record<string, unknown>
) => Promise<unknown>;

/**
 * 注册委托执行处理器
 * 后端 DAG 编排器会把节点执行委托给前端，前端在这里注册实际的执行逻辑
 */
export function registerDelegateHandlers(
  handlers: Record<string, DelegateHandler>
): () => void {
  const api = getAPI();
  if (!api) return () => {};

  return api.onDelegate(async (_: any, data: any) => {
    const { delegateId, handler, params, context } = data;
    const fn = handlers[handler];
    if (!fn) {
      api.sendDelegateResult(delegateId, null, `未注册的处理器: ${handler}`);
      return;
    }
    try {
      const result = await fn(params, context);
      api.sendDelegateResult(delegateId, result);
    } catch (err: any) {
      api.sendDelegateResult(delegateId, null, err.message);
    }
  });
}

export const workflowBridge = {
  start: workflowStart,
  pause: workflowPause,
  resume: workflowResume,
  cancel: workflowCancel,
  approve: workflowApprove,
  getRun: workflowGetRun,
  listRuns: workflowListRuns,
  onEvent: onWorkflowEvent,
  registerDelegateHandlers,
};
