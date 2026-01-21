## Context

当前 frontend 代码存在以下问题：
- `App.tsx` 约 900 行，包含状态管理、UI 渲染、事件处理等所有逻辑
- `components/` 目录有 45+ 组件平铺，难以快速定位
- `ProjectList.tsx` 界面元素过多，封面图占用大量空间

## Goals / Non-Goals

### Goals
- 提升代码可维护性和可读性
- 简化项目列表视觉效果，减少空间占用
- 保持所有现有功能和样式不变

### Non-Goals
- 不改变业务逻辑
- 不引入新的状态管理方案
- 不改变组件的 props 接口（除非必要）

## Decisions

### 1. App.tsx 拆分策略

拆分为以下组件：

```
App.tsx (主入口, ~100行)
├── hooks/useAppState.ts (状态逻辑)
├── common/Sidebar.tsx (~100行)
├── common/Header.tsx (~80行)
└── editor/EditorView.tsx (~300行)
    ├── ScriptEditorPanel
    ├── AssetsPanel
    ├── StoryboardPanel
    └── VideoPanel
```

### 2. Components 目录结构

```
components/
├── common/           # 公共组件
│   ├── Sidebar.tsx
│   ├── Header.tsx
│   ├── WindowControls.tsx
│   ├── TaskStatusBar.tsx
│   ├── StepNavigator.tsx
│   ├── SaveStatusIndicator.tsx
│   └── index.ts
├── project/          # 项目管理
│   ├── ProjectList.tsx
│   ├── ProjectOverview.tsx
│   ├── CreateProjectModal.tsx
│   ├── ProjectSettingsModal.tsx
│   ├── EpisodeManager.tsx
│   ├── EpisodeSplitWizard.tsx
│   └── index.ts
├── asset/            # 资产管理
│   ├── AssetManager.tsx
│   ├── CharacterDetailModal.tsx
│   ├── CreateCharacterModal.tsx
│   ├── SceneAssetEditor.tsx
│   ├── PropAssetEditor.tsx
│   ├── ReferenceImagePicker.tsx
│   ├── ImageCardGrid.tsx
│   ├── VideoCardGrid.tsx
│   ├── VideoVersionList.tsx
│   └── index.ts
├── storyboard/       # 分镜
│   ├── Storyboard.tsx
│   ├── ShotListEditor.tsx
│   └── index.ts
├── settings/         # 设置
│   ├── SettingsPage.tsx
│   ├── LLMConfigManager.tsx
│   ├── TTIConfigManager.tsx
│   ├── ITVConfigManager.tsx
│   ├── TTSConfigManager.tsx
│   ├── VisualStyleManager.tsx
│   ├── ThemeSelector.tsx
│   └── index.ts
└── editor/           # 编辑器 (已存在)
    └── ...
```

### 3. ProjectList 简化设计

**Before**: 卡片带封面图 + 大标题
**After**:
- 紧凑头部：标题 | 搜索框 | 筛选器 | [新建按钮]
- 无封面卡片：状态标签 + 标题 + 类型 + 时间

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| 重构过程中遗漏 import | 使用 IDE 重构功能，逐步验证 |
| 样式变化 | 保留原有 className，不修改 CSS |

## Migration Plan

1. 先完成 UI 优化（不涉及文件移动）
2. 创建目录结构，逐个移动组件
3. 每移动一批组件后验证应用正常
4. 最后拆分 App.tsx

## Open Questions

- 无
