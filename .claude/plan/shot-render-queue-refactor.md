# 实施计划：分镜渲染工作流队列化重构

## 任务类型
- [x] 后端 (→ Codex)
- [x] 前端 (→ Gemini)
- [x] 全栈 (→ 并行)

## 技术方案

### 核心架构决策

**采用混合迁移方案（分阶段实施）**：
- **阶段 1（本次实施）**：主进程引入 BullMQ + Redis 队列系统，Worker 负责任务调度和状态管理，具体 TTS/ITV 执行通过 IPC 委托给渲染进程
- **阶段 2（后续优化）**：逐步将 Provider 执行迁移到主进程，实现完全后端化

**理由**：
- Codex 分析指出：一步到位全后端化与"保持 Provider 接口不变 + 不改 UI 组件"存在冲突
- Gemini 分析强调：需要保持 UI 组件不变，通过全局状态管理和通知系统提升 UX
- 混合方案可以快速满足验收标准，同时为后续演进预留路径

### 架构对比

**当前架构（同步）**：
```
Frontend Component
  └─> shotRenderWorkflow (同步执行)
      ├─> prepareShotRenderStage (TTS)
      ├─> executeShotRenderStage (ITV)
      └─> persistShotRenderStage (保存)
```

**目标架构（异步队列）**：
```
Frontend Component
  └─> IPC: task:submitShotRender
      └─> Main Process: BullMQ Queue
          └─> Worker Process
              ├─> prepareShotRenderStage
              │   └─> IPC delegate → Renderer (TTS Provider)
              ├─> executeShotRenderStage
              │   └─> IPC delegate → Renderer (ITV Provider)
              └─> persistShotRenderStage
                  └─> 保存到数据库

Frontend Component
  └─> IPC: task:subscribe (实时状态更新)
```

## 实施步骤

### Step 1: 环境准备与依赖安装
**预期产物**：Redis 运行环境 + BullMQ 依赖

1.1 在 `electron/package.json` 添加依赖：
```json
{
  "dependencies": {
    "bullmq": "^5.0.0",
    "ioredis": "^5.3.2"
  }
}
```

1.2 确定 Redis 部署策略：
- **开发环境**：使用本地 Redis 实例（`redis://localhost:6379`）
- **生产环境**：内置 Redis sidecar 或外部 Redis 服务
- 配置文件：`electron/src/config/redis.ts`

### Step 2: 创建任务队列基础设施
**预期产物**：Queue、Worker、RedisClient 模块

2.1 创建 Redis 连接管理器：`electron/src/queue/redis.ts`
```typescript
import Redis from 'ioredis';

export const queueRedis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
});
```

2.2 创建队列定义：`electron/src/queue/queues.ts`
```typescript
import { Queue, JobsOptions } from 'bullmq';
import { queueRedis } from './redis';

export const QUEUE_NAME = {
  SHOT_RENDER: 'koma-shot-render',
} as const;

const defaultJobOptions: JobsOptions = {
  removeOnComplete: 500,
  removeOnFail: 500,
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
};

export const shotRenderQueue = new Queue(QUEUE_NAME.SHOT_RENDER, {
  connection: queueRedis,
  defaultJobOptions,
});
```

2.3 创建任务数据类型：`electron/src/queue/types.ts`
```typescript
export type TaskStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface ShotRenderJobData {
  taskId: string;
  projectId: string;
  shotId: string;
  shot: Shot;
  projectConfigIds?: {
    ttiConfigId?: string;
    itvConfigId?: string;
    ttsConfigId?: string;
  };
  theme?: string;
  stylePrompt?: string;
}

export interface TaskProgressPayload {
  taskId: string;
  status: TaskStatus;
  progress: number;
  stage?: string;
  error?: string;
  result?: any;
}
```

### Step 3: 实现 Worker 处理器
**预期产物**：Worker 进程 + 任务处理逻辑

3.1 创建 Worker 入口：`electron/src/queue/workers/shotRender.worker.ts`
```typescript
import { Worker, Job } from 'bullmq';
import { queueRedis } from '../redis';
import { QUEUE_NAME } from '../queues';
import { ShotRenderJobData } from '../types';
import { processShotRenderJob } from './handlers/shotRenderHandler';

export function createShotRenderWorker() {
  return new Worker<ShotRenderJobData>(
    QUEUE_NAME.SHOT_RENDER,
    async (job) => await processShotRenderJob(job),
    {
      connection: queueRedis,
      concurrency: parseInt(process.env.SHOT_RENDER_CONCURRENCY || '3'),
    }
  );
}
```

3.2 创建任务处理器：`electron/src/queue/workers/handlers/shotRenderHandler.ts`
```typescript
import { Job } from 'bullmq';
import { ShotRenderJobData } from '../../types';
import { reportTaskProgress } from '../shared';

export async function processShotRenderJob(job: Job<ShotRenderJobData>) {
  const { taskId, projectId, shot, projectConfigIds, theme, stylePrompt } = job.data;

  try {
    // Stage 1: Prepare (TTS)
    await reportTaskProgress(job, 0, 'preparing', '准备生成语音...');
    const audioResult = await delegateToRenderer('tts:synthesize', {
      projectId,
      shotId: shot.id,
      dialogue: shot.dialogue,
      configId: projectConfigIds?.ttsConfigId,
    });

    // Stage 2: Execute (ITV)
    await reportTaskProgress(job, 30, 'processing', '生成视频...');
    const videoResult = await delegateToRenderer('itv:generate', {
      projectId,
      shotId: shot.id,
      imageUrl: getSelectedImageUrl(shot),
      prompt: buildVideoPrompt(shot, theme, stylePrompt),
      configId: projectConfigIds?.itvConfigId,
    });

    // Stage 3: Persist
    await reportTaskProgress(job, 90, 'processing', '保存版本...');
    const version = await saveShotVersion(projectId, shot.id, {
      audioPath: audioResult?.path,
      videoPath: videoResult?.url,
      remoteVideoUrl: videoResult?.url,
      prompt: videoResult?.prompt,
      seed: shot.seed || Math.floor(Math.random() * 1000000),
      model: videoResult?.model,
    });

    await reportTaskProgress(job, 100, 'completed', '完成');
    return { success: true, version };
  } catch (error: any) {
    await reportTaskProgress(job, 0, 'failed', error.message);
    throw error;
  }
}
```

3.3 创建渲染进程委托机制：`electron/src/queue/workers/rendererDelegate.ts`
```typescript
import { BrowserWindow } from 'electron';

export async function delegateToRenderer(
  channel: string,
  payload: any
): Promise<any> {
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (!mainWindow) {
    throw new Error('No renderer window available');
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Renderer delegate timeout: ${channel}`));
    }, 300000); // 5 minutes

    mainWindow.webContents.send(`delegate:${channel}`, payload);

    ipcMain.once(`delegate:${channel}:response`, (event, response) => {
      clearTimeout(timeoutId);
      if (response.error) {
        reject(new Error(response.error));
      } else {
        resolve(response.result);
      }
    });
  });
}
```

### Step 4: 实现 IPC API
**预期产物**：任务提交、查询、取消、订阅接口

4.1 创建任务服务：`electron/src/queue/taskService.ts`
```typescript
import { v4 as uuidv4 } from 'uuid';
import { shotRenderQueue } from './queues';
import { ShotRenderJobData, TaskStatus } from './types';

export class TaskService {
  async submitShotRender(params: Omit<ShotRenderJobData, 'taskId'>): Promise<string> {
    const taskId = uuidv4();
    const jobData: ShotRenderJobData = { ...params, taskId };

    await shotRenderQueue.add('shot-render', jobData, {
      jobId: taskId,
    });

    return taskId;
  }

  async getTask(taskId: string) {
    const job = await shotRenderQueue.getJob(taskId);
    if (!job) return null;

    return {
      id: taskId,
      status: this.mapJobStateToTaskStatus(await job.getState()),
      progress: job.progress || 0,
      data: job.data,
      result: job.returnvalue,
      error: job.failedReason,
    };
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const job = await shotRenderQueue.getJob(taskId);
    if (!job) return false;

    await job.remove();
    return true;
  }

  private mapJobStateToTaskStatus(state: string): TaskStatus {
    const mapping: Record<string, TaskStatus> = {
      'waiting': 'queued',
      'active': 'processing',
      'completed': 'completed',
      'failed': 'failed',
    };
    return mapping[state] || 'queued';
  }
}

export const taskService = new TaskService();
```

4.2 注册 IPC 处理器：`electron/src/ipc/taskHandlers.ts`
```typescript
import { ipcMain } from 'electron';
import { taskService } from '../queue/taskService';

export function registerTaskHandlers() {
  ipcMain.handle('task:submitShotRender', async (event, params) => {
    return await taskService.submitShotRender(params);
  });

  ipcMain.handle('task:get', async (event, taskId: string) => {
    return await taskService.getTask(taskId);
  });

  ipcMain.handle('task:cancel', async (event, taskId: string) => {
    return await taskService.cancelTask(taskId);
  });
}
```

4.3 实现任务事件推送：`electron/src/queue/taskEvents.ts`
```typescript
import { QueueEvents } from 'bullmq';
import { BrowserWindow } from 'electron';
import { queueRedis } from './redis';
import { QUEUE_NAME } from './queues';

export function setupTaskEvents() {
  const queueEvents = new QueueEvents(QUEUE_NAME.SHOT_RENDER, {
    connection: queueRedis,
  });

  queueEvents.on('progress', ({ jobId, data }) => {
    broadcastToRenderers('task:progress', { taskId: jobId, ...data });
  });

  queueEvents.on('completed', ({ jobId, returnvalue }) => {
    broadcastToRenderers('task:completed', { taskId: jobId, result: returnvalue });
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    broadcastToRenderers('task:failed', { taskId: jobId, error: failedReason });
  });
}

function broadcastToRenderers(channel: string, data: any) {
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send(channel, data);
  });
}
```

### Step 5: 前端适配层
**预期产物**：前端 API 调用方式调整 + 全局状态管理

5.1 创建任务 API 封装：`frontend/src/services/taskQueueService.ts`
```typescript
import { electronService } from './electronService';

export class TaskQueueService {
  private listeners = new Map<string, Set<(data: any) => void>>();

  async submitShotRender(params: {
    projectId: string;
    shot: Shot;
    projectConfigIds?: any;
    theme?: string;
    stylePrompt?: string;
  }): Promise<string> {
    return await electronService.ipc.invoke('task:submitShotRender', params);
  }

  async getTask(taskId: string) {
    return await electronService.ipc.invoke('task:get', taskId);
  }

  async cancelTask(taskId: string) {
    return await electronService.ipc.invoke('task:cancel', taskId);
  }

  subscribeToTask(taskId: string, callback: (data: any) => void) {
    if (!this.listeners.has(taskId)) {
      this.listeners.set(taskId, new Set());
    }
    this.listeners.get(taskId)!.add(callback);

    return () => {
      this.listeners.get(taskId)?.delete(callback);
    };
  }

  initialize() {
    electronService.ipc.on('task:progress', (event, data) => {
      this.notifyListeners(data.taskId, data);
    });

    electronService.ipc.on('task:completed', (event, data) => {
      this.notifyListeners(data.taskId, { ...data, status: 'completed' });
    });

    electronService.ipc.on('task:failed', (event, data) => {
      this.notifyListeners(data.taskId, { ...data, status: 'failed' });
    });
  }

  private notifyListeners(taskId: string, data: any) {
    this.listeners.get(taskId)?.forEach(callback => callback(data));
  }
}

export const taskQueueService = new TaskQueueService();
```

5.2 修改 shotRenderWorkflow 调用方式：`frontend/src/workflow/shotRenderWorkflow.ts`
```typescript
// 新增：异步提交接口
export async function submitShotRenderJob(
  params: ShotRenderParams,
  onProgress?: (progress: number, step?: string) => void
): Promise<string> {
  const taskId = await taskQueueService.submitShotRender(params);

  if (onProgress) {
    taskQueueService.subscribeToTask(taskId, (data) => {
      onProgress(data.progress, data.stage);
    });
  }

  return taskId;
}

// 保留：兼容旧接口（内部调用新接口）
export async function shotRenderWorkflow(
  params: ShotRenderParams,
  onProgress: (progress: number, step?: string) => void,
  depsOverride?: Partial<ShotRenderDeps>
): Promise<ShotRenderResult> {
  const taskId = await submitShotRenderJob(params, onProgress);

  return new Promise((resolve) => {
    const unsubscribe = taskQueueService.subscribeToTask(taskId, async (data) => {
      if (data.status === 'completed') {
        unsubscribe();
        resolve({
          shotId: params.shot.id,
          version: data.result.version,
          success: true,
        });
      } else if (data.status === 'failed') {
        unsubscribe();
        resolve({
          shotId: params.shot.id,
          version: {} as ShotVersion,
          success: false,
          error: data.error,
        });
      }
    });
  });
}
```

5.3 添加全局任务状态管理（可选，提升 UX）：`frontend/src/store/globalTaskStore.ts`
```typescript
import { create } from 'zustand';

interface TaskState {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  stage?: string;
  error?: string;
}

interface GlobalTaskStore {
  tasks: Map<string, TaskState>;
  addTask: (taskId: string) => void;
  updateTask: (taskId: string, updates: Partial<TaskState>) => void;
  removeTask: (taskId: string) => void;
}

export const useGlobalTaskStore = create<GlobalTaskStore>((set) => ({
  tasks: new Map(),
  addTask: (taskId) => set((state) => {
    const newTasks = new Map(state.tasks);
    newTasks.set(taskId, { id: taskId, status: 'queued', progress: 0 });
    return { tasks: newTasks };
  }),
  updateTask: (taskId, updates) => set((state) => {
    const newTasks = new Map(state.tasks);
    const existing = newTasks.get(taskId);
    if (existing) {
      newTasks.set(taskId, { ...existing, ...updates });
    }
    return { tasks: newTasks };
  }),
  removeTask: (taskId) => set((state) => {
    const newTasks = new Map(state.tasks);
    newTasks.delete(taskId);
    return { tasks: newTasks };
  }),
}));
```

### Step 6: 任务恢复机制
**预期产物**：应用启动时恢复 stale 任务

6.1 创建恢复服务：`electron/src/queue/recoveryService.ts`
```typescript
import { shotRenderQueue } from './queues';

export class RecoveryService {
  async recoverStaleTasks() {
    const jobs = await shotRenderQueue.getJobs(['active', 'waiting']);

    for (const job of jobs) {
      const state = await job.getState();
      if (state === 'active') {
        // 检查是否超时（5分钟无心跳）
        const lastUpdate = job.processedOn || job.timestamp;
        if (Date.now() - lastUpdate > 5 * 60 * 1000) {
          console.log(`[Recovery] Retrying stale job ${job.id}`);
          await job.retry();
        }
      }
    }
  }
}

export const recoveryService = new RecoveryService();
```

6.2 在应用启动时调用：`electron/src/main.ts`
```typescript
import { recoveryService } from './queue/recoveryService';

app.on('ready', async () => {
  // ... 其他初始化代码
  await recoveryService.recoverStaleTasks();
});
```

### Step 7: 测试策略
**预期产物**：单元测试 + 集成测试

7.1 任务状态机单元测试：`electron/src/queue/__tests__/taskService.test.ts`
- 测试任务提交
- 测试任务状态查询
- 测试任务取消

7.2 队列集成测试：`electron/src/queue/__tests__/shotRenderQueue.test.ts`
- 测试任务重试（模拟失败场景）
- 测试任务恢复（模拟应用重启）
- 测试并发处理

7.3 工作流回归测试：`frontend/src/workflow/__tests__/shotRenderWorkflow.test.ts`
- 保持现有测试用例
- 验证 TTS + ITV 结果一致性

## 关键文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `electron/package.json` | 修改 | 添加 bullmq、ioredis 依赖 |
| `electron/src/queue/redis.ts` | 新建 | Redis 连接管理 |
| `electron/src/queue/queues.ts` | 新建 | 队列定义 |
| `electron/src/queue/types.ts` | 新建 | 任务数据类型 |
| `electron/src/queue/workers/shotRender.worker.ts` | 新建 | Worker 入口 |
| `electron/src/queue/workers/handlers/shotRenderHandler.ts` | 新建 | 任务处理逻辑 |
| `electron/src/queue/workers/rendererDelegate.ts` | 新建 | 渲染进程委托 |
| `electron/src/queue/taskService.ts` | 新建 | 任务服务 |
| `electron/src/queue/taskEvents.ts` | 新建 | 任务事件推送 |
| `electron/src/queue/recoveryService.ts` | 新建 | 任务恢复服务 |
| `electron/src/ipc/taskHandlers.ts` | 新建 | IPC 处理器 |
| `frontend/src/services/taskQueueService.ts` | 新建 | 前端任务 API |
| `frontend/src/workflow/shotRenderWorkflow.ts` | 修改 | 添加异步提交接口 |
| `frontend/src/store/globalTaskStore.ts` | 新建 | 全局任务状态管理 |

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| Redis 运维复杂度 | 开发环境使用本地 Redis，生产环境提供内置 sidecar 选项 |
| 渲染进程委托超时 | 设置合理超时时间（5分钟），添加心跳机制 |
| 任务状态不一致 | 使用 BullMQ 的事务机制，确保状态原子性更新 |
| 应用重启后任务丢失 | 实现恢复机制，启动时检查并重试 stale 任务 |
| 前端 UI 状态丢失 | 使用全局状态管理，应用启动时从后端同步任务状态 |
| Provider 执行位置迁移 | 分阶段实施，先委托后迁移，降低风险 |

## SESSION_ID（供 /ccg:execute 使用）

- **CODEX_SESSION**: `019ca8af-2b04-7163-b26a-12fbb9304800`
- **GEMINI_SESSION**: `14fd8fd9-d360-42a8-ada2-c1de5ef33241`

## 验收标准检查清单

- [ ] 分镜渲染任务可以异步提交到队列
- [ ] Worker 进程可以并发处理多个任务（配置并发数为 3）
- [ ] 任务状态可以实时查询（queued/processing/completed/failed）
- [ ] 任务失败时自动重试（最多 3 次，指数退避）
- [ ] 保持原有功能完整性（TTS + ITV 生成）
- [ ] 应用重启后可以恢复未完成的任务
- [ ] 前端 UI 可以实时显示任务进度
- [ ] 用户可以取消正在执行的任务

## 后续优化方向

1. **Provider 后端化**：将 TTS/ITV Provider 逐步迁移到主进程执行
2. **多队列支持**：参考 waoowaoo，拆分为 image/video/voice/text 四个队列
3. **任务优先级**：支持高优先级任务插队
4. **批量操作优化**：实现真正的并发批量渲染
5. **任务历史记录**：持久化任务历史，支持查询和统计
6. **监控和告警**：添加队列监控面板，异常任务告警
