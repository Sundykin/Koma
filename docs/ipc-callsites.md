# 前端 IPC 调用点清单

> 供 frontend-2 在 Task #5 中直接按清单操作

## 关键结论

**前端代码本身几乎不需要修改。** 所有 IPC 调用都通过两层封装：
1. **Preload 层** (`electron/src/preload/index.ts`) — 唯一直接调用 `ipcRenderer.invoke('rpc:invoke', ...)` 的地方
2. **前端桥接层** (`frontend/src/services/electronService.ts` 等) — 调用 `window.electronAPI.xxx.yyy()`

只要 preload 脚本保持 `window.electronAPI` 接口签名不变，前端代码零改动。

**唯一例外：** `frontend/src/utils/ipcRenderer.ts` 中的 `persistenceClient` 直接使用 `electronAPI.rpc.invoke(channel, args)` 发送原始 channel，需要关注。

---

## 一、Preload 层调用点（需要改动）

文件：`electron/src/preload/index.ts`
改动方式：将 `invokeRpc('domain:action', args)` 改为 `ipcRenderer.invoke('controller/domain/action', args)`

| 行号 | 当前 channel | 新路由 | 需要修改 |
|------|-------------|--------|---------|
| 27 | `window:minimize` | `controller/window/minimize` | yes |
| 28 | `window:maximize` | `controller/window/maximize` | yes |
| 29 | `window:close` | `controller/window/close` | yes |
| 30 | `window:isMaximized` | `controller/window/isMaximized` | yes |
| 33 | `dialog:openFile` | `controller/dialog/openFile` | yes |
| 34 | `dialog:openDirectory` | `controller/dialog/openDirectory` | yes |
| 35 | `dialog:saveFile` | `controller/dialog/saveFile` | yes |
| 38 | `fs:readFile` | `controller/fs/readFile` | yes |
| 39-40 | `fs:writeFile` | `controller/fs/writeFile` | yes |
| 41 | `fs:downloadFile` | `controller/fs/downloadFile` | yes |
| 42 | `fs:exists` | `controller/fs/exists` | yes |
| 43 | `fs:mkdir` | `controller/fs/mkdir` | yes |
| 44 | `fs:readdir` | `controller/fs/readdir` | yes |
| 45 | `fs:stat` | `controller/fs/stat` | yes |
| 46 | `fs:remove` | `controller/fs/remove` | yes |
| 47 | `fs:copy` | `controller/fs/copy` | yes |
| 50 | `app:openExternal` | `controller/app/openExternal` | yes |
| 51 | `app:showItemInFolder` | `controller/app/showItemInFolder` | yes |
| 54 | `app:getPath` | `controller/app/getPath` | yes |
| 55 | `app:getVersion` | `controller/app/getVersion` | yes |
| 58 | `project:list` | `controller/project/list` | yes |
| 59 | `project:create` | `controller/project/create` | yes |
| 60 | `project:load` | `controller/project/load` | yes |
| 61 | `project:save` | `controller/project/save` | yes |
| 62 | `project:update` | `controller/project/update` | yes |
| 63 | `project:delete` | `controller/project/delete` | yes |
| 64 | `project:rebuildIndex` | `controller/project/rebuildIndex` | yes |
| 65-66 | `project:export` | `controller/project/export` | yes |
| 67 | `project:import` | `controller/project/import` | yes |
| 70 | `ffmpeg:isAvailable` | `controller/ffmpeg/isAvailable` | yes |
| 71 | `ffmpeg:getInfo` | `controller/ffmpeg/getInfo` | yes |
| 72 | `ffmpeg:extractFrames` | `controller/ffmpeg/extractFrames` | yes |
| 73 | `ffmpeg:waveform` | `controller/ffmpeg/waveform` | yes |
| 74 | `ffmpeg:splitAudio` | `controller/ffmpeg/splitAudio` | yes |
| 75 | `ffmpeg:getCacheDir` | `controller/ffmpeg/getCacheDir` | yes |
| 76 | `ffmpeg:clearCache` | `controller/ffmpeg/clearCache` | yes |
| 77 | `ffmpeg:cancelTask` | `controller/ffmpeg/cancelTask` | yes |
| 78 | `ffmpeg:clearQueue` | `controller/ffmpeg/clearQueue` | yes |
| 79 | `ffmpeg:encodeVideo` | `controller/ffmpeg/encodeVideo` | yes |
| 80 | `ffmpeg:saveFrames` | `controller/ffmpeg/saveFrames` | yes |
| 83 | `plugin:validate` | `controller/plugin/validate` | yes |
| 84 | `plugin:install` | `controller/plugin/install` | yes |
| 85 | `plugin:uninstall` | `controller/plugin/uninstall` | yes |
| 86 | `plugin:list` | `controller/plugin/list` | yes |
| 87 | `plugin:openFolder` | `controller/plugin/openFolder` | yes |
| 88 | `plugin:activate` | `controller/plugin/activate` | yes |
| 89 | `plugin:deactivate` | `controller/plugin/deactivate` | yes |
| 90 | `plugin:status` | `controller/plugin/status` | yes |
| 91 | `plugin:listActive` | `controller/plugin/listActive` | yes |
| 92 | `plugin:listMCPTools` | `controller/plugin/listMCPTools` | yes |
| 93 | `plugin:listAgents` | `controller/plugin/listAgents` | yes |
| 94-95 | `plugin:listProviderStatus` | `controller/plugin/listProviderStatus` | yes |
| 96-100 | `plugin:testProvider` | `controller/plugin/testProvider` | yes |
| 101 | `plugin:listRuntimeStates` | `controller/plugin/listRuntimeStates` | yes |
| 102 | `plugin:getRuntimeState` | `controller/plugin/getRuntimeState` | yes |
| 105 | `config:get` | `controller/config/get` | yes |
| 106 | `config:set` | `controller/config/set` | yes |
| 107 | `config:reset` | `controller/config/reset` | yes |
| 108 | `config:list` | `controller/config/list` | yes |
| 109-110 | `config:import` | `controller/config/import` | yes |
| 111 | `config:export` | `controller/config/export` | yes |
| 114 | `workflow:start` | `controller/workflow/start` | yes |
| 115 | `workflow:pause` | `controller/workflow/pause` | yes |
| 116 | `workflow:resume` | `controller/workflow/resume` | yes |
| 117 | `workflow:cancel` | `controller/workflow/cancel` | yes |
| 118 | `workflow:approve` | `controller/workflow/approve` | yes |
| 119 | `workflow:getRun` | `controller/workflow/getRun` | yes |
| 120 | `workflow:listRuns` | `controller/workflow/listRuns` | yes |
| 131 | `workflow:delegateResult` | `controller/workflow/delegateResult` | yes |
| 134 | `chat:session:create` | `controller/chat/createSession` | yes |
| 135 | `chat:session:get` | `controller/chat/getSession` | yes |
| 136 | `chat:session:dispose` | `controller/chat/disposeSession` | yes |
| 137 | `chat:session:list` | `controller/chat/listSessions` | yes |
| 138-139 | `chat:session:updateConfig` | `controller/chat/updateSessionConfig` | yes |
| 140-141 | `chat:message:send` | `controller/chat/sendMessage` | yes |
| 142-143 | `chat:message:sendStream` | `controller/chat/sendMessageStream` | yes |
| 144-145 | `chat:message:cancel` | `controller/chat/cancelStream` | yes |
| 163 | `chat:mcp:connect` | `controller/mcp/connect` | yes |
| 164 | `chat:mcp:disconnect` | `controller/mcp/disconnect` | yes |
| 165 | `chat:mcp:list` | `controller/mcp/list` | yes |
| 166 | `chat:mcp:listTools` | `controller/mcp/listTools` | yes |
| 167 | `chat:mcp:listResources` | `controller/mcp/listResources` | yes |
| 168 | `chat:mcp:readResource` | `controller/mcp/readResource` | yes |
| 169 | `chat:mcp:callTool` | `controller/mcp/callTool` | yes |
| 170 | `chat:mcp:importConfig` | `controller/mcp/importConfig` | yes |
| 171 | `chat:mcp:exportConfig` | `controller/mcp/exportConfig` | yes |
| 174 | `chat:tools:list` | `controller/chat/listTools` | yes |
| 175 | `chat:tools:call` | `controller/chat/callTool` | yes |
| 178 | `chat:capability:list` | `controller/chat/listCapabilities` | yes |
| 179 | `chat:capability:invoke` | `controller/chat/invokeCapability` | yes |
| 180 | `chat:capability:resolve` | `controller/chat/resolveCapabilities` | yes |
| 183 | `chat:history:loadMessages` | `controller/chat/loadHistory` | yes |
| 184 | `chat:history:saveMessages` | `controller/chat/saveHistory` | yes |
| 185 | `chat:history:deleteMessages` | `controller/chat/deleteHistory` | yes |
| 189-190 | `persistence:list` | `controller/persistence/list` | yes |
| 191-192 | `persistence:find` | `controller/persistence/find` | yes |
| 193-194 | `persistence:findById` | `controller/persistence/findById` | yes |
| 195-196 | `persistence:save` | `controller/persistence/save` | yes |
| 197-198 | `persistence:delete` | `controller/persistence/delete` | yes |
| 199-200 | `persistence:batchSave` | `controller/persistence/batchSave` | yes |
| 203 | `event:emit` | 迁移到插件 SDK `emitGlobalEvent` | yes |
| 204 | `event:subscribe` | 迁移到插件 SDK `onGlobalEvent` | yes |
| 205 | `event:unsubscribe` | 迁移到插件 SDK 取消订阅 | yes |

### Preload 层事件监听（`ipcRenderer.on`）

| 行号 | 当前 channel | 说明 | 需要修改 |
|------|-------------|------|---------|
| 121-124 | `workflow:${event}` | 工作流事件推送 | yes - 需对齐新事件 channel |
| 126-128 | `workflow:delegate` | 工作流委托执行 | yes |
| 146-148 | `chat:stream:chunk` | 聊天流式 chunk | yes - 改为 `chat:stream:{streamId}:data` |
| 150-152 | `chat:stream:tool` | 聊天流式工具调用 | yes - 合并到 data channel |
| 154-156 | `chat:stream:done` | 聊天流结束 | yes - 改为 `chat:stream:{streamId}:end` |
| 158-160 | `chat:stream:error` | 聊天流错误 | yes - 改为 `chat:stream:{streamId}:error` |
| 206-209 | `event:message` | 事件总线消息 | yes - 迁移到插件 SDK |

---

## 二、前端桥接层调用点（可能不需要改动）

以下文件通过 `window.electronAPI.xxx.yyy()` 调用，只要 preload 保持接口签名不变，**无需修改**。

### `frontend/src/services/electronService.ts`
- 行 175: `(window as any).electronAPI` — 获取 API 入口
- 行 188-198: `electronAPI.window.{minimize,maximize,close,isMaximized}` — no
- 行 206-224: `electronAPI.dialog.{openFile,openDirectory,saveFile}` — no
- 行 228-314: `electronAPI.fs.{readFile,writeFile,exists,mkdir,...}` — no
- 行 326-342: `electronAPI.shell.{openExternal,showItemInFolder,openPath}` — no
- 行 347-380: `electronAPI.app.{getPath,getVersion}` — no
- 行 384-427: `electronAPI.project.{list,create,load,save,...}` — no
- 行 429-465: `electronAPI.plugin.{listProviderStatus,testProvider,...}` — no
- 行 532-571: `electronService.ipc.invoke(channel)` — **需要关注**，内部 switch 匹配 `plugin:xxx` channel

| 行号 | 调用方式 | 需要修改 |
|------|---------|---------|
| 175 | `window.electronAPI` | no |
| 188-465 | `electronAPI.{domain}.{method}()` | no |
| 532-571 | `electronService.ipc.invoke('plugin:xxx')` | no（内部转发到 electronAPI.plugin.xxx） |

### `frontend/src/utils/ipcRenderer.ts`
- 行 32-38: `electronAPI.rpc.invoke(channel, args)` — **需要关注**

| 行号 | 调用方式 | 当前 channel | 需要修改 |
|------|---------|-------------|---------|
| 38 | `electronAPI.rpc.invoke(channel, args)` | 动态 channel | **取决于 preload 是否保留 rpc.invoke** |
| 71 | `invokeDomainAction('persistence:list', ...)` | `persistence:list` | 同上 |
| 73 | `invokeDomainAction('persistence:find', ...)` | `persistence:find` | 同上 |
| 75 | `invokeDomainAction('persistence:findById', ...)` | `persistence:findById` | 同上 |
| 77 | `invokeDomainAction('persistence:save', ...)` | `persistence:save` | 同上 |
| 79 | `invokeDomainAction('persistence:delete', ...)` | `persistence:delete` | 同上 |
| 81 | `invokeDomainAction('persistence:batchSave', ...)` | `persistence:batchSave` | 同上 |
| 84-231 | `createEventBusClient()` | 通过 `electronAPI.eventBus` | no（preload 封装） |

### `frontend/src/chat/ipc/chatIPC.ts`
- 行 144-157: 通过 `electronAPI.chat.xxx()` 调用

| 行号 | 调用方式 | 需要修改 |
|------|---------|---------|
| 162 | `api.createSession(config)` | no |
| 167 | `api.getSession(sessionId)` | no |
| 172 | `api.disposeSession(sessionId)` | no |
| 177 | `api.listSessions(windowId)` | no |
| 185 | `api.updateSessionConfig(sessionId, config)` | no |
| 196 | `api.sendMessage(sessionId, input, options)` | no |
| 205 | `api.sendMessageStream(sessionId, input, options)` | no |
| 210 | `api.cancelStream(requestIdOrSessionId)` | no |
| 220 | `api.onStreamChunk(callback)` | no |
| 225 | `api.onStreamTool(callback)` | no |
| 230 | `api.onStreamDone(callback)` | no |
| 235 | `api.onStreamError(callback)` | no |
| 242 | `api.mcp.connect(config)` | no |
| 247 | `api.mcp.disconnect(name)` | no |
| 255 | `api.mcp.list(includeTools)` | no |
| 260 | `api.mcp.listTools()` | no |
| 265 | `api.mcp.callTool(name, args)` | no |
| 272 | `api.tools.list()` | no |
| 277 | `api.tools.call(name, args)` | no |

### `frontend/src/services/mcpService.ts`
- 行 30-33: 通过 `electronAPI.chat.mcp.xxx()` 调用

| 行号 | 调用方式 | 需要修改 |
|------|---------|---------|
| 47 | `api.chat.mcp.connect(config)` | no |
| 58 | `api.chat.mcp.disconnect(name)` | no |
| 69 | `api.chat.mcp.list(includeTools)` | no |
| 80 | `api.chat.mcp.listTools()` | no |
| 91 | `api.chat.mcp.listResources()` | no |
| 102 | `api.chat.mcp.callTool(name, args)` | no |
| 113 | `api.chat.mcp.readResource(uri)` | no |

### `frontend/src/services/configBridge.ts`
- 行 20: 通过 `electronAPI.config.xxx()` 调用

| 行号 | 调用方式 | 需要修改 |
|------|---------|---------|
| 28 | `api.get(moduleId)` | no |
| 43 | `api.set(moduleId, payload)` | no |
| 55 | `api.reset(moduleId)` | no |
| 67 | `api.list()` | no |
| 81 | `api.import(moduleId, payload, filePath)` | no |
| 96 | `api.export(moduleId, filePath)` | no |

### `frontend/src/services/workflowBridge.ts`
- 行 11: 通过 `electronAPI.workflow.xxx()` 调用

| 行号 | 调用方式 | 需要修改 |
|------|---------|---------|
| 22 | `api.start(definition, context)` | no |
| 35 | `api.pause(runId)` | no |
| 47 | `api.resume(runId)` | no |
| 59 | `api.cancel(runId)` | no |
| 74 | `api.approve(runId, nodeId)` | no |
| 86 | `api.getRun(runId)` | no |
| 97 | `api.listRuns()` | no |
| 110 | `api.onEvent(event, callback)` | no |
| 128 | `api.onDelegate(callback)` | no |
| 132 | `api.sendDelegateResult(delegateId, result, error)` | no |

### `frontend/src/store/chatHistoryStore.ts`
- 行 42: 通过 `electronAPI.chat.history.xxx()` 调用

| 行号 | 调用方式 | 需要修改 |
|------|---------|---------|
| 42 | `electronAPI.chat.history` | no |

### `frontend/src/services/ffmpegManager.ts`
- 行 74: 通过 `electronAPI.ffmpeg.xxx()` 调用

| 行号 | 调用方式 | 需要修改 |
|------|---------|---------|
| 74 | `api.ffmpeg` | no |

### `frontend/src/services/exportRenderer.ts`
- 行 312: 通过 `electronAPI.ffmpeg.xxx()` 调用

| 行号 | 调用方式 | 需要修改 |
|------|---------|---------|
| 312 | `(getElectronAPI() as any)?.ffmpeg` | no |

### `frontend/src/services/simpleExportRenderer.ts`
- 行 41: 通过 `electronAPI.ffmpeg.xxx()` 调用

| 行号 | 调用方式 | 需要修改 |
|------|---------|---------|
| 41 | `api?.ffmpeg` | no |

### `frontend/src/services/uploadService.ts`
- 行 27: 通过 `electronAPI.assets.xxx()` 调用

| 行号 | 调用方式 | 需要修改 |
|------|---------|---------|
| 27 | `api?.assets` | no（注意：preload 中未暴露 assets，可能是未实现的功能） |

### `frontend/src/services/imageHostingService.ts`
- 行 208-216: 通过 `electronAPI.fs.readFile()` 调用

| 行号 | 调用方式 | 需要修改 |
|------|---------|---------|
| 208-216 | `electronAPI.fs.readFile(localPath)` | no |

### `frontend/src/providers/tts/OpenAITTSProvider.ts`
- 行 74-81: 通过 `electronAPI.{app,fs}.xxx()` 调用

| 行号 | 调用方式 | 需要修改 |
|------|---------|---------|
| 77 | `electronAPI.app.getPath('temp')` | no |
| 80 | `electronAPI.fs.mkdir(...)` | no |
| 81 | `electronAPI.fs.writeFile(...)` | no |

---

## 三、persistenceClient 使用点（间接 IPC 调用）

以下文件通过 `persistenceClient` 间接调用 `invokeDomainAction` → `electronAPI.rpc.invoke`。
如果 preload 保留 `rpc.invoke` 兼容层，则无需修改。

| 文件 | 行号 | 调用 | 需要修改 |
|------|------|------|---------|
| `store/project/core.ts` | 55-56 | `persistenceClient.save(projectId, 'project/timeline', ...)` | no |
| `store/project/core.ts` | 113 | `persistenceClient.findById(projectId, 'project', ...)` | no |
| `store/project/core.ts` | 122 | `persistenceClient.save(project.id, 'project', ...)` | no |
| `store/project/episodes.ts` | 31 | `persistenceClient.save(projectId, 'episode', ...)` | no |
| `store/project/episodes.ts` | 42 | `persistenceClient.findById(projectId, 'episode', ...)` | no |
| `store/project/episodes.ts` | 64 | `persistenceClient.save(projectId, 'episode', ...)` | no |
| `store/project/episodes.ts` | 75 | `persistenceClient.delete(projectId, 'episode', ...)` | no |
| `store/project/episodes.ts` | 86 | `persistenceClient.list(projectId, 'episode')` | no |
| `store/project/shots.ts` | 22 | `persistenceClient.findById(projectId, 'shot', ...)` | no |
| `store/project/shots.ts` | 85 | `persistenceClient.save(projectId, 'shot', ...)` | no |
| `store/project/shots.ts` | 99 | `persistenceClient.findById(projectId, 'shot', ...)` | no |
| `store/project/shots.ts` | 111 | `persistenceClient.list(projectId, 'shot')` | no |
| `store/project/entities.ts` | 9 | `persistenceClient.list(projectId, 'character')` | no |
| `store/project/entities.ts` | 17 | `persistenceClient.save(projectId, 'character', ...)` | no |
| `store/project/entities.ts` | 22 | `persistenceClient.list(projectId, 'scene')` | no |
| `store/project/entities.ts` | 30 | `persistenceClient.save(projectId, 'scene', ...)` | no |
| `store/project/entities.ts` | 35 | `persistenceClient.list(projectId, 'shot')` | no |
| `store/project/entities.ts` | 43 | `persistenceClient.save(projectId, 'shot', ...)` | no |
| `store/project/assets.ts` | 35 | `persistenceClient.save(projectId, 'asset', ...)` | no |
| `store/project/assets.ts` | 90 | `persistenceClient.list(projectId, 'asset')` | no |
| `store/project/assets.ts` | 127 | `persistenceClient.save(projectId, 'asset', ...)` | no |
| `store/project/assets.ts` | 142 | `persistenceClient.save(projectId, 'asset', ...)` | no |
| `store/project/assets.ts` | 167 | `persistenceClient.save(projectId, 'asset', ...)` | no |
| `store/project/assetStorage.ts` | 104 | `persistenceClient.list(projectId, 'prop')` | no |
| `store/project/assetStorage.ts` | 116 | `persistenceClient.save(projectId, 'prop', ...)` | no |
| `store/project/assetStorage.ts` | 128 | `persistenceClient.save(projectId, 'prop', ...)` | no |
| `store/project/assetStorage.ts` | 142 | `persistenceClient.findById(projectId, 'shot', ...)` | no |
| `store/project/assetStorage.ts` | 154 | `persistenceClient.save(projectId, 'shot', ...)` | no |
| `store/project/assetStorage.ts` | 166 | `persistenceClient.findById(projectId, 'shot', ...)` | no |
| `store/project/assetStorage.ts` | 196 | `persistenceClient.save(projectId, 'shot', ...)` | no |
| `store/project/analysis.ts` | 32 | `persistenceClient.save(projectId, 'episodeAnalysis', ...)` | no |
| `store/project/analysis.ts` | 45 | `persistenceClient.findById(projectId, 'episodeAnalysis', ...)` | no |
| `store/project/analysis.ts` | 97 | `persistenceClient.save(projectId, 'episodeAnalysis', ...)` | no |
| `store/project/analysis.ts` | 108 | `persistenceClient.findById(projectId, 'episodeTimeline', ...)` | no |
| `store/project/analysis.ts` | 126 | `persistenceClient.save(projectId, 'episodeTimeline', ...)` | no |
| `store/project/analysis.ts` | 156 | `persistenceClient.delete(projectId, 'episodeAnalysis', ...)` | no |
| `store/project/timeline.ts` | 9 | `persistenceClient.findById(projectId, 'timeline', ...)` | no |
| `store/project/timeline.ts` | 20 | `persistenceClient.save(projectId, 'timeline', ...)` | no |
| `store/project/manju.ts` | 84 | `persistenceClient.save(projectId, 'project', ...)` | no |
| `store/project/manju.ts` | 87 | `persistenceClient.save(projectId, 'timeline', ...)` | no |
| `store/project/manju.ts` | 90-92 | `persistenceClient.save(projectId, 'character/scene/shot', ...)` | no |

---

## 四、迁移操作建议

### 方案 A（推荐）：仅改 Preload，前端零改动
1. 在新 preload 中保持 `window.electronAPI` 完全相同的接口签名
2. 内部将 `invokeRpc('domain:action')` 改为 `ipcRenderer.invoke('controller/domain/action')`
3. 保留 `rpc.invoke` 兼容层（内部做 channel 格式转换）
4. 前端代码 **零改动**

### 方案 B：同时改 Preload + 前端 ipcRenderer.ts
1. 删除 `rpc.invoke` 统一入口
2. `persistenceClient` 改为通过 `electronAPI.persistence.xxx()` 调用
3. 删除 `invokeDomainAction` 和 `unwrapIPCResponse`（ee-core 框架处理错误包装）
4. 需要改动 `frontend/src/utils/ipcRenderer.ts`

### 推荐方案 A，因为：
- 改动范围最小（仅 1 个文件）
- 不影响前端任何业务逻辑
- 可以在后端迁移完成后独立验证
