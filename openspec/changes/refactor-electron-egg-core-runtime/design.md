## Context
当前代码同时存在旧运行时路径与新 egg-core 架构落地，导致 IPC、Provider、存储和 UI 入口存在重复定义。该变更定义一次性切换策略，直接以新核心运行时为唯一真相，避免长期维护双轨系统。

## Goals / Non-Goals
### Goals
- 完成 Electron egg-core runtime 的一次性切换。
- 取消兼容层与双轨执行，建立单一调用链。
- 将用户顶层操作入口收敛到核心三页。
- 保证主流程在新运行时可验证、可回归。

### Non-Goals
- 不新增第四个核心页面或过渡页。
- 不保留旧 IPC/provide/storage 的长期兼容开关。
- 不在本提案内扩展新的业务能力。

## Decisions
- Decision: 采用一次性 cutover（single cutover）而非灰度双轨。
  - Rationale: 双轨会持续放大维护成本，并掩盖真实边界问题。
  - Alternative considered: 保留兼容层逐步迁移（拒绝，复杂度高且回收困难）。

- Decision: Provider 注册表以后端为唯一实现。
  - Rationale: 统一健康检查、错误处理和鉴权上下文，减少前后端重复。

- Decision: 存储采用一次性迁移后只写新结构。
  - Rationale: 杜绝双写分叉和历史格式污染，降低数据一致性风险。

- Decision: UI 顶层仅保留三页（项目总览、创作工作台、系统设置）。
  - Rationale: 核心路径清晰，减少运行时状态分散与路由维护面。

## Risks / Trade-offs
- 风险: 无兼容层意味着迁移失败会直接阻断启动。
  - Mitigation: 迁移前校验 + 结构化错误 + 明确人工修复提示。
- 风险: 导航收敛可能影响原有入口习惯。
  - Mitigation: 将非核心能力下沉为三页内二级入口，不再作为顶层路由。

## Migration Plan
1. 启动阶段执行存储与配置一次性迁移；失败即终止并返回错误。
2. 注册新 IPC router 与 controller，移除旧 channel 分发。
3. 完成 Provider Registry 后端接管并删除兼容映射。
4. 切换前端主导航为三页壳层并校验主流程。
5. 全量回归通过后，清理 legacy runtime 代码路径。

## Open Questions
- 三页内的二级入口组织是否采用统一 tab 规范（不影响本次三页约束）。