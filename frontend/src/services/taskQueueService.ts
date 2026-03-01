import { electronService } from './electronService';

export type TaskStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface TaskInfo<T = any> {
  taskId: string;
  status: TaskStatus;
  progress: number;
  type?: string;
  phase?: string;
  attempts?: number;
  maxRetries?: number;
  payload?: any;
  error?: string;
  result?: T;
  updatedAt?: number;
}

type TaskListener = (task: TaskInfo) => void;

class TaskQueueService {
  private listeners: Map<string, Set<TaskListener>> = new Map();
  private initialized = false;
  private globalListeners: Set<TaskListener> = new Set();

  initialize() {
    if (this.initialized) return;
    this.initialized = true;

    if (electronService.isElectron()) {
      // 监听任务更新事件
      (window as any).electronAPI?.task?.onUpdate?.((event: any, data: any) => {
        const taskListeners = this.listeners.get(data.taskId);
        if (taskListeners) {
          taskListeners.forEach(fn => fn(data));
        }
        // 通知全局监听器
        this.globalListeners.forEach(fn => fn(data));
      });
    }
  }

  async submitTask(type: string, payload: any): Promise<string> {
    if (!electronService.isElectron()) {
      throw new Error('Task queue only available in Electron');
    }
    const task = await (window as any).electronAPI.task.submitShotRender(payload);
    return task.id;
  }

  async getTaskStatus(taskId: string): Promise<TaskInfo> {
    if (!electronService.isElectron()) {
      throw new Error('Task queue only available in Electron');
    }

    const task = await (window as any).electronAPI.task.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    return {
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      type: task.type,
      phase: task.phase,
      attempts: task.attempts,
      maxRetries: task.maxRetries,
      payload: task.payload,
      error: task.error,
      result: task.result,
      updatedAt: task.updatedAt,
    };
  }

  async cancelTask(taskId: string): Promise<boolean> {
    if (!electronService.isElectron()) {
      throw new Error('Task queue only available in Electron');
    }
    const result = await (window as any).electronAPI.task.cancelTask(taskId);
    return !!result;
  }

  subscribe(taskId: string, listener: TaskListener): () => void {
    if (!this.listeners.has(taskId)) {
      this.listeners.set(taskId, new Set());
    }
    this.listeners.get(taskId)!.add(listener);

    return () => {
      this.listeners.get(taskId)?.delete(listener);
    };
  }

  // 新增：订阅所有任务更新
  subscribeAll(listener: TaskListener): () => void {
    this.globalListeners.add(listener);

    return () => {
      this.globalListeners.delete(listener);
    };
  }

  async listTasks(status?: string): Promise<TaskInfo[]> {
    if (!electronService.isElectron()) {
      throw new Error('Task queue only available in Electron');
    }

    const tasks = await (window as any).electronAPI.task.listTasks(undefined, status);
    if (!Array.isArray(tasks)) {
      return [];
    }

    return tasks.map((task: any) => ({
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      type: task.type,
      phase: task.phase,
      attempts: task.attempts,
      maxRetries: task.maxRetries,
      payload: task.payload,
      error: task.error,
      result: task.result,
      updatedAt: task.updatedAt,
    }));
  }
}

export const taskQueueService = new TaskQueueService();
