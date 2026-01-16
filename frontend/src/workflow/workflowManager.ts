/**
 * 工作流管理器
 * 管理异步任务队列和工作流状态
 */
import type { WorkflowProgress, WorkflowType } from '../types';

type WorkflowHandler = (
  params: any,
  onProgress: (progress: number, step?: string) => void
) => Promise<any>;

interface QueuedTask {
  id: string;
  type: WorkflowType;
  params: any;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

export class WorkflowManager {
  private handlers: Map<WorkflowType, WorkflowHandler> = new Map();
  private queue: QueuedTask[] = [];
  private running: Map<string, WorkflowProgress> = new Map();
  private isProcessing = false;
  private maxConcurrent = 2;

  private listeners: ((workflows: WorkflowProgress[]) => void)[] = [];

  /**
   * 注册工作流处理器
   */
  registerHandler(type: WorkflowType, handler: WorkflowHandler) {
    this.handlers.set(type, handler);
  }

  /**
   * 提交工作流任务
   */
  submit<T = any>(type: WorkflowType, params: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = `workflow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      this.queue.push({ id, type, params, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * 取消工作流
   */
  cancel(workflowId: string) {
    // 从队列中移除
    this.queue = this.queue.filter((t) => t.id !== workflowId);
    // 标记为取消
    const workflow = this.running.get(workflowId);
    if (workflow) {
      workflow.status = 'cancelled';
      this.notifyListeners();
    }
  }

  /**
   * 获取所有工作流状态
   */
  getAll(): WorkflowProgress[] {
    const queued: WorkflowProgress[] = this.queue.map((t) => ({
      workflowId: t.id,
      type: t.type,
      status: 'pending',
      progress: 0,
    }));
    return [...queued, ...Array.from(this.running.values())];
  }

  /**
   * 监听工作流变化
   */
  subscribe(listener: (workflows: WorkflowProgress[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * 处理队列
   */
  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0 && this.running.size < this.maxConcurrent) {
      const task = this.queue.shift()!;
      this.executeTask(task);
    }

    this.isProcessing = false;
  }

  /**
   * 执行单个任务
   */
  private async executeTask(task: QueuedTask) {
    const handler = this.handlers.get(task.type);
    if (!handler) {
      task.reject(new Error(`No handler for workflow type: ${task.type}`));
      return;
    }

    const progress: WorkflowProgress = {
      workflowId: task.id,
      type: task.type,
      status: 'running',
      progress: 0,
      startedAt: Date.now(),
    };
    this.running.set(task.id, progress);
    this.notifyListeners();

    try {
      const result = await handler(task.params, (p, step) => {
        progress.progress = p;
        progress.currentStep = step;
        this.notifyListeners();
      });

      progress.status = 'completed';
      progress.progress = 100;
      progress.completedAt = Date.now();
      this.notifyListeners();
      task.resolve(result);
    } catch (err: any) {
      progress.status = 'failed';
      progress.error = err.message;
      this.notifyListeners();
      task.reject(err);
    } finally {
      // 移除已完成的任务（延迟5秒）
      setTimeout(() => {
        this.running.delete(task.id);
        this.notifyListeners();
      }, 5000);

      // 继续处理队列
      this.processQueue();
    }
  }

  private notifyListeners() {
    const workflows = this.getAll();
    this.listeners.forEach((l) => l(workflows));
  }
}

export const workflowManager = new WorkflowManager();
export default workflowManager;
