## Context
Koma Studio 当前处于核心运行时切换期：目标是以 electron-egg 为底层统一框架，同时让前端在 IPC 改造期间保持可用。现有问题集中在：
1) 主进程装配路径尚未完全统一；
2) IPC 路由语义与前端桥接尚在收敛；
3) Sora2 依赖对 ITV 与创作流程形成不稳定点；
4) 主流程存在冗余操作和可恢复 bug。

## Goals / Non-Goals
### Goals
- 统一底层到 electron-egg runtime（main/lifecycle/controller/service）。
- 完成 IPC 路由收敛，并通过 preload 兼容层保持前端无感。
- 移除 Sora2 全链路依赖，建立非 Sora2 的 ITV 最小可用基线。
- 打通最小主流程：剧本→分镜→资产→渲染。
- 用自动化测试（Chrome DevTools MCP）给出可复验结论。

### Non-Goals
- 不新增新的业务页面与功能域。
- 不引入新的 ITV 供应商类型（仅在既有非 Sora2 选项中择优）。
- 不保留长期双轨兼容层。

## Decisions
- Decision: 以 preload 为前端稳定边界。
  - Rationale: 前端大量业务调用已绑定 `window.electronAPI`，集中在 preload 变更可最小化渲染层修改。
  - Alternative considered: 全量改前端 channel（拒绝，改动面大且回归成本高）。

- Decision: Sora2 从 provider、类型、UI、workflow 全链路移除。
  - Rationale: 当前目标是保证最小主流程稳定，移除高风险依赖可降低回归复杂度。

- Decision: IPC 路由统一后由后端维护单一路径，前端仅消费 typed bridge。
  - Rationale: 避免 domain:action 与 controller 路由长期并存，减少调试成本。

## Risks / Trade-offs
- 风险: IPC 切换阶段可能出现局部通道失配。
  - Mitigation: 建立调用点清单与分域回归（project/config/plugin/workflow/persistence 等）。

- 风险: 移除 Sora2 后用户预设配置失效。
  - Mitigation: 迁移时标记为无效并提示改选 Kling/Runway；不 silent fallback。

- 风险: 持久层迁移与运行时切换叠加导致启动失败。
  - Mitigation: 数据完整性门禁 + 结构化错误 + 明确修复指引。

## Migration Plan
1. 固化 OpenSpec 要求并完成 strict validate。
2. 后端先完成 runtime + IPC + provider/persistence 基线。
3. 前端执行 preload 适配与 Sora2 移除，收敛 UI 操作。
4. 评审全量改动并修复 critical 问题。
5. 使用 Chrome DevTools MCP 完成 E2E 与残留扫描，形成最终验收。

## Open Questions
- 事件通道命名在最终 cutover 前是否保持桥接别名（短期）还是一次性替换（长期）？
- 非 Sora2 的默认 ITV 选型是 Kling 还是 Runway（取决于现网稳定性）？
