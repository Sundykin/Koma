# Koma → electron-egg 架构迁移方案

## 一、架构差异对比表

| 维度 | Koma (当前) | electron-egg (目标) |
|------|------------|-------------------|
| **启动入口** | `electron/src/main.ts` 手动 `app.whenReady()` + `bootstrap()` | `electron/main.ts` 使用 `ElectronEgg` 类 + `app.register()` 生命周期钩子 |
| **生命周期** | 自定义 `Lifecycle` 类，手动绑定 `app` 事件 | ee-core 框架管理，注册 `ready / electron-app-ready / window-ready / before-close` |
| **IPC 路由** | 单一 `rpc:invoke` handle，`domain:action` 格式（冒号分隔），手动分发到 controllers | ee-core 自动扫描 controller，`controller/domain/action` 格式（斜杠分隔），框架自动注册 |
| **Controller** | 继承 `BaseController`，手动注册到 `controllers` 对象 | 普通 class + `export default`，ee-core 自动发现并注册 IPC handle |
| **Service 层** | 手动实例化单例，通过 `services` 对象聚合 | 同样手动单例，但初始化在 `preload` 钩子中统一执行 |
| **Preload 脚本** | `contextBridge.exposeInMainWorld('electronAPI', {...})`，每个 API 调用 `invokeRpc('domain:action', args)` | `contextBridge.exposeInMainWorld('electron/electronAPI', {...})`，每个 API 调用 `ipcRenderer.invoke('controller/domain/action', args)` |
| **配置系统** | 自定义 `EEConfig` 类型 + `defaultConfig` 对象 | ee-core `AppConfig` 类型，`config.default.ts / config.local.ts / config.prod.ts` 分环境 |
| **持久层** | JSON 文件存储 (`PersistenceService`)，无 SQLite | SQLite (`better-sqlite3` via `ee-core/storage`)，`BasedbService` 基类 |
| **插件系统** | `PluginService` + `ElectronPluginRuntime`，Worker 沙箱，zip 安装 | `pluginHost` + `PluginRuntime`，沙箱加载，能力点注册表 + MCP Gateway |
| **事件总线** | 自定义 `appEventBus` + renderer 订阅机制 | 插件 SDK `onGlobalEvent` / `emitGlobalEvent` |
| **窗口管理** | 自定义 `createMainWindow()` | ee-core `getMainWindow()`，配置驱动 |
| **日志** | `console.log/error` | `ee-core/log` 的 `logger` |
| **构建工具** | `concurrently` + 手动 `tsc` | `ee-bin` CLI 统一管理 dev/build/encrypt |

## 二、迁移步骤（按优先级排序）

### P0 - 基础框架切换（阻塞所有后续工作）

#### 步骤 1：引入 ee-core 依赖并改造入口
- 安装 `ee-core`、`ee-bin` 依赖
- 将 `electron/src/main.ts` 改为 ee-core 的 `ElectronEgg` 启动模式
- 创建 `electron/preload/lifecycle.ts` 实现四个生命周期钩子
- 创建 `electron/preload/index.ts` 作为服务初始化入口

**涉及文件：**
- `electron/src/main.ts` → 重写为 `electron/main.ts`
- 新建 `electron/preload/lifecycle.ts`
- `electron/src/lifecycle/index.ts` → 删除
- `electron/src/bootstrap/window.ts` → 迁移到 lifecycle.windowReady
- `electron/src/bootstrap/protocol.ts` → 迁移到 lifecycle.ready

#### 步骤 2：配置系统迁移
- 创建 `electron/config/config.default.ts`（ee-core AppConfig 格式）
- 创建 `electron/config/config.local.ts`（开发环境覆盖）
- 创建 `electron/config/config.prod.ts`（生产环境覆盖）
- 保留现有 `service/config` 业务配置管理器

**涉及文件：**
- `electron/src/config/index.ts` → 拆分为 ee-core 配置 + 业务配置
- 新建 `electron/config/config.default.ts`
- 新建 `electron/config/config.local.ts`
- 新建 `electron/config/config.prod.ts`

### P1 - IPC 路由迁移（核心通信层）

#### 步骤 3：Controller 改造为 ee-core 规范
- 移除 `BaseController` 基类依赖
- 每个 controller 改为 `export default ControllerClass` 格式
- 方法签名保持 `(args, event?)` 不变
- 删除 `electron/src/ipc/router.ts` 手动路由注册
- 删除 `electron/src/ipc/contracts.ts`（ee-core 框架处理错误包装）

**涉及文件：**
- `electron/src/controller/*.ts` → 全部改造
- `electron/src/controller/index.ts` → 删除（ee-core 自动发现）
- `electron/src/controller/base.ts` → 删除
- `electron/src/ipc/router.ts` → 删除
- `electron/src/ipc/contracts.ts` → 删除
- `electron/src/ipc/eventBus.ts` → 迁移到插件 SDK 事件系统

#### 步骤 4：Preload 脚本适配
- IPC channel 格式从 `domain:action` 改为 `controller/domain/action`
- 移除 `rpc:invoke` 统一入口，改为直接 `ipcRenderer.invoke`
- 保持 `window.electronAPI` 接口不变，仅改底层调用

**涉及文件：**
- `electron/src/preload/index.ts` → 重写

### P2 - 持久层迁移

#### 步骤 5：引入 SQLite 持久层
- 创建 `electron/service/database/basedb.ts`（继承 ee-core SqliteStorage）
- 创建 `electron/service/database/sqlitedb.ts`
- 将 `PersistenceService` 的 JSON 文件存储逐步迁移到 SQLite
- 项目数据（project/episode/shot/character）迁移到 SQLite 表

**涉及文件：**
- 新建 `electron/service/database/basedb.ts`
- 新建 `electron/service/database/sqlitedb.ts`
- `electron/src/service/persistence.ts` → 重构为 SQLite 后端
- `electron/src/service/project.ts` → 适配 SQLite

### P3 - 插件系统对齐

#### 步骤 6：插件系统迁移
- 将 `PluginService` (zip 安装/卸载) 迁移到 `pluginHost` 模式
- 保留 Worker 沙箱机制
- 引入 `ee-core/log` 替换 console.log
- 对齐能力点注册表和 MCP Gateway

**涉及文件：**
- `electron/src/service/plugin.ts` → 重构
- `electron/src/service/plugin/runtime.ts` → 对齐 electron-egg 的 runtime
- `electron/src/service/plugin/sandbox/` → 保留，适配新接口
- `electron/src/service/plugin/registries/` → 对齐 capabilityRegistry
- `electron/src/service/plugin/capability/` → 对齐

### P4 - 日志和工具链

#### 步骤 7：日志系统替换
- 全局替换 `console.log/error/warn` 为 `logger.info/error/warn`
- 引入 `ee-core/log`

#### 步骤 8：构建工具链迁移
- 配置 `ee-bin` 替代 `concurrently` + 手动脚本
- 更新 `package.json` scripts

## 三、IPC 路由映射表

### 旧 channel → 新 ee-core 路由

| 旧 channel (domain:action) | 新路由 (controller/domain/action) |
|---------------------------|----------------------------------|
| `window:minimize` | `controller/window/minimize` |
| `window:maximize` | `controller/window/maximize` |
| `window:close` | `controller/window/close` |
| `window:isMaximized` | `controller/window/isMaximized` |
| `dialog:openFile` | `controller/dialog/openFile` |
| `dialog:openDirectory` | `controller/dialog/openDirectory` |
| `dialog:saveFile` | `controller/dialog/saveFile` |
| `fs:readFile` | `controller/fs/readFile` |
| `fs:writeFile` | `controller/fs/writeFile` |
| `fs:downloadFile` | `controller/fs/downloadFile` |
| `fs:exists` | `controller/fs/exists` |
| `fs:mkdir` | `controller/fs/mkdir` |
| `fs:readdir` | `controller/fs/readdir` |
| `fs:stat` | `controller/fs/stat` |
| `fs:remove` | `controller/fs/remove` |
| `fs:copy` | `controller/fs/copy` |
| `app:openExternal` | `controller/app/openExternal` |
| `app:showItemInFolder` | `controller/app/showItemInFolder` |
| `app:getPath` | `controller/app/getPath` |
| `app:getVersion` | `controller/app/getVersion` |
| `project:list` | `controller/project/list` |
| `project:create` | `controller/project/create` |
| `project:load` | `controller/project/load` |
| `project:save` | `controller/project/save` |
| `project:update` | `controller/project/update` |
| `project:delete` | `controller/project/delete` |
| `project:rebuildIndex` | `controller/project/rebuildIndex` |
| `project:export` | `controller/project/export` |
| `project:import` | `controller/project/import` |
| `ffmpeg:isAvailable` | `controller/ffmpeg/isAvailable` |
| `ffmpeg:getInfo` | `controller/ffmpeg/getInfo` |
| `ffmpeg:extractFrames` | `controller/ffmpeg/extractFrames` |
| `ffmpeg:waveform` | `controller/ffmpeg/waveform` |
| `ffmpeg:splitAudio` | `controller/ffmpeg/splitAudio` |
| `ffmpeg:getCacheDir` | `controller/ffmpeg/getCacheDir` |
| `ffmpeg:clearCache` | `controller/ffmpeg/clearCache` |
| `ffmpeg:cancelTask` | `controller/ffmpeg/cancelTask` |
| `ffmpeg:clearQueue` | `controller/ffmpeg/clearQueue` |
| `ffmpeg:encodeVideo` | `controller/ffmpeg/encodeVideo` |
| `ffmpeg:saveFrames` | `controller/ffmpeg/saveFrames` |
| `plugin:validate` | `controller/plugin/validate` |
| `plugin:install` | `controller/plugin/install` |
| `plugin:uninstall` | `controller/plugin/uninstall` |
| `plugin:list` | `controller/plugin/list` |
| `plugin:openFolder` | `controller/plugin/openFolder` |
| `plugin:activate` | `controller/plugin/activate` |
| `plugin:deactivate` | `controller/plugin/deactivate` |
| `plugin:status` | `controller/plugin/status` |
| `plugin:listActive` | `controller/plugin/listActive` |
| `plugin:listMCPTools` | `controller/plugin/listMCPTools` |
| `plugin:listAgents` | `controller/plugin/listAgents` |
| `plugin:listProviderStatus` | `controller/plugin/listProviderStatus` |
| `plugin:testProvider` | `controller/plugin/testProvider` |
| `plugin:listRuntimeStates` | `controller/plugin/listRuntimeStates` |
| `plugin:getRuntimeState` | `controller/plugin/getRuntimeState` |
| `config:get` | `controller/config/get` |
| `config:set` | `controller/config/set` |
| `config:reset` | `controller/config/reset` |
| `config:list` | `controller/config/list` |
| `config:import` | `controller/config/import` |
| `config:export` | `controller/config/export` |
| `workflow:start` | `controller/workflow/start` |
| `workflow:pause` | `controller/workflow/pause` |
| `workflow:resume` | `controller/workflow/resume` |
| `workflow:cancel` | `controller/workflow/cancel` |
| `workflow:approve` | `controller/workflow/approve` |
| `workflow:getRun` | `controller/workflow/getRun` |
| `workflow:listRuns` | `controller/workflow/listRuns` |
| `workflow:delegateResult` | `controller/workflow/delegateResult` |
| `chat:session:create` | `controller/chat/createSession` |
| `chat:session:get` | `controller/chat/getSession` |
| `chat:session:dispose` | `controller/chat/disposeSession` |
| `chat:session:list` | `controller/chat/listSessions` |
| `chat:session:updateConfig` | `controller/chat/updateSessionConfig` |
| `chat:message:send` | `controller/chat/sendMessage` |
| `chat:message:sendStream` | `controller/chat/sendMessageStream` |
| `chat:message:cancel` | `controller/chat/cancelStream` |
| `chat:mcp:connect` | `controller/mcp/connect` |
| `chat:mcp:disconnect` | `controller/mcp/disconnect` |
| `chat:mcp:list` | `controller/mcp/list` |
| `chat:mcp:listTools` | `controller/mcp/listTools` |
| `chat:mcp:listResources` | `controller/mcp/listResources` |
| `chat:mcp:readResource` | `controller/mcp/readResource` |
| `chat:mcp:callTool` | `controller/mcp/callTool` |
| `chat:mcp:importConfig` | `controller/mcp/importConfig` |
| `chat:mcp:exportConfig` | `controller/mcp/exportConfig` |
| `chat:tools:list` | `controller/chat/listTools` |
| `chat:tools:call` | `controller/chat/callTool` |
| `chat:capability:list` | `controller/chat/listCapabilities` |
| `chat:capability:invoke` | `controller/chat/invokeCapability` |
| `chat:capability:resolve` | `controller/chat/resolveCapabilities` |
| `chat:history:loadMessages` | `controller/chat/loadHistory` |
| `chat:history:saveMessages` | `controller/chat/saveHistory` |
| `chat:history:deleteMessages` | `controller/chat/deleteHistory` |
| `event:emit` | 迁移到插件 SDK `emitGlobalEvent` |
| `event:subscribe` | 迁移到插件 SDK `onGlobalEvent` |
| `event:unsubscribe` | 迁移到插件 SDK 取消订阅 |

### 事件推送 channel 映射

| 旧事件 channel | 新事件 channel | 说明 |
|---------------|---------------|------|
| `event:message` | 保留或迁移到 `ipcRenderer.on` 直接监听 | 通用事件总线 |
| `chat:stream:chunk` | `chat:stream:{streamId}:data` | 流式数据按 streamId 隔离 |
| `chat:stream:tool` | `chat:stream:{streamId}:data` (type=step) | 合并到 data channel |
| `chat:stream:done` | `chat:stream:{streamId}:end` | 流结束 |
| `chat:stream:error` | `chat:stream:{streamId}:error` | 流错误 |
| `workflow:*` | `anime:*` 系列事件 | 工作流事件对齐 |

## 四、需要改动的文件清单

### 删除的文件
- `electron/src/main.ts` (重写为 `electron/main.ts`)
- `electron/src/lifecycle/index.ts`
- `electron/src/ipc/router.ts`
- `electron/src/ipc/contracts.ts`
- `electron/src/ipc/eventBus.ts`
- `electron/src/controller/base.ts`
- `electron/src/controller/index.ts`

### 新建的文件
- `electron/main.ts` (ee-core 入口)
- `electron/preload/lifecycle.ts`
- `electron/preload/index.ts` (服务初始化)
- `electron/config/config.default.ts`
- `electron/config/config.local.ts`
- `electron/config/config.prod.ts`
- `electron/service/database/basedb.ts`
- `electron/service/database/sqlitedb.ts`

### 重构的文件
- `electron/src/controller/app.ts` → 移除 BaseController 继承
- `electron/src/controller/window.ts` → 移除 BaseController 继承
- `electron/src/controller/dialog.ts` → 移除 BaseController 继承
- `electron/src/controller/fs.ts` → 移除 BaseController 继承
- `electron/src/controller/project.ts` → 移除 BaseController 继承
- `electron/src/controller/ffmpeg.ts` → 移除 BaseController 继承
- `electron/src/controller/plugin.ts` → 适配新插件系统
- `electron/src/controller/chat.ts` → 适配新路由
- `electron/src/controller/config.ts` → 适配新配置系统
- `electron/src/controller/workflow.ts` → 适配新路由
- `electron/src/controller/persistence.ts` → 适配 SQLite
- `electron/src/preload/index.ts` → 重写 IPC channel 格式
- `electron/src/service/plugin.ts` → 对齐 pluginHost
- `electron/src/service/plugin/runtime.ts` → 对齐 ee-core runtime
- `electron/src/service/persistence.ts` → SQLite 后端
- `electron/src/service/project.ts` → SQLite 后端
- `electron/src/service/index.ts` → 适配新初始化流程
- `electron/src/bootstrap/window.ts` → 迁移到 lifecycle
- `electron/src/bootstrap/protocol.ts` → 迁移到 lifecycle
- `package.json` → 更新依赖和 scripts

### 前端适配文件
- `frontend/src/services/` 下所有调用 `window.electronAPI.rpc.invoke()` 的文件
- 如果前端直接使用 `electronAPI.xxx.yyy()` 形式，则无需改动（preload 层已封装）

## 五、风险点和注意事项

### 高风险
1. **IPC 路由格式变更**：从 `domain:action` 到 `controller/domain/action` 是全局性变更。如果前端有直接调用 `rpc:invoke` 的地方（绕过 preload 封装），需要逐一排查。
2. **ee-core 版本兼容性**：ee-core 的 controller 自动发现机制依赖特定目录结构（`electron/controller/`），需确保目录布局符合框架约定。
3. **持久层迁移数据丢失**：从 JSON 文件迁移到 SQLite 需要编写数据迁移脚本，确保现有项目数据不丢失。

### 中风险
4. **事件总线重构**：当前 `appEventBus` 支持 owner 级别的订阅管理和 renderer 订阅清理，迁移到插件 SDK 事件系统后需确保这些能力不丢失。
5. **插件系统兼容性**：现有已安装的插件（zip 格式 + manifest.json）需要确保在新 pluginHost 下仍能正常加载。
6. **Worker 沙箱差异**：两个项目的沙箱实现细节不同，需要仔细对齐 API 桥接层。

### 低风险
7. **日志替换**：纯机械替换，但需注意 `ee-core/log` 的日志级别和输出格式差异。
8. **构建工具链**：`ee-bin` 有自己的约定，需要调整项目目录结构以适配。
9. **TypeScript 编译配置**：ee-core 可能有自己的 tsconfig 要求，需要合并。

### 迁移策略建议
- 采用**渐进式迁移**，每个步骤完成后确保应用可启动
- P0 步骤完成后立即验证基本窗口创建和 IPC 通信
- 持久层迁移（P2）可以先保留 JSON 后端作为 fallback，SQLite 作为新数据的默认存储
- 插件系统迁移（P3）建议最后进行，因为它依赖其他所有层的稳定
