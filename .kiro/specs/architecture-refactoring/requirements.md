# 需求文档：Koma 底层架构重构

## 简介

本文档定义了 Koma 项目底层架构的全面重构需求。当前项目存在以下核心问题：

1. **持久化系统**：前端直接通过 `electronService` 进行文件 I/O，缺乏统一的数据访问层，前后端持久化逻辑分散（前端 `store/project/` 直接拼路径读写 JSON，后端 `ConfigRegistry` 用 JsonStore）
2. **插件系统**：前端插件通过全局变量 `window.__KOMA_PLUGIN_xxx__` 加载，缺乏模块隔离；前后端插件生命周期管理分散在 `pluginStore`、`PluginService`、`PluginInitializer` 等多处
3. **Agent/Chat 系统**：前端 `chat/` 模块和后端 `service/chat/` 存在功能重叠，Adapter 模式与 LangChain 集成混用，职责边界不清
4. **工作流系统**：后端 `WorkflowOrchestrator` 通过 IPC 委托前端执行实际逻辑，架构倒挂
5. **前端组件**：大量组件 props 传递过深（如 `Storyboard` 组件 30+ 个回调），状态管理与 UI 耦合严重
6. **类型系统**：核心类型定义集中在单一 `types.ts` 文件（600+ 行），缺乏领域划分

重构目标是参考 Komarefactoring 项目的设计模式，实现彻底的关注点分离和模块解耦。

## 术语表

- **Persistence_Layer**：统一数据持久化层，负责所有数据的读写、缓存和迁移
- **Repository**：数据仓库接口，为每个领域实体提供 CRUD 操作的抽象
- **Plugin_Runtime**：插件运行时环境，管理插件的加载、沙箱隔离和生命周期
- **Plugin_Host**：插件宿主，提供插件与主应用之间的通信桥梁
- **Agent_System**：AI Agent 系统，管理对话会话、工具调用和多 Agent 编排
- **Workflow_Engine**：工作流引擎，负责 DAG 节点的调度、执行和状态管理
- **Event_Bus**：事件总线，提供模块间松耦合的事件通信机制
- **Provider_Registry**：Provider 注册表，统一管理 TTI/ITV/TTS 等服务提供者
- **Config_System**：配置系统，管理应用配置的注册、验证、迁移和持久化
- **IPC_Bridge**：进程间通信桥梁，连接 Electron 主进程和渲染进程
- **Domain_Model**：领域模型，按业务领域划分的类型定义和数据结构
- **Component_Store**：组件级状态管理，将 UI 状态与业务逻辑分离

## 需求

### 需求 1：统一持久化层重构

**用户故事：** 作为开发者，我希望所有数据读写通过统一的持久化层进行，以便实现数据访问的一致性、可测试性和未来存储后端的可替换性。

#### 验收标准

1. THE Persistence_Layer SHALL 提供统一的 Repository 接口，包含 `find`、`findById`、`save`、`delete`、`list` 方法，供所有领域实体使用
2. THE Persistence_Layer SHALL 将所有文件系统操作封装在后端（Electron 主进程），前端通过 IPC_Bridge 调用 Repository 接口而非直接操作文件系统
3. WHEN 前端请求数据时，THE Persistence_Layer SHALL 先检查内存缓存，缓存命中时直接返回缓存数据
4. WHEN 缓存未命中时，THE Persistence_Layer SHALL 通过 IPC 从后端加载数据并更新缓存
5. THE Persistence_Layer SHALL 为每个领域实体（Project、Episode、Shot、Character、Scene、Prop、Timeline、Asset）提供独立的 Repository 实现
6. WHEN 数据保存操作发生时，THE Persistence_Layer SHALL 使用写入队列进行防抖合并，避免频繁磁盘 I/O
7. THE Persistence_Layer SHALL 支持数据版本迁移，WHEN 检测到旧版本数据格式时自动执行迁移脚本
8. IF 文件读写操作失败，THEN THE Persistence_Layer SHALL 记录错误日志并返回结构化错误信息，包含错误类型和恢复建议
9. THE Persistence_Layer SHALL 提供事务性批量操作接口，WHEN 批量保存多个实体时保证原子性（全部成功或全部回滚）
10. FOR ALL 有效的领域实体对象，保存后再加载 SHALL 产生与原始对象等价的数据（往返一致性）

### 需求 2：插件系统重构

**用户故事：** 作为插件开发者，我希望插件系统提供清晰的生命周期管理、安全的沙箱隔离和标准化的 API，以便开发稳定可靠的插件。

#### 验收标准

1. THE Plugin_Runtime SHALL 使用 Web Worker 或 iframe 沙箱加载前端插件代码，替代当前的全局变量注入方式
2. THE Plugin_Host SHALL 提供统一的消息通道（MessageChannel），插件通过消息传递与主应用通信，而非直接访问 `window` 对象
3. THE Plugin_Runtime SHALL 管理插件的完整生命周期：`install` → `validate` → `activate` → `running` → `deactivate` → `uninstall`
4. WHEN 插件激活时，THE Plugin_Runtime SHALL 验证插件声明的权限范围（scopes），仅授予已声明的 API 访问权限
5. THE Plugin_Host SHALL 将插件状态管理统一到单一模块，合并当前分散在 `pluginStore`、`PluginService`、`PluginInitializer` 中的逻辑
6. WHEN 插件运行时抛出未捕获异常，THE Plugin_Runtime SHALL 隔离该异常，记录错误日志，并将插件状态标记为 `error`，主应用继续正常运行
7. THE Plugin_Host SHALL 提供插件间通信机制，允许插件通过 Event_Bus 发布和订阅事件
8. THE Plugin_Runtime SHALL 支持插件热重载，WHEN 开发模式下插件代码变更时自动重新加载插件而无需重启应用
9. IF 插件安装包校验失败（签名不匹配或 manifest 格式错误），THEN THE Plugin_Runtime SHALL 拒绝安装并返回具体的校验失败原因
10. THE Plugin_Host SHALL 提供标准化的 Provider 注册接口，插件通过声明式配置注册 TTI/ITV/TTS Provider，替代当前的命令式注册方式

### 需求 3：Agent/Chat 系统重构

**用户故事：** 作为用户，我希望 AI 对话系统响应快速、支持多种模型、具备工具调用能力，并且对话历史可靠持久化。

#### 验收标准

1. THE Agent_System SHALL 将所有 LLM 交互逻辑统一到后端（Electron 主进程），前端仅负责 UI 渲染和用户交互
2. THE Agent_System SHALL 提供统一的 Adapter 接口，支持 OpenAI、Claude、Gemini 等模型的无缝切换，Adapter 实现仅存在于后端
3. WHEN 用户发送消息时，THE Agent_System SHALL 通过流式传输（SSE/Stream）将响应逐 token 推送到前端
4. THE Agent_System SHALL 支持多 Agent 编排模式，包括串行执行、并行执行和条件分支
5. WHEN Agent 需要调用工具时，THE Agent_System SHALL 通过统一的工具注册表查找并执行工具，支持 MCP 协议和内置工具
6. THE Agent_System SHALL 将对话历史持久化到本地存储，支持按会话 ID 加载历史记录
7. WHEN 对话历史超过模型上下文窗口限制时，THE Agent_System SHALL 自动执行上下文压缩策略（摘要或滑动窗口）
8. IF LLM API 调用失败（网络错误或速率限制），THEN THE Agent_System SHALL 执行指数退避重试，最多重试 3 次
9. THE Agent_System SHALL 支持对话分支，WHEN 用户选择从历史消息重新生成时创建新的对话分支
10. THE Agent_System SHALL 提供 Agent 能力声明机制，每个 Agent 声明其可用工具、系统提示词和适用场景

### 需求 4：工作流引擎重构

**用户故事：** 作为用户，我希望自动化工作流（剧本分析→分镜生成→素材生成→渲染）在后端可靠执行，支持暂停恢复和错误重试。

#### 验收标准

1. THE Workflow_Engine SHALL 将所有节点执行逻辑迁移到后端，前端仅通过 IPC 接收进度事件和最终结果
2. THE Workflow_Engine SHALL 支持 DAG（有向无环图）定义，节点之间通过声明式依赖关系连接
3. WHEN 工作流启动时，THE Workflow_Engine SHALL 执行拓扑排序，自动识别可并行执行的节点并并行调度
4. THE Workflow_Engine SHALL 支持 HITL（Human-in-the-Loop）门控节点，WHEN 到达门控节点时暂停执行并通知前端等待用户审批
5. WHEN 节点执行失败时，THE Workflow_Engine SHALL 根据节点配置的重试策略自动重试，支持指数退避
6. THE Workflow_Engine SHALL 持久化工作流运行状态，WHEN 应用重启后能恢复未完成的工作流继续执行
7. THE Workflow_Engine SHALL 支持工作流模板，用户可保存和复用自定义工作流配置
8. WHEN 工作流执行过程中，THE Workflow_Engine SHALL 通过 Event_Bus 实时推送节点状态变更事件（pending → running → completed/failed）
9. IF 用户取消工作流，THEN THE Workflow_Engine SHALL 优雅终止所有正在执行的节点，释放相关资源
10. THE Workflow_Engine SHALL 支持子工作流嵌套，允许将一个工作流作为另一个工作流的节点

### 需求 5：事件总线与模块通信

**用户故事：** 作为开发者，我希望模块之间通过事件总线进行松耦合通信，以便减少模块间的直接依赖。

#### 验收标准

1. THE Event_Bus SHALL 提供类型安全的事件发布/订阅接口，每个事件类型对应明确的 payload 类型定义
2. THE Event_Bus SHALL 支持跨进程事件传递，后端发布的事件能自动转发到前端，反之亦然
3. WHEN 事件监听器抛出异常时，THE Event_Bus SHALL 捕获异常并记录日志，不影响其他监听器的执行
4. THE Event_Bus SHALL 支持事件命名空间，格式为 `domain:action`（如 `project:saved`、`plugin:activated`）
5. THE Event_Bus SHALL 支持一次性监听（`once`）和通配符监听（`domain:*`）
6. WHEN 模块销毁时，THE Event_Bus SHALL 自动清理该模块注册的所有监听器，防止内存泄漏

### 需求 6：前端状态管理重构

**用户故事：** 作为开发者，我希望前端状态管理按领域划分，组件通过 hooks 访问状态，以便减少 props 传递层级和组件耦合。

#### 验收标准

1. THE Component_Store SHALL 按领域划分独立的 Zustand store：`projectStore`、`episodeStore`、`shotStore`、`assetStore`、`settingsStore`、`uiStore`
2. THE Component_Store SHALL 为每个 store 提供对应的 React hooks（如 `useProjectStore`、`useShotStore`），组件直接通过 hooks 访问状态而非 props 传递
3. WHEN 后端数据变更时，THE Component_Store SHALL 通过 Event_Bus 接收变更通知并自动更新对应的 store
4. THE Component_Store SHALL 将 UI 临时状态（如 modal 开关、选中项）与业务数据状态分离到不同的 store
5. WHEN 组件卸载时，THE Component_Store SHALL 自动清理该组件订阅的临时状态，保留业务数据状态
6. THE Component_Store SHALL 提供 selector 机制，组件仅订阅所需的状态片段，避免不必要的重渲染

### 需求 7：类型系统与领域模型重构

**用户故事：** 作为开发者，我希望类型定义按领域模块组织，每个领域有独立的类型文件，以便提高代码可维护性和类型安全性。

#### 验收标准

1. THE Domain_Model SHALL 将当前 `types.ts`（600+ 行）拆分为独立的领域类型模块：`project.types.ts`、`episode.types.ts`、`shot.types.ts`、`character.types.ts`、`scene.types.ts`、`prop.types.ts`、`timeline.types.ts`、`asset.types.ts`、`settings.types.ts`
2. THE Domain_Model SHALL 为每个领域实体定义 Zod schema，用于运行时数据验证
3. THE Domain_Model SHALL 从 Zod schema 自动推导 TypeScript 类型，确保运行时验证和编译时类型检查一致
4. WHEN 外部数据（文件读取、API 响应）进入系统时，THE Domain_Model SHALL 使用 Zod schema 进行验证，拒绝不合法数据
5. THE Domain_Model SHALL 为前后端共享的类型定义创建独立的 `shared-types` 包，避免类型定义重复

### 需求 8：IPC 通信层重构

**用户故事：** 作为开发者，我希望前后端 IPC 通信有类型安全的接口定义和统一的错误处理，以便减少通信层的 bug。

#### 验收标准

1. THE IPC_Bridge SHALL 提供类型安全的 RPC 接口，前端调用后端方法时获得完整的参数和返回值类型提示
2. THE IPC_Bridge SHALL 统一所有 IPC 通道的命名规范为 `domain:action` 格式，替代当前混合的命名方式（`controller.xxx.method` 和 `fs:readFile` 并存）
3. WHEN IPC 调用发生错误时，THE IPC_Bridge SHALL 将后端错误序列化为结构化错误对象传递到前端，包含错误码、消息和堆栈信息
4. THE IPC_Bridge SHALL 支持双向流式通信，后端可通过 IPC 向前端推送实时数据流（如 AI 响应流、工作流进度流）
5. THE IPC_Bridge SHALL 提供请求超时机制，WHEN IPC 调用超过配置的超时时间时自动取消请求并返回超时错误
6. THE IPC_Bridge SHALL 自动生成前端调用代码（类型安全的 client），基于后端 controller 定义自动推导

### 需求 9：前端组件解耦与优化

**用户故事：** 作为用户，我希望界面响应流畅、交互直观，组件加载快速。

#### 验收标准

1. WHEN Storyboard 组件渲染时，THE Storyboard 组件 SHALL 通过 hooks 直接从 store 获取数据，将当前 30+ 个回调 props 减少到 10 个以内
2. THE 前端组件 SHALL 使用 React.lazy 和 Suspense 实现路由级别的代码分割，首屏加载仅包含当前路由所需的代码
3. THE 前端组件 SHALL 将大型列表（分镜列表、素材列表）使用虚拟滚动渲染，WHEN 列表项超过 50 个时仅渲染可视区域内的元素
4. WHEN 用户在分镜编辑器中修改数据时，THE 前端组件 SHALL 使用乐观更新策略，先更新 UI 再异步持久化
5. THE 前端组件 SHALL 将通用 UI 模式（确认弹窗、加载状态、错误边界）抽象为可复用的高阶组件或 hooks
6. IF 组件渲染过程中发生未捕获错误，THEN THE 前端组件 SHALL 通过 ErrorBoundary 捕获错误，显示友好的错误提示并提供重试选项

### 需求 10：样式系统与主题优化

**用户故事：** 作为用户，我希望应用界面美观一致，支持主题切换，视觉风格专业。

#### 验收标准

1. THE 样式系统 SHALL 使用统一的 Design Token 体系（颜色、间距、圆角、阴影、字体），所有组件通过 token 引用样式值而非硬编码
2. THE 样式系统 SHALL 支持亮色和暗色主题切换，WHEN 用户切换主题时所有组件同步更新样式
3. THE 样式系统 SHALL 将当前混合使用的 CSS Modules、内联样式和全局 CSS 统一为 CSS Modules + Tailwind 的组合方案
4. THE 样式系统 SHALL 提供响应式布局支持，WHEN 窗口尺寸变化时界面元素自适应调整
5. WHEN 用户自定义主题预设时，THE 样式系统 SHALL 将自定义 token 值持久化并在下次启动时自动应用

### 需求 11：配置系统统一

**用户故事：** 作为开发者，我希望应用配置有统一的管理入口，支持模块化注册和版本迁移。

#### 验收标准

1. THE Config_System SHALL 将前端 `store/settings/` 中的配置管理逻辑迁移到后端 `ConfigRegistry`，前端通过 IPC 读写配置
2. THE Config_System SHALL 为每个配置模块提供 Zod schema 验证，WHEN 配置值不符合 schema 时拒绝写入并返回验证错误
3. THE Config_System SHALL 支持配置变更监听，WHEN 配置值变更时通过 Event_Bus 通知所有订阅者
4. THE Config_System SHALL 支持配置导入导出，用户可将全部配置导出为 JSON 文件并在其他设备导入
5. IF 配置文件损坏或无法解析，THEN THE Config_System SHALL 自动回退到默认配置并记录警告日志

### 需求 12：Provider 系统优化

**用户故事：** 作为用户，我希望能方便地管理和切换不同的 AI 服务提供者（图像生成、视频生成、语音合成），配置过程简单直观。

#### 验收标准

1. THE Provider_Registry SHALL 统一前端和后端的 Provider 注册表，消除当前前端 `providers/registry.ts` 和后端 `service/provider/` 的重复实现
2. THE Provider_Registry SHALL 支持 Provider 健康检查，WHEN 用户配置 Provider 后自动执行连接测试并显示结果
3. THE Provider_Registry SHALL 支持 Provider 优先级和故障转移，WHEN 首选 Provider 不可用时自动切换到备选 Provider
4. WHEN 插件注册新的 Provider 时，THE Provider_Registry SHALL 自动在设置界面中生成对应的配置表单（基于 configSchema）
5. THE Provider_Registry SHALL 记录每个 Provider 的调用统计（成功率、平均延迟、错误分布），供用户参考选择
