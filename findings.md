# Findings & Decisions

## Requirements
- 按 9 个指定模块进行后端产品功能分析
- 每模块输出：一句话功能概述、产品级问题、可执行优化建议（P0/P1/P2）
- 最后给出跨模块产品优化 Top 5（按影响力排序）
- 语言：中文，偏产品架构分析，不是纯代码 review

## Research Findings
- 已确认需要遵循 OpenSpec 指南；本次属于分析与建议，不直接实施代码改造
- 已启用 planning-with-files 工作流并初始化本地记忆文件

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 输出聚焦“用户价值 + 稳定性 + 扩展性”三类问题 | 符合用户提出的产品级问题维度 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 暂无 | - |

## Resources
- `openspec/AGENTS.md`
- `.agents/skills/planning-with-files/SKILL.md`
- 待补充：目标模块代码路径

## Visual/Browser Findings
- 本任务不涉及浏览器视觉信息

## Research Findings (Round 1: 目录盘点)
- 目标模块文件结构齐全，且与用户给定范围一致。
- `electron/service/chat/` 包含 AgentGraph、AgentOrchestrator、AgentWorker、ChatService、SessionStore、MCP 子目录，具备多 Agent 编排与 MCP 接入基础。
- `electron/service/plugin/` 具备 runtime/bridge/sandbox/registries/capability，全链路插件执行框架已存在。
- `electron/service/provider/` 由 `manager.ts + instance-store.ts` 组成，偏实例生命周期与缓存管理。
- `electron/service/workflow/` 由 `orchestrator.ts + graph-dsl.ts + templates.ts` 组成，具备模板化工作流能力。
- 跨层编排由 `electron/controller/*.ts` 与 `electron/ipc/router.ts` 承担，事件机制由 `electron/ipc/eventBus.ts` 提供。

## Resources (Round 1)
- `electron/service/chat/*`
- `electron/service/plugin/*`
- `electron/service/provider/*`
- `electron/service/workflow/*`
- `electron/service/project.ts`
- `electron/service/persistence.ts`
- `electron/service/config/*`
- `electron/controller/*`
- `electron/ipc/*`

## Research Findings (Round 2: chat 模块深读)
- `ChatService` 支持 `single` 与 `orchestrated` 双模式；`orchestrated` 由 `AgentOrchestrator` 进行 Supervisor+Worker 任务分解。
- 会话在 `SessionStore` 里以内存保存，默认 30 分钟 TTL；存在单独 `chatHistoryPersist.ts` 文件能力，但未见在 `ChatService` 主流程中自动落盘。
- 工具源有两条路径：CapabilityRegistry（优先）与 MCP（外部+内部插件注册）回退，体现向能力注册统一收敛的方向。
- `AgentOrchestrator` 的任务规划依赖 LLM 返回 JSON；解析失败直接返回空任务，可能导致“用户请求被误判为无需分发”的静默失败。
- `AgentGraph` 流式输出对 AI 消息做 `<think>` 标签解析并分离 reasoning；这是可解释性能力基础，但无策略控制与审计分级。
- `MCPManager` 支持 stdio/sse/websocket/internal，具备自动发现工具/资源；但连接健康检查、自动重连、连接退化策略较弱。
- MCP 工具调用依赖按名称全局查找；命名空间冲突通过前缀缓解，但缺少“用户可见工具来源与权限提示”。

## Issues Encountered (Round 2)
| Issue | Resolution |
|-------|------------|
| `AgentOrchestrator.ts` 和 `MCPManager.ts` 首轮读取被截断 | 二次读取后半段补齐 |

## Research Findings (Round 3: plugin 模块深读)
- `pluginRuntime` 负责插件加载/激活/停用/卸载，后端 entry 统一在 Worker 沙箱中执行，生命周期状态可查询。
- 激活后会触发 `syncProviders + syncAllMCP`，说明插件能力会自动注入统一 Capability 层。
- `PluginHostApiBridge` 按 scope 校验权限（如 `network:external`、`spawn:process`、`mcp:*`、`agent:register`），具备基础权限闸门。
- `providerRegistry / mcpRegistry / agentRegistry` 都允许覆盖式注册（同名覆盖并警告），缺少强约束冲突治理策略（版本、优先级、租户隔离）。
- `pluginWorkerEntry` 中多个同步查询 API 在沙箱里直接抛错，仅保留异步调用；对插件开发者可用性有学习成本，且错误反馈偏运行时。
- `spawn.run` 在沙箱返回能力受限（无 stdout/stderr/kill 控制），容易造成“声明可用但行为不完整”的插件预期偏差。
- Capability 层已将 Provider/MCP Tool/Resource 抽象统一，支持标签解析；但当前解析逻辑是“标签任一匹配”，缺少权重/置信度/策略排序。

## Resources (Round 3)
- `electron/service/plugin/runtime.ts`
- `electron/service/plugin/bridge.ts`
- `electron/service/plugin/sandbox/workerHost.ts`
- `electron/service/plugin/sandbox/hostApiBridge.ts`
- `electron/service/plugin/sandbox/pluginWorkerEntry.ts`
- `electron/service/plugin/registries/*`
- `electron/service/plugin/capability/*`

## Research Findings (Round 4: provider/workflow/project/persistence/config)
- `provider/instance-store` 使用 SQLite + `safeStorage` 对 secret 字段加密，支持默认实例与按类型实例管理。
- `provider/manager` 提供实例缓存与按 kind 获取默认 Provider，但缓存键仅按 instanceId，配置更新后是否强制失效依赖调用方显式 clear。
- `workflow/orchestrator` 已支持 DAG 并行执行、暂停/恢复/取消、HITL 审批节点（requireApproval），但节点失败补偿与重试策略缺失。
- `workflow/templates` 内置“漫剧生产流水线”模板，形成剧本->分镜->资产->渲染标准路径。
- `projectService` 负责项目目录结构、索引、导入导出，索引与元数据双写；存在一致性依赖（meta/index/recentProjects 分散更新）。
- `persistenceService` 是基于 JSON 文件仓储 + 内存缓存 + 50ms 写入合并队列，提供批量保存回滚快照。
- `config` 模块化设计完整（registry+module+migration），但敏感配置（如 `app-settings` 中 apiKey）仍是普通 JSON 持久化，未统一加密。
- `storagePathLoader` 与 `projectService.init` 都会管理 `.koma` 路径，存在“路径初始化职责分散”风险。

## Issues Encountered (Round 4)
| Issue | Resolution |
|-------|------------|
| `persistence.ts` 首轮读取截断 | 追加读取后半段确认写队列与回滚逻辑 |

## Research Findings (Round 5: controller/ipc + init)
- `ipc/router.ts` 已收敛为统一 `rpc:invoke` 入口 + `event:*` 订阅操作，返回统一 envelope（ok/data/error）。
- `ChatController.sendMessageStream` 使用主进程异步推送 `chat:stream:*` 事件到 renderer，属于“请求-事件分离”模式。
- `WorkflowController` 将多个节点 handler 委托到 renderer 执行（`workflow:delegate`），主进程等待回传；这让工作流执行依赖窗口在线与前端响应。
- `preload/init.ts` 在主窗口创建前并行初始化 project/ffmpeg/plugin/chat，`lifecycle/windowReady` 才绑定 workflow window。
- `PluginController`、`ConfigController`、`ProjectController`、`PersistenceController` 均是轻薄转发层，业务规则基本在 service。
- `chatController` 存在未使用字段（`orchestrators`）和部分兼容接口（MCP methods），说明正在经历接口演进期。
- `router` 当前未实现 IPC 调用限流/幂等请求 ID/审计钩子，复杂任务下可能造成事件风暴与排障成本上升。

## Technical Decisions (Update)
| Decision | Rationale |
|----------|-----------|
| 将初始化时序（preload + lifecycle）纳入分析 | 许多稳定性与体验问题来自模块间启停顺序，而非单模块代码 |

