# 实施计划：分镜渲染工作流队列化重构 (v2 - Electron 原生)

## 任务类型
- [x] 后端 (→ Codex)
- [x] 前端 (→ Gemini)
- [x] 全栈 (→ 并行)

## 技术方案

### 核心架构决策

**采用 Electron 原生队列方案（无需 Redis）**：
- **阶段 1（本次实施）**：主进程实现内存队列 + Worker Threads，任务调度和状态管理在主进程，TTS/ITV 执行通过 IPC 委托给渲染进程
- **阶段 2（后续优化）**：逐步将 Provider 执行迁移到主进程，实现完全后端化

**技术选型**：
- **队列系统**：`better-queue` (轻量级、零依赖、支持持久化)
- **并发控制**：`p-queue` (Promise 队列，支持并发限制)
- **持久化**：SQLite (通过 `better-sqlite3`，Electron 友好)
- **Worker**：Node.js Worker Threads (主进程内并发)

**理由**：
- 避免 Redis 运维复杂度，适合桌面应用
- 所有依赖都是 Electron 友好的纯 Node.js 库
- 支持任务持久化，应用重启后可恢复
- 性能足够（桌面应用通常不需要 Redis 级别的吞吐量）

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
      └─> Main Process: TaskQueue (better-queue)
          └─> Worker Pool (p-queue, concurrency=3)
              ├─> prepareShotRenderStage
              │   └─> IPC delegate → Renderer (TTS Provider)
              ├─> executeShotRenderStage
              │   └─> IPC delegate → Renderer (ITV Provider)
              └─> persistShotRenderStage
                  └─> 保存到 SQLite

Frontend Component
  └─> IPC: task:subscribe (实时状态更新)
```

## 实施步骤

### Step 1: 环境准备与依赖安装
**预期产物**：队列库 + 持久化依赖

1.1 在 `electron/package.json` 添加依赖：
```json
{
  "dependencies": {
    "better-queue": "^3.8.12",
    "better-queue-sqlite": "^1.0.3",
    "p-queue": "^8.0.1",
    "better-sqlite3": "^9.2.2"
  }
}
```

1.2 技术栈说明：
- **better-queue**：轻量级任务队列，支持优先级、重试、持久化
- **better-queue-sqlite**：SQLite 持久化存储适配器
- **p-queue**：Promise 队列，控制并发执行
- **better-sqlite3**：同步 SQLite 库，Electron 友好

### Step 2: 创建任务队列基础设施
**预期产物**：Queue、Worker Pool、Storage 模块

2.1 创建任务数据类型：`electron/src/queue/types.ts`
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

export interface TaskRecord {
  id: string;
  status: TaskStatus;
  progress: number;
  data: ShotRenderJobData;
  result?: any;
  error?: string;
  attempt: number;
  maxRetries: number;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
}
```

2.2 创建队列管理器：`electron/src/queue/taskQueue.ts`
```typescript
import Queue from 'better-queue';
import SqliteStore from 'better-queue-sqlite';
import path from 'path';
import { app } from 'electron';
import { ShotRenderJobData, TaskRecord, TaskStatus } from './types';
import { processShotRenderJob } from './workers/shotRenderHandler';

export class TaskQueue {
  private queue: Queue;
  private tasks: Map<string, TaskRecord> = new Map();
  private listeners: Set<(taskId: string, data: any) => void> = new Set();

  constructor() {
    const dbPath = path.join(app.getPath('userData'), 'task-queue.db');

    this.queue = new Queue(
      async (job: ShotRenderJobData, cb) => {
        try {
          const result = await this.processJob(job);
          cb(null, result);
        } catch (error: any) {
          cb(error);
        }
      },
      {
        store: new SqliteStore({ path: dbPath }),
        concurrent: 3, // 并发数
        maxRetries: 3,
        retryDelay: 2000,
        afterProcessDelay: 500,
        id: 'taskId',
      }
    );

    this.setupQueueEvents();
  }

  private setupQueueEvents() {
    this.queue.on('task_queued', (taskId: string, job: ShotRenderJobData) => {
      this.updateTaskStatus(taskId, 'queued', 0);
    });

    this.queue.on('task_started', (taskId: string) => {
      this.updateTaskStatus(taskId, 'processing', 0);
    });

    this.queue.on('task_finish', (taskId: string, result: any) => {
      this.updateTaskStatus(taskId, 'completed', 100, undefined, result);
    });

    this.queue.on('task_failed', (taskId: string, error: Error) => {
      this.updateTaskStatus(taskId, 'failed', 0, error.message);
    });
  }

  async submitJob(job: ShotRenderJobData): Promise<string> {
    const taskRecord: TaskRecord = {
      id: job.taskId,
      status: 'queued',
      progress: 0,
      data: job,
      attempt: 0,
      maxRetries: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.tasks.set(job.taskId, taskRecord);

    return new Promise((resolve, reject) => {
      this.queue.push(job, (err) => {
        if (err) reject(err);
        else resolve(job.taskId);
      });
    });
  }

  async getTask(taskId: string): Promise<TaskRecord | null> {
    return this.tasks.get(taskId) || null;
  }

  async cancelTask(taskId: string): Promise<boolean> {
    // better-queue 不直接支持取消，标记为 failed
    const task = this.tasks.get(taskId);
    if (!task) return false;

    this.updateTaskStatus(taskId, 'failed', task.progress, '用户取消');
    return true;
  }

  private async processJob(job: ShotRenderJobData): Promise<any> {
    const task = this.tasks.get(job.taskId);
    if (!task) throw new Error('Task not found');

    task.startedAt = Date.now();
    task.attempt++;

    const onProgress = (progress: number, stage?: string) => {
      this.updateTaskProgress(job.taskId, progress, stage);
    };

    return await processShotRenderJob(job, onProgress);
  }

  private updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    progress: number,
    error?: string,
    result?: any
  ) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = status;
    task.progress = progress;
    task.updatedAt = Date.now();

    if (error) task.error = error;
    if (result) task.result = result;
    if (status === 'completed' || status === 'failed') {
      task.completedAt = Date.now();
    }

    this.notifyListeners(taskId, {
      taskId,
      status,
      progress,
      stage: undefined,
      error,
      result,
    });
  }

  private updateTaskProgress(taskId: string, progress: number, stage?: string) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.progress = progress;
    task.updatedAt = Date.now();

    this.notifyListeners(taskId, {
      taskId,
      status: task.status,
      progress,
      stage,
    });
  }

  addListener(callback: (taskId: string, data: any) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(taskId: string, data: any) {
    this.listeners.forEach((callback) => {
      try {
        callback(taskId, data);
      } catch (err) {
        console.error('Task listener error:', err);
      }
    });
  }

  async destroy() {
    return new Promise<void>((resolve) => {
      this.queue.destroy(() => resolve());
    });
  }
}

export const taskQueue = new TaskQueue();
```

### Step 3: 实现 Worker 处理器
**预期产物**：任务处理逻辑 + 渲染进程委托

3.1 创建任务处理器：`electron/src/queue/workers/shotRenderHandler.ts`
```typescript
import { ShotRenderJobData } from '../types';
import { delegateToRenderer } from './rendererDelegate';

export async function processShotRenderJob(
  job: ShotRenderJobData,
  onProgress: (progress: number, stage?: string) => void
): Promise<any> {
  const { projectId, shot, projectConfigIds, theme, stylePrompt } = job;

  try {
    // Stage 1: Prepare (TTS)
    onProgress(0, '准备生成语音...');
    let audioResult = null;
    if (shot.dialogue) {
      audioResult = await delegateToRenderer('tts:synthesize', {
        projectId,
        shotId: shot.id,
        dialogue: shot.dialogue,
        configId: projectConfigIds?.ttsConfigId,
      });
    }
    onProgress(30, '语音生成完成');

    // Stage 2: Execute (ITV)
    onProgress(30, '生成视频...');
    const videoResult = await delegateToRenderer('itv:generate', {
      projectId,
      shotId: shot.id,
      shot,
      theme,
      stylePrompt,
      configId: projectConfigIds?.itvConfigId,
    });
    onProgress(90, '视频生成完成');

    // Stage 3: Persist
    onProgress(90, '保存版本...');
    const version = await delegateToRenderer('shot:saveVersion', {
      projectId,
      shotId: shot.id,
      audioPath: audioResult?.path,
      videoPath: videoResult?.url,
      remoteVideoUrl: videoResult?.url,
      prompt: videoResult?.prompt,
      seed: shot.seed || Math.floor(Math.random() * 1000000),
      model: videoResult?.model,
    });

    onProgress(100, '完成');
    return { success: true, version };
  } catch (error: any) {
    throw new Error(`Shot render failed: ${error.message}`);
  }
}
```

3.2 创建渲染进程委托机制：`electron/src/queue/workers/rendererDelegate.ts`
```typescript
import { BrowserWindow, ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
}

const pendingRequests = new Map<string, PendingRequest>();

export function setupRendererDelegate() {
  ipcMain.on('delegate:response', (event, { requestId, error, result }) => {
    const pending = pendingRequests.get(requestId);
    if (!pending) return;

    clearTimeout(pending.timeoutId);
    pendingRequests.delete(requestId);

    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  });
}

export async function delegateToRenderer(
  channel: string,
  payload: any
): Promise<any> {
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (!mainWindow) {
    throw new Error('No renderer window available');
  }

  const requestId = uuidv4();

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`Renderer delegate timeout: ${channel}`));
    }, 300000); // 5 minutes

    pendingRequests.set(requestId, { resolve, reject, timeoutId });

    mainWindow.webContents.send('delegate:request', {
      requestId,
      channel,
      payload,
    });
  });
}
```

### Step 4: 实现 IPC API
**预期产物**：任务提交、查询、取消、订阅接口

4.1 注册 IPC 处理器：`electron/src/ipc/taskHandlers.ts`
```typescript
import { ipcMain, BrowserWindow } from 'electron';
import { taskQueue } from '../queue/taskQueue';

export function registerTaskHandlers() {
  // 提交任务
  ipcMain.handle('task:submitShotRender', async (event, params) => {
    return await taskQueue.submitJob(params);
  });

  // 查询任务
  ipcMain.handle('task:get', async (event, taskId: string) => {
    return await taskQueue.getTask(taskId);
  });

  // 取消任务
  ipcMain.handle('task:cancel', async (event, taskId: string) => {
    return await taskQueue.cancelTask(taskId);
  });

  // 任务状态变更监听
  taskQueue.addListener((taskId, data) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('task:update', data);
    });
  });
}
```

### Step 5: 前端适配层
**预期产物**：前端 API 调用方式调整 + 委托处理器

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
    electronService.ipc.on('task:update', (event, data) => {
      this.notifyListeners(data.taskId, data);
    });
  }

  private notifyListeners(taskId: string, data: any) {
    this.listeners.get(taskId)?.forEach((callback) => callback(data));
  }
}

export const taskQueueService = new TaskQueueService();
```

5.2 创建委托处理器：`frontend/src/services/delegateHandler.ts`
```typescript
import { electronService } from './electronService';
import { getProjectTTSProvider, getProjectITVProvider } from '../providers';
import { saveShotVersion } from '../store/projectStore';
import { getSelectedImageUrl } from '../workflow/shotRenderWorkflow';

export function setupDelegateHandler() {
  electronService.ipc.on('delegate:request', async (event, { requestId, channel, payload }) => {
    try {
      let result;

      switch (channel) {
        case 'tts:synthesize':
          result = await handleTTSSynthesize(payload);
          break;
        case 'itv:generate':
          result = await handleITVGenerate(payload);
          break;
        case 'shot:saveVersion':
          result = await handleSaveVersion(payload);
          break;
        default:
          throw new Error(`Unknown delegate channel: ${channel}`);
      }

      electronService.ipc.send('delegate:response', { requestId, result });
    } catch (error: any) {
      electronService.ipc.send('delegate:response', { requestId, error: error.message });
    }
  });
}

async function handleTTSSynthesize(payload: any) {
  const { dialogue, configId } = payload;
  const ttsProvider = await getProjectTTSProvider(configId);
  if (!ttsProvider) return null;

  const voices = await ttsProvider.listVoices();
  const voiceId = voices[0]?.id;
  if (!voiceId) return null;

  const result = await ttsProvider.synthesize(dialogue, voiceId, {
    rate: 1.0,
    pitch: 1.0,
  });

  return result;
}

async function handleITVGenerate(payload: any) {
  const { shot, theme, stylePrompt, configId } = payload;
  const itvProvider = await getProjectITVProvider(configId);
  if (!itvProvider) throw new Error('未配置 ITV 服务');

  const imageUrl = getSelectedImageUrl(shot);
  const prompt = buildVideoPrompt(shot, theme, stylePrompt);

  const result = await itvProvider.generateVideo({
    imageUrl: imageUrl || '',
    prompt,
    options: { duration: shot.duration, motionPrompt: shot.cameraMovement },
  });

  return {
    url: result.url || (result as any).path,
    prompt,
    model: itvProvider.config?.provider || 'unknown',
  };
}

async function handleSaveVersion(payload: any) {
  const { projectId, shotId, ...versionData } = payload;
  return await saveShotVersion(projectId, shotId, versionData);
}

function buildVideoPrompt(shot: any, theme?: string, stylePrompt?: string): string {
  // 复用现有逻辑
  return shot.videoPrompt || shot.description || '';
}
```

5.3 修改 shotRenderWorkflow 调用方式：`frontend/src/workflow/shotRenderWorkflow.ts`
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

### Step 6: 应用初始化
**预期产物**：主进程和渲染进程初始化

6.1 主进程初始化：`electron/src/main.ts`
```typescript
import { registerTaskHandlers } from './ipc/taskHandlers';
import { setupRendererDelegate } from './queue/workers/rendererDelegate';

app.on('ready', async () => {
  // ... 其他初始化代码
  
  // 注册任务处理器
  registerTaskHandlers();
  
  // 设置渲染进程委托
  setupRendererDelegate();
});
```

6.2 渲染进程初始化：`frontend/src/App.tsx`
```typescript
import { taskQueueService } from './services/taskQueueService';
import { setupDelegateHandler } from './services/delegateHandler';

useEffect(() => {
  // 初始化任务队列服务
  taskQueueService.initialize();
  
  // 设置委托处理器
  setupDelegateHandler();
}, []);
```

### Step 7: 测试策略
**预期产物**：单元测试 + 集成测试

7.1 任务队列单元测试：`electron/src/queue/__tests__/taskQueue.test.ts`
- 测试任务提交
- 测试任务状态查询
- 测试任务取消
- 测试并发控制

7.2 工作流回归测试：`frontend/src/workflow/__tests__/shotRenderWorkflow.test.ts`
- 保持现有测试用例
- 验证 TTS + ITV 结果一致性

## 关键文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `electron/package.json` | 修改 | 添加 better-queue、p-queue、better-sqlite3 依赖 |
| `electron/src/queue/types.ts` | 新建 | 任务数据类型 |
| `electron/src/queue/taskQueue.ts` | 新建 | 队列管理器 |
| `electron/src/queue/workers/shotRenderHandler.ts` | 新建 | 任务处理逻辑 |
| `electron/src/queue/workers/rendererDelegate.ts` | 新建 | 渲染进程委托 |
| `electron/src/ipc/taskHandlers.ts` | 新建 | IPC 处理器 |
| `frontend/src/services/taskQueueService.ts` | 新建 | 前端任务 API |
| `frontend/src/services/delegateHandler.ts` | 新建 | 委托处理器 |
| `frontend/src/workflow/shotRenderWorkflow.ts` | 修改 | 添加异步提交接口 |

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 队列持久化性能 | better-queue-sqlite 使用 WAL 模式，性能足够 |
| 渲染进程委托超时 | 5 分钟超时 + 请求 ID 追踪 |
| 任务状态不一致 | 使用内存 Map + SQLite 双重存储 |
| 应用重启后任务丢失 | better-queue 自动从 SQLite 恢复 |
| 并发控制失效 | better-queue 内置并发控制 |

## SESSION_ID（供 /ccg:execute 使用）

- **CODEX_SESSION**: `019ca8af-2b04-7163-b26a-12fbb9304800`
- **GEMINI_SESSION**: `14fd8fd9-d360-42a8-ada2-c1de5ef33241`

## 验收标准检查清单

- [ ] 分镜渲染任务可以异步提交到队列
- [ ] Worker 可以并发处理多个任务（配置并发数为 3）
- [ ] 任务状态可以实时查询（queued/processing/completed/failed）
- [ ] 任务失败时自动重试（最多 3 次，指数退避）
- [ ] 保持原有功能完整性（TTS + ITV 生成）
- [ ] 应用重启后可以恢复未完成的任务
- [ ] 前端 UI 可以实时显示任务进度
- [ ] 用户可以取消正在执行的任务

## 后续优化方向

1. **Provider 后端化**：将 TTS/ITV Provider 逐步迁移到主进程执行
2. **多队列支持**：拆分为 image/video/voice/text 四个队列
3. **任务优先级**：支持高优先级任务插队
4. **批量操作优化**：实现真正的并发批量渲染
5. **任务历史记录**：持久化任务历史，支持查询和统计
6. **监控面板**：添加队列监控面板，查看任务统计
