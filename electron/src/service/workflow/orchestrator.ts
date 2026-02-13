/**
 * 工作流编排器
 * 驱动 DAG 节点执行，管理运行状态
 */
import { EventEmitter } from 'events';
import type {
  WorkflowDefinition,
  WorkflowRun,
  NodeRecord,
  NodeStatus,
  RunStatus,
} from './types';
import { validateWorkflow } from './graph-dsl';

type NodeHandler = (
  params: Record<string, unknown>,
  context: Record<string, unknown>,
  onProgress: (progress: number, step?: string) => void
) => Promise<unknown>;

export class WorkflowOrchestrator extends EventEmitter {
  private handlers = new Map<string, NodeHandler>();
  private runs = new Map<string, WorkflowRun>();
  private abortControllers = new Map<string, AbortController>();
  // HITL 门控
  private approvalResolvers = new Map<string, () => void>();

  /** 注册节点处理器 */
  registerHandler(name: string, handler: NodeHandler): void {
    this.handlers.set(name, handler);
  }

  /** 创建并启动工作流 */
  async startRun(
    definition: WorkflowDefinition,
    initialContext?: Record<string, unknown>
  ): Promise<string> {
    const errors = validateWorkflow(definition);
    if (errors.length > 0) {
      throw new Error(`工作流验证失败: ${errors.join('; ')}`);
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const nodes = new Map<string, NodeRecord>();
    for (const node of definition.nodes) {
      nodes.set(node.id, {
        nodeId: node.id,
        status: 'pending',
        progress: 0,
      });
    }

    const run: WorkflowRun = {
      id: runId,
      workflowId: definition.id,
      status: 'running',
      nodes,
      context: { ...initialContext, _definition: definition },
      createdAt: now,
      updatedAt: now,
    };

    this.runs.set(runId, run);
    this.abortControllers.set(runId, new AbortController());
    this.emit('run:start', { runId, workflowId: definition.id });

    // 异步执行
    this.executeRun(runId, definition).catch(err => {
      console.error(`[Orchestrator] Run ${runId} failed:`, err);
    });

    return runId;
  }

  /** 执行工作流 */
  private async executeRun(runId: string, definition: WorkflowDefinition): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;

    // 构建依赖图
    const deps = new Map<string, Set<string>>();
    for (const node of definition.nodes) {
      deps.set(node.id, new Set());
    }
    for (const conn of definition.connections) {
      deps.get(conn.target)?.add(conn.source);
    }

    // 拓扑执行
    const completed = new Set<string>();
    while (completed.size < definition.nodes.length) {
      if (run.status === 'cancelled' || run.status === 'failed') break;

      // 暂停检查
      if (run.status === 'paused') {
        await new Promise<void>(resolve => {
          const check = () => {
            if (run.status !== 'paused') resolve();
            else setTimeout(check, 500);
          };
          check();
        });
      }

      // 找到可执行的节点（所有依赖已完成）
      const ready: string[] = [];
      for (const node of definition.nodes) {
        if (completed.has(node.id)) continue;
        const nodeDeps = deps.get(node.id) || new Set();
        if ([...nodeDeps].every(d => completed.has(d))) {
          const record = run.nodes.get(node.id);
          if (record && record.status === 'pending') {
            ready.push(node.id);
          }
        }
      }

      if (ready.length === 0) {
        // 死锁或全部完成
        break;
      }

      // 并行执行就绪节点
      await Promise.all(ready.map(nodeId =>
        this.executeNode(runId, definition, nodeId)
      ));

      // 标记完成的节点
      for (const nodeId of ready) {
        const record = run.nodes.get(nodeId);
        if (record && (record.status === 'completed' || record.status === 'skipped')) {
          completed.add(nodeId);
        } else if (record?.status === 'failed') {
          run.status = 'failed';
          break;
        }
      }
    }

    if (run.status === 'running') {
      run.status = 'completed';
    }
    run.updatedAt = Date.now();
    this.emit('run:end', { runId, status: run.status });
  }

  /** 执行单个节点 */
  private async executeNode(
    runId: string,
    definition: WorkflowDefinition,
    nodeId: string
  ): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;

    const nodeDef = definition.nodes.find(n => n.id === nodeId);
    if (!nodeDef) return;

    const record = run.nodes.get(nodeId);
    if (!record) return;

    // HITL 门控
    if (nodeDef.requireApproval) {
      record.status = 'paused';
      this.emit('node:approval-required', { runId, nodeId });
      await new Promise<void>(resolve => {
        this.approvalResolvers.set(`${runId}:${nodeId}`, resolve);
      });
    }

    const handler = this.handlers.get(nodeDef.handler);
    if (!handler) {
      record.status = 'failed';
      record.error = `Handler "${nodeDef.handler}" not registered`;
      this.emit('node:error', { runId, nodeId, error: record.error });
      return;
    }

    record.status = 'running';
    record.startedAt = Date.now();
    this.emit('node:start', { runId, nodeId });

    try {
      const output = await handler(
        nodeDef.params || {},
        run.context,
        (progress, step) => {
          record.progress = progress;
          record.currentStep = step;
          this.emit('node:progress', { runId, nodeId, progress, step });
        }
      );

      record.status = 'completed';
      record.progress = 100;
      record.output = output;
      record.completedAt = Date.now();
      // 将输出存入上下文供下游使用
      run.context[`output:${nodeId}`] = output;
      this.emit('node:complete', { runId, nodeId });
    } catch (err: any) {
      record.status = 'failed';
      record.error = err.message;
      this.emit('node:error', { runId, nodeId, error: err.message });
    }
  }

  /** 批准 HITL 门控 */
  approve(runId: string, nodeId: string): void {
    const key = `${runId}:${nodeId}`;
    const resolver = this.approvalResolvers.get(key);
    if (resolver) {
      resolver();
      this.approvalResolvers.delete(key);
    }
  }

  /** 暂停运行 */
  pause(runId: string): void {
    const run = this.runs.get(runId);
    if (run && run.status === 'running') {
      run.status = 'paused';
      this.emit('run:paused', { runId });
    }
  }

  /** 恢复运行 */
  resume(runId: string): void {
    const run = this.runs.get(runId);
    if (run && run.status === 'paused') {
      run.status = 'running';
      this.emit('run:resumed', { runId });
    }
  }

  /** 取消运行 */
  cancel(runId: string): void {
    const run = this.runs.get(runId);
    if (run) {
      run.status = 'cancelled';
      this.abortControllers.get(runId)?.abort();
      this.emit('run:cancelled', { runId });
    }
  }

  /** 获取运行状态 */
  getRun(runId: string): WorkflowRun | undefined {
    return this.runs.get(runId);
  }

  /** 获取所有运行 */
  listRuns(): WorkflowRun[] {
    return Array.from(this.runs.values());
  }
}

export const workflowOrchestrator = new WorkflowOrchestrator();
