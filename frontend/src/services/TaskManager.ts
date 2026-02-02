/**
 * 后台任务管理器
 * 管理异步任务的创建、追踪、持久化和恢复
 * v2: 支持 category + subType 分类，任务恢复策略
 */
import { v4 as uuidv4 } from 'uuid';
import { electronService } from './electronService';
import { getStorageConfig, initStorageConfig } from '../store/storageConfig';

// ========== 任务分类 ==========

// 任务大类
export type TaskCategory = 'prompt' | 'media' | 'analysis' | 'asset' | 'script' | 'export';

// 任务子类型
export type TaskSubType =
  | 'image' | 'video'                          // prompt 类
  | 'tti' | 'itv' | 'tts'                      // media 类
  | 'shot-analysis' | 'shot-generation'        // analysis 类
  | 'script-analysis'                          // script 类
  | 'asset-generation' | 'character-extraction' // asset 类
  | 'prompt-generation' | 'prompt-optimization'; // prompt 操作

// 旧版任务类型（兼容）
export type TaskType = 'script-analysis' | 'asset-generation' | 'shot-render' | 'shot-generation' | 'shot-analysis'
  | 'prompt-generation:image' | 'prompt-generation:video'
  | 'prompt-optimization:image' | 'prompt-optimization:video';

// 任务状态
export type TaskStatus = 'pending' | 'running' | 'processing' | 'completed' | 'failed';

// 目标类型
export type TaskTargetType = 'episode' | 'character' | 'scene' | 'prop' | 'shot';

// 任务恢复选项
export interface TaskRecoveryOptions {
  staleTimeoutMs: number;  // 默认 5 分钟
  now?: () => number;
}

// 任务记录（v2）
export interface Task {
  id: string;
  projectId: string;
  // 新增分类字段
  category?: TaskCategory;
  subType?: TaskSubType;
  // 兼容旧版
  type: TaskType;
  status: TaskStatus;
  progress: number;
  targetType: TaskTargetType;
  targetId: string;
  targetName?: string;
  // 恢复相关字段
  recoverable?: boolean;
  lastHeartbeat?: number;
  attempt?: number;
  maxRetries?: number;
  remoteTaskId?: string;
  // 时间戳
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  // 结果
  result?: any;
  error?: string;
  metadata?: Record<string, unknown>;
}

// 任务创建参数
export interface CreateTaskParams {
  projectId: string;
  type?: TaskType;           // 兼容旧版
  category?: TaskCategory;   // 新版分类
  subType?: TaskSubType;     // 新版子类型
  targetType: TaskTargetType;
  targetId: string;
  targetName?: string;
  recoverable?: boolean;
  maxRetries?: number;
  metadata?: Record<string, unknown>;
}

// 任务变更监听器
type TaskListener = (task: Task) => void;

// 默认恢复选项
const DEFAULT_RECOVERY_OPTIONS: TaskRecoveryOptions = {
  staleTimeoutMs: 5 * 60 * 1000, // 5 分钟
};

// 旧版 TaskType 到新版 category/subType 的映射
function mapLegacyTaskType(type: TaskType): { category: TaskCategory; subType: TaskSubType } {
  const mapping: Record<string, { category: TaskCategory; subType: TaskSubType }> = {
    'script-analysis': { category: 'script', subType: 'script-analysis' },
    'asset-generation': { category: 'asset', subType: 'asset-generation' },
    'shot-render': { category: 'media', subType: 'itv' },
    'shot-generation': { category: 'analysis', subType: 'shot-generation' },
    'shot-analysis': { category: 'analysis', subType: 'shot-analysis' },
    'prompt-generation:image': { category: 'prompt', subType: 'image' },
    'prompt-generation:video': { category: 'prompt', subType: 'video' },
    'prompt-optimization:image': { category: 'prompt', subType: 'prompt-optimization' },
    'prompt-optimization:video': { category: 'prompt', subType: 'prompt-optimization' },
  };
  return mapping[type] || { category: 'analysis', subType: 'shot-analysis' };
}

class TaskManagerClass {
  private tasks: Map<string, Task> = new Map();
  private listeners: Set<TaskListener> = new Set();
  private pollingInterval: NodeJS.Timeout | null = null;
  private initialized = false;
  private currentProjectId: string | null = null;

  /**
   * 初始化任务管理器（支持任务恢复）
   */
  async initialize(projectId: string, options?: TaskRecoveryOptions): Promise<void> {
    if (this.initialized && this.currentProjectId === projectId) return;

    this.currentProjectId = projectId;
    await this.loadTasks(projectId);
    await this.recoverTasks(projectId, options || DEFAULT_RECOVERY_OPTIONS);
    this.startPolling();
    this.initialized = true;
  }

  /**
   * 创建新任务
   */
  createTask(params: CreateTaskParams): Task {
    const now = Date.now();

    // 处理 category/subType（兼容旧版 type）
    let category = params.category;
    let subType = params.subType;
    let type = params.type;

    if (!category && !subType && type) {
      const mapped = mapLegacyTaskType(type);
      category = mapped.category;
      subType = mapped.subType;
    } else if (category && subType && !type) {
      // 生成兼容的 type
      type = `${category}-${subType}` as TaskType;
    }

    const task: Task = {
      id: uuidv4(),
      projectId: params.projectId,
      type: type || 'shot-analysis',
      category,
      subType,
      status: 'pending',
      progress: 0,
      targetType: params.targetType,
      targetId: params.targetId,
      targetName: params.targetName,
      recoverable: params.recoverable ?? false,
      attempt: 0,
      maxRetries: params.maxRetries ?? 3,
      metadata: params.metadata,
      createdAt: now,
      updatedAt: now,
      lastHeartbeat: now,
    };

    this.tasks.set(task.id, task);
    this.saveTasks(params.projectId);
    this.notifyListeners(task);

    return task;
  }

  /**
   * 更新任务状态
   */
  updateTask(taskId: string, updates: Partial<Omit<Task, 'id' | 'projectId' | 'createdAt'>>): Task | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const now = Date.now();
    const updatedTask: Task = {
      ...task,
      ...updates,
      updatedAt: now,
      lastHeartbeat: now,
    };

    // 记录开始/完成时间
    if (updates.status === 'running' && !task.startedAt) {
      updatedTask.startedAt = now;
    }
    if ((updates.status === 'completed' || updates.status === 'failed') && !task.completedAt) {
      updatedTask.completedAt = now;
    }

    this.tasks.set(taskId, updatedTask);
    this.saveTasks(task.projectId);
    this.notifyListeners(updatedTask);

    return updatedTask;
  }

  /**
   * 记录心跳（用于检测 stale 任务）
   */
  recordHeartbeat(taskId: string): Task | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const updatedTask: Task = {
      ...task,
      lastHeartbeat: Date.now(),
      updatedAt: Date.now(),
    };

    this.tasks.set(taskId, updatedTask);
    return updatedTask;
  }

  /**
   * 恢复 stale 任务（启动时调用）
   */
  async recoverTasks(projectId: string, options: TaskRecoveryOptions): Promise<void> {
    const now = options.now ? options.now() : Date.now();
    const staleTasks = Array.from(this.tasks.values()).filter(t => {
      if (t.projectId !== projectId) return false;
      if (t.status !== 'running' && t.status !== 'processing') return false;
      const lastActive = t.lastHeartbeat || t.updatedAt;
      return (now - lastActive) > options.staleTimeoutMs;
    });

    for (const task of staleTasks) {
      if (task.recoverable && (task.attempt || 0) < (task.maxRetries || 3)) {
        // 可恢复：转为 pending 重入队
        console.log(`[TaskManager] 恢复任务 ${task.id} (attempt ${(task.attempt || 0) + 1})`);
        this.updateTask(task.id, {
          status: 'pending',
          attempt: (task.attempt || 0) + 1,
          error: undefined,
        });
      } else {
        // 不可恢复：标记为 failed
        console.log(`[TaskManager] 标记任务 ${task.id} 为失败 (stale on restart)`);
        this.updateTask(task.id, {
          status: 'failed',
          error: '任务在软件重启后中断',
        });
      }
    }

    if (staleTasks.length > 0) {
      console.log(`[TaskManager] 恢复处理完成: ${staleTasks.length} 个任务`);
    }
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
          // 迁移旧版任务：补充 category/subType
          if (!task.category && task.type) {
            const mapped = mapLegacyTaskType(task.type);
            task.category = mapped.category;
            task.subType = mapped.subType;
          }
          // 补充默认字段
          if (task.recoverable === undefined) task.recoverable = false;
          if (task.attempt === undefined) task.attempt = 0;
          if (task.maxRetries === undefined) task.maxRetries = 3;

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
