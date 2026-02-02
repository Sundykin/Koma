# 统一任务管理架构重构计划

> 综合 Codex（后端）+ Gemini（前端）+ Claude（编排）多模型协作设计
> 状态：待批准

---

## 📋 需求总览

| # | 问题 | 解决方案 |
|---|------|---------|
| 1 | 图片/视频提示词任务状态共享 | 状态拆分 + 独立任务追踪 |
| 2 | 优化功能无效 | ShotPromptService 增加 force 参数 |
| 3 | @角色 ID 格式错误 | normalizeMentionId 去重复前缀 |
| 4 | 任务面板展示不完整 | 扩展 TaskType，引入 category + subType |
| 5 | 软件退出后任务状态未恢复 | 任务恢复策略 + stale 检测 |

---

## 🏗️ 后端架构设计 (Codex)

### 1. TaskRecord 新接口定义

```typescript
// frontend/src/services/TaskManager.ts

export type TaskCategory = 'prompt' | 'media' | 'analysis' | 'asset' | 'script' | 'export';

export type TaskSubType =
  | 'image' | 'video'
  | 'tti' | 'itv' | 'tts'
  | 'character-extraction' | 'shot-analysis' | 'shot-generation'
  | 'script-analysis' | 'asset-generation'
  | 'prompt-generation' | 'prompt-optimization';

export type TaskStatus = 'pending' | 'running' | 'processing' | 'completed' | 'failed';

export interface TaskRecord {
  id: string;
  projectId: string;
  category: TaskCategory;
  subType: TaskSubType;
  status: TaskStatus;
  progress: number;
  targetType: TaskTargetType;
  targetId: string;
  targetName?: string;
  recoverable: boolean;
  lastHeartbeat?: number;
  attempt: number;
  maxRetries: number;
  remoteTaskId?: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: Record<string, unknown>;
  error?: string;
  metadata?: Record<string, unknown>;
}
```

### 2. 任务恢复策略

```typescript
// 启动时调用
async initialize(projectId: string, options?: TaskRecoveryOptions): Promise<void> {
  await this.loadTasks(projectId);
  await this.recoverTasks(projectId, options);
  this.startPolling();
}

async recoverTasks(projectId: string, options: TaskRecoveryOptions): Promise<void> {
  const staleTasks = this.tasks.filter(t =>
    (t.status === 'running' || t.status === 'processing') &&
    (Date.now() - (t.lastHeartbeat || t.updatedAt)) > options.staleTimeoutMs
  );

  for (const task of staleTasks) {
    if (task.recoverable && task.attempt < task.maxRetries) {
      // 转为 pending 重入队
      this.updateTask(task.id, { status: 'pending', attempt: task.attempt + 1 });
    } else {
      // 标记为 failed
      this.updateTask(task.id, { status: 'failed', error: 'Stale task on restart' });
    }
  }
}
```

### 3. ShotPromptService 改造

```typescript
// frontend/src/services/ShotPromptService.ts

export interface PromptGenerationOptions {
  generate?: { image?: boolean; video?: boolean };
  force?: boolean;  // 新增：强制重新生成
  taskContext?: { projectId: string; episodeId: string; shotId: string };
}

async generateDualShotPrompts(
  shot: Shot,
  characters: Character[],
  stylePrefix?: string,
  options?: PromptGenerationOptions
): Promise<{ imagePrompt: string; videoPrompt: string }> {
  const { generate, force, taskContext } = options || {};

  // 修改逻辑：支持 force 强制重新生成
  const needImage = force ? (generate?.image ?? true) : (generate?.image ?? !shot.imagePrompt?.trim());
  const needVideo = force ? (generate?.video ?? true) : (generate?.video ?? !shot.videoPrompt?.trim());

  // 注册任务到 TaskManager
  if (taskContext && needImage) {
    TaskManager.createTask({
      projectId: taskContext.projectId,
      category: 'prompt',
      subType: force ? 'prompt-optimization' : 'prompt-generation',
      targetType: 'shot',
      targetId: taskContext.shotId,
      targetName: `分镜 ${shot.scriptContent?.slice(0, 20)}... (图片)`,
      recoverable: false,
      metadata: { promptType: 'image' }
    });
  }
  // ... 同理 video
}
```

### 4. Mention ID 规范化

```typescript
// frontend/src/editor/mentionTypes.ts

/**
 * 规范化 Mention ID，去除重复前缀
 */
export function normalizeMentionId(type: MentionType, id: string): string {
  const prefix = `${type}_`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

/**
 * 生成 Mention 字符串（使用规范化后的 ID）
 */
export function createMentionString(type: MentionType, id: string): string {
  const normalizedId = normalizeMentionId(type, id);
  return `@${type}_${normalizedId}`;
}
```

---

## 🎨 前端架构设计 (Gemini)

### 1. ShotCard Props 拆分

```typescript
// frontend/src/components/storyboard/ShotCard.tsx

interface ShotCardProps {
  // ... 原有 props

  // 状态拆分
  promptState: {
    isGeneratingImage: boolean;
    isGeneratingVideo: boolean;
  };

  // 回调拆分
  onGenerateImagePrompt: (shotId: string) => void;
  onGenerateVideoPrompt: (shotId: string) => void;
  onOptimizeImagePrompt: (shotId: string, currentPrompt: string) => void;
  onOptimizeVideoPrompt: (shotId: string, currentPrompt: string) => void;
}
```

### 2. Storyboard 状态管理

```typescript
// frontend/src/components/storyboard/Storyboard.tsx

const [generatingImagePromptIds, setGeneratingImagePromptIds] = useState<Set<string>>(new Set());
const [generatingVideoPromptIds, setGeneratingVideoPromptIds] = useState<Set<string>>(new Set());

// 监听 TaskManager
useEffect(() => {
  const unsubscribe = TaskManager.addListener((task) => {
    if (task.projectId !== projectId) return;
    if (task.category === 'prompt') {
      const ids = task.metadata?.promptType === 'image'
        ? generatingImagePromptIds
        : generatingVideoPromptIds;
      const setter = task.metadata?.promptType === 'image'
        ? setGeneratingImagePromptIds
        : setGeneratingVideoPromptIds;

      if (task.status === 'running') {
        setter(prev => new Set(prev).add(task.targetId));
      } else if (task.status === 'completed' || task.status === 'failed') {
        setter(prev => {
          const next = new Set(prev);
          next.delete(task.targetId);
          return next;
        });
      }
    }
  });
  return unsubscribe;
}, [projectId]);
```

### 3. TaskDashboard 组件设计

```
UI 布局：
+---------------------------------------------------------------+
| [Status Bar - 底部固定]                                        |
| (Icon) 3个任务运行中... [Progress] [展开按钮]                  |
+---------------------------------------------------------------+
| [Drawer - 可展开]                                              |
|  Tabs: 全部 | 运行中 | 已完成 | 异常                          |
|  Filter: [任务类型下拉]                                        |
|  +----------------------------------------------------------+  |
|  | [Icon] 分镜 #3 图片提示词生成                            |  |
|  | Status: Running (45%) | 00:12                            |  |
|  | [Progress Bar]                                           |  |
|  | [Cancel]                                                 |  |
|  +----------------------------------------------------------+  |
|  | [Icon] 分镜 #5 视频渲染                                  |  |
|  | Status: Failed | Error: VRAM Insufficient               |  |
|  | [Retry] [View Log]                                       |  |
|  +----------------------------------------------------------+  |
+---------------------------------------------------------------+
```

---

## 📝 实施步骤

### Phase 1: 后端基础设施 (P0)

| 步骤 | 文件 | 改动 |
|------|------|------|
| 1.1 | `TaskManager.ts` | 新增 TaskRecord 接口，添加 category/subType 字段 |
| 1.2 | `TaskManager.ts` | 实现 recoverTasks 任务恢复策略 |
| 1.3 | `TaskManager.ts` | 添加 recordHeartbeat 方法 |
| 1.4 | `taskQueueStore.ts` | 与 TaskManager 统一持久化格式 |

### Phase 2: 提示词服务改造 (P0)

| 步骤 | 文件 | 改动 |
|------|------|------|
| 2.1 | `ShotPromptService.ts` | 添加 force 参数支持强制重新生成 |
| 2.2 | `ShotPromptService.ts` | 分离 image/video 任务注册 |
| 2.3 | `mentionTypes.ts` | 实现 normalizeMentionId 函数 |
| 2.4 | `Storyboard.tsx` | 修复 actualMentionItems 中的 ID 传递 |

### Phase 3: 前端状态分离 (P1)

| 步骤 | 文件 | 改动 |
|------|------|------|
| 3.1 | `ShotCard.tsx` | Props 拆分为 promptState + 分离回调 |
| 3.2 | `ShotListEditor.tsx` | 适配新的 Props 结构 |
| 3.3 | `Storyboard.tsx` | 引入 generatingImagePromptIds/generatingVideoPromptIds |

### Phase 4: 任务面板升级 (P1)

| 步骤 | 文件 | 改动 |
|------|------|------|
| 4.1 | `TaskStatusBar.tsx` → `TaskDashboard.tsx` | 重构为 Drawer + StatusBar 组合 |
| 4.2 | `TaskDashboard.tsx` | 支持按 category 分组、筛选 |
| 4.3 | `TaskDashboard.tsx` | 添加重试/取消操作 |
| 4.4 | `TaskDashboard.tsx` | 任务恢复 UI 反馈 |

### Phase 5: 数据迁移与兼容 (P2)

| 步骤 | 文件 | 改动 |
|------|------|------|
| 5.1 | `TaskManager.ts` | 实现 migrate 方法，兼容旧 tasks.json |
| 5.2 | `mentionTypes.ts` | parseMentionId 兼容双前缀格式 |

---

## ⚠️ 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| 任务恢复重复执行 | 对含 remoteTaskId 的任务先回查远程状态 |
| 旧数据兼容 | migrate 方法自动转换，保留 tasks.json.bak |
| UI 渲染性能 | 使用 Set 管理状态，避免频繁重渲染 |
| 双前缀 ID 历史数据 | parseMentionId 支持容错解析 |

---

## ✅ 验收标准

1. [ ] 图片/视频提示词生成按钮独立 loading 状态
2. [ ] 点击"优化"按钮实际调用 LLM 重新生成
3. [ ] @角色选择后插入 `@char_xxx` 格式（无重复前缀）
4. [ ] 任务面板展示所有任务类型（prompt/media/analysis）
5. [ ] 软件重启后，stale 任务标记为 failed 或重入队
6. [ ] 任务面板支持重试/取消操作
