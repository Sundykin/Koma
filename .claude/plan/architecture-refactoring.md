# Koma 架构改造方案

> 状态：✅ 后端基础设施 + 前端对接层 + Store 迁移 + 插件 scope 强约束 全部完成
>
> 已完成：
> - 持久化：ConfigManager + ConfigRegistry + JsonStore + 7 个配置模块
> - 插件：ProviderManager + scope 运行时强约束（net/spawn/mcp/agent）
> - 工作流：DAG 编排器 + 委托执行 + 漫剧流水线模板
> - 前端桥接：configBridge + workflowBridge + preload API
> - Store 迁移：settings / recentProjects / modelPresets / promptTemplates（双写兼容）
> - 应用初始化：workflowAdapter 注册
>
> 待做：
> - TaskManager + taskQueueStore 整合（都写 tasks.json，需统一）
> - chatHistoryStore 迁移（大数据量，需专用存储方案）
> - 前端硬编码 Provider 逐步迁移为插件注册
> - 前端旧 WorkflowManager 逐步切换到后端 DAG 编排器
> - 下线前端直写逻辑（settings.json / localStorage）

## 一、现状诊断

### 1.1 持久化系统
**问题**：数据存储分散，无统一抽象
- Electron 端：`ProjectService` 用裸 JSON 文件（meta.json, project.json, projects-index.json）
- `ProviderConfigStore` 内联在 runtime.ts 中，独立 JSON 文件
- 前端：`localStorage` 存系统配置，30+ store 文件各自管理读写
- 无 schema 验证、无版本迁移、无存储引擎抽象

### 1.2 插件系统
**问题**：后加的系统未从底层融合
- 类型定义完整（5种类型），但注册表分散（Provider/MCP/Agent 各自独立）
- `CapabilityRegistry` 与三个注册表之间有冗余同步逻辑（syncProviders/syncAllMCP）
- 前端有独立的 `PluginManager`（chat/plugins/），与 electron 端插件系统割裂
- 前端 `providers/` 硬编码了具体 Provider 实现，绕过了插件系统

### 1.3 漫剧工作流
**问题**：硬编码多，无编排能力
- `workflowManager` 是通用队列，但只注册了 1 个处理器
- `shotListGenerator` 硬编码 LLM 调用和 JSON 解析
- 各工作流函数（scene/character/prop）直接导出，无组合编排
- 无 DAG 依赖、无暂停/恢复、无 HITL 门控

## 二、目标架构（参考 Komarefactoring）

### 2.1 持久化系统：ConfigManager + ConfigRegistry
```
ConfigManager (编排)
  ├── StoragePathLoader (引导配置)
  ├── ConfigRegistry (模块注册中心)
  │   ├── JsonStore (轻量配置)
  │   └── SqliteStore (结构化数据，可选)
  └── MigrationManager (版本迁移)
```

### 2.2 插件系统：PluginHost 模式
```
PluginHost (生命周期管理)
  ├── Loader (发现/安装/卸载)
  ├── Runtime (加载/激活/停用)
  ├── CapabilityRegistry (统一能力注册)
  ├── PermissionChecker (权限控制)
  └── ProviderManager (Provider 实例管理)
```

### 2.3 工作流系统：Orchestrator + DAG
```
WorkflowOrchestrator (编排器)
  ├── WorkflowMapper (Plan → DAG)
  ├── WorkflowExecutor (节点执行)
  ├── WorkflowStore (状态持久化)
  └── HITL Gate (人工确认门控)
```

## 三、改造方案（分 3 个阶段）

### 阶段 1：持久化系统统一（优先级最高）
**目标**：建立统一的配置管理基础设施

**步骤**：
1. 新建 `electron/src/service/config/` 目录结构：
   - `types.ts` — ConfigModule, ConfigRecord, IConfigStore 等类型
   - `stores/jsonStore.ts` — JSON 文件存储引擎
   - `registry.ts` — ConfigRegistry 注册中心
   - `manager.ts` — ConfigManager 编排器
   - `migrations/migrationManager.ts` — 版本迁移
   - `modules/` — 各业务模块配置定义

2. 迁移现有配置：
   - `ProviderConfigStore` → ConfigModule `provider-config`
   - 前端 `settings/*` → 对应 ConfigModule（通过 IPC 桥接）
   - `projects-index.json` → ConfigModule `projects-index`

3. 建立 IPC 桥接：
   - `controller/config.ts` — 统一的配置 CRUD IPC handler
   - 前端 `services/configBridge.ts` — 统一的配置访问层

**影响文件**：
- 新建：`electron/src/service/config/*`（~8 个文件）
- 修改：`electron/src/service/plugin/runtime.ts`（移除内联 ProviderConfigStore）
- 修改：`electron/src/main.ts`（初始化 ConfigManager）
- 新建：`electron/src/controller/config.ts`
- 新建：`frontend/src/services/configBridge.ts`

### 阶段 2：插件系统重构
**目标**：清晰的生命周期管理，消除冗余

**步骤**：
1. 重构 `electron/src/service/plugin/` 为 PluginHost 模式：
   - `host/index.ts` — PluginHost 主类（合并 runtime.ts 的职责）
   - `host/loader.ts` — 插件发现/安装/卸载
   - `host/runtime.ts` — 单个插件的运行时（加载模块、创建 API）
   - `host/permissions.ts` — 权限检查
   - `host/manifest.ts` — Manifest 验证（用 zod）

2. 统一 CapabilityRegistry：
   - 移除 `syncProviders/syncAllMCP` 冗余同步
   - CapabilityRegistry 成为唯一的能力注册入口
   - Provider/MCP/Agent 注册表作为 CapabilityRegistry 的内部实现

3. 引入 ProviderManager：
   - `electron/src/service/provider/manager.ts` — 统一 Provider 实例管理
   - `electron/src/service/provider/instance-store.ts` — Provider 实例配置
   - 前端 `providers/` 下的硬编码 Provider 迁移为插件

4. 插件状态持久化：
   - 使用 ConfigRegistry 的 `plugin-state` 模块存储启用状态
   - 应用启动时自动恢复已启用插件

**影响文件**：
- 重构：`electron/src/service/plugin/*`（~10 个文件）
- 新建：`electron/src/service/provider/*`（~3 个文件）
- 修改：`electron/src/controller/plugin.ts`
- 逐步迁移：`frontend/src/providers/*`

### 阶段 3：工作流系统改造
**目标**：DAG 编排替代硬编码，支持暂停/恢复

**步骤**：
1. 建立工作流 DSL：
   - `electron/src/service/workflow/types.ts` — Workflow, Node, Connection 类型
   - `electron/src/service/workflow/graph-dsl.ts` — DAG 定义和验证

2. 实现编排器：
   - `electron/src/service/workflow/orchestrator.ts` — 工作流编排
   - `electron/src/service/workflow/executor.ts` — 节点执行器
   - `electron/src/service/workflow/store.ts` — 运行状态持久化

3. 迁移现有工作流：
   - `shotListGenerator` → WorkflowNode（LLM 调用通过 Provider 系统）
   - `scenePropAssetWorkflow` → WorkflowNode 组合
   - `characterAssetWorkflow` → WorkflowNode 组合
   - `shotRenderWorkflow` → WorkflowNode

4. 前端对接：
   - IPC 事件驱动 UI 更新（workflow:start, node:progress, phase:complete）
   - 工作流可视化组件（进度、状态、操作）

**影响文件**：
- 新建：`electron/src/service/workflow/*`（~5 个文件）
- 重构：`frontend/src/workflow/*`（现有文件改为调用后端编排器）
- 新建：`electron/src/controller/workflow.ts`

## 四、迁移策略

### 兼容性保证
- 阶段 1 完成前，现有 JSON 文件读写逻辑保留
- ConfigRegistry 初始化时自动从旧格式迁移数据
- 前端 store 逐步切换到 configBridge，不一次性替换

### 执行顺序
```
阶段 1（持久化）→ 阶段 2（插件）→ 阶段 3（工作流）
     ↓                  ↓                  ↓
  基础设施          依赖阶段1          依赖阶段1+2
  ~15个文件         ~15个文件          ~12个文件
```

### 风险控制
1. 每个阶段完成后运行完整测试
2. 旧代码保留 deprecated 标记，不立即删除
3. 数据迁移提供回滚机制（备份旧文件）

## 五、不做的事情
- 不引入 SQLite（当前数据量不需要，JSON 足够）
- 不重写前端 UI 组件（只改数据层）
- 不改变 IPC 通信的基本模式（controller 路由保留）
- 不引入新的依赖（zod 除外，用于 schema 验证）
