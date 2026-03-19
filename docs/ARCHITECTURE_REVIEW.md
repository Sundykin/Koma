# Koma Studio 架构审查报告

> 审查日期：2026-03-19
> 审查范围：前端架构（React 19 + Zustand 5 + Vite 6）+ 后端架构（Electron 39 + Node.js + LangChain）
> 审查方法：前后端架构师并行独立分析，共覆盖 307 个 TS/TSX 前端文件 + 完整 Electron 主进程代码

---

## 目录

- [一、总体评价](#一总体评价)
- [二、高优先级问题（P0）](#二高优先级问题p0)
- [三、中优先级问题（P1）](#三中优先级问题p1)
- [四、低优先级问题（P2）](#四低优先级问题p2)
- [五、架构优势（值得保持）](#五架构优势值得保持)
- [六、改进路线图](#六改进路线图)

---

## 一、总体评价

Koma Studio 是一个功能完整、技术栈现代的 Electron 桌面应用。项目在安全架构、模块化分层、插件系统设计方面表现优秀，但随着功能快速增长，出现了以下结构性问题：

| 维度 | 评价 | 说明 |
|------|------|------|
| 可维护性 | ⭐⭐⭐ 中等 | 巨型组件 + 分散的状态管理，修改风险大 |
| 可扩展性 | ⭐⭐⭐ 中等 | AI 集成、编辑器扩展需要修改多个文件 |
| 可测试性 | ⭐⭐ 偏低 | 大组件难以单元测试，业务逻辑与 UI 混合 |
| 可靠性 | ⭐⭐⭐ 中等 | 缺乏熔断、重试、超时等容错机制 |
| 安全性 | ⭐⭐⭐⭐ 良好 | SSRF 防护、路径验证、contextIsolation 等完善 |
| 性能 | ⭐⭐⭐ 中等 | 主进程阻塞风险，缺乏 Worker 线程池 |

---

## 二、高优先级问题（P0）

### P0-1 [前端] 巨型组件问题

**问题描述**

多个核心组件文件过大，单个文件混合了业务逻辑、UI 渲染、状态管理、数据加载和事件处理：

| 组件 | 行数 | 混合职责 |
|------|------|----------|
| Storyboard.tsx | 1462 行 | 分镜列表管理、分镜编辑、AI 生成、资产预设、批量操作 |
| SimpleTimeline.tsx | 1100 行 | 时间轴渲染、拖拽交互、轨道管理、缩放控制 |
| SimplePropertiesPanel.tsx | 758 行 | 属性编辑、关键帧管理、多类型属性 |
| CharacterDetailModal.tsx | 663 行 | 角色详情、表单验证、AI 生成、图片管理 |
| SimpleExportDialog.tsx | 649 行 | 导出配置、格式转换、进度追踪 |

**影响**

- 代码可维护性差，修改一个功能需要理解整个文件
- 单元测试困难，无法独立测试某个子功能
- 多人协作容易产生合并冲突
- 重用和组合困难

**解决方案**

**策略：按职责拆分组件 + 提取业务逻辑到自定义 Hooks**

以 Storyboard.tsx 为例：

```
重构前：
  Storyboard.tsx (1462 行，5+ 个职责)

重构后：
  storyboard/
  ├── Storyboard.tsx            # 容器组件，仅负责布局编排（~100 行）
  ├── ShotListView.tsx          # 分镜列表展示
  ├── ShotEditor.tsx            # 单个分镜编辑
  ├── ShotGenerationWizard.tsx  # AI 生成流程
  ├── ShotBatchActions.tsx      # 批量操作
  ├── hooks/
  │   ├── useStoryboardData.ts  # 数据加载和管理
  │   ├── useShotEditing.ts     # 编辑逻辑
  │   └── useShotGeneration.ts  # AI 生成逻辑
  └── index.ts
```

**拆分原则**：
1. 每个组件只有一个变化的理由（单一职责）
2. 业务逻辑提取到自定义 Hooks，组件只负责 UI 渲染
3. 容器组件负责编排，展示组件负责渲染
4. 每个组件文件不超过 300 行

---

### P0-2 [后端] Chat ↔ Plugin 循环依赖

**问题描述**

Chat 服务和 Plugin 服务之间存在循环依赖：

```
electron/service/chat/ ──导入──→ ../plugin/registries, ../plugin/capability
electron/service/plugin/capability/MCPAdapter.ts ──导入──→ ../../chat/mcp
```

ChatService 依赖 mcpRegistry、agentRegistry、capabilityRegistry；MCPAdapter（属于 plugin）又反向依赖 MCPManager（属于 chat）。

**影响**

- 模块初始化顺序微妙且易碎
- 重构任何一个模块都需要同时修改另一个
- 测试隔离性差，无法独立测试 Chat 或 Plugin 模块
- 未来若需分离后端进程，耦合将成为障碍

**解决方案**

**策略：引入 Event Bus 解耦 + 依赖倒置**

```
重构前（循环依赖）：
  Chat ←→ Plugin

重构后（Event Bus 解耦）：
  Chat ──发布事件──→ EventBus ←──监听事件── Plugin
                        ↑
                   共享接口层
```

具体步骤：

1. **创建 Event Bus**（`electron/service/event-bus.ts`）：
   - 发布-订阅机制，基于 Node.js EventEmitter
   - 定义类型安全的事件契约（MCPConnectionChanged、AgentRegistered 等）

2. **创建共享接口层**（`electron/service/shared/interfaces.ts`）：
   - 定义 IMCPManager、IAgentRegistry 等接口
   - Chat 和 Plugin 都依赖接口而非具体实现

3. **重构依赖方向**：
   - Chat 发出 `mcp:connection:changed` 事件，Plugin 监听
   - MCPAdapter 通过接口注入 MCPManager 实例，而非直接导入
   - 在 app 启动时通过依赖注入组装

---

### P0-3 [后端] MCP 服务器进程管理不完善

**问题描述**

`electron/service/chat/mcp/MCPManager.ts` 中 MCP 进程管理存在以下缺陷：
- stdio 传输没有完善的失败重连机制
- 进程意外退出时不会自动重启或通知用户
- 没有心跳检测确保连接活跃
- 进程可能泄漏（CPU 占用但无法通信）

**影响**

- MCP 工具调用可能悬挂，导致 AI 代理卡死
- 后端进程泄漏（CPU 占用但无法通信）
- 用户无法感知连接状态问题

**解决方案**

**策略：心跳检测 + 指数退避重连 + 状态通知**

1. **心跳检测机制**：
   - 每 30 秒发送 `ping` 请求到 MCP 服务器
   - 连续 3 次无响应标记为断开
   - 通过 IPC 通知前端连接状态变化

2. **自动重连（指数退避）**：
   - 首次重连等待 1 秒，之后 2s → 4s → 8s → 最大 60s
   - 最多重连 5 次，超过后标记为不可用
   - 重连期间缓存待发送请求，恢复后重放

3. **进程生命周期管理**：
   - 监听子进程 `exit`、`error` 事件
   - 退出码非 0 时自动触发重连
   - 应用关闭时确保所有 MCP 子进程优雅退出（SIGTERM → 等待 5s → SIGKILL）

4. **状态通知 API**：
   - 向前端暴露 `mcp:status` 事件（connected / reconnecting / disconnected / failed）
   - 前端展示 MCP 连接状态指示器

---

## 三、中优先级问题（P1）

### P1-1 [前端] 状态管理粒度和分散

**问题描述**

状态管理分散在多个系统中：
- 5 个 Zustand stores（trackStore、resourceStore、pluginStore、chatHistoryStore 等）
- 771 次 useState hooks 分布在 82 个文件
- globalStore 和 projectStore 使用间接重定向模式
- 本地 UI 状态、全局业务状态、编辑状态混用

**影响**

- 状态同步困难，容易产生不一致 bug
- 难以理解完整的数据流向
- 跨组件状态同步复杂

**解决方案**

**策略：分层状态管理 + 明确状态所有权**

```
状态分层：
┌─────────────────────────────────────┐
│  UI 状态（组件局部 useState）        │  按钮悬停、弹窗开关、输入焦点
├─────────────────────────────────────┤
│  编辑状态（editorStore - 新增）      │  选中项、时间指针、撤销栈、剪贴板
├─────────────────────────────────────┤
│  业务状态（projectStore / chatStore）│  项目数据、会话历史、AI 配置
├─────────────────────────────────────┤
│  全局配置（settingsStore）          │  用户偏好、语言、主题
└─────────────────────────────────────┘
```

具体步骤：

1. **新增 editorStore**：集中管理编辑器相关状态（选中分镜、时间指针、播放状态、撤销栈）
2. **简化 store 导出**：消除 globalStore / projectStore 的间接重定向
3. **使用 Zustand immer 中间件**：简化嵌套状态更新
4. **提取常见 state + setter 为自定义 hooks**：减少组件内 useState 数量

---

### P1-2 [前端] AI 集成层耦合

**问题描述**

AI 调用分散在多个地方：
- ShotGenerationService、AssetGenerationWizard、Storyboard 等独立调用 provider
- ProviderManager 提供了统一创建接口，但调用点未统一
- 错误处理、重试逻辑、进度追踪不一致

**影响**

- 难以管理并发 AI 调用的优先级和限流
- 错误恢复机制不统一，用户体验不一致
- 无法共享通用逻辑（缓存、重试、日志、计费追踪）

**解决方案**

**策略：创建统一 AIService 门面层**

```
重构前（分散调用）：
  Storyboard ──→ ProviderManager ──→ LLM Provider
  AssetWizard ──→ ProviderManager ──→ TTI Provider
  ChatPage    ──→ ChatSession     ──→ LLM Provider

重构后（统一门面）：
  所有调用方 ──→ AIService ──→ ProviderManager ──→ Provider
                    │
                    ├── 重试逻辑（指数退避，最多 3 次）
                    ├── 错误映射（Provider 错误 → 用户友好错误）
                    ├── 日志记录（调用耗时、token 用量）
                    ├── 进度追踪（统一的 onProgress 回调）
                    └── 并发控制（限制同时 AI 调用数）
```

AIService 提供的统一 API：
- `generateText(prompt, options)` — 文本生成
- `generateImage(prompt, options)` — 图片生成
- `generateSpeech(text, options)` — 语音合成
- `generateVideo(config, options)` — 视频生成
- 每个方法统一支持：`{ retry, timeout, onProgress, signal }`

---

### P1-3 [前端] 编辑器模块架构松散

**问题描述**

编辑器相关代码分散在多个大文件中：
- SimpleEditor.tsx（559 行）— 整体协调
- SimpleTimeline.tsx（1100 行）— 时间线
- SimplePlayer.tsx（401 行）— 播放器
- SimplePropertiesPanel.tsx（758 行）— 属性面板
- 各组件独立管理状态，缺乏统一协调

**影响**

- 编辑器各子模块协调复杂（如播放器和时间线的同步）
- 数据转换逻辑（shotsToTracks）散落在组件内
- 难以添加新的编辑器功能（如多轨道、关键帧曲线）

**解决方案**

**策略：创建 editorStore + EditorManager 核心逻辑层**

```
架构设计：
┌─────────────────────────────────────────────┐
│                SimpleEditor                  │  布局容器
├──────────┬──────────┬───────────────────────┤
│ Timeline │  Player  │  PropertiesPanel      │  UI 组件
├──────────┴──────────┴───────────────────────┤
│              editorStore (Zustand)            │  统一状态
├─────────────────────────────────────────────┤
│              EditorManager (类)              │  核心逻辑
│  - insertClip / deleteClip / splitClip      │
│  - alignToGrid / snapToMagnet               │
│  - undo / redo                              │
│  - shotsToTracks / tracksToShots            │
└─────────────────────────────────────────────┘
```

EditorManager 职责：
1. 管理 track/clip 的 CRUD 操作
2. 处理数据格式转换（shots ↔ tracks）
3. 提供撤销/重做（Command Pattern）
4. 管理选择状态和剪贴板
5. 所有子组件通过 editorStore 读取状态，调用 EditorManager 方法修改

---

### P1-4 [前端] Props Drilling 和数据流问题

**问题描述**

深层组件嵌套导致 Props drilling：
- App.tsx 有 16 处 useCallback/useState
- EditorView → SimpleEditor → SimpleTimeline/SimplePlayer → 子组件
- 中间组件接收大量 props 但不使用，仅转发

**影响**

- 难以追踪 props 来源
- 修改 props 签名需要更新所有中间层
- 组件不够独立，难以复用

**解决方案**

**策略：Zustand store 替代 props drilling + 组合模式**

1. **用 editorStore 替代编辑器 props 链**：
   - 播放状态、选中分镜、时间指针等放入 editorStore
   - 子组件直接 `useEditorStore(state => state.currentTime)` 读取
   - 不再通过 SimpleEditor 转发

2. **用组合模式替代嵌套**：
   ```
   重构前：<EditorView> → <SimpleEditor> → <Timeline> + <Player>
   重构后：<EditorLayout> 内直接组合 <Timeline> + <Player>，共享 editorStore
   ```

3. **减少 App.tsx 的状态负担**：
   - 将项目相关状态移入 projectStore
   - 将编辑相关状态移入 editorStore
   - App.tsx 只负责路由和全局 Provider

---

### P1-5 [前端] IPC 调用分散

**问题描述**

Electron IPC 调用没有统一的抽象层：
- projectStore 混合了 IPC 调用和业务逻辑
- ChatPage 通过 useChat hook 使用 chatIPC
- 其他数据通过 projectStore 的静态函数加载
- 错误处理、超时控制、重试策略不统一

**影响**

- IPC 调用逻辑重复
- 错误处理不一致，用户体验参差不齐
- 无法统一添加日志、超时、重试等横切关注点

**解决方案**

**策略：创建 ElectronService 统一 IPC 抽象层**

```
架构设计：
  组件 / Store ──→ ElectronService ──→ window.electron.ipcRenderer
                        │
                        ├── 统一错误转换（IPC 错误 → AppError）
                        ├── 超时控制（默认 30s，可配置）
                        ├── 自动重试（网络类错误重试 2 次）
                        ├── 请求日志（dev 环境记录所有 IPC 调用）
                        └── TypeScript 类型安全（请求/响应类型定义）
```

ElectronService API 示例：
- `electronService.project.save(data)` — 保存项目
- `electronService.project.load(id)` — 加载项目
- `electronService.fs.readFile(path)` — 读取文件
- `electronService.chat.sendStream(params)` — 流式聊天
- 所有方法返回 `Promise<Result<T, AppError>>`

---

### P1-6 [前端] 类型系统不完整

**问题描述**

类型定义分散且不完整：
- `types/index.ts` 只有 2 行（仅导出 track 和 resource）
- 基础类型（Project、Episode、Shot、Character）位置不清晰
- 接口名称和结构不统一
- 存在类型重复定义的风险

**影响**

- 类型导入困难，开发者不知道去哪找
- 易产生类型重复定义
- IDE 自动完成效果差

**解决方案**

**策略：按功能域统一组织类型**

```
types/
├── index.ts            # 统一导出入口
├── common.ts           # Project, Episode, Shot, Character, Asset
├── editor.ts           # Track, Clip, Keyframe（已有，保持）
├── ai.ts               # LLMConfig, TTIConfig, TTSConfig, ProviderInfo
├── workflow.ts         # WorkflowTask, WorkflowProgress, TaskStatus
├── plugin.ts           # PluginManifest, PluginConfig（已有，保持）
├── ipc.ts              # IPC 请求/响应类型定义
├── track.ts            # 轨道相关（已有，保持）
├── mcp.ts              # MCP 相关（已有，保持）
└── jianying.ts         # 剪映导出（已有，保持）
```

原则：
1. 所有类型通过 `types/index.ts` 统一导出
2. 组件不直接定义业务类型，只定义 Props 类型
3. 使用 `satisfies` 关键字确保运行时数据与类型一致

---

### P1-7 [后端] 会话管理内存泄漏风险

**问题描述**

`electron/service/chat/SessionStore.ts` 存在内存泄漏隐患：
- 30 分钟 TTL，5 分钟检查一次
- 窗口关闭时依赖 `disposeSessionsByWindow()` 手动调用，若遗漏则会话永驻
- 会话存储完整 LangChain BaseMessage[]，大会话可占用大量内存
- 没有会话数量上限和 LRU 驱逐策略

**影响**

- 长期运行应用逐渐积累僵尸会话
- 大型项目或多窗口场景容易导致内存溢出
- 无法感知内存异常增长

**解决方案**

1. **LRU 缓存限制**：最多保留 50 个活跃会话，超出时驱逐最久未使用的
2. **窗口生命周期绑定**：在 Electron 的 `BrowserWindow.on('closed')` 中强制清理关联会话
3. **消息压缩**：超过 100 条消息的会话，自动摘要压缩早期消息
4. **内存监控**：定期检查 SessionStore 总内存占用，超过阈值触发告警日志

---

### P1-8 [后端] IPC 流式请求缺乏超时和去重

**问题描述**

`electron/service/chat/ipc.ts` 中流式消息处理存在缺陷：
- `chat:message:sendStream` 返回 void，发出即忘
- 流式响应没有超时保护（可能永久挂起）
- 没有请求去重或幂等性保证
- 用户重复点击可能触发多个并发请求

**影响**

- 后端崩溃或网络阻塞时前端无法感知
- 长时间运行的流式请求泄漏资源
- 重复请求浪费计算资源

**解决方案**

1. **超时机制**：流式响应默认 5 分钟超时，超时后自动取消并通知前端
2. **请求去重**：基于 `sessionId + messageHash` 去重，相同请求 2 秒内只处理一次
3. **请求 ID 机制**：返回 requestId 给前端，前端可用于取消操作
4. **AbortSignal 支持**：充分利用 ChatService 中已有的 abort 框架，前端发送取消信号时立即中断

---

### P1-9 [后端] 错误处理不一致

**问题描述**

不同模块的错误处理策略不统一：
- Chat 模块部分使用 `EventEmitter.emit('error')`，部分直接 throw
- Plugin 模块有些错误被静默吞掉
- 没有中央日志聚合
- IPC 响应的错误格式不统一

**影响**

- 生产环境问题难以诊断
- 用户只看到通用错误，无法理解失败原因
- 调试耗时

**解决方案**

**策略：统一错误类型 + 结构化日志**

1. **创建统一错误基类**：
   ```
   ServiceError
   ├── code: string        (如 "CHAT_SESSION_EXPIRED")
   ├── category: enum      (NETWORK / AUTH / VALIDATION / INTERNAL)
   ├── details: object     (上下文信息)
   ├── userMessage: string (用户可读的错误描述)
   └── retryable: boolean  (是否可重试)
   ```

2. **IPC 错误格式统一**：所有 IPC 响应包含 `{ success, data, error: { code, message, retryable } }`

3. **结构化日志**：引入 winston 或 electron-log，按模块标记日志来源，便于过滤和分析

---

### P1-10 [后端] 文件系统路径验证不够完备

**问题描述**

`electron/controller/fs.ts` 的路径验证存在逃逸风险：
- `isPathAllowed()` 只检查路径前缀，不处理软链接和符号链接
- `downloadFile()` 每次重定向检查 URL，但没有验证最终写入路径
- 没有防止 zip 炸弹或恶意存档的检查

**影响**

- 攻击者可能通过软链接绕过路径限制
- 大型存档可能导致磁盘写满
- 下载后的文件路径可能被篡改

**解决方案**

1. **使用 `fs.realpathSync()` 解析真实路径**：检查软链接解析后的路径是否仍在允许范围内
2. **存档安全检查**：
   - 解压前检查压缩比（>10:1 警告，>100:1 拒绝）
   - 限制解压后总大小（如 500MB）
   - 检查文件名是否包含 `../` 路径遍历
3. **下载文件二次验证**：写入前用 `realpath` 再次验证最终路径
4. **磁盘空间预检查**：大文件操作前检查可用空间

---

### P1-11 [后端] 插件安装缺乏事务性

**问题描述**

`electron/service/plugin.ts` 的 `install()` 方法缺乏原子性保证：
- 解压、验证、激活三步若任意一步失败，状态混乱
- 没有自动回滚机制
- 没有锁机制防止并发安装同一插件

**影响**

- 安装失败后需要用户手动清理
- 插件列表可能包含孤立条目
- 系统状态不可预测

**解决方案**

1. **两阶段提交**：
   - Phase 1（Prepare）：解压到 staging 目录 + 验证 manifest + 检查依赖
   - Phase 2（Commit）：原子化移至正式目录 + 更新注册表
   - 任何阶段失败自动清理 staging 目录

2. **文件锁**：使用 `proper-lockfile` 或类似库，防止并发安装同一插件

3. **回滚清单**：记录每步操作，失败时按逆序清理

---

### P1-12 [后端] 多 LLM Provider 缺乏熔断和降级

**问题描述**

多 LLM 提供商集成缺乏容错机制：
- Provider 服务不可用时没有自动降级或重试策略
- Provider 实例缓存没有 TTL，长期连接可能过期
- 没有请求级别的超时和速率限制

**影响**

- 一个 provider 宕机导致整个应用响应缓慢
- 配置更新后旧连接仍被使用
- 无法灰度切换 provider

**解决方案**

1. **断路器模式**：
   - 连续失败 3 次 → 标记为 OPEN（10 秒内不再尝试）
   - 10 秒后自动进入 HALF-OPEN（试探一次）
   - 成功则恢复 CLOSED，失败则继续 OPEN

2. **Provider 实例管理**：
   - 添加 5 分钟 TTL，过期后重建连接
   - 配置变更时立即废弃旧实例
   - 健康检查（每分钟 ping 一次）

3. **请求超时**：每个 provider 配置独立超时（默认 30s，流式 5min）

4. **降级策略**：主 provider 不可用时，提示用户切换到备选 provider

---

### P1-13 [后端] 缺乏 Worker 线程和资源隔离

**问题描述**

所有计算和 I/O 都在 Electron 主进程中：
- ChatService、AgentOrchestrator、FFmpegService 都在主进程
- 没有 Worker 线程池限制并发任务
- 大型 LangGraph 编排或文件操作会阻塞 IPC 消息处理

**影响**

- UI 响应变慢
- 长时间运行的任务（视频生成、AI 编排）导致应用卡顿
- 无法充分利用多核 CPU

**解决方案**

1. **Worker 线程池**：
   - 为 AgentOrchestrator 创建 Worker 池（默认 2 个 Worker）
   - 将 FFmpeg 操作移至独立子进程
   - 实现任务队列和优先级调度

2. **进程模型**：
   ```
   Main Process（轻量级调度）
   ├── IPC Handler（快速响应）
   ├── Worker Pool（AI 任务）
   │   ├── Worker 1: LangGraph Agent
   │   └── Worker 2: LangGraph Agent
   └── Child Process（FFmpeg 视频处理）
   ```

3. **流量控制**：限制并发 AI 调用数（如最多 3 个），超出排队等待

---

## 四、低优先级问题（P2）

### P2-1 [前端] 工作流/任务管理两套系统并存

**问题描述**

WorkflowManager 和 TaskManager 两套系统并存，职责不清。

**解决方案**

统一使用 WorkflowManager 管理所有长运行任务，创建 workflowStore 提供统一的进度追踪 API。废弃独立的 TaskManager。

---

### P2-2 [前端] 缺少通用 Hooks

**问题描述**

数据加载、防抖、节流、表单验证等逻辑在多个组件中重复编写。

**解决方案**

创建 `hooks/common.ts` 提供：
- `useAsync(fn)` — 异步操作包装（loading / error / data）
- `useDebounce(value, delay)` — 防抖
- `useThrottle(fn, delay)` — 节流
- `usePrevious(value)` — 前一个值

---

### P2-3 [前端] 插件系统与核心应用耦合

**问题描述**

插件加载和管理逻辑与核心应用有依赖，缺乏独立的 PluginLoader。

**解决方案**

创建 PluginLoader 类统一管理插件发现、加载、激活、卸载的生命周期。定义清晰的插件入口点和 API 合约。

---

### P2-4 [前端] 构建配置优化空间

**问题描述**

已有基本的 chunk 分割，但缺少路由级别的懒加载优化。

**解决方案**

确保 `React.lazy()` 配合 Vite 自动 code splitting 生效。考虑分离 AI SDK 为独立 chunk。

---

### P2-5 [后端] CSP 规则过宽松

**问题描述**

生产环境允许 `unsafe-inline` 脚本，虽然有 contextIsolation 保护。

**解决方案**

生产环境使用 nonce 动态脚本加载，去掉 `unsafe-inline`。对用户生成内容使用沙箱 iframe。

---

## 五、架构优势（值得保持）

| 优势 | 说明 |
|------|------|
| ✅ 安全架构完善 | SSRF 防护、路径验证、CSP 配置、contextIsolation、IPC 白名单 |
| ✅ 现代化技术栈 | React 19、Zustand 5、Vite 6、TypeScript 全覆盖 |
| ✅ 模块化分层清晰 | Electron 端 controller → service 分层明确 |
| ✅ 插件系统设计灵活 | 支持 Provider、MCP、Agent 多种扩展类型 |
| ✅ 流式处理支持 | IPC 和 LangGraph 都支持流式响应 |
| ✅ 完整的 TypeScript 类型 | 类型定义详细（虽然组织可优化） |
| ✅ 国际化支持 | i18next 中英文双语 |
| ✅ 代码分割已配置 | Vite manualChunks 按库分组 |

---

## 六、改进路线图

```
Phase 1（1-2 周）— 立即止血
├── P0-1: 拆分 Top 5 巨型组件（Storyboard、SimpleTimeline 等）
├── P0-2: 引入 Event Bus 解决 Chat ↔ Plugin 循环依赖
└── P0-3: MCP 进程添加心跳检测和自动重连

Phase 2（2-4 周）— 核心重构
├── P1-1: 创建 editorStore，统一编辑器状态管理
├── P1-2: 创建 AIService 统一 AI 调用层
├── P1-3: 创建 EditorManager 核心逻辑层
├── P1-5: 创建 ElectronService 统一 IPC 抽象
└── P1-9: 统一错误处理和日志系统

Phase 3（4-8 周）— 系统加固
├── P1-4: 消除 Props Drilling，简化组件树
├── P1-6: 类型系统统一组织
├── P1-7: SessionStore 添加 LRU 和内存限制
├── P1-8: IPC 流式请求添加超时和去重
├── P1-10: 文件路径验证增强（软链接、zip 炸弹）
├── P1-11: 插件安装事务性保证
├── P1-12: LLM Provider 断路器模式
└── P1-13: Worker 线程池

Phase 4（持续）— 持续优化
├── P2-1 ~ P2-5: 低优先级改进
└── 定期架构复审
```

---

> 本报告由前后端架构师团队自动生成，建议团队按 Phase 分阶段推进，每个 Phase 完成后进行回归测试。
