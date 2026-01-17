/**
 * 后台任务管理器
 * 管理异步任务的创建、追踪、持久化和恢复
 */
import { v4 as uuidv4 } from 'uuid';
import { electronService } from './electronService';
import { getStorageConfig, initStorageConfig } from '../store/storageConfig';

// 任务类型
export type TaskType = 'script-analysis' | 'asset-generation' | 'shot-render' | 'shot-generation' | 'shot-analysis';

// 任务状态
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

// 目标类型
export type TaskTargetType = 'episode' | 'character' | 'scene' | 'prop' | 'shot';

// 任务记录
export interface Task {
  id: string;
  projectId: string;
  type: TaskType;
  status: TaskStatus;
  progress: number;
  targetType: TaskTargetType;
  targetId: string;
  targetName?: string;
  result?: any;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

// 任务创建参数
export interface CreateTaskParams {
  projectId: string;
  type: TaskType;
  targetType: TaskTargetType;
  targetId: string;
  targetName?: string;
}

// 任务变更监听器
type TaskListener = (task: Task) => void;

class TaskManagerClass {
  private tasks: Map<string, Task> = new Map();
  private listeners: Set<TaskListener> = new Set();
  private pollingInterval: NodeJS.Timeout | null = null;
  private initialized = false;

  /**
   * 初始化任务管理器
   */
  async initialize(projectId: string): Promise<void> {
    if (this.initialized) return;

    await this.loadTasks(projectId);
    this.startPolling();
    this.initialized = true;
  }

  /**
   * 创建新任务
   */
  createTask(params: CreateTaskParams): Task {
    const now = Date.now();
    const task: Task = {
      id: uuidv4(),
      projectId: params.projectId,
      type: params.type,
      status: 'pending',
      progress: 0,
      targetType: params.targetType,
      targetId: params.targetId,
      targetName: params.targetName,
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(task.id, task);
    this.saveTasks(params.projectId);
    this.notifyListeners(task);

    return task;
  }

  /**
   * 更新任务状态
   */
  updateTask(taskId: string, updates: Partial<Pick<Task, 'status' | 'progress' | 'result' | 'error'>>): Task | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const updatedTask: Task = {
      ...task,
      ...updates,
      updatedAt: Date.now(),
    };

    this.tasks.set(taskId, updatedTask);
    this.saveTasks(task.projectId);
    this.notifyListeners(updatedTask);

    return updatedTask;
  }

  /**
   * 获取任务
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 获取项目的所有任务
   */
  getProjectTasks(projectId: string): Task[] {
    return Array.from(this.tasks.values())
      .filter(t => t.projectId === projectId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 获取项目的运行中任务
   */
  getRunningTasks(projectId: string): Task[] {
    return this.getProjectTasks(projectId)
      .filter(t => t.status === 'pending' || t.status === 'running');
  }

  /**
   * 添加任务变更监听器
   */
  addListener(listener: TaskListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(task: Task): void {
    this.listeners.forEach(listener => {
      try {
        listener(task);
      } catch (err) {
        console.error('Task listener error:', err);
      }
    });
  }

  /**
   * 从项目目录加载任务
   */
  private async loadTasks(projectId: string): Promise<void> {
    if (!electronService.isElectron()) return;

    try {
      const config = getStorageConfig() || (await initStorageConfig());
      const tasksPath = `${config.rootPath}/projects/${projectId}/tasks.json`;

      const exists = await electronService.fs.exists(tasksPath);
      if (!exists) return;

      const content = await electronService.fs.readFile(tasksPath);
      const data = JSON.parse(content);

      if (data.tasks && Array.isArray(data.tasks)) {
        // 清理7天前的已完成任务
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const validTasks = data.tasks.filter((t: Task) => {
          if (t.status === 'completed' || t.status === 'failed') {
            return t.updatedAt > sevenDaysAgo;
          }
          return true;
        });

        validTasks.forEach((task: Task) => {
          this.tasks.set(task.id, task);
        });
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  }

  /**
   * 保存任务到项目目录
   */
  private async saveTasks(projectId: string): Promise<void> {
    if (!electronService.isElectron()) return;

    try {
      const config = getStorageConfig() || (await initStorageConfig());
      const tasksPath = `${config.rootPath}/projects/${projectId}/tasks.json`;

      const projectTasks = this.getProjectTasks(projectId);
      const data = {
        tasks: projectTasks,
        updatedAt: Date.now(),
      };

      await electronService.fs.writeFile(tasksPath, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Failed to save tasks:', err);
    }
  }

  /**
   * 启动轮询器
   */
  private startPolling(): void {
    if (this.pollingInterval) return;

    this.pollingInterval = setInterval(() => {
      this.pollRunningTasks();
    }, 3000);
  }

  /**
   * 停止轮询器
   */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * 轮询运行中的任务
   * 子类或外部可以注册轮询处理器
   */
  private async pollRunningTasks(): Promise<void> {
    const runningTasks = Array.from(this.tasks.values())
      .filter(t => t.status === 'running');

    // 这里由具体的服务来处理轮询逻辑
    // TaskManager 只负责管理任务状态
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.stopPolling();
    this.tasks.clear();
    this.listeners.clear();
    this.initialized = false;
  }
}

// 导出单例
export const TaskManager = new TaskManagerClass();
export default TaskManager;
