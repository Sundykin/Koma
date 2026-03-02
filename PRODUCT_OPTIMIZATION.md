# Koma Studio 产品优化方案 (v1.1)

> 综合 Codex 后端分析 + 前端 UX 深度扫描，按产品影响力排序

---

## 一、P0 — 必须立即修复（阻塞核心体验）

### 1. 数据可靠性与崩溃恢复

**问题：** Chat 会话/Workflow 运行状态仅存内存，Electron 崩溃=全部丢失。`persistence.ts` 写队列存在 Promise 悬挂风险，项目元数据写入缺事务一致性。

**影响：** 用户花 30 分钟的 AI 对话/工作流一次崩溃全没。

**方案：**
| 项目 | 改动 | 文件 |
|------|------|------|
| Chat 会话增量持久化 | 每轮对话自动保存到 SQLite，崩溃后可恢复 | `service/chat/SessionStore.ts` |
| Workflow checkpoint | 每个 DAG 节点完成后写 checkpoint，支持断点续跑 | `service/workflow/orchestrator.ts` |
| 重写 persistence 写队列 | 同 key 合并 + 所有调用方回执，杜绝悬挂 | `service/persistence.ts` |
| 项目元数据原子更新 | 引入文件锁/journal 模式 | `service/project.ts` |

---

### 2. 统一错误体验 — 用户不应看到技术堆栈

**问题：** Controller 返回格式不统一（有的 bool、有的对象、有的抛异常）；Chat 错误直接 `message.error(err.message)` 绕过 `toUserMessage()`；只有一个根级 ErrorBoundary，一个 Stage 崩溃=整个 App 白屏。

**影响：** 用户看到 "ECONNREFUSED" / "Cannot read property of undefined"，不知所措。

**方案：**
| 项目 | 改动 | 文件 |
|------|------|------|
| Controller 返回协议统一 | `{ ok, data, error: { code, message } }` | `electron/controller/*.ts` |
| 错误码字典 | 定义 50+ 业务错误码，前端可映射中文 | 新建 `ipc/errorCodes.ts` |
| Chat 错误走 errorMessages | 所有 catch 走 `toUserMessage()` | `chat/ChatPage.tsx` |
| Stage 级 ErrorBoundary | 每个 Stage 独立 boundary，崩溃可重试不影响其他 | `workspace/WorkspaceShell.tsx` |
| 流式接口统一 requestId | 支持 cancel/timeout/状态查询 | `controller/chat.ts`, `controller/workflow.ts` |

---

### 3. Chat 页面不可达 — 核心功能藏起来了

**问题：** `ChatPage` 组件已完整实现（流式对话、MCP、Agent 模板、多模型），但 Sidebar 没有导航入口，用户无法到达。

**影响：** 产品的 AI 核心能力完全不可用。

**方案：**
- Sidebar 增加 "AI 助手" 导航项
- AppPage 类型增加 `'chat'`
- 考虑将 Chat 嵌入 WorkspaceShell 作为右侧抽屉（项目上下文感知的 AI 助手）

---

### 4. 安全治理 — API Key 明文 + 无插件签名

**问题：** 配置中 API Key 存普通 JSON；控制台存在部分 API Key 打印；插件系统无签名校验/信任链。

**影响：** API Key 泄露风险，恶意插件可窃取凭据。

**方案：**
| 项目 | 改动 |
|------|------|
| Secrets 模块 | 拆出 `service/config/secrets.ts`，用 `safeStorage` 加密存储，配置只存引用 |
| 控制台清理 | 移除所有 `console.log` 中含 key/token 的输出 |
| 插件信任链 | 签名校验 + 校验和 + 来源标记 + 首次安装确认 |

---

## 二、P1 — 显著提升（影响日常使用效率）

### 5. IPC 健壮性 — 超时/背压/可观测

**问题：** IPC 无 QoS（无超时、无并发上限、无背压）；事件总线无重放，晚订阅丢关键事件；无全链路 tracing。

**方案：**
- IPC 层增加 timeout（默认 30s）、maxConcurrency、拒绝策略
- 事件总线支持关键事件短窗口持久化
- 全链路 tracing（channel + 耗时 + 错误码 + 调用方）

---

### 6. 状态管理升级 — 告别 prop drilling

**问题：** 无全局状态库，`App.tsx` 到 Stage 组件靠层层 props 传递。设置每次 `loadSettings()` 触发并行异步读。`globalStore.ts` 是迁移中遗留的 re-export shim。

**方案：**
- 引入 Zustand 作为全局状态管理（轻量、与 React 18 兼容好）
- 拆分 store: `useProjectStore`, `useSettingsStore`, `useChatStore`, `useWorkflowStore`
- 删除 `globalStore.ts` shim，直接使用新 store
- Settings 初始化一次，后续通过 store 订阅变更

---

### 7. Provider 路由与熔断

**问题：** 单 Provider 实例无 fallback；配置更新后缓存不失效（用旧实例）；无 SLA 画像。

**方案：**
- 实例版本号 + 事件驱动失效
- 多实例路由策略（默认→备选→熔断）
- Provider 级指标面板（成功率、P95 延迟）

---

### 8. 工作流引擎增强

**问题：** 运行状态纯内存；节点失败无重试/补偿；条件分支字段存在但未实现执行语义；关键执行依赖 renderer 窗口。

**方案：**
- Workflow run checkpoint 持久化
- 节点级重试 + 超时 + 补偿策略
- 执行器后移到主进程/worker，renderer 委托仅做可选
- 条件分支可视化调试

---

### 9. MCP 连接管理

**问题：** 无健康探测/自动重连；工具来源和权限对用户不透明。

**方案：**
- 心跳 + 断线重连 + 熔断
- 工具面板展示来源/权限/调用历史
- 失败原因可视化

---

## 三、P2 — 体验打磨（差异化竞争力）

### 10. Loading 体验升级

**问题：** 全局只用 `Spin`，无 Skeleton 占位。布局在数据到达时跳动。

**方案：**
- 关键页面（ProjectList、WorkspaceShell、EditStage）加 Skeleton Screen
- AutoSave 增加微交互反馈（非 Spin）

### 11. 国际化 (i18n)

**问题：** 所有字符串硬编码中文，无 i18n 库。仅 AntD 有 `locale={zhCN}`。

**方案：**
- 引入 `react-i18next`
- 先抽离 400+ 中文字符串到 locale JSON
- 支持中/英双语

### 12. 可访问性 (a11y)

**问题：** 零 ARIA 标签；项目卡片用 `div+onClick`（不可键盘聚焦）；无 `aria-selected` / `aria-current`。

**方案：**
- 交互元素替换为语义化 `<button>` / `<a>`
- 图标按钮加 `aria-label`
- Stage 导航加 `role="tablist"` / `aria-selected`
- 键盘导航支持（Tab / Enter / Escape）

### 13. 样式一致性

**问题：** Chat 组件用 CSS Modules，其他用 Tailwind；图标混用 Lucide + AntD Icons。

**方案：** 统一为 Tailwind + Lucide，逐步迁移 CSS Modules。

### 14. 废弃代码清理

**问题：** `taskQueueStore.ts` 标记 @deprecated 仍被引用；Simple* 组件与旧组件共存；双套 LLM 适配器 (`chat/adapters/` + `providers/llm/`)。

**方案：** 统一为一套适配器，删除废弃 store 和旧组件。

---

## 四、产品优化 Top 10 总排名

| 排名 | 项目 | 优先级 | 影响 |
|:----:|------|:------:|------|
| 1 | 数据可靠性与崩溃恢复 | P0 | 防止用户工作丢失 |
| 2 | 统一错误体验 | P0 | 用户不再看到技术堆栈 |
| 3 | Chat 页面导航接入 | P0 | 核心 AI 功能可达 |
| 4 | API Key 安全存储 | P0 | 凭据不泄露 |
| 5 | IPC 健壮性（QoS） | P1 | 消除卡顿/超时黑洞 |
| 6 | 全局状态管理 (Zustand) | P1 | 消除 prop drilling，提升开发效率 |
| 7 | Provider 路由与熔断 | P1 | AI 服务高可用 |
| 8 | 工作流引擎持久化 | P1 | 长工作流可恢复 |
| 9 | MCP 连接管理 | P1 | 工具服务稳定性 |
| 10 | Loading/Skeleton 体验 | P2 | 视觉专业感 |

---

## 五、建议实施路径

```
Phase 1 (1-2 周): P0 项 1-4
  ├─ 后端: persistence 写队列重写 + Chat 持久化 + Controller 协议统一 + Secrets 模块
  └─ 前端: Chat 导航接入 + Stage ErrorBoundary + 错误码映射

Phase 2 (2-3 周): P1 项 5-9
  ├─ 后端: IPC QoS + Provider 路由 + Workflow checkpoint + MCP 健康管理
  └─ 前端: Zustand 引入 + 状态迁移

Phase 3 (持续): P2 项 10-14
  ├─ Skeleton Screens + i18n + a11y
  └─ 代码清理 + 样式统一
```
