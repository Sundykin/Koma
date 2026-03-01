import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { BrowserWindow } from 'electron';
import { logger } from 'ee-core/log';
import Database from 'better-sqlite3';
import { appEventBus } from '../ipc/eventBus';
import { storagePathLoader } from '../service/config';
import type {
  QueueTaskRecord,
  QueueTaskStatus,
  RendererDelegateProgress,
  RendererDelegateResult,
  ShotRenderTaskPayload,
  ShotRenderTaskResult,
  TaskUpdateEvent,
} from './types';
import { rendererDelegate } from './workers/rendererDelegate';
import { runShotRenderTask, TASK_CANCELLED_ERROR } from './workers/shotRenderHandler';

const BetterQueue: any = require('better-queue');
const BetterQueueSqliteStore: any = require('better-queue-sqlite');

const QUEUE_CONCURRENCY = 3;
const QUEUE_MAX_RETRIES = 3;

interface QueueJob {
  taskId: string;
}

type QueuePushCallback = (error?: Error | null, result?: unknown) => void;

interface QueueLike {
  push: (job: QueueJob, callback?: QueuePushCallback) => void;
  remove?: (id: string) => void;
}

interface TaskRow {
  id: string;
  type: string;
  status: string;
  progress: number;
  attempts: number;
  max_retries: number;
  phase: string | null;
  project_id: string;
  shot_id: string;
  payload_json: string;
  result_json: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  completed_at: number | null;
}

function clampProgress(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function asShotId(shot: Record<string, unknown>): string {
  const id = shot.id;
  return typeof id === 'string' && id.length > 0 ? id : 'unknown-shot';
}

export class ShotRenderTaskQueue {
  private initialized = false;
  private db: Database.Database | null = null;
  private queue: QueueLike | null = null;
  private mainWindow: BrowserWindow | null = null;
  private readonly cancelledTasks = new Set<string>();

  setWindow(win: BrowserWindow): void {
    this.mainWindow = win;
    rendererDelegate.setWindow(win);
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    const { dataDir } = storagePathLoader.getPaths();
    const dbDir = path.join(dataDir, 'db');
    fs.mkdirSync(dbDir, { recursive: true });

    const taskDbPath = path.join(dbDir, 'shot_render_tasks.sqlite');
    const queueStorePath = path.join(dbDir, 'shot_render_queue_store.sqlite');

    this.db = new Database(taskDbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shot_render_tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        progress INTEGER NOT NULL,
        attempts INTEGER NOT NULL,
        max_retries INTEGER NOT NULL,
        phase TEXT,
        project_id TEXT NOT NULL,
        shot_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        result_json TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_shot_render_tasks_project
        ON shot_render_tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_shot_render_tasks_status
        ON shot_render_tasks(status);
      CREATE INDEX IF NOT EXISTS idx_shot_render_tasks_updated_at
        ON shot_render_tasks(updated_at DESC);
    `);

    const store = new BetterQueueSqliteStore({ path: queueStorePath });
    this.queue = new BetterQueue(
      (job: QueueJob, callback: QueuePushCallback) => {
        void this.processTask(job)
          .then((result) => callback(null, result))
          .catch((error) => {
            const err = error instanceof Error ? error : new Error(String(error));
            callback(err);
          });
      },
      {
        id: (job: QueueJob) => job.taskId,
        concurrent: QUEUE_CONCURRENCY,
        maxRetries: QUEUE_MAX_RETRIES,
        retryDelay: 2000,
        store,
      }
    ) as QueueLike;

    this.initialized = true;
    logger.info('[shotRenderTaskQueue] initialized');
  }

  async submitShotRender(payload: ShotRenderTaskPayload): Promise<QueueTaskRecord> {
    await this.init();
    const now = Date.now();
    const taskId = randomUUID();
    const shotId = asShotId(payload.shot);

    const task: QueueTaskRecord = {
      id: taskId,
      type: 'shot-render',
      status: 'queued',
      progress: 0,
      attempts: 0,
      maxRetries: QUEUE_MAX_RETRIES,
      projectId: payload.projectId,
      shotId,
      payload,
      createdAt: now,
      updatedAt: now,
    };

    this.upsertTask(task);
    this.emitUpdate(task, '任务已入队');
    this.enqueue(taskId);

    return task;
  }

  async getTask(taskId: string): Promise<QueueTaskRecord | null> {
    await this.init();
    return this.getTaskSync(taskId);
  }

  async listTasks(projectId: string, status?: QueueTaskStatus): Promise<QueueTaskRecord[]> {
    await this.init();
    const db = this.getDb();
    const rows = status
      ? (db
          .prepare('SELECT * FROM shot_render_tasks WHERE project_id = ? AND status = ? ORDER BY updated_at DESC')
          .all(projectId, status) as TaskRow[])
      : (db
          .prepare('SELECT * FROM shot_render_tasks WHERE project_id = ? ORDER BY updated_at DESC')
          .all(projectId) as TaskRow[]);

    return rows.map((row) => this.rowToTask(row));
  }

  async cancelTask(taskId: string): Promise<QueueTaskRecord | null> {
    await this.init();
    const current = this.getTaskSync(taskId);
    if (!current) return null;
    if (current.status === 'completed' || current.status === 'failed') return current;

    this.cancelledTasks.add(taskId);
    try {
      this.getQueue().remove?.(taskId);
    } catch (error) {
      logger.warn('[shotRenderTaskQueue] queue remove failed:', error);
    }

    return this.updateTask(
      taskId,
      {
        status: 'failed',
        error: '任务已取消',
        completedAt: Date.now(),
      },
      '任务已取消'
    );
  }

  async retryTask(taskId: string): Promise<QueueTaskRecord | null> {
    await this.init();
    const current = this.getTaskSync(taskId);
    if (!current || current.status !== 'failed') return null;

    this.cancelledTasks.delete(taskId);
    const reset = this.updateTask(
      taskId,
      {
        status: 'queued',
        progress: 0,
        attempts: 0,
        phase: undefined,
        error: undefined,
        result: undefined,
        startedAt: undefined,
        completedAt: undefined,
      },
      '任务重试已入队'
    );

    if (reset) {
      this.enqueue(taskId);
    }
    return reset;
  }

  async reportProgress(update: RendererDelegateProgress): Promise<QueueTaskRecord | null> {
    await this.init();
    const current = this.getTaskSync(update.taskId);
    if (!current) return null;
    if (current.status === 'completed' || current.status === 'failed') return current;

    return this.updateTask(update.taskId, {
      status: 'processing',
      progress: clampProgress(update.progress),
      phase: update.phase,
    }, update.message);
  }

  async handleDelegateResult(args: RendererDelegateResult): Promise<{ ok: boolean }> {
    await this.init();
    const ok = rendererDelegate.handleResult(args);
    return { ok };
  }

  private enqueue(taskId: string): void {
    this.getQueue().push({ taskId }, (error?: Error | null) => {
      if (!error) return;
      const current = this.getTaskSync(taskId);
      if (!current || current.status === 'failed' || current.status === 'completed') return;
      this.updateTask(taskId, {
        status: 'failed',
        error: error.message || '任务执行失败',
        completedAt: Date.now(),
      });
    });
  }

  private async processTask(job: QueueJob): Promise<ShotRenderTaskResult> {
    const current = this.getTaskSync(job.taskId);
    if (!current) {
      throw new Error(`任务不存在: ${job.taskId}`);
    }

    if (this.cancelledTasks.has(job.taskId)) {
      this.updateTask(job.taskId, {
        status: 'failed',
        error: '任务已取消',
        completedAt: Date.now(),
      });
      this.cancelledTasks.delete(job.taskId);
      return { output: { cancelled: true } };
    }

    this.updateTask(job.taskId, {
      status: 'processing',
      attempts: current.attempts + 1,
      startedAt: current.startedAt || Date.now(),
      error: undefined,
    }, '开始处理任务');

    try {
      const result = await runShotRenderTask({
        taskId: job.taskId,
        payload: current.payload,
        delegate: rendererDelegate,
        isCancelled: () => this.cancelledTasks.has(job.taskId),
        onProgress: async (progress, phase, message) => {
          this.updateTask(
            job.taskId,
            {
              status: 'processing',
              progress: clampProgress(progress),
              phase,
            },
            message
          );
        },
      });

      this.updateTask(job.taskId, {
        status: 'completed',
        progress: 100,
        result,
        completedAt: Date.now(),
        error: undefined,
      }, '任务完成');

      this.cancelledTasks.delete(job.taskId);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const latest = this.getTaskSync(job.taskId);

      if (!latest) {
        throw error instanceof Error ? error : new Error(message);
      }

      const isCancelled = this.cancelledTasks.has(job.taskId) || message === TASK_CANCELLED_ERROR;
      if (isCancelled) {
        this.updateTask(job.taskId, {
          status: 'failed',
          error: '任务已取消',
          completedAt: Date.now(),
        }, '任务已取消');
        this.cancelledTasks.delete(job.taskId);
        return { output: { cancelled: true } };
      }

      if (latest.attempts < latest.maxRetries) {
        this.updateTask(job.taskId, {
          status: 'queued',
          progress: Math.min(latest.progress, 95),
          error: `阶段执行失败，准备重试 (${latest.attempts}/${latest.maxRetries})`,
        }, '任务失败，准备重试');
      } else {
        this.updateTask(job.taskId, {
          status: 'failed',
          error: message,
          completedAt: Date.now(),
        }, '任务失败');
      }

      throw error instanceof Error ? error : new Error(message);
    }
  }

  private getDb(): Database.Database {
    if (!this.db) {
      throw new Error('Task DB not initialized');
    }
    return this.db;
  }

  private getQueue(): QueueLike {
    if (!this.queue) {
      throw new Error('Task queue not initialized');
    }
    return this.queue;
  }

  private upsertTask(task: QueueTaskRecord): void {
    this.getDb()
      .prepare(`
        INSERT OR REPLACE INTO shot_render_tasks (
          id, type, status, progress, attempts, max_retries, phase, project_id, shot_id,
          payload_json, result_json, error, created_at, updated_at, started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        task.id,
        task.type,
        task.status,
        task.progress,
        task.attempts,
        task.maxRetries,
        task.phase ?? null,
        task.projectId,
        task.shotId,
        JSON.stringify(task.payload),
        task.result === undefined ? null : JSON.stringify(task.result),
        task.error ?? null,
        task.createdAt,
        task.updatedAt,
        task.startedAt ?? null,
        task.completedAt ?? null
      );
  }

  private getTaskSync(taskId: string): QueueTaskRecord | null {
    const row = this.getDb().prepare('SELECT * FROM shot_render_tasks WHERE id = ?').get(taskId) as TaskRow | undefined;
    return row ? this.rowToTask(row) : null;
  }

  private rowToTask(row: TaskRow): QueueTaskRecord {
    const fallbackPayload: ShotRenderTaskPayload = {
      projectId: row.project_id,
      shot: { id: row.shot_id },
    };

    return {
      id: row.id,
      type: 'shot-render',
      status: this.normalizeStatus(row.status),
      progress: row.progress,
      attempts: row.attempts,
      maxRetries: row.max_retries,
      phase: (row.phase || undefined) as QueueTaskRecord['phase'],
      projectId: row.project_id,
      shotId: row.shot_id,
      payload: parseJson<ShotRenderTaskPayload>(row.payload_json, fallbackPayload),
      result: parseJson<ShotRenderTaskResult | undefined>(row.result_json, undefined),
      error: row.error || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined,
    };
  }

  private updateTask(taskId: string, patch: Partial<QueueTaskRecord>, message?: string): QueueTaskRecord | null {
    const current = this.getTaskSync(taskId);
    if (!current) return null;

    const next: QueueTaskRecord = {
      ...current,
      ...patch,
      updatedAt: Date.now(),
    };

    this.upsertTask(next);
    this.emitUpdate(next, message);
    return next;
  }

  private emitUpdate(task: QueueTaskRecord, message?: string): void {
    const event: TaskUpdateEvent = {
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      phase: task.phase,
      attempts: task.attempts,
      maxRetries: task.maxRetries,
      error: task.error,
      message,
      updatedAt: task.updatedAt,
      task,
    };

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('task:update', event);
    }
    appEventBus.emit('task:updated', event);
  }

  private normalizeStatus(status: string): QueueTaskStatus {
    if (status === 'queued' || status === 'processing' || status === 'completed' || status === 'failed') {
      return status;
    }
    return 'failed';
  }
}

export const shotRenderTaskQueue = new ShotRenderTaskQueue();
