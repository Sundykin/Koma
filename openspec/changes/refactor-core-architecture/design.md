## Context
Koma 当前核心架构在多处出现职责重叠与边界反转：前端直接文件 I/O、后端工作流依赖前端执行、插件生命周期分散在多个模块、Agent 逻辑前后端重复实现。这些问题导致：
- 状态来源不唯一，出现数据一致性风险
- UI 与业务逻辑耦合，组件演进成本高
- 测试粒度粗，难以在模块边界做单测和集成测试
- 新能力（新 Provider、新工作流节点）扩展需要跨层改动

本次设计聚焦“架构基线重建”，不是单点功能增强。

## Goals / Non-Goals
### Goals
- 建立后端中心化的核心执行层（Persistence/Agent/Workflow/Config）。
- 建立统一跨模块通信机制（类型安全 Event Bus + IPC Bridge）。
- 建立领域化类型与状态模型，降低前端组件耦合。
- 在不一次性推翻现有代码的前提下，提供可分阶段迁移路径。

### Non-Goals
- 不在本提案阶段替换所有现有 UI 组件或重写全部业务流程。
- 不强制引入新的远程后端服务（保持 Electron 本地架构）。
- 不定义具体第三方库绑定（如固定某个事件库实现），只约束能力与接口行为。

## Key Decisions
### 1) 后端中心化执行
- Decision: 文件系统访问、LLM 调用、工作流节点执行、配置落盘全部收敛到 Electron 主进程。
- Rationale: 主进程天然适合 I/O 与长期任务调度，便于统一错误处理和资源治理。
- Alternative considered:
  - 保持前后端混合执行：短期改动小，但长期边界持续恶化。

### 2) Persistence Layer + Repository 统一抽象
- Decision: 每个领域实体（Project/Episode/Shot/Character/Scene/Prop/Timeline/Asset）提供独立 Repository，前端仅通过 IPC 请求。
- Rationale: 统一 CRUD 语义、缓存策略、迁移策略和事务边界。
- Trade-off: 初期需要梳理并迁移分散的数据读写入口。

### 3) 插件运行沙箱化
- Decision: 前端插件从 `window.__KOMA_PLUGIN_xxx__` 全局注入迁移到 Worker/iframe 沙箱，通信通过 MessageChannel + 权限声明。
- Rationale: 隔离异常与权限，降低插件对主应用稳定性的影响。
- Trade-off: 插件 API 需要标准化，旧插件存在适配工作。

### 4) Agent System 后端单一实现
- Decision: Adapter、工具注册、多 Agent 编排、会话持久化统一在后端；前端仅渲染和交互。
- Rationale: 消除 chat 模块重复逻辑，统一上下文压缩、重试、工具调用审计。

### 5) Workflow Engine 真后端编排
- Decision: DAG 调度、并行执行、重试、HITL 门控、状态持久化全部在后端完成；前端仅消费事件。
- Rationale: 修复“后端编排但前端执行”架构倒挂问题。

### 6) Event Bus 作为模块解耦主通道
- Decision: 统一事件命名 `domain:action`，支持跨进程桥接、once 和通配符监听。
- Rationale: 减少模块直接依赖，支持插件/工作流/状态同步统一事件源。

### 7) 前端状态按领域拆分
- Decision: Zustand store 按领域拆分，并将 UI 临时状态与业务状态分离。
- Rationale: 降低 props drilling，提升组件可复用和性能可控性。

### 8) 类型系统领域化 + 运行时校验
- Decision: 拆分单体 `types.ts`，采用 Zod schema 推导 TS 类型，并在系统边界做入站校验。
- Rationale: 减少“编译时通过、运行时脏数据”问题。

### 9) IPC 类型安全 RPC 化
- Decision: 统一 IPC 通道命名与错误对象模型，支持请求超时与双向流。
- Rationale: 提升跨进程接口可维护性与调试效率。

## Architecture Outline
### Runtime Responsibility Split
- Main Process:
  - Repository 持久化/缓存/迁移
  - Agent 调用与会话管理
  - Workflow DAG 调度与状态机
  - ConfigRegistry 与 ProviderRegistry
  - IPC Controller
- Renderer Process:
  - 组件渲染
  - 用户输入
  - 订阅事件并更新 store
  - 发起类型安全 RPC 调用

### Data & Event Flow
1. UI 触发业务动作 → 调用 IPC client
2. Main Controller 调用对应 Service/Repository
3. Service 执行并发布 `domain:action` 事件
4. IPC Bridge 转发关键事件到前端
5. 前端 store 订阅后更新，驱动 UI 重渲染

## Migration Plan
### Phase 1: 基础设施层
- 建立 Event Bus、IPC 规范、Repository 接口抽象、结构化错误模型。

### Phase 2: 核心执行层迁移
- 迁移 Persistence/Config/Provider 到后端统一入口。
- 迁移 Agent 与 Workflow 的执行逻辑到后端。

### Phase 3: 前端解耦
- 领域化 Zustand store 改造。
- Storyboard 等高耦合组件减少深层 props，改为 hooks + selector。

### Phase 4: 收敛与优化
- 类型拆分 + Zod 校验全面落地。
- 补齐缓存、重试、事务与恢复机制测试。

## Risks / Trade-offs
- 大规模迁移期间可能出现 IPC 接口不兼容。
  - Mitigation: 引入版本化接口或兼容层，并提供迁移检查脚本。
- 工作流和 Agent 迁移会暴露隐藏依赖。
  - Mitigation: 先为关键流程补充黑盒回归用例，再分阶段切换。
- 插件沙箱化可能影响历史插件可用性。
  - Mitigation: 提供旧 API 兼容窗口与迁移文档。

## Validation Strategy
- Spec 层：`openspec validate refactor-core-architecture --strict`
- 测试层（实施阶段）：
  - Repository 往返一致性测试
  - IPC contract 测试（类型/错误/超时/流式）
  - Workflow 状态恢复与重试测试
  - 前端 store selector 渲染次数回归测试
