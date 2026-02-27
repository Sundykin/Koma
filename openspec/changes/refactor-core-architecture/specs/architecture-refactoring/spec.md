## ADDED Requirements

### Requirement: Unified Persistence Layer
系统 SHALL 提供统一的持久化层与 Repository 抽象，作为所有领域数据读写的唯一入口。

#### Scenario: Repository contract and entity coverage
- **WHEN** 开发者访问核心领域数据
- **THEN** 系统提供 `find`、`findById`、`save`、`delete`、`list` 统一接口
- **AND** 为 Project、Episode、Shot、Character、Scene、Prop、Timeline、Asset 提供独立 Repository 实现

#### Scenario: Backend-only file I/O via IPC
- **WHEN** 渲染进程请求数据读写
- **THEN** 通过 IPC 调用主进程 Repository
- **AND** 渲染进程不直接执行文件系统 I/O

#### Scenario: Cache, write queue, migration and structured errors
- **WHEN** 发生读取请求
- **THEN** 持久化层先检查缓存并在未命中时加载并回填缓存
- **AND** 保存操作通过写入队列合并防抖
- **AND** 检测到旧版本数据时自动执行迁移
- **AND** 读写失败时返回包含错误类型与恢复建议的结构化错误

#### Scenario: Transactional batch consistency
- **WHEN** 批量保存多个实体
- **THEN** 操作保证原子性（全部成功或全部回滚）
- **AND** 对有效实体执行保存后再加载应保持往返一致性

### Requirement: Sandboxed Plugin Runtime and Host
系统 SHALL 提供沙箱化插件运行时与统一宿主管理，替代全局变量注入方式。

#### Scenario: Sandboxed loading and message-based host communication
- **WHEN** 加载前端插件
- **THEN** 通过 Web Worker 或 iframe 沙箱运行插件代码
- **AND** 插件通过 MessageChannel 与宿主通信
- **AND** 插件不直接访问 `window` 全局对象

#### Scenario: Unified lifecycle and scope-based permission
- **WHEN** 插件从安装到卸载
- **THEN** 生命周期遵循 `install` → `validate` → `activate` → `running` → `deactivate` → `uninstall`
- **AND** 激活阶段按声明 scopes 验证并授予最小权限

#### Scenario: Fault isolation, plugin communication, and install validation
- **WHEN** 插件抛出未捕获异常
- **THEN** 运行时隔离异常并将插件状态标记为 `error`
- **AND** 主应用持续可用
- **AND** 插件可通过 Event Bus 进行发布/订阅通信
- **AND** 插件签名或 manifest 校验失败时拒绝安装并返回原因

### Requirement: Backend-Centered Agent System
系统 SHALL 将 Agent/Chat 核心执行统一在主进程，前端仅负责 UI 与交互。

#### Scenario: Unified backend adapters and streaming response
- **WHEN** 用户发送消息
- **THEN** 主进程使用统一 Adapter 接口调用 OpenAI、Claude、Gemini 等模型
- **AND** 以流式方式逐 token 推送响应到前端

#### Scenario: Tool registry, orchestration, and session persistence
- **WHEN** Agent 需要执行工具或编排任务
- **THEN** 通过统一工具注册表执行 MCP 或内置工具
- **AND** 支持串行、并行、条件分支多 Agent 编排
- **AND** 对话历史按会话 ID 持久化与加载

#### Scenario: Context compression, retry, and conversation branching
- **WHEN** 历史消息超过上下文限制
- **THEN** 自动执行摘要或滑动窗口压缩策略
- **AND** LLM 调用失败时执行指数退避重试（最多 3 次）
- **AND** 用户从历史重新生成时创建对话分支

### Requirement: Backend Workflow Engine
系统 SHALL 提供后端统一工作流引擎，负责 DAG 调度、执行、恢复与状态管理。

#### Scenario: DAG scheduling and parallel execution
- **WHEN** 工作流启动
- **THEN** 引擎执行拓扑排序并识别可并行节点
- **AND** 在后端调度节点执行
- **AND** 前端仅接收进度事件与结果

#### Scenario: HITL gate, retry policy, and state recovery
- **WHEN** 执行到 HITL 门控节点
- **THEN** 工作流暂停并通知前端等待审批
- **AND** 节点失败按配置重试策略（支持指数退避）
- **AND** 应用重启后可恢复未完成工作流继续执行

#### Scenario: Cancellation, template reuse, and sub-workflow
- **WHEN** 用户取消工作流
- **THEN** 引擎优雅终止运行节点并释放资源
- **AND** 支持保存与复用工作流模板
- **AND** 支持子工作流作为节点嵌套执行

### Requirement: Typed Cross-Process Event Bus
系统 SHALL 提供类型安全事件总线，支持模块解耦与跨进程事件传递。

#### Scenario: Type-safe publish/subscribe with namespace
- **WHEN** 模块发布或订阅事件
- **THEN** 事件遵循 `domain:action` 命名空间
- **AND** 每个事件绑定明确 payload 类型

#### Scenario: Cross-process forwarding and listener resilience
- **WHEN** 前后端任一侧发布事件
- **THEN** 事件可自动跨进程转发到另一侧订阅者
- **AND** 某监听器异常不影响其他监听器执行

#### Scenario: once/wildcard and lifecycle cleanup
- **WHEN** 使用一次性监听或通配符监听
- **THEN** 事件总线支持 `once` 与 `domain:*`
- **AND** 模块销毁时自动清理其监听器防止泄漏

### Requirement: Domain-Oriented Frontend State Management
系统 SHALL 采用按领域拆分的状态管理，并将 UI 临时状态与业务状态分离。

#### Scenario: Domain stores and hook-based access
- **WHEN** 前端组件访问业务数据
- **THEN** 通过 `projectStore`、`episodeStore`、`shotStore`、`assetStore`、`settingsStore`、`uiStore` 等领域 store 及 hooks 获取状态
- **AND** 减少深层 props 传递

#### Scenario: Event-driven sync and selector rendering control
- **WHEN** 后端数据发生变更
- **THEN** 前端通过 Event Bus 接收通知并更新对应 store
- **AND** 组件通过 selector 仅订阅必要状态片段以减少不必要重渲染

#### Scenario: UI transient cleanup
- **WHEN** 组件卸载
- **THEN** 清理与该组件相关的临时 UI 订阅状态
- **AND** 保留业务数据状态

### Requirement: Domain Model and Runtime Validation
系统 SHALL 按领域拆分类型模型并引入运行时校验，保持前后端类型一致。

#### Scenario: Domain type decomposition and shared package
- **WHEN** 定义核心实体类型
- **THEN** 将单体类型拆分为 project、episode、shot、character、scene、prop、timeline、asset、settings 等领域模块
- **AND** 建立 `shared-types` 供前后端共享

#### Scenario: Schema-first typing and boundary validation
- **WHEN** 外部数据（文件/API）进入系统边界
- **THEN** 使用 Zod schema 进行运行时验证
- **AND** 从 schema 推导 TypeScript 类型保持一致性
- **AND** 拒绝不合法输入数据

### Requirement: Type-Safe IPC Bridge
系统 SHALL 提供类型安全 IPC RPC 层，统一命名、错误模型、流式能力与超时控制。

#### Scenario: Typed RPC and naming convention
- **WHEN** 渲染进程调用主进程能力
- **THEN** 调用端获得完整参数与返回值类型提示
- **AND** IPC 通道统一为 `domain:action` 命名

#### Scenario: Structured error and timeout handling
- **WHEN** IPC 调用失败或超时
- **THEN** 返回结构化错误对象（错误码、消息、堆栈）
- **AND** 超过配置超时时间自动取消并返回超时错误

#### Scenario: Bidirectional stream and client generation
- **WHEN** 后端需要持续推送数据（如 AI 流、工作流进度）
- **THEN** IPC 支持双向流式通信
- **AND** 可基于后端 controller 自动生成类型安全前端 client

### Requirement: Storyboard and Frontend Component Decoupling
系统 SHALL 优化高耦合组件，提升交互流畅性与可维护性。

#### Scenario: Storyboard callback reduction via store hooks
- **WHEN** 渲染 Storyboard 组件
- **THEN** 组件通过 hooks/store 直接获取状态
- **AND** 回调 props 数量减少到 10 个以内

#### Scenario: Route-level code splitting and virtualized list
- **WHEN** 加载前端路由
- **THEN** 使用 React.lazy + Suspense 实现路由级代码分割
- **AND** 大列表在项数超过 50 时使用虚拟滚动仅渲染可视区域

#### Scenario: Optimistic update and reusable UI patterns
- **WHEN** 用户在分镜编辑器修改数据
- **THEN** 先执行 UI 乐观更新再异步持久化
- **AND** 通用确认弹窗、加载态、错误边界抽象为可复用模式

### Requirement: Unified Design Token and Theme System
系统 SHALL 提供统一设计令牌与主题机制，保证视觉一致性与可扩展性。

#### Scenario: Token-based styling and theme switching
- **WHEN** 组件定义样式
- **THEN** 使用 Design Token（颜色、间距、圆角、阴影、字体）而非硬编码值
- **AND** 支持亮色/暗色主题切换并全局同步生效

#### Scenario: Styling strategy and responsive layout
- **WHEN** 实施样式系统
- **THEN** 统一为 CSS Modules + Tailwind 组合方案
- **AND** 在窗口尺寸变化时执行响应式布局调整

#### Scenario: Custom theme persistence
- **WHEN** 用户自定义主题预设
- **THEN** 系统持久化 token 值
- **AND** 下次启动自动恢复应用

### Requirement: Unified Backend Config System
系统 SHALL 统一配置管理至后端并支持验证、迁移、监听及导入导出。

#### Scenario: Backend config registry and schema validation
- **WHEN** 前端读写配置
- **THEN** 通过 IPC 调用后端 ConfigRegistry
- **AND** 写入前按模块 schema 校验，非法值拒绝写入并返回验证错误

#### Scenario: Change notification and portability
- **WHEN** 配置项变更
- **THEN** 通过 Event Bus 通知订阅者
- **AND** 支持全部配置 JSON 导入与导出

#### Scenario: Corruption fallback
- **WHEN** 配置文件损坏或无法解析
- **THEN** 系统自动回退默认配置
- **AND** 记录告警日志

### Requirement: Unified Provider Registry
系统 SHALL 统一 Provider 注册与运行治理，支持健康检查、故障转移与动态扩展。

#### Scenario: Unified registry and health check
- **WHEN** 管理 TTI/ITV/TTS Provider
- **THEN** 前后端使用统一 Provider Registry 而非重复实现
- **AND** 配置后自动执行健康检查并返回结果

#### Scenario: Priority and failover
- **WHEN** 首选 Provider 不可用
- **THEN** 按优先级自动切换到备选 Provider
- **AND** 不中断当前业务流程

#### Scenario: Plugin-driven provider form and telemetry
- **WHEN** 插件注册新 Provider
- **THEN** 设置界面基于 `configSchema` 自动生成配置表单
- **AND** 系统记录调用统计（成功率、延迟、错误分布）供用户参考
