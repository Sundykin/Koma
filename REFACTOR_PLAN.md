# Koma 短剧制作流程重构计划

## 一、现状分析

### 当前问题
1. **双入口冗余**：`项目总览`(ProjectOverview) 和 `创作工作台`(EditorView) 功能大量重叠
   - ProjectOverview: 三栏布局（剧集管理 | 剧本编辑 | 资产预览），含模型配置、一键成片
   - EditorView: 三步流程（资产 → 分镜 → 视频），含资产管理、分镜、剪辑
   - 两者共享 Project 数据、Episode 数据，但各自独立加载和管理状态

2. **状态管理混乱**：App.tsx 300+ 行，所有状态（项目、剧集、步骤、分析数据、设置）全部堆积在一个组件
3. **流程断裂**：从 ProjectOverview 到 EditorView 需要手动点"开始制作"，数据通过 props 层层传递
4. **不可测试**：逻辑和 UI 高度耦合，无法单独测试工作流
5. **兼容代码多**：types.ts 中大量 `Deprecated` 字段、兼容层

### 参考项目 waoowaoo 的优点
1. **URL 驱动导航**：stage + episode 由 URL 参数决定，可分享、可刷新
2. **阶段状态可视**：每个阶段显示 empty/active/processing/ready 状态
3. **Hook 架构分层**：业务逻辑与 UI 彻底解耦
4. **5阶段流程**：config → script/assets → storyboard → videos → voice
5. **SSE 实时推送**：任务状态实时同步

### Koma 自身优势（保留）
1. **Electron 桌面端**：本地文件持久化、ffmpeg 本地剪辑
2. **CodeMirror 剧本编辑器**：@引用角色/场景/道具，/运镜命令
3. **插件系统**：Capability 注册、Provider 动态扩展
4. **时间线剪辑器**：多轨道、关键帧、导出
5. **持久化层**：JSON 文件存储，IPC 通信

---

## 二、重构目标

### 最终产品形态
一个统一的短剧制作工作台，包含 **5 个阶段**的线性流程：

```
故事输入(Story) → 剧本资产(Script) → 分镜生成(Storyboard) → 视频生成(Video) → 剪辑导出(Edit)
```

### 设计原则
1. **单一入口**：从项目列表进入项目后，直接进入工作台，不再有 overview/editor 的区分
2. **阶段内聚**：每个阶段是独立组件，拥有完整的输入→处理→输出能力
3. **数据驱动导航**：阶段状态由数据存在性推断，而非手动标记
4. **Hook 分层**：业务逻辑抽取到 hooks，组件只负责渲染
5. **无历史包袱**：彻底删除兼容代码，重新定义干净的数据模型

---

## 三、新架构设计

### 3.1 视图结构（删除 overview/editor 二分）

```
App.tsx
├── Sidebar（项目列表 / 系统设置）
└── WorkspaceShell（进入项目后的工作台外壳）
    ├── WorkspaceHeader（项目名称 + 模型配置 + 剧集选择器）
    ├── StageNavigation（5阶段胶囊导航）
    └── StageContent（当前阶段组件）
        ├── StoryStage      — 故事输入 + AI分集
        ├── ScriptStage     — 剧本编辑 + 资产管理（角色/场景/道具）
        ├── StoryboardStage — 分镜生成 + 图片生成
        ├── VideoStage      — 视频生成 + 预览
        └── EditStage       — 时间线剪辑 + 导出
```

### 3.2 路由设计

保持 Electron 内 React state 路由（无 react-router），但改为结构化路由状态：

```typescript
// 新的路由状态
interface AppRoute {
  page: 'projects' | 'workspace' | 'settings';
  // workspace 专属
  projectId?: string;
  episodeId?: string;
  stage?: WorkspaceStage;
}

type WorkspaceStage = 'story' | 'script' | 'storyboard' | 'video' | 'edit';
```

### 3.3 数据模型（精简）

```typescript
// === 核心实体 ===

interface Project {
  id: string;
  title: string;
  mode: 'drama' | 'narration';
  theme?: string;
  stylePrompt?: string;
  // 模型配置引用
  llmConfigId?: string;
  ttiConfigId?: string;
  itvConfigId?: string;
  ttsConfigId?: string;
  createdAt: number;
  updatedAt: number;
}

interface Episode {
  id: string;
  projectId: string;
  number: number;
  title: string;
  storyText: string;       // 原始故事文本
  scriptText: string;      // 编辑后的剧本
  createdAt: number;
  updatedAt: number;
}

interface Character {
  id: string;
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting';
  prompt: string;           // 生成提示词
  imagePath?: string;       // 定妆照
  voiceId?: string;
}

interface Scene {
  id: string;
  name: string;
  prompt: string;
  imagePath?: string;
}

interface Prop {
  id: string;
  name: string;
  prompt: string;
  imagePath?: string;
}

interface Shot {
  id: string;
  episodeId: string;
  index: number;            // 排序序号
  scriptContent: string;    // 对应的剧本片段
  shotType: ShotType;
  cameraMovement: CameraMovement;
  duration: number;
  imagePrompt: string;
  videoPrompt: string;
  imagePath?: string;       // 当前选中图片
  imagePaths?: string[];    // 候选图片列表
  videoPath?: string;       // 当前视频
  videoPaths?: string[];    // 候选视频列表
  characters: string[];     // 角色ID列表
  scenes: string[];
  dialogue?: string;
  emotion?: string;
}
```

### 3.4 Hook 架构

```
hooks/
├── useWorkspace.ts           — 工作台总控（projectId, episodeId, stage）
├── useWorkspaceNavigation.ts — 阶段导航逻辑
├── useProjectData.ts         — 项目数据加载/保存
├── useEpisodeData.ts         — 剧集数据加载/保存
├── useAssets.ts              — 资产（角色/场景/道具）CRUD
├── useShots.ts               — 分镜 CRUD
├── useStageStatus.ts         — 各阶段状态推断
└── useAutoSave.ts            — 自动保存（已有，复用）
```

---

## 四、实施步骤（分 6 个阶段）

### Phase 1: 基础架构重建（预计 2 个子任务）

**任务 1.1: 精简数据模型和路由**
- [ ] 重写 `types.ts`，删除所有兼容字段和冗余类型
- [ ] 定义新的 `AppRoute` 和 `WorkspaceStage` 类型
- [ ] 更新 `App.tsx`：删除 overview/editor 二分，统一为 projects/workspace/settings 三页

**任务 1.2: 构建 Hook 架构**
- [ ] 创建 `useWorkspace.ts` — 管理 projectId, episodeId, stage 状态
- [ ] 创建 `useWorkspaceNavigation.ts` — 阶段切换、阶段状态推断
- [ ] 创建 `useProjectData.ts` — 封装项目 CRUD（复用 projectStore）
- [ ] 创建 `useEpisodeData.ts` — 封装剧集 CRUD（复用 episodeStore）
- [ ] 创建 `useAssets.ts` — 封装资产 CRUD
- [ ] 创建 `useShots.ts` — 封装分镜 CRUD

### Phase 2: 工作台外壳（预计 2 个子任务）

**任务 2.1: WorkspaceShell + Header + StageNav**
- [ ] 创建 `WorkspaceShell.tsx` — 工作台容器（替代 ProjectOverview + EditorView）
- [ ] 创建 `WorkspaceHeader.tsx` — 项目名称编辑 + 模型选择器 + 剧集选择器
  - 复用 ProjectOverview 的模型配置 Select 组件
  - 复用 EpisodeManager 的剧集列表逻辑（改为下拉选择器）
- [ ] 创建 `StageNavigation.tsx` — 5 阶段胶囊导航
  - 参考 waoowaoo 的 CapsuleNav 设计
  - 显示 empty/active/processing/ready 状态

**任务 2.2: 更新 Sidebar + App 路由**
- [ ] 更新 `Sidebar.tsx`：删除 "创作工作台" 入口，保留 "项目" + "设置"
- [ ] 更新 `App.tsx`：统一路由逻辑

### Phase 3: 5 个阶段组件（预计 5 个子任务）

**任务 3.1: StoryStage — 故事输入**
- [ ] 新建 `components/workspace/stages/StoryStage.tsx`
- [ ] 功能：文本输入/粘贴 + AI 智能分集 + 剧集管理
- [ ] 复用：ScriptEditor（CodeMirror）、EpisodeSplitWizard

**任务 3.2: ScriptStage — 剧本 + 资产**
- [ ] 新建 `components/workspace/stages/ScriptStage.tsx`
- [ ] 功能：剧本编辑（@引用）+ 剧本解析 + 资产管理（角色/场景/道具生成）
- [ ] 复用：ScriptEditor + ScriptWorkbench 的解析逻辑 + AssetManager 的资产管理
- [ ] 布局：左右分栏（剧本编辑 | 资产面板）

**任务 3.3: StoryboardStage — 分镜**
- [ ] 新建 `components/workspace/stages/StoryboardStage.tsx`
- [ ] 功能：分镜列表 + 图片生成 + 分镜编辑
- [ ] 复用：Storyboard 组件（大部分可直接使用）

**任务 3.4: VideoStage — 视频生成**
- [ ] 新建 `components/workspace/stages/VideoStage.tsx`
- [ ] 功能：分镜→视频批量生成 + 预览 + 选择
- [ ] 复用：部分 ShotCard 的视频生成逻辑

**任务 3.5: EditStage — 剪辑导出**
- [ ] 新建 `components/workspace/stages/EditStage.tsx`
- [ ] 功能：时间线剪辑 + 导出
- [ ] 复用：SimpleEditor（完整复用）

### Phase 4: 清理冗余代码（预计 1 个子任务）

**任务 4.1: 删除旧代码**
- [ ] 删除 `ProjectOverview.tsx`
- [ ] 删除 `EditorView.tsx`
- [ ] 删除 `StepNavigator.tsx`（被 StageNavigation 替代）
- [ ] 删除 types.ts 中的兼容字段
- [ ] 清理 App.tsx 中的冗余状态和回调
- [ ] 删除所有 `// Deprecated` 和 `// 旧字段` 标注的代码
- [ ] 更新所有 import 和 index.ts 导出

### Phase 5: 测试计划（预计 2 个子任务）

**任务 5.1: 编写端到端测试计划**
- [ ] 使用 MCP Chrome DevTools 进行自动化 UI 测试
- [ ] 测试矩阵：
  1. 项目创建 → 进入工作台
  2. Story 阶段：文本输入、AI 分集
  3. Script 阶段：剧本编辑、@引用、解析、资产生成
  4. Storyboard 阶段：分镜生成、图片生成
  5. Video 阶段：视频生成、预览
  6. Edit 阶段：时间线加载、播放、导出
  7. 阶段导航：前进、后退、状态显示
  8. 剧集切换：切换剧集后数据正确加载
  9. 自动保存：编辑后数据持久化
  10. 模型配置：切换模型配置

**任务 5.2: 执行测试并修复问题**
- [ ] 启动 Electron 应用
- [ ] 按测试矩阵逐项验证
- [ ] 修复发现的问题

### Phase 6: 收尾优化（预计 1 个子任务）

**任务 6.1: 最终清理和优化**
- [ ] 确保所有 import 路径正确
- [ ] 确保构建无错误（`npm run build`）
- [ ] 清理未使用的文件和依赖
- [ ] 更新 MEMORY.md 记录重构结果

---

## 五、文件变更清单

### 新建文件
```
frontend/src/components/workspace/
  WorkspaceShell.tsx
  WorkspaceHeader.tsx
  StageNavigation.tsx
  stages/
    StoryStage.tsx
    ScriptStage.tsx
    StoryboardStage.tsx
    VideoStage.tsx
    EditStage.tsx

frontend/src/hooks/
  useWorkspace.ts
  useWorkspaceNavigation.ts
  useProjectData.ts (已有 useProjects，扩展)
  useEpisodeData.ts
  useAssets.ts (扩展已有)
  useShots.ts
  useStageStatus.ts
```

### 大幅修改
```
frontend/src/App.tsx              — 精简为三页路由
frontend/src/types.ts             — 删除兼容字段，精简模型
frontend/src/components/common/Sidebar.tsx — 删除 editor 入口
```

### 删除文件
```
frontend/src/components/project/ProjectOverview.tsx    — 被 WorkspaceShell 替代
frontend/src/components/editor/EditorView.tsx          — 被 WorkspaceShell 替代
frontend/src/components/common/StepNavigator.tsx       — 被 StageNavigation 替代
frontend/src/components/project/ScriptWorkbench.tsx    — 逻辑合并到 ScriptStage
frontend/src/components/project/ProjectAssetOverview.tsx — 逻辑合并到 ScriptStage
frontend/src/components/project/InlineProjectToolbar.tsx — 被 WorkspaceHeader 替代
```

### 保留并复用（不改或微调）
```
frontend/src/editor/               — 完整保留 ScriptEditor + mention 系统
frontend/src/components/asset/     — 保留所有资产组件
frontend/src/components/storyboard/ — 保留分镜组件
frontend/src/components/editor/SimpleEditor.tsx — 保留剪辑器
frontend/src/components/editor/SimpleTimeline.tsx — 保留时间线
frontend/src/components/editor/SimplePlayer.tsx   — 保留播放器
frontend/src/store/                — 保留持久化层
frontend/src/providers/            — 保留所有 AI Provider
frontend/src/workflow/             — 保留工作流引擎
frontend/src/services/             — 保留服务层
```

---

## 六、风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 持久化格式变化导致旧数据不兼容 | 低 | 用户说明"无需考虑历史数据" |
| 剧本编辑器 mention 系统受影响 | 低 | 编辑器独立模块，不涉及重构 |
| 分镜/剪辑组件因 props 变化报错 | 中 | 逐步迁移，每阶段完成后测试 |
| 工作流引擎适配新数据模型 | 中 | workflow 层通过 adapter 适配 |

---

## 七、信心评估

**我对这次重构有信心。** 理由：

1. 两个项目我已深入阅读，理解了每个组件的职责和数据流
2. 核心资产（编辑器、分镜、剪辑、AI Provider）不需要修改，只需要在新框架下重新组织
3. 重构的本质是"拆分重组"而非"重写"，大量代码可以复用
4. 用户明确要求"不考虑历史数据"，消除了最大的兼容性风险
5. 有参考项目 waoowaoo 作为设计蓝本，方向清晰
