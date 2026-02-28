# Change: Refactor Electron egg core runtime

## Why
当前 Electron 运行时仍存在新旧架构并存、前后端职责交叉和 UI 入口分散的问题，导致维护成本和回归风险持续升高。需要一次性完成运行时核心切换，建立单一执行路径并收敛用户界面。

## What Changes
- **BREAKING** 一次性切换到 Electron egg 核心运行时（Main 负责核心执行，Renderer 仅负责 UI）。
- **BREAKING** 删除兼容层策略，不再保留旧 IPC/旧 Provider/旧设置结构的长期兼容分支。
- 将渲染端顶层导航收敛为核心三页：项目总览、创作工作台、系统设置。
- 统一 Provider 注册与加载入口为后端中心化注册表，前端仅消费受控配置与状态。
- 将存储结构迁移为单一新模型：迁移后不再回退或双写旧结构。

## Impact
- Affected specs:
  - `electron-integration`
  - `model-providers`
  - `storage`
- Affected code (expected):
  - `electron/src/main.ts`
  - `electron/src/controller/**`
  - `electron/src/ipc/**`
  - `electron/src/bootstrap/**`
  - `frontend/src/components/common/Sidebar.tsx`
  - `frontend/src/components/project/ProjectOverview.tsx`
  - `frontend/src/workflow/**`
  - `frontend/src/services/*Bridge.ts`
- Runtime impact:
  - 启动后执行一次性迁移并进入新运行时。
  - 不提供旧路径兜底，失败按结构化错误中止并提示修复。