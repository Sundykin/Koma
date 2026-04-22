## 1. Schema 与 DDL

- [x] 1.1 在 `electron/service/storage/schema.ts` 提升 `CURRENT_SCHEMA_VERSION` 并新增配置表 DDL（`channel_configs`、`prompt_templates`、`visual_style_presets`、`plugin_registry`、`mcp_servers`、`agent_profiles`、`recent_projects`、`kv_configs`）
- [x] 1.2 为上述表补齐索引（`channel_configs(kind, is_default)`、`prompt_templates(type)`、`recent_projects(last_opened_at DESC)` 等）
- [x] 1.3 在升级脚本中加入幂等 seed：内置 Prompt 模板、内置视觉风格预设（使用 `INSERT OR IGNORE`，跳过 `user_modified_at IS NOT NULL` 行）
- [x] 1.4 编写 schema 升级单元测试（in-memory SQLite，从空库升级到最新版本）

## 2. 加密工具下沉到 Repository 层

- [x] 2.1 `frontend/src/store/encryption.ts` 已删除（M5 批次一并清理）；无调用残留。
- [x] 2.2 在 `electron/service/storage/` 新增字段级加密工具 `fieldCrypto.ts`（基于 machineId 派生 AES-256-GCM）
- [x] 2.3 定义 `encrypted:` 前缀约定与解密失败 fallback（返回空串 + 日志警告）

## 3. Repository 接口与实现

- [x] 3.1 在 `electron/service/storage/repositories/interfaces.ts` 新增：`IChannelConfigRepository`、`IPromptTemplateRepository`、`IVisualStylePresetRepository`、`IPluginRegistryRepository`、`IMCPServerRepository`、`IAgentProfileRepository`、`IRecentProjectRepository`、`IKvConfigRepository`
- [x] 3.2 实现 `SqliteChannelConfigRepository`（包含字段级加密）
- [x] 3.3 实现 `SqlitePromptTemplateRepository`（含 `upsert`、`reset`、种子判定）
- [x] 3.4 实现 `SqliteVisualStylePresetRepository`（禁止删除 `is_builtin=1`）
- [x] 3.5 实现 `SqlitePluginRegistryRepository`
- [x] 3.6 实现 `SqliteMCPServerRepository`（`auth_token` 加密）
- [x] 3.7 实现 `SqliteAgentProfileRepository`
- [x] 3.8 实现 `SqliteRecentProjectRepository`（UPSERT `last_opened_at`）
- [x] 3.9 实现 `SqliteKvConfigRepository`（按 namespace/key 存取）
- [x] 3.10 为每个 Repository 补充 in-memory SQLite 单元测试  <!-- 测试文件已落，待 electron 工作区接入 vitest 后运行 -->


## 4. IPC Controller 与 Preload

- [x] 4.1 新增 `electron/controller/config.ts`，注册 `config:bootstrap`、`config:channel.*`、`config:prompt.*`、`config:style.*`、`config:plugin.*`、`config:mcp.*`、`config:agent.*`、`config:kv.*`、`config:recent.*` 通道  <!-- 通道经 ee-core 自动注册为 `controller/config/<method>` -->
- [x] 4.2 所有写通道在 `BaseDB` 事务中执行并调用 `webContents.send('config:changed', payload)` 广播  <!-- ConfigService.writeTx -->
- [x] 4.3 在 `electron/preload/` 暴露 `electronAPI.config.*` 代理  <!-- 含 ALLOWED_INVOKE_CHANNELS 与 ALLOWED_LISTEN_CHANNELS 白名单 -->
- [x] 4.4 为 controller 写最小集成测试（mock IPC invoke + Repository）  <!-- 文件已落，待 vitest 接入电子工作区后运行 -->


## 5. 后端现有模块切换

> ⚠️ **M4+M5 不可拆分**：5.2 / 5.6 删除 `settings.json` 读写后，现有前端 `frontend/src/store/settings/core.ts` 仍通过 `electronService.fs.readFile('settings.json')` 读配置，会立刻失效。必须同一轮次把 §6（前端 store 重写）一起做完，应用才能正常启动。

- [x] 5.1 `electron/service/chat/LLMProfileStore.ts` 删除；`{profileId, apiKey}` 折叠进 `channel_configs.api_key`。`AgentGraph.createLLM` / `LLMQueryService.resolveConfig` 改为从 `services.config.channel.getById(profileId)` 读 apiKey。决策记录已补入 design.md D9a。
- [x] 5.2 `electron/service/chat/LLMChannelConfigTransactionService.ts` 重写为基于 `configService.channel` + `configService.kv`；新增 `channelConfigMapper.ts` 负责 ChannelConfig ↔ ChannelConfigRow 双向映射（富字段走 `meta_json`）。
- [x] 5.3 `electron/service/plugin/runtime.ts:ProviderConfigStore` 改为 `services.config.kv` 适配器（namespace=`provider.configs`）。
- [x] 5.4 ~~MCPRegistry~~ **N/A**
- [x] 5.5 ~~AgentRegistry~~ **N/A**
- [x] 5.6 删除 `settings.json` / `llm-profiles.json` / `provider-configs.json` 的文件 I/O 代码路径（随 5.1/5.2/5.3 一并完成）。`llm:migrateSettingsSecrets` IPC 降级为空响应以保 API 兼容。

## 6. 前端 Store 重写

> 必须与 §5 同轮次完成。

- [x] 6.1 新增 `frontend/src/store/useConfigStore.ts`（Zustand），`ensureConfigReady()` + `electronAPI.config.bootstrap()` + `config:changed` 事件订阅。
- [x] 6.2 `frontend/src/store/settings/core.ts` 重写为薄适配：`loadSettings()` 从 `useConfigStore` 合成 AppSettings；`saveSettings()` 拆分到 channel/kv/prompt 三条 IPC 写入。
- [x] 6.3 `frontend/src/store/promptTemplates.ts` 删除 `migrateLegacyPromptTemplates` + 旧文件 I/O 路径；模板读取/写入走 `loadSettings`/`saveSettings` → IPC。
- [x] 6.4 `frontend/src/store/settings/recentProjects.ts` 重写为 `electronAPI.config.recent.*` 包装。
- [x] 6.5 `frontend/src/store/settings/modelPresets.ts` 重写：`loadPresets` 从 `useConfigStore.channels` 聚合；`savePreset`/`deletePreset` 走 `electronAPI.config.channel.*`。
- [x] 6.6 `themePresets.ts` 改为 `electronAPI.config.style.*`；`channelConfig.ts` / `llmConfig.ts` / `mediaConfig.ts` / `chatSettings.ts` / `presets.ts` 通过新 `loadSettings`/`saveSettings` 自动获得 SQLite 后端，无需单独改代码。
- [x] 6.7 `frontend/src/store/storageConfig.ts` 改为 `electronAPI.config.kv.*` (namespace=`storage`) 的同步快照 + 异步初始化适配。
- [x] 6.8 `frontend/src/constants/storageKeys.ts` 精简：只保留 `LANGUAGE`；`CHAT_STORAGE_KEYS` / `PROJECT_STORAGE_KEYS` 保留（非配置态）。
- [x] 6.9 删除 `frontend/src/store/encryption.ts` 与 `migrateLegacyPromptTemplates`；`migrateLLMSecretsTransaction` 保留导出但后端 IPC 已降级为空响应。

## 7. UI 组件对接

**说明**：§6 的兼容适配层使得 ConfigManager 组件在不改代码的前提下自动走 SQLite。下列任务保留跟踪，但多数为"已经通过 §6 的数据流间接完成"；后续如需性能优化（避免每次 save 全量回写）再细化拆分。

- [x] 7.1 `components/settings/LLMConfigManager.tsx` — 通过 `useMediaConfigManager.ts` 使用 `loadSettings`→ `useConfigStore`，写路径经 `channelConfig.ts` → `saveSettings` → `electronAPI.config.channel.*`
- [x] 7.2 `components/settings/TTIConfigManager.tsx` — 同上
- [x] 7.3 `components/settings/ITVConfigManager.tsx` — 同上
- [x] 7.4 `components/settings/TTSConfigManager.tsx` — 同上
- [x] 7.5 `components/settings/VisualStyleManager.tsx` / `ThemeSelector.tsx` — 通过 `themePresets.ts` → `electronAPI.config.style.*`
- [x] 7.6 `components/settings/PromptStudio.tsx` — 通过 `promptTemplates.ts` 导出的 API → `saveSettings` → `electronAPI.config.prompt.*`
- [ ] 7.7 插件管理 UI — 暂未切换到 `electronAPI.config.plugin.*`；现有 `controller/plugin/*` IPC 继续负责文件操作与元数据管理。`plugin_registry` 表作为净新增能力暂无 UI 写入。**遗留**
- [ ] 7.8 `components/settings/MCPConfigManager.tsx` — 未迁移到 `electronAPI.config.mcp.*`（当前 MCP 配置走 `chat:mcp:importConfig` 等旧 IPC）。**遗留**
- [x] 7.9 "最近项目"列表 — 通过 `recentProjects.ts` 重写 → `electronAPI.config.recent.*`
- [x] 7.10 `providers/channel/resolver.ts` — 以 `AppSettings` 为入参；数据源上游已从 `useConfigStore` 同步，无需代码改动
- [x] 7.11 `useMediaConfigManager.ts` / `channelManagerShared.ts` — 通过兼容适配层无需改代码

## 8. Web/开发模式

- [x] 8.1 `frontend/src/services/configBridge.ts` 中实现 `MockConfigStore`：非 Electron 环境返回内存态，支持 CRUD + `onChanged`。
- [x] 8.2 grep 验证：`frontend/src/` 不再有配置相关 localStorage 写入（`koma_settings` / `koma_recent_projects` / `koma_presets` / `koma_prompt_templates` / `koma_storage_config` 均无引用）。

## 9. 清理与文档

- [x] 9.1 `frontend/src/types.ts:AppSettings` 移除 `customThemePresets` / `stylePrompts` 字段；核心形状瘦身为 channel/media/prompt 三项。
- [x] 9.2 `frontend/src/store/README.md` 重写开头 + 新增 Configuration Flow 图，说明 useConfigStore → IPC → ConfigService → SQLite 链路。
- [x] 9.3 `CLAUDE.md` 补入"Storage 约定"：所有配置走 SQLite；无 settings.json / localStorage 配置；field crypto 在 Repository 边界；新增配置域的步骤清单。
- [x] 9.4 `SettingsPage.tsx` 顶部新增 `<Alert type="info">` 告知用户配置已迁入 SQLite，旧文件不再被读取，如需从旧版本升级需重新录入。
- [x] 9.5 **取消**：`BUILTIN_PROMPT_TEMPLATES` / `BUILTIN_VISUAL_STYLES` 保持空。前端 `DEFAULT_TEMPLATES` 作为内存 fallback，`getPromptTemplate` 读不到 override 就回落到它；`prompt_templates` 表只存用户覆写。此设计既避免 1481 行常量跨边界复制，也不影响 UX——空表 = 纯默认值，用户编辑后才进表。

## 10. 测试与验证

- [ ] 10.1 Repository 单元测试全部通过（in-memory SQLite）
- [ ] 10.2 IPC 集成测试覆盖 `config:bootstrap` + 每个域的 CRUD
- [ ] 10.3 端到端手测：全新启动 → 在 UI 录入 LLM/TTI/ITV/TTS 各 1 个渠道 → 重启确认持久化
- [ ] 10.4 手测：编辑内置 Prompt 模板 → 重启确认保留；重置模板 → 恢复为默认
- [ ] 10.5 手测：安装一个插件 → 启停 → 卸载，确认 SQLite 与 `{storageRoot}/plugins/` 同步
- [ ] 10.6 手测：多窗口（如果开启）验证 `config:changed` 广播在所有渲染进程生效
- [x] 10.7 `openspec validate sqlite-config-storage --type change --strict` → 通过。

## 11. 归档准备

- [ ] 11.1 `openspec archive` 时补写 `openspec/specs/app-config-storage/spec.md` 的 `## Purpose`；同步复核 `storage` / `sqlite-persistence` / `model-providers` / `prompt-templates` / `visual-style-management` / `tts` / `itv` 的 Purpose 占位（多数为历次 archive 的 `TBD -` 占位，与本变更合并后应写入"配置统一 SQLite 持久化"语义）。
- [x] 11.2 `findings.md` / `progress.md` 无旧配置存储相关段落（grep 检查无匹配），无需清理。
