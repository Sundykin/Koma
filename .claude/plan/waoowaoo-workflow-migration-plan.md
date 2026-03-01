# Waoowaoo 完整工作流迁移计划

## 📋 执行摘要

本计划旨在将 waoowaoo 开源项目的**完整短剧制作流程**迁移到 Koma 项目中，包括：
- **前端界面**：Stage-based UI、Episode 管理、Script/Storyboard/Video 编辑器
- **操作流程**：Story → Script → Storyboard → Voice → Video 完整工作流
- **后端工作流**：Orchestrator 模式、Graph Executor、多阶段 AI 处理
- **任务系统**：任务队列、Worker 系统、进度追踪

## 🎯 迁移目标

### 核心目标
1. **完整复刻 waoowaoo 的前端界面**
   - Stage-based 导航系统（Config → Script → Storyboard → Video → Editor）
   - Episode 管理界面
   - Script 编辑器（Clip 管理、角色/场景关联）
   - Storyboard 编辑器（Panel 编辑、图片生成、摄影规则）
   - Video 生成界面（Timeline、批量生成、First-Last Frame）
   - Asset Library（角色库、场景库）

2. **完整复刻 waoowaoo 的操作流程**
   - Story → Script 转换流程
   - Script → Storyboard 转换流程
   - Storyboard → Video 生成流程
   - 角色/场景 AI 生成流程

3. **完整复刻 waoowaoo 的后端工作流**
   - Orchestrator 模式（多阶段 AI 处理）
   - Graph Executor（节点执行引擎）
   - Stage Pipeline（工作流定义）
   - Worker 系统（任务处理）

4. **适配 Koma 架构**
   - 保留 better-queue + SQLite（替代 BullMQ + Redis）
   - 保留 Electron 架构（Main ↔ Renderer IPC）
   - 保留 better-sqlite3（替代 Prisma ORM）

### 非目标
- ❌ 不迁移 Next.js 服务端渲染（Koma 使用 Electron + React）
- ❌ 不迁移 BullMQ + Redis（使用 better-queue + SQLite 替代）
- ❌ 不迁移 Prisma ORM（使用 better-sqlite3）
- ❌ 不迁移 i18n 国际化（Koma 暂时只支持中文）

---

## 🏗️ 架构对比分析

### Waoowaoo 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Web Application (Next.js)                 │
├─────────────────────────────────────────────────────────────┤
│  Stage Pipeline (stage-pipeline.ts)                         │
│  ├─ STORY_TO_SCRIPT_RUN                                     │
│  ├─ SCRIPT_TO_STORYBOARD_RUN                                │
│  ├─ AI_CREATE_CHARACTER                                     │
│  └─ AI_CREATE_LOCATION                                      │
├─────────────────────────────────────────────────────────────┤
│  Orchestrators (多阶段 AI 处理)                              │
│  ├─ story-to-script/orchestrator.ts                         │
│  │   ├─ Phase 1: 角色/场景分析（并行）                       │
│  │   ├─ Phase 2: 片段切分（重试机制）                        │
│  │   └─ Phase 3: 剧本转换（并行）                           │
│  └─ script-to-storyboard/orchestrator.ts                    │
│      ├─ Phase 1: 分镜规划                                   │
│      ├─ Phase 2: 摄影规则 + 表演指导（并行）                 │
│      └─ Phase 3: 细节优化                                   │
├─────────────────────────────────────────────────────────────┤
│  Graph Executor (graph-executor.ts)                         │
│  ├─ 节点执行引擎                                            │
│  ├─ 重试机制（maxAttempts, timeout）                        │
│  └─ Checkpoint 状态管理                                     │
├─────────────────────────────────────────────────────────────┤
│  Workers (BullMQ)                                           │
│  ├─ text.worker.ts (Story → Script)                        │
│  ├─ video.worker.ts (Storyboard → Video)                   │
│  └─ voice.worker.ts (Script → Voice)                       │
├─────────────────────────────────────────────────────────────┤
│  Queue System: BullMQ + Redis                               │
└─────────────────────────────────────────────────────────────┘
```

### Koma 现有架构

```
┌─────────────────────────────────────────────────────────────┐
│              Electron App (Main + Renderer)                  │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React)                                           │
│  ├─ shotRenderWorkflow.ts (单阶段工作流)                     │
│  ├─ taskQueueService.ts (IPC 客户端)                        │
│  └─ TaskManager.ts (UI 状态管理)                            │
├─────────────────────────────────────────────────────────────┤
│  IPC Bridge                                                 │
│  ├─ task:submit                                            │
│  ├─ task:update                                            │
│  └─ task:cancel                                            │
├─────────────────────────────────────────────────────────────┤
│  Electron Main Process                                      │
│  ├─ taskQueue.ts (ShotRenderTaskQueue)                     │
│  ├─ shotRenderHandler.ts (3-stage handler)                 │
│  │   ├─ prepareShotRenderStage                             │
│  │   ├─ executeShotRenderStage                             │
│  │   └─ persistShotRenderStage                             │
│  └─ rendererDelegate.ts (Main → Renderer 委托)             │
├─────────────────────────────────────────────────────────────┤
│  Queue System: better-queue + SQLite                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 迁移策略

### 策略 1: 增强现有 shotRenderWorkflow（推荐）

**优势**：
- ✅ 保留 Koma 现有基础设施
- ✅ 渐进式迁移，风险可控
- ✅ 复用 better-queue + SQLite

**实施步骤**：
1. 将 waoowaoo 的 Orchestrator 模式移植到 Koma
2. 扩展 `shotRenderHandler.ts`，支持多阶段编排
3. 实现 Graph Executor 的简化版本
4. 添加 Stage Pipeline 定义

### 策略 2: 完全重写（不推荐）

**劣势**：
- ❌ 破坏现有功能
- ❌ 迁移成本高
- ❌ 风险大

---

## 📦 迁移组件清单

### 第一部分：前端界面迁移

#### 1. Stage Navigation 系统

**源文件**: `waoowaoo/src/app/[locale]/workspace/[projectId]/modes/novel-promotion/`

**核心组件**：
- `StageNavigation.tsx` - 阶段导航胶囊按钮
- `WorkspaceStageContent.tsx` - 阶段内容路由
- `useWorkspaceStageNavigation.ts` - 阶段状态管理

**迁移目标**: `Koma/frontend/src/pages/NovelPromotion/`

**UI 结构**：
```
┌─────────────────────────────────────────────────────────┐
│  [S] Story  [A] Script  [B] Storyboard  [V] Video  [E] │  ← Stage Navigation
├─────────────────────────────────────────────────────────┤
│  Episode Selector: Episode 1 ▼                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  <Stage Content Area>                                   │
│  - ConfigStage (Story Input)                            │
│  - ScriptStage (Clip Editor)                            │
│  - StoryboardStage (Panel Editor)                       │
│  - VideoStage (Video Generation)                        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

#### 2. Config Stage（Story Input）

**源文件**: `waoowaoo/.../components/ConfigStage.tsx`

**核心功能**：
- 小说文本输入（Textarea）
- 主题风格选择（Theme Selector）
- 视频比例选择（16:9, 9:16）
- "生成剧本" 按钮（触发 Story → Script）

**迁移目标**: `Koma/frontend/src/pages/NovelPromotion/ConfigStage.tsx`

#### 3. Script Stage（Clip Editor）

**源文件**: `waoowaoo/.../components/ScriptStage.tsx` + `ScriptView.tsx`

**核心功能**：
- Clip 列表展示（左侧面板）
  - Clip 卡片（summary, characters, location）
  - Clip 编辑（内容、角色、场景）
- 角色/场景资产面板（右侧面板）
  - 角色卡片（头像、名称、描述）
  - 场景卡片（图片、名称、描述）
  - AI 生成角色/场景按钮
- "生成分镜" 按钮（触发 Script → Storyboard）

**迁移目标**: `Koma/frontend/src/pages/NovelPromotion/ScriptStage/`

**UI 结构**：
```
┌──────────────────┬──────────────────────────────────────┐
│  Clip List       │  Assets Panel                        │
│  ┌────────────┐  │  ┌─────────────────────────────────┐ │
│  │ Clip 1     │  │  │ Characters                      │ │
│  │ Summary... │  │  │ ┌────┐ ┌────┐ ┌────┐           │ │
│  │ 角色: A,B  │  │  │ │ A  │ │ B  │ │ C  │ [+ AI]   │ │
│  │ 场景: 教室  │  │  │ └────┘ └────┘ └────┘           │ │
│  └────────────┘  │  │                                 │ │
│  ┌────────────┐  │  │ Locations                       │ │
│  │ Clip 2     │  │  │ ┌────┐ ┌────┐                  │ │
│  │ ...        │  │  │ │教室 │ │操场 │ [+ AI]         │ │
│  └────────────┘  │  │ └────┘ └────┘                  │ │
│                  │  └─────────────────────────────────┘ │
│  [生成分镜]      │                                      │
└──────────────────┴──────────────────────────────────────┘
```

#### 4. Storyboard Stage（Panel Editor）

**源文件**: `waoowaoo/.../components/StoryboardStage.tsx` + `storyboard/`

**核心功能**：
- Storyboard Group 列表（按 Clip 分组）
- Panel 卡片展示
  - Panel 图片（候选图片切换）
  - Panel 描述（description, location, characters）
  - 摄影规则（composition, lighting, atmosphere）
  - 表演指导（acting notes）
- Panel 编辑功能
  - 编辑描述
  - 生成图片（TTI）
  - 插入/删除 Panel
  - Panel 变体生成
- "生成视频" 按钮（进入 Video Stage）

**迁移目标**: `Koma/frontend/src/pages/NovelPromotion/StoryboardStage/`

**UI 结构**：
```
┌─────────────────────────────────────────────────────────┐
│  Storyboard Group: Clip 1                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │ Panel 1  │ │ Panel 2  │ │ Panel 3  │               │
│  │ [Image]  │ │ [Image]  │ │ [Image]  │               │
│  │ 描述...  │ │ 描述...  │ │ 描述...  │               │
│  │ 摄影规则 │ │ 摄影规则 │ │ 摄影规则 │               │
│  │ [编辑]   │ │ [编辑]   │ │ [编辑]   │               │
│  └──────────┘ └──────────┘ └──────────┘               │
├─────────────────────────────────────────────────────────┤
│  Storyboard Group: Clip 2                               │
│  ┌──────────┐ ┌──────────┐                             │
│  │ Panel 1  │ │ Panel 2  │                             │
│  │ ...      │ │ ...      │                             │
│  └──────────┘ └──────────┘                             │
└─────────────────────────────────────────────────────────┘
```

#### 5. Video Stage（Video Generation）

**源文件**: `waoowaoo/.../components/VideoStage.tsx` + `video-stage/`

**核心功能**：
- Timeline 面板（视频时间轴）
- Video Panel 卡片
  - Panel 图片预览
  - 视频生成状态（pending, processing, completed）
  - 视频播放器
  - Prompt 编辑
  - First-Last Frame 设置
- 批量生成按钮
- 视频导出功能

**迁移目标**: `Koma/frontend/src/pages/NovelPromotion/VideoStage/`

**UI 结构**：
```
┌─────────────────────────────────────────────────────────┐
│  Timeline                                               │
│  ┌────┬────┬────┬────┬────┬────┬────┬────┬────┬────┐  │
│  │ P1 │ P2 │ P3 │ P4 │ P5 │ P6 │ P7 │ P8 │ P9 │P10 │  │
│  └────┴────┴────┴────┴────┴────┴────┴────┴────┴────┘  │
├─────────────────────────────────────────────────────────┤
│  Video Render Panel                                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Panel 1                                          │  │
│  │ ┌────────────┐  ┌────────────┐                  │  │
│  │ │ [Image]    │  │ [Video]    │                  │  │
│  │ │            │  │ ▶ Play     │                  │  │
│  │ └────────────┘  └────────────┘                  │  │
│  │ Prompt: ...                                      │  │
│  │ [生成视频] [编辑Prompt] [First-Last Frame]       │  │
│  └──────────────────────────────────────────────────┘  │
│  [批量生成全部视频]                                     │
└─────────────────────────────────────────────────────────┘
```

#### 6. Asset Library（角色/场景库）

**源文件**: `waoowaoo/.../components/AssetLibrary.tsx` + `assets/`

**核心功能**：
- 角色管理
  - 角色卡片（头像、名称、描述、外貌、性格）
  - AI 生成角色（基于剧本分析）
  - 编辑角色信息
  - 生成角色图片（TTI）
- 场景管理
  - 场景卡片（图片、名称、描述）
  - AI 生成场景
  - 编辑场景信息
  - 生成场景图片（TTI）

**迁移目标**: `Koma/frontend/src/pages/NovelPromotion/AssetLibrary/`

#### 7. Episode 管理

**源文件**: `waoowaoo/.../NovelPromotionWorkspace.tsx`

**核心功能**：
- Episode 列表（下拉选择器）
- 创建 Episode
- 重命名 Episode
- 删除 Episode
- Episode 数据隔离（每个 Episode 独立的 Clips/Storyboards/Videos）

**迁移目标**: `Koma/frontend/src/pages/NovelPromotion/EpisodeManager.tsx`

---

### 第二部分：后端工作流迁移

#### 1. Orchestrator 系统

#### 1.1 Story-to-Script Orchestrator
**源文件**: `waoowaoo/src/lib/novel-promotion/story-to-script/orchestrator.ts`

**核心功能**：
- 角色/场景分析（并行执行）
- 片段切分（边界匹配 + 重试）
- 剧本转换（并行处理每个片段）

**迁移目标**: `Koma/electron/src/orchestrators/storyToScriptOrchestrator.ts`

**关键适配点**：
```typescript
// Waoowaoo: 使用 executeAiTextStep
const output = await runStep(meta, prompt, action, maxOutputTokens);

// Koma: 需要通过 rendererDelegate 调用前端 AI Provider
const output = await delegate.execute('aiTextStep', taskId, {
  meta, prompt, action, maxOutputTokens
});
```

#### 1.2 Script-to-Storyboard Orchestrator
**源文件**: `waoowaoo/src/lib/novel-promotion/script-to-storyboard/orchestrator.ts`

**核心功能**：
- Phase 1: 分镜规划（为每个 clip 生成 panels）
- Phase 2: 摄影规则 + 表演指导（并行）
- Phase 3: 细节优化（过滤无效 panels）

**迁移目标**: `Koma/electron/src/orchestrators/scriptToStoryboardOrchestrator.ts`

### 2. Graph Executor

**源文件**: `waoowaoo/src/lib/run-runtime/graph-executor.ts`

**核心功能**：
- 节点顺序执行
- 重试机制（maxAttempts + exponential backoff）
- Timeout 控制
- Checkpoint 状态管理

**迁移目标**: `Koma/electron/src/runtime/graphExecutor.ts`

**简化版实现**：
```typescript
export async function executePipelineGraph<TState>(
  input: GraphExecutorInput<TState>
): Promise<TState> {
  const { nodes, state } = input;

  for (const node of nodes) {
    let attempt = 1;
    const maxAttempts = node.maxAttempts || 1;

    while (attempt <= maxAttempts) {
      try {
        const result = await withTimeout(
          node.run({ state, attempt }),
          node.timeoutMs || 0
        );

        // Merge state
        state.refs = { ...state.refs, ...result?.checkpointRefs };
        state.meta = { ...state.meta, ...result?.checkpointMeta };

        break; // Success
      } catch (error) {
        if (attempt >= maxAttempts) throw error;
        await wait(computeBackoffMs(attempt));
        attempt++;
      }
    }
  }

  return state;
}
```

### 3. Stage Pipeline

**源文件**: `waoowaoo/src/lib/llm-observe/stage-pipeline.ts`

**核心功能**：
- 定义工作流阶段（STORY_TO_SCRIPT_RUN, SCRIPT_TO_STORYBOARD_RUN）
- 流程元数据（flowId, flowStageIndex, flowStageTotal）

**迁移目标**: `Koma/electron/src/pipeline/stagePipeline.ts`

**Koma 适配版本**：
```typescript
export const KOMA_WORKFLOWS = {
  SHOT_RENDER: {
    id: 'shot_render',
    stages: [
      { id: 'prepare', title: '准备阶段' },
      { id: 'execute', title: '执行阶段' },
      { id: 'persist', title: '持久化阶段' },
    ],
  },
  STORY_TO_SCRIPT: {
    id: 'story_to_script',
    stages: [
      { id: 'analyze_characters', title: '角色分析' },
      { id: 'analyze_locations', title: '场景分析' },
      { id: 'split_clips', title: '片段切分' },
      { id: 'screenplay_conversion', title: '剧本转换' },
    ],
  },
  SCRIPT_TO_STORYBOARD: {
    id: 'script_to_storyboard',
    stages: [
      { id: 'phase1_plan', title: '分镜规划' },
      { id: 'phase2_cinematography', title: '摄影规则' },
      { id: 'phase2_acting', title: '表演指导' },
      { id: 'phase3_detail', title: '细节优化' },
    ],
  },
};
```

### 4. Worker 系统适配

**Waoowaoo Workers**:
- `text.worker.ts` → Story-to-Script 任务
- `video.worker.ts` → Storyboard-to-Video 任务
- `voice.worker.ts` → Script-to-Voice 任务

**Koma 适配方案**:
```
Koma/electron/src/queue/workers/
├── storyToScriptHandler.ts    (替代 text.worker.ts)
├── scriptToStoryboardHandler.ts
├── storyboardToVideoHandler.ts (替代 video.worker.ts)
└── scriptToVoiceHandler.ts     (替代 voice.worker.ts)
```

**统一 Handler 接口**：
```typescript
export interface WorkflowHandlerOptions<TPayload> {
  taskId: string;
  payload: TPayload;
  delegate: RendererDelegate;
  onProgress: (progress: number, phase: string, message: string) => void | Promise<void>;
  isCancelled?: () => boolean;
}

export interface WorkflowHandlerResult {
  output: Record<string, unknown>;
  checkpoints?: Record<string, unknown>[];
}

export async function runWorkflowTask<TPayload>(
  options: WorkflowHandlerOptions<TPayload>,
  orchestrator: (ctx: OrchestratorContext) => Promise<OrchestratorResult>
): Promise<WorkflowHandlerResult>;
```

---

## 🛠️ 实施步骤

### Phase 1: 基础设施准备（2-3天）

#### 1.1 创建目录结构
```bash
# 前端目录
Koma/frontend/src/pages/NovelPromotion/
├── index.tsx                    # 主入口
├── NovelPromotionWorkspace.tsx  # 工作区容器
├── StageNavigation.tsx          # 阶段导航
├── EpisodeManager.tsx           # Episode 管理
├── ConfigStage/                 # Story Input 阶段
│   └── index.tsx
├── ScriptStage/                 # Script 编辑阶段
│   ├── index.tsx
│   ├── ClipList.tsx
│   ├── ClipCard.tsx
│   └── AssetsPanel.tsx
├── StoryboardStage/             # Storyboard 编辑阶段
│   ├── index.tsx
│   ├── StoryboardGroup.tsx
│   ├── PanelCard.tsx
│   ├── PanelEditModal.tsx
│   └── ImageSection.tsx
├── VideoStage/                  # Video 生成阶段
│   ├── index.tsx
│   ├── VideoTimeline.tsx
│   ├── VideoRenderPanel.tsx
│   └── VideoPanelCard.tsx
├── AssetLibrary/                # 资产库
│   ├── index.tsx
│   ├── CharacterSection.tsx
│   ├── CharacterCard.tsx
│   ├── LocationSection.tsx
│   └── LocationCard.tsx
└── hooks/
    ├── useStageNavigation.ts
    ├── useEpisodeData.ts
    └── useWorkflowRuntime.ts

# 后端目录
Koma/electron/src/
├── orchestrators/          # Orchestrator 实现
│   ├── storyToScriptOrchestrator.ts
│   ├── scriptToStoryboardOrchestrator.ts
│   └── types.ts
├── runtime/                # 运行时引擎
│   ├── graphExecutor.ts
│   └── types.ts
├── pipeline/               # 工作流定义
│   ├── stagePipeline.ts
│   └── types.ts
└── queue/workers/          # 扩展现有 workers
    ├── storyToScriptHandler.ts
    └── scriptToStoryboardHandler.ts
```

#### 1.2 定义核心类型
**文件**: `Koma/frontend/src/pages/NovelPromotion/types.ts`

```typescript
// Episode 类型
export interface Episode {
  id: string;
  projectId: string;
  name: string;
  novelText: string;
  createdAt: number;
  updatedAt: number;
}

// Clip 类型
export interface Clip {
  id: string;
  episodeId: string;
  start: number;
  end: number;
  summary: string;
  content: string;
  characters: string[];
  location: string | null;
  screenplay: Record<string, unknown> | null;
}

// Storyboard 类型
export interface Storyboard {
  id: string;
  clipId: string;
  panels: Panel[];
}

export interface Panel {
  panelNumber: number;
  description: string;
  location: string;
  characters: string[];
  imageUrl?: string;
  imageCandidates?: string[];
  photographyPlan?: {
    composition: string;
    lighting: string;
    colorPalette: string;
    atmosphere: string;
  };
  actingNotes?: Array<{
    character: string;
    action: string;
  }>;
}

// Character 类型
export interface Character {
  id: string;
  projectId: string;
  name: string;
  description: string;
  appearance: string;
  personality: string;
  imageUrl?: string;
}

// Location 类型
export interface Location {
  id: string;
  projectId: string;
  name: string;
  description: string;
  imageUrl?: string;
}

// Stage 类型
export type Stage = 'config' | 'script' | 'storyboard' | 'video' | 'editor';
```

### Phase 2: 前端 UI 基础框架（3-4天）

#### 2.1 Stage Navigation 系统
**文件**: `Koma/frontend/src/pages/NovelPromotion/StageNavigation.tsx`

**实现要点**：
```typescript
export function StageNavigation({
  currentStage,
  onStageChange,
  stageStatus
}: StageNavigationProps) {
  const stages = [
    { id: 'config', icon: 'S', label: '故事' },
    { id: 'script', icon: 'A', label: '剧本' },
    { id: 'storyboard', icon: 'B', label: '分镜' },
    { id: 'video', icon: 'V', label: '视频' },
    { id: 'editor', icon: 'E', label: '编辑器', disabled: true },
  ];

  return (
    <div className="stage-navigation">
      {stages.map(stage => (
        <button
          key={stage.id}
          className={cn('stage-button', {
            active: currentStage === stage.id,
            disabled: stage.disabled,
          })}
          onClick={() => onStageChange(stage.id)}
        >
          <span className="stage-icon">{stage.icon}</span>
          <span className="stage-label">{stage.label}</span>
        </button>
      ))}
    </div>
  );
}
```

#### 2.2 Episode 管理
**文件**: `Koma/frontend/src/pages/NovelPromotion/EpisodeManager.tsx`

**实现要点**：
- Episode 列表下拉选择器
- 创建/重命名/删除 Episode
- Episode 数据加载

#### 2.3 Workspace 容器
**文件**: `Koma/frontend/src/pages/NovelPromotion/NovelPromotionWorkspace.tsx`

**实现要点**：
```typescript
export function NovelPromotionWorkspace({ projectId }: Props) {
  const [currentStage, setCurrentStage] = useState<Stage>('config');
  const [currentEpisodeId, setCurrentEpisodeId] = useState<string | null>(null);
  const { episodes, clips, storyboards } = useEpisodeData(projectId, currentEpisodeId);

  return (
    <div className="novel-promotion-workspace">
      <EpisodeManager
        projectId={projectId}
        currentEpisodeId={currentEpisodeId}
        onEpisodeSelect={setCurrentEpisodeId}
      />
      <StageNavigation
        currentStage={currentStage}
        onStageChange={setCurrentStage}
      />
      <div className="stage-content">
        {currentStage === 'config' && <ConfigStage />}
        {currentStage === 'script' && <ScriptStage />}
        {currentStage === 'storyboard' && <StoryboardStage />}
        {currentStage === 'video' && <VideoStage />}
      </div>
    </div>
  );
}
```

### Phase 3: Config Stage 实现（1-2天）

**文件**: `Koma/frontend/src/pages/NovelPromotion/ConfigStage/index.tsx`

**核心功能**：
1. 小说文本输入（Textarea）
2. 主题风格选择
3. 视频比例选择
4. "生成剧本" 按钮

**实现要点**：
```typescript
export function ConfigStage() {
  const [novelText, setNovelText] = useState('');
  const [theme, setTheme] = useState('');
  const [videoRatio, setVideoRatio] = useState('16:9');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateScript = async () => {
    setIsGenerating(true);
    try {
      const taskId = await workflowService.submitStoryToScript({
        projectId,
        episodeId,
        novelText,
        theme,
        videoRatio,
      });
      // 订阅任务进度
      workflowService.subscribeWorkflow(taskId, (data) => {
        // 更新进度 UI
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="config-stage">
      <textarea
        value={novelText}
        onChange={(e) => setNovelText(e.target.value)}
        placeholder="输入小说文本..."
      />
      <button onClick={handleGenerateScript} disabled={isGenerating}>
        {isGenerating ? '生成中...' : '生成剧本'}
      </button>
    </div>
  );
}
```

### Phase 4: Script Stage 实现（3-4天）

**文件**: `Koma/frontend/src/pages/NovelPromotion/ScriptStage/`

**核心组件**：
1. `ClipList.tsx` - Clip 列表
2. `ClipCard.tsx` - Clip 卡片
3. `AssetsPanel.tsx` - 角色/场景面板

**实现要点**：
```typescript
// ClipCard.tsx
export function ClipCard({ clip, onEdit }: ClipCardProps) {
  return (
    <div className="clip-card">
      <div className="clip-summary">{clip.summary}</div>
      <div className="clip-meta">
        <span>角色: {clip.characters.join(', ')}</span>
        <span>场景: {clip.location}</span>
      </div>
      <button onClick={() => onEdit(clip)}>编辑</button>
    </div>
  );
}

// AssetsPanel.tsx
export function AssetsPanel({ projectId }: AssetsPanelProps) {
  const { characters, locations } = useAssets(projectId);

  const handleGenerateCharacter = async () => {
    await workflowService.submitAICreateCharacter({ projectId });
  };

  return (
    <div className="assets-panel">
      <section>
        <h3>角色</h3>
        <div className="character-grid">
          {characters.map(char => (
            <CharacterCard key={char.id} character={char} />
          ))}
        </div>
        <button onClick={handleGenerateCharacter}>AI 生成角色</button>
      </section>
      <section>
        <h3>场景</h3>
        <div className="location-grid">
          {locations.map(loc => (
            <LocationCard key={loc.id} location={loc} />
          ))}
        </div>
      </section>
    </div>
  );
}
```

### Phase 5: Storyboard Stage 实现（4-5天）

**文件**: `Koma/frontend/src/pages/NovelPromotion/StoryboardStage/`

**核心组件**：
1. `StoryboardGroup.tsx` - Storyboard 分组
2. `PanelCard.tsx` - Panel 卡片
3. `PanelEditModal.tsx` - Panel 编辑弹窗
4. `ImageSection.tsx` - 图片生成区域

**实现要点**：
```typescript
// PanelCard.tsx
export function PanelCard({ panel, onEdit, onGenerateImage }: PanelCardProps) {
  return (
    <div className="panel-card">
      <div className="panel-image">
        {panel.imageUrl ? (
          <img src={panel.imageUrl} alt={panel.description} />
        ) : (
          <div className="placeholder">无图片</div>
        )}
      </div>
      <div className="panel-description">{panel.description}</div>
      <div className="panel-photography">
        <span>构图: {panel.photographyPlan?.composition}</span>
        <span>光线: {panel.photographyPlan?.lighting}</span>
      </div>
      <div className="panel-actions">
        <button onClick={() => onEdit(panel)}>编辑</button>
        <button onClick={() => onGenerateImage(panel)}>生成图片</button>
      </div>
    </div>
  );
}

// StoryboardGroup.tsx
export function StoryboardGroup({ storyboard, clip }: StoryboardGroupProps) {
  return (
    <div className="storyboard-group">
      <div className="group-header">
        <h3>Clip {clip.id}</h3>
        <span>{clip.summary}</span>
      </div>
      <div className="panel-list">
        {storyboard.panels.map(panel => (
          <PanelCard key={panel.panelNumber} panel={panel} />
        ))}
      </div>
    </div>
  );
}
```

### Phase 6: Video Stage 实现（3-4天）

**文件**: `Koma/frontend/src/pages/NovelPromotion/VideoStage/`

**核心组件**：
1. `VideoTimeline.tsx` - 视频时间轴
2. `VideoRenderPanel.tsx` - 视频渲染面板
3. `VideoPanelCard.tsx` - 视频 Panel 卡片

**实现要点**：
```typescript
// VideoPanelCard.tsx
export function VideoPanelCard({ panel, onGenerateVideo }: VideoPanelCardProps) {
  const [videoStatus, setVideoStatus] = useState<'pending' | 'processing' | 'completed'>('pending');

  const handleGenerate = async () => {
    setVideoStatus('processing');
    const taskId = await workflowService.submitPanelVideoGeneration({
      panelId: panel.id,
      imageUrl: panel.imageUrl,
      prompt: panel.description,
    });
    workflowService.subscribeWorkflow(taskId, (data) => {
      if (data.status === 'completed') {
        setVideoStatus('completed');
      }
    });
  };

  return (
    <div className="video-panel-card">
      <div className="panel-preview">
        <img src={panel.imageUrl} alt="" />
      </div>
      {videoStatus === 'completed' && (
        <div className="video-player">
          <video src={panel.videoUrl} controls />
        </div>
      )}
      <button onClick={handleGenerate} disabled={videoStatus === 'processing'}>
        {videoStatus === 'processing' ? '生成中...' : '生成视频'}
      </button>
    </div>
  );
}
```

### Phase 7: Asset Library 实现（2-3天）

**文件**: `Koma/frontend/src/pages/NovelPromotion/AssetLibrary/`

**核心组件**：
1. `CharacterSection.tsx` - 角色管理
2. `CharacterCard.tsx` - 角色卡片
3. `LocationSection.tsx` - 场景管理
4. `LocationCard.tsx` - 场景卡片

### Phase 8: 后端 Graph Executor 实现（2-3天）

**文件**: `Koma/electron/src/runtime/graphExecutor.ts`

**核心功能**：
1. 节点顺序执行
2. 重试机制（exponential backoff）
3. Timeout 控制
4. 取消检查

**实现要点**：
```typescript
// 1. Timeout 包装
function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return task;

  return Promise.race([
    task,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

// 2. Exponential Backoff
function computeBackoffMs(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
  const jitter = Math.floor(Math.random() * 200);
  return base + jitter;
}

// 3. 取消检查
function ensureNotCancelled(isCancelled?: () => boolean): void {
  if (isCancelled?.()) {
    throw new Error('TASK_CANCELLED');
  }
}
```

### Phase 3: Story-to-Script Orchestrator（3-4天）

**文件**: `Koma/electron/src/orchestrators/storyToScriptOrchestrator.ts`

**迁移重点**：
1. **并行执行**：角色分析 + 场景分析
2. **边界匹配**：片段切分的 `createClipContentMatcher`
3. **重试机制**：JSON 解析失败时的多级修复
4. **错误处理**：部分失败时的容错

**关键适配**：
```typescript
// Waoowaoo: 直接调用 AI
const output = await executeAiTextStep(meta, prompt, action, maxOutputTokens);

// Koma: 通过 delegate 调用
const output = await delegate.execute('aiTextStep', taskId, {
  meta,
  prompt,
  action,
  maxOutputTokens,
});
```

### Phase 4: Script-to-Storyboard Orchestrator（3-4天）

**文件**: `Koma/electron/src/orchestrators/scriptToStoryboardOrchestrator.ts`

**迁移重点**：
1. **三阶段处理**：Plan → Cinematography/Acting → Detail
2. **并行优化**：Phase 2 的摄影规则和表演指导并行执行
3. **数据合并**：`mergePanelsWithRules` 合并多阶段结果

### Phase 5: Worker 集成（2-3天）

**扩展现有 taskQueue.ts**：
```typescript
// 新增任务类型
export type TaskType =
  | 'shot-render'
  | 'story-to-script'
  | 'script-to-storyboard'
  | 'storyboard-to-video'
  | 'script-to-voice';

// 统一 Handler 注册
const TASK_HANDLERS: Record<TaskType, WorkflowHandler> = {
  'shot-render': runShotRenderTask,
  'story-to-script': runStoryToScriptTask,
  'script-to-storyboard': runScriptToStoryboardTask,
  'storyboard-to-video': runStoryboardToVideoTask,
  'script-to-voice': runScriptToVoiceTask,
};
```

### Phase 6: Frontend 集成（2-3天）

**新增 UI 组件**：
```
Koma/frontend/src/
├── components/workflow/
│   ├── StoryToScriptPanel.tsx
│   ├── ScriptToStoryboardPanel.tsx
│   └── WorkflowStageIndicator.tsx
├── services/
│   └── workflowService.ts
└── hooks/
    └── useWorkflowStatus.ts
```

**工作流服务**：
```typescript
// frontend/src/services/workflowService.ts
export class WorkflowService {
  async submitStoryToScript(params: StoryToScriptParams): Promise<string> {
    return await taskQueueService.submitTask('story-to-script', params);
  }

  async submitScriptToStoryboard(params: ScriptToStoryboardParams): Promise<string> {
    return await taskQueueService.submitTask('script-to-storyboard', params);
  }

  subscribeWorkflow(taskId: string, callback: (data: TaskUpdateEvent) => void) {
    return taskQueueService.subscribe(taskId, callback);
  }
}
```

### Phase 7: 测试与优化（2-3天）

**测试清单**：
- [ ] Graph Executor 重试机制
- [ ] Orchestrator 并行执行
- [ ] 任务取消功能
- [ ] 错误恢复
- [ ] 进度报告准确性
- [ ] 内存泄漏检查

---

## 🎯 关键技术决策

### 决策 1: Queue 系统选择
**选择**: 保留 better-queue + SQLite
**理由**:
- ✅ Koma 已有成熟实现
- ✅ 无需额外 Redis 依赖
- ✅ 适合 Electron 单机应用

### 决策 2: AI 调用方式
**选择**: 通过 rendererDelegate 委托给前端
**理由**:
- ✅ 保持 Koma 现有架构
- ✅ 前端统一管理 AI Provider
- ✅ 避免 Main Process 直接调用 API

### 决策 3: 数据库选择
**选择**: 保留 better-sqlite3
**理由**:
- ✅ 无需迁移 Prisma
- ✅ 轻量级，适合 Electron
- ✅ 已有 taskQueue 表结构

### 决策 4: Orchestrator 执行位置
**选择**: Main Process
**理由**:
- ✅ 避免阻塞 UI
- ✅ 便于任务队列管理
- ✅ 统一错误处理

---

## 📊 工作量估算（更新版）

| 阶段 | 工作量 | 优先级 | 说明 |
|------|--------|--------|------|
| **前端 UI 部分** | | | |
| Phase 1: 基础设施准备 | 2-3天 | P0 | 目录结构、类型定义 |
| Phase 2: UI 基础框架 | 3-4天 | P0 | Stage Navigation、Workspace 容器 |
| Phase 3: Config Stage | 1-2天 | P1 | Story Input 界面 |
| Phase 4: Script Stage | 3-4天 | P1 | Clip 编辑器、Assets 面板 |
| Phase 5: Storyboard Stage | 4-5天 | P1 | Panel 编辑器、图片生成 |
| Phase 6: Video Stage | 3-4天 | P1 | Timeline、视频生成 |
| Phase 7: Asset Library | 2-3天 | P2 | 角色/场景管理 |
| **后端工作流部分** | | | |
| Phase 8: Graph Executor | 2-3天 | P0 | 节点执行引擎 |
| Phase 9: Story-to-Script | 3-4天 | P1 | Orchestrator 实现 |
| Phase 10: Script-to-Storyboard | 3-4天 | P1 | Orchestrator 实现 |
| Phase 11: Worker 集成 | 2-3天 | P0 | 任务处理器 |
| **数据与接口部分** | | | |
| Phase 12: 数据库 Schema | 2-3天 | P0 | SQLite 表结构扩展 |
| Phase 13: IPC 接口 | 1-2天 | P0 | Electron IPC 通道 |
| Phase 14: 前端服务层 | 1-2天 | P1 | Service 封装 |
| **测试与优化** | | | |
| Phase 15: 测试与优化 | 3-4天 | P2 | 集成测试、性能优化 |
| **总计** | **37-52天** | - | **约 7-10 周** |

---

## 🚨 风险与缓解

### 风险 1: AI 调用适配复杂
**影响**: 高
**缓解**: 先实现 Mock AI Provider 进行测试

### 风险 2: 并行执行稳定性
**影响**: 中
**缓解**: 增加详细日志，逐步测试并行度

### 风险 3: 内存占用
**影响**: 中
**缓解**: 实现流式处理，避免大对象缓存

### 风险 4: 错误恢复机制
**影响**: 高
**缓解**: 完善 Checkpoint 机制，支持断点续传

---

## ✅ 验收标准

### 功能验收 - 前端界面
- [ ] Stage Navigation 正常切换
- [ ] Episode 管理（创建/重命名/删除）
- [ ] Config Stage 小说输入与配置
- [ ] Script Stage Clip 列表展示与编辑
- [ ] Script Stage 角色/场景资产管理
- [ ] Storyboard Stage Panel 展示与编辑
- [ ] Storyboard Stage 图片生成功能
- [ ] Video Stage Timeline 展示
- [ ] Video Stage 视频生成功能
- [ ] Asset Library 角色/场景管理

### 功能验收 - 后端工作流
- [ ] Story-to-Script 工作流完整运行
- [ ] Script-to-Storyboard 工作流完整运行
- [ ] Panel 图片生成任务
- [ ] Panel 视频生成任务
- [ ] 任务队列支持多种任务类型
- [ ] 进度报告实时更新
- [ ] 任务取消功能正常
- [ ] 错误重试机制有效

### 性能验收
- [ ] 单个 Orchestrator 执行时间 < 5分钟
- [ ] 并行任务不阻塞 UI
- [ ] 内存占用 < 500MB
- [ ] UI 响应流畅（60fps）

### 代码质量
- [ ] TypeScript 类型完整
- [ ] 单元测试覆盖率 > 70%
- [ ] 无 ESLint 错误
- [ ] 代码符合 Koma 项目规范

---

## 📚 参考资料

### Waoowaoo 核心文件
1. `src/lib/novel-promotion/story-to-script/orchestrator.ts` - Story-to-Script 编排
2. `src/lib/novel-promotion/script-to-storyboard/orchestrator.ts` - Script-to-Storyboard 编排
3. `src/lib/run-runtime/graph-executor.ts` - 图执行引擎
4. `src/lib/llm-observe/stage-pipeline.ts` - 阶段定义
5. `src/lib/workers/handlers/story-to-script.ts` - Worker 实现

### Koma 核心文件
1. `electron/src/queue/taskQueue.ts` - 任务队列
2. `electron/src/queue/workers/shotRenderHandler.ts` - Shot Render Handler
3. `frontend/src/workflow/shotRenderWorkflow.ts` - 前端工作流
4. `frontend/src/services/taskQueueService.ts` - 任务服务

---

## 🎬 下一步行动

1. **用户确认计划** - 等待用户回复 "Y" 确认执行
2. **创建 Git 分支** - `git checkout -b feature/waoowaoo-workflow-migration`
3. **开始 Phase 1** - 创建目录结构和核心类型定义

---

**计划版本**: v2.0（完整版：前端 + 后端 + 操作流程）
**创建时间**: 2026-03-01
**预计完成**: 2026-04-15（约 7-10 周）
