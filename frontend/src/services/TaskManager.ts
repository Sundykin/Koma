/**
 * 后台任务管理器
 * 管理异步任务的创建、追踪、持久化和恢复
 * v2: 支持 category + subType 分类，任务恢复策略
 */
import { v4 as uuidv4 } from 'uuid';
import { electronService } from './electronService';
import { getStorageConfig, initStorageConfig } from '../store/storageConfig';
import { createLogger } from '../store/logger';
import { DEFAULT_POLLING_CONFIG } from '../providers/polling';

const logger = createLogger('TaskManager');

// ========== 任务分类 ==========

// 任务大类
export type TaskCategory = 'prompt' | 'analysis' | 'asset' | 'script' | 'export' | 'linghui';

// 任务子类型
export type TaskSubType =
  | 'image' | 'video'                          // prompt 类
  | 'shot-analysis' | 'shot-generation'        // analysis 类
  | 'script-analysis'                          // script 类
  | 'asset-generation' | 'character-extraction' // asset 类
  | 'prompt-generation' | 'prompt-optimization' // prompt 操作
  | 'linghui-text' | 'linghui-image' | 'linghui-video'
  | 'linghui-audio' | 'linghui-agent' | 'linghui-script'; // 灵绘节点执行

// 旧版任务类型（兼容）
export type TaskType = 'script-analysis' | 'asset-generation' | 'shot-generation' | 'shot-analysis'
  | 'prompt-generation:image' | 'prompt-generation:video'
  | 'prompt-optimization:image' | 'prompt-optimization:video'
  | 'linghui-execution';

// 任务状态
export type TaskStatus = 'pending' | 'running' | 'processing' | 'completed' | 'failed';

// 目标类型
export type TaskTargetType = 'episode' | 'character' | 'scene' | 'prop' | 'shot' | 'linghui-node';

// 任务恢复选项
export interface TaskRecoveryOptions {
  staleTimeoutMs: number;  // 默认 5 分钟
  now?: () => number;
}

// 任务记录（v2）
export interface Task {
  id: string;
  projectId: string;
  sessionId?: string;
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
  private readonly sessionId = uuidv4();
  // 写盘节流：高频 progress 推进时合并多次 saveTasks 为一次最终 IPC，
  // 避免 9 张抽卡并发等场景下 fire-and-forget IPC 在事件循环中堆积
  private flushTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly FLUSH_DEBOUNCE_MS = 200;

  private async getTasksPath(projectId: string): Promise<string> {
    const config = getStorageConfig() || (await initStorageConfig());
    // NOTE: taskQueueStore owns `tasks.json` for media tasks.
    // TaskManager (analysis/script/asset/export) persists to a separate file to avoid collisions.
    return `${config.rootPath}/projects/${projectId}/background-tasks.json`;
  }

  /**
   * 初始化任务管理器（支持任务恢复）
   */
  async initialize(projectId: string, options?: TaskRecoveryOptions): Promise<void> {
    if (this.initialized && this.currentProjectId === projectId) return;

    this.currentProjectId = projectId;
    await this.loadTasks(projectId);
    await this.reconcileInterruptedTasks(projectId);
    if (options) {
      await this.recoverTasks(projectId, options || DEFAULT_RECOVERY_OPTIONS);
    }
    this.startPolling();
    this.initialized = true;
  }

  private async reconcileInterruptedTasks(projectId: string): Promise<void> {
    const interruptedTasks = Array.from(this.tasks.values()).filter(task => {
      if (task.projectId !== projectId) return false;
      if (task.sessionId === this.sessionId) return false;
      return task.status === 'pending' || task.status === 'running' || task.status === 'processing';
    });

    for (const task of interruptedTasks) {
      this.updateTask(task.id, {
        status: 'failed',
        error: '任务在软件重启后中断',
      });
    }
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
      sessionId: this.sessionId,
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
    // 终态（completed/failed）立即写盘，其他更新（progress/metadata）走 200ms 节流
    const isTerminal = updates.status === 'completed' || updates.status === 'failed';
    this.saveTasks(task.projectId, isTerminal);
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
      // 仅"远程异步任务"（含 remoteTaskId）才适合自动恢复 — 这类任务即使本地进程重启
      // 也能通过 polling 远端继续追踪结果。
      // 本地长任务（如 LLM 同步调用、剧本/分镜分析）天然不可恢复：上下文已丢失，
      // 重新进入 pending 也没有 worker 消费 → 直接标 failed 让用户决定是否重试。
      const canResume = task.recoverable
        && !!task.remoteTaskId
        && (task.attempt || 0) < (task.maxRetries || 3);

      if (canResume) {
        this.updateTask(task.id, {
          status: 'pending',
          attempt: (task.attempt || 0) + 1,
          error: undefined,
        });
      } else {
        this.updateTask(task.id, {
          status: 'failed',
          error: task.remoteTaskId
            ? '任务在软件重启后中断（已超出重试上限）'
            : '任务在软件重启后中断（无法自动恢复，请重新触发）',
        });
      }
    }
  }

  /**
   * 获取任务
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 删除单个任务（用户从任务面板手动清除）
   * 不取消远程异步任务的 polling 流程；仅从本地任务列表移除。
   */
  removeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    this.tasks.delete(taskId);
    this.saveTasks(task.projectId);
    // 通知监听器，把"已删除"作为状态变更广播（用 failed 占位让 UI 自动移除）
    this.notifyListeners(task);
    return true;
  }

  /**
   * 清空指定项目的已完成 / 已失败任务记录（保留运行中的）
   */
  clearFinishedTasks(projectId: string): number {
    let removed = 0;
    for (const [id, task] of Array.from(this.tasks.entries())) {
      if (task.projectId !== projectId) continue;
      if (task.status === 'completed' || task.status === 'failed') {
        this.tasks.delete(id);
        removed++;
        this.notifyListeners(task);
      }
    }
    if (removed > 0) {
      this.saveTasks(projectId);
    }
    return removed;
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
   * 获取内存中的所有任务（跨项目）。
   * 注意：只看当前已 init/load 进内存的项目；磁盘上未加载项目的任务不会出现。
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
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
        logger.error('Task listener error', err);
      }
    });
  }

  /**
   * 从项目目录加载任务
   */
  private async loadTasks(projectId: string): Promise<void> {
    if (!electronService.isElectron()) return;

    try {
      const tasksPath = await this.getTasksPath(projectId);

      const exists = await electronService.fs.exists(tasksPath);
      if (!exists) return;

      const content = await electronService.fs.readFile(tasksPath);
      const data = JSON.parse(content);

      if (data.tasks && Array.isArray(data.tasks)) {
        // 清理7天前的已完成任务
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const validTasks = data.tasks
          .filter((t: Task) => {
            if (t.status === 'completed' || t.status === 'failed') {
              return t.updatedAt > sevenDaysAgo;
            }
            return true;
          })
          // Only accept tasks that already conform to the current Task shape.
          // Avoid runtime migrations/compat branches per OpenSpec guidance.
          .filter((t: Partial<Task>) =>
            Boolean(
              t
              && typeof t.id === 'string'
              && typeof t.projectId === 'string'
              && typeof t.type === 'string'
              && typeof t.status === 'string'
              && typeof t.progress === 'number'
              && typeof t.targetType === 'string'
              && typeof t.targetId === 'string'
              && typeof t.createdAt === 'number'
              && typeof t.updatedAt === 'number'
            )
          ) as Task[];

        validTasks.forEach((task: Task) => {
          this.tasks.set(task.id, task);
        });
      }
    } catch (err) {
      logger.error('Failed to load tasks', err);
    }
  }

  /**
   * 保存任务到项目目录
   *
   * 默认走节流写盘（合并 200ms 内多次调用为一次 IPC）。调用方传 immediate=true
   * 用于结构性变更（创建/删除/最终态完成）保证不丢。
   */
  private async saveTasks(projectId: string, immediate = false): Promise<void> {
    if (!electronService.isElectron()) return;

    if (!immediate) {
      const existing = this.flushTimers.get(projectId);
      if (existing) clearTimeout(existing);
      this.flushTimers.set(projectId, setTimeout(() => {
        this.flushTimers.delete(projectId);
        // 节流路径同样调底层 flush；忽略错误（已在 try/catch 内）
        this.saveTasks(projectId, true).catch(() => undefined);
      }, this.FLUSH_DEBOUNCE_MS));
      return;
    }

    try {
      const tasksPath = await this.getTasksPath(projectId);

      const projectTasks = this.getProjectTasks(projectId);
      const data = {
        tasks: projectTasks,
        updatedAt: Date.now(),
      };

      await electronService.fs.writeFile(tasksPath, JSON.stringify(data, null, 2));
    } catch (err) {
      logger.error('Failed to save tasks', err);
    }
  }

  /**
   * 启动轮询器
   */
  private startPolling(): void {
    if (this.pollingInterval) return;

    this.pollingInterval = setInterval(() => {
      this.pollRunningTasks();
    }, DEFAULT_POLLING_CONFIG.interval);
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
    const _runningTasks = Array.from(this.tasks.values())
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
