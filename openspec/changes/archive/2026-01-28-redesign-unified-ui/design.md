# Design: 统一 UI 设计重构

## Context

### 当前问题分析

**Header 结构**（占用约 120px 垂直空间）:
```
┌────────────────────────────────────────────────────────────┐
│ [Home] > ProjectName > Episode          [设置] [保存] [导出] │  ← 64px 导航栏
├────────────────────────────────────────────────────────────┤
│ ○剧本解析 ─── ○角色场景 ─── ○AI分镜 ─── ○后期剪辑 [开始解析] │  ← StepNavigator
├────────────────────────────────────────────────────────────┤
│ [任务进度] 剧本解析中... 60%                      [展开]    │  ← TaskStatusBar
└────────────────────────────────────────────────────────────┘
```

**问题**:
1. Header 独立于页面，功能重复
2. 三层结构在非编辑器视图浪费空间
3. 面包屑与 Sidebar 导航重复

### 目标架构

**新结构**（Header 融入页面）:
```
┌──────┬─────────────────────────────────────────────────────┐
│      │ 我的项目                    [搜索] [筛选] [+ 新建]   │
│ Logo │─────────────────────────────────────────────────────│
│      │                                                     │
│ Nav  │  ┌─────────┐  ┌─────────┐  ┌─────────┐             │
│      │  │ Project │  │ Project │  │ Project │   ...       │
│ ───  │  └─────────┘  └─────────┘  └─────────┘             │
│      │                                                     │
│ User │                                                     │
└──────┴─────────────────────────────────────────────────────┘
```

编辑器视图：
```
┌──────┬──────────────────────────────────────────────┬──────┐
│      │ ○剧本 ─── ○资产 ─── ●分镜 ─── ○剪辑  [下一步]│      │
│ Side │──────────────────────────────────────────────│ Panel│
│ bar  │                                              │      │
│      │              内容区域                        │      │
│      │                                              │      │
└──────┴──────────────────────────────────────────────┴──────┘
```

## Goals / Non-Goals

### Goals
- 减少垂直空间浪费（Header 从 120px 减至 48-56px）
- 统一设计语言（颜色、间距、圆角、字体）
- 提升组件复用率
- 保持现有功能完整

### Non-Goals
- 不改变核心业务流程
- 不引入新的状态管理方案
- 不重写底层服务

## Decisions

### 1. Header 融合策略
**决策**: 移除独立 Header，将导航嵌入各页面
**理由**: 不同页面有不同的上下文需求，统一 Header 无法适配
**替代方案**: 保留 Header 但压缩高度 → 仍有功能重复问题

### 2. 导航模式
**决策**: 侧边栏保持 Logo + Nav + User，面包屑移至页面标题区
**理由**: 侧边栏已有导航功能，面包屑在 Sidebar 会显得拥挤

### 3. StepNavigator 嵌入
**决策**: StepNavigator 仅在 EditorView 顶部显示，与内容区无缝衔接
**理由**: 步骤导航仅编辑流程需要，其他页面无需展示

### 4. TaskStatusBar 处理
**决策**: 改为右下角悬浮通知或 Sidebar 底部状态指示
**理由**: 任务状态是辅助信息，不应占用主要内容区

### 5. 设计 Token 系统
**决策**: 使用 pencil-new.pen 中定义的 CSS 变量
```
颜色:
  --accent: #10b981 (emerald-500)
  --bg-app: #09090b (zinc-950)
  --bg-surface: #18181b (zinc-900)
  --bg-card: #18181b
  --bg-elevated: #27272a (zinc-800)
  --border: #3f3f46 (zinc-700)
  --text-primary: #f4f4f5 (zinc-100)
  --text-secondary: #a1a1aa (zinc-400)
  --text-muted: #52525b (zinc-600)

圆角:
  --radius-sm: 4px
  --radius-md: 8px
  --radius-lg: 12px
```

## Risks / Trade-offs

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 大范围重构可能引入 bug | 高 | 渐进式重构，每页面单独验证 |
| 用户习惯改变 | 中 | 保持核心交互不变，仅调整布局 |
| 设计稿与代码不同步 | 中 | 先完成设计稿，再逐页面实现 |

## Component Mapping

| 设计组件 ID | 设计组件名称 | 对应代码组件 |
|-------------|-------------|--------------|
| `3NQKV` | Component/Sidebar | Sidebar.tsx |
| `xhFwl` | Component/Button/Primary | Button (type="primary") |
| `UBB0z` | Component/Button/Secondary | Button (默认) |
| `PURyl` | Component/Button/Ghost | Button (type="text") |
| `JxN1m` | Component/Button/Icon | IconButton |
| `Y6UMe` | Component/Input | Input |
| `34jZa` | Component/ProjectCard | ProjectList 卡片 |
| `h3QVr` | Component/ShotCard | ShotCard.tsx |
| `CFVn7` | Component/TabBar | Segmented / Tabs |
| `zNMoh` | Component/Modal | Modal |
| `gmRUe` | Component/CharacterCard | CharacterCard |
| `aF9st` | Component/SceneCard | SceneCard |
| `wdgGa` | Component/StepNavigator | StepNavigator.tsx |
| `kmEgW` | Component/CreateProjectModal | CreateProjectModal.tsx |
| `oaMtn` | Component/TaskStatusBar | TaskStatusBar.tsx |
| `SC8v7` | Component/EpisodeItem | EpisodeManager 列表项 |
| `mOQ1F` | Component/CharacterDetailModal | CharacterDetailModal.tsx |

## Open Questions
- [ ] 是否需要支持 Light 主题？（当前仅 Dark）
- [ ] 任务状态栏是否需要展示历史任务？
