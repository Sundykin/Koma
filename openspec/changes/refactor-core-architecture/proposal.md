# Change: Refactor Core Architecture

## Why
当前 Koma Studio 在持久化、插件、Agent/Chat、工作流、前端状态和 IPC 等核心层存在职责倒挂、重复实现和强耦合问题，导致功能演进成本高、可测试性差、故障定位困难。需要通过一次架构级重构建立清晰边界和统一抽象，为后续功能扩展与稳定性提升提供基础。

## What Changes
- 新增 `architecture-refactoring` 能力规格，定义 12 个核心能力重构目标与验收场景。
- 建立后端中心化执行原则：文件读写、Agent 调用、工作流调度、配置管理统一迁移到 Electron 主进程。
- 建立统一基础设施抽象：Persistence Layer + Repository、Event Bus、IPC Bridge、Provider Registry、Config System。
- 前端改为领域化状态管理与组件解耦：通过 hooks/store 获取状态，减少深层 props 传递。
- 规范领域类型系统：按领域拆分类型并引入 Zod 运行时验证与 shared-types 共享机制。
- 定义迁移和落地顺序（基础设施 → 核心引擎 → 前端解耦 → 收敛优化），确保渐进实施和可回滚。

## Impact
- Affected specs: `architecture-refactoring` (new)
- Likely touched code areas:
  - `electron/src/controller/**`
  - `electron/src/service/**`
  - `electron/src/ipc/**` (or equivalent IPC registration layer)
  - `frontend/src/store/**`
  - `frontend/src/components/**`
  - `frontend/src/providers/**`
  - `frontend/src/types/**`
  - `frontend/src/workflow/**`
  - `frontend/src/services/**`
- Cross-cutting risks:
  - IPC channel migration compatibility
  - 数据迁移一致性与缓存失效策略
  - 现有插件运行方式（全局注入）到沙箱通信模式的迁移成本
