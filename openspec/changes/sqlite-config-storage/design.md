## Context

当前 Koma 的"项目业务数据"（projects/characters/scenes/shots/timelines 等）已落地 SQLite（`sqlite-persistence` spec），业务 CRUD 走 `BaseDB` + Repository + IPC 的既定管线，稳定运行。但"配置数据"仍是多源并存：

- `{storageRoot}/settings.json` — 全局 LLM/TTI/ITV/TTS 渠道配置、默认渠道指针、媒体默认值、Prompt 模板覆盖。
- `localStorage`（`koma_*` 前缀）— 最近项目、模型预设、Prompt 模板、存储根目录、聊天会话元数据。
- `plugins/registry.json` / `mcp/registry.json` / `agents/registry.json` — 插件、MCP、Agent 的独立 JSON 注册表。
- `frontend/src/store/settings/core.ts` 中 Web/Electron 双路径读写 + `migrateEncryptedData`、`migrateLLMSecretsTransaction` 等历史兼容层。

用户当前版本迭代节奏是直接换存储、不保留任何迁移代码：全新启动即空配置，旧 JSON/localStorage 全部作废。

## Goals / Non-Goals

**Goals:**
- 把应用级 & 跨项目的所有"配置"数据统一到同一个 SQLite 文件（`{storageRoot}/db/koma.db`），复用现有 `BaseDB`、WAL、外键、事务。
- 为配置数据定义清晰的 Repository 接口与 IPC 契约（`config:*`），前端完全不再直接碰文件系统与 localStorage。
- 强类型领域（LLM/TTI/ITV/TTS 渠道、Prompt 模板、视觉风格预设、插件/MCP/Agent 注册表）各自拥有专用表；弱类型、零散的标志位集中在单张 `kv_configs` 表（key/value 形式），避免为 1~2 个字段单独建表。
- 延续 AES-256-GCM + machineId 派生密钥的加密策略，敏感字段值以 `encrypted:` 前缀标识。
- 首次启动自动 seed 内置 Prompt 模板与内置视觉风格预设，保证新安装可用。

**Non-Goals:**
- 不做任何旧数据迁移、读取、备份或兼容；不提供"一键导入旧 settings.json"。
- 不改变静态资源（插件 zip 包、素材、缓存、临时文件、导出产物）的文件系统存储。
- 不引入新的 ORM 或 migration 框架，继续手写 DDL + `schema_version` 版本号。
- 不重新设计 Channel/Template 的领域模型；仅更换持久化介质。
- 不覆盖纯 UI 客户端态（如 Ant Design ConfigProvider 语言、展开/收起状态等），这类 UI 态允许继续用 `localStorage` 或 Zustand persist。

## Decisions

### D1. 配置也走 `koma.db`，不单独开库
**选择**：配置表与业务表共用 `{storageRoot}/db/koma.db`。
**理由**：
- 一份连接、一份 WAL、一份备份/恢复策略，与现有 `BaseDB` 完全对齐。
- 全局配置（渠道、模板）会被业务数据引用（例如项目表有 `llm_config_id`），同库避免跨库外键难题。
**备选**：独立 `koma.config.db`。风险在于需要双连接管理与事务协调，收益低。

### D2. 领域专用表 + 兜底 KV 表
**选择**：
- 专用表：`channel_configs`（LLM/TTI/ITV/TTS 合并存储，用 `kind` 区分）、`prompt_templates`、`visual_style_presets`、`plugin_registry`、`mcp_servers`、`agent_profiles`、`recent_projects`。
- KV 表：`kv_configs(namespace TEXT, key TEXT, value_json TEXT, updated_at INTEGER, PRIMARY KEY(namespace, key))` 用于存放 `storage.rootPath`、默认渠道指针 `defaultChannelId.<kind>`、特性开关、媒体默认值等小颗粒配置。
**理由**：
- 专用表带来类型安全、索引、排序字段；KV 表吸收长尾，避免"为一个 boolean 建一张表"。
- `channel_configs` 合并四类配置，因为四者 schema 高度相似（id/name/provider/baseUrl/apiKey/modelName/isDefault/meta_json），仅靠 `kind` 字段区分 `llm`|`tti`|`itv`|`tts`。
**备选**：四张渠道表（llm_configs、tti_configs、itv_configs、tts_configs）。舍弃理由：重复 DDL、重复 Repository、UI 层也要分别实现四份 CRUD。

### D3. Repository 按域拆分，但共享 `BaseDB`
**选择**：新增
- `SqliteChannelConfigRepository`
- `SqlitePromptTemplateRepository`
- `SqliteVisualStylePresetRepository`
- `SqlitePluginRegistryRepository`
- `SqliteKvConfigRepository`（泛型 get/set/delete）
- `SqliteRecentProjectsRepository`

每个 Repository 接口在 `electron/service/storage/repositories/interfaces.ts` 声明，SQLite 实现在同目录。
**理由**：与业务 Repository 风格一致；单元测试通过 in-memory SQLite 隔离即可。

### D4. IPC 命名空间 `config:*`
**选择**：前端统一通过以下通道访问配置：
- `config:channel.list(kind)` / `config:channel.upsert(payload)` / `config:channel.delete(id)` / `config:channel.setDefault(kind, id)`
- `config:prompt.list()` / `config:prompt.upsert(payload)` / `config:prompt.reset(id)`
- `config:style.list()` / `config:style.upsert(payload)` / `config:style.delete(id)`
- `config:plugin.list()` / `config:plugin.upsert(payload)` / `config:plugin.setEnabled(id, enabled)` / `config:plugin.delete(id)`
- `config:kv.get(namespace, key)` / `config:kv.set(namespace, key, value)` / `config:kv.delete(namespace, key)` / `config:kv.listNamespace(namespace)`
- `config:recent.list()` / `config:recent.touch(projectId)` / `config:recent.remove(projectId)`

**理由**：命名空间明确，便于前端 `window.komaAPI.config.*` 代理聚合。Controller → Service → Repository 分层与项目业务侧完全对称。
**备选**：统一 `config:get(path)`/`config:set(path, value)` 的大 JSON Path 接口。舍弃理由：失去类型与事务语义。

### D5. 前端内存缓存 + 变更订阅
**选择**：前端 Zustand store（`useConfigStore`）在应用启动时并发拉取所有配置（一次 IPC 批量调用 `config:bootstrap`），内存中持有全量配置快照；后续变更统一走 IPC，并由主进程通过 `config:changed` 事件广播，前端增量更新 store。
**理由**：
- 配置读取是高频操作（每次 LLM 调用、每次渲染 SettingsPage），不能每次发 IPC。
- 广播保证多窗口（未来可能）与渲染进程内 Zustand 状态一致。
**备选**：每次读取都发 IPC。舍弃理由：明显性能退化，尤其 workflow/*.ts 中链式调用。

### D6. 敏感字段加密规范
**选择**：
- 表中敏感列（如 `channel_configs.api_key`、`mcp_servers.auth_token`）存储密文字符串，以 `encrypted:` 前缀标识。
- 明文仅在 Repository 出口（返回给 Controller 前）解密一次；IPC payload 仍是明文但走本地通道。
- 加密/解密在 Repository 内完成，业务层无感。
**理由**：把加密约束封装在数据访问层，避免业务层遗漏；与今日 `encryptSettings` / `decryptSettings` 设计一致。

### D7. 种子数据策略
**选择**：
- 默认 Prompt 模板（`promptTemplates.ts` 中已有常量）在 `schema_version` 从 0 → 1 时批量 INSERT；此后该记录 `is_builtin=1`，不再被 seed 覆盖。
- 用户可编辑内置模板，编辑后产生"用户覆写版本"写入 `template_overrides_json` 或改为 `is_builtin=0` 的副本（具体选择记入 `app-config-storage` spec）。
- 内置视觉风格预设同上。
**理由**：让新安装即可用；同时不让 seed 污染用户编辑。

### D8. 插件包文件与元数据分离
**选择**：
- 插件 `.zip`、解压后的运行时目录保留在 `{storageRoot}/plugins/<plugin-id>/`。
- `plugin_registry` 表仅存：id、name、version、source（local/url）、installed_at、enabled、manifest_json、permissions_json。
- 卸载插件时 Repository 事务内：DELETE 记录 + `fs.rm` 目录。
**理由**：二进制不入库；与今日 `storage` spec 的 asset/file 分离思路一致。

### D9. 不做迁移代码
**选择**：
- 启动时不读 `settings.json`、不读 `localStorage`、不读 `registry.json`。
- 删除 `migrateEncryptedData`、`migrateLLMSecretsTransaction` 等迁移函数。
- 对于存在旧文件的用户，首次启动：SQLite 空表 + 默认 seed；旧 JSON 保留在磁盘上不动（不删也不读），以防用户手动取回。
**理由**：用户明确指示不保留兼容；消除迁移代码可显著缩减本次改动面与回归风险。

### D9a. LLMProfile 合并到 channel_configs（M4 实现决策）
**选择**：取消 `LLMProfileStore` 的独立持久化，把 `{profileId, apiKey}` 折叠进 `channel_configs.api_key`（profileId 即 channelId，1:1 关系）。运行时代码（`AgentGraph.createLLM`、`LLMQueryService.resolveConfig`）改为直接从 `IChannelConfigRepository.getById(channelId)` 读取 apiKey。
**理由**：
- 旧模型里 profile 与 channel 1:1 绑定（`profileId=channel.id`），多出一层间接已无意义。
- `channel_configs.api_key` 已经字段级加密，存储语义统一。
- 删除 `LLMProfileStore`（+ `{userData}/llm-profiles.json`）简化一半的事务回滚代码。
**旧 ChannelConfig → 新 ChannelConfigRow 映射**：
- 顶层字段：`id/name/providerType→provider/providerConfig.baseUrl→base_url/providerConfig.apiKey→api_key/defaultModelId→model_name/isDefault→is_default`
- 富信息（`models[]`、`capabilities`、`polling`、`providerConfig` 其余字段、`description`、`enabled`、`source`、`pluginId`）整体塞进 `meta_json`。
- 存取时由 `LLMChannelConfigTransactionService`（或其替代层）做 row ↔ ChannelConfig 的双向转换；前端继续以 `ChannelConfig` 形态读取。

### D10. 开发/Web 模式
**选择**：
- Electron 环境：走真实 SQLite + IPC。
- 纯浏览器开发（无 Electron）：保留一个 **内存 Mock 实现**（`MockConfigStore`），不持久化；刷新即丢失。之前走 `localStorage` 的 Web fallback 删除。
**理由**：Koma 主交付是 Electron 桌面端；Web 纯开发预览不承担持久化义务。

## Risks / Trade-offs

- **[用户本地旧 JSON 文件会被"遗忘"]** → 应用 UI 明示"配置已从 v{X} 起迁入数据库，旧 settings.json 不再被读取"。不强制删除旧文件，给用户留导出窗口。
- **[种子数据与用户编辑冲突]** → `is_builtin=1` + 独立 `user_modified_at` 字段；升级应用时不覆盖已被用户编辑过的模板。
- **[加密密钥与 SQLite 文件绑定]** → 用户换机器/重装系统会导致 machineId 变化从而无法解密 `api_key`。与今日行为一致；文档中明确"换机需重新录入 Key"，并提供"清空敏感字段"IPC。
- **[IPC 往返对启动性能的影响]** → 在启动阶段用一次 `config:bootstrap` 批量查询，避免 N 次 round-trip。
- **[多进程/多窗口并发写]** → SQLite WAL + busy_timeout 已处理；Repository 写操作在事务中执行，Controller 层加入单通道队列（可选）。
- **[`channel_configs` 合表带来的字段稀疏]** → 接受稀疏字段 + `meta_json` 兜底；权衡后仍优于四表分治的维护成本。
- **[KV 表滥用]** → Code review 约束：任何 >3 个字段且跨项目使用的配置必须升级成专用表。设计文档 + lint 规则。

## Migration Plan

本变更**不含数据迁移**。部署步骤：

1. **数据库 schema 升级**
   - `CURRENT_SCHEMA_VERSION` 提升一位；在升级脚本中仅执行 `CREATE TABLE IF NOT EXISTS ...` + seed 默认 Prompt 模板/视觉风格。
   - 不 DROP 任何已有表。
2. **后端切换**
   - `electron/service/chat/LLMProfileStore` 与 `LLMChannelConfigTransactionService` 改为调用 `SqliteChannelConfigRepository`。
   - `electron/service/plugin/registries/*` 改为 `SqlitePluginRegistryRepository`。
   - 删除 `settings.json` 的读写函数。
3. **IPC 层新增**
   - `electron/controller/configController.ts` 暴露 `config:*` 通道。
   - `electron/preload/config.ts` 暴露 `komaAPI.config.*`。
4. **前端切换**
   - 重写 `frontend/src/store/settings/*.ts`、`store/promptTemplates.ts`、`store/storageConfig.ts`，全部基于 `komaAPI.config.*`。
   - 删除 `STORAGE_KEYS` 中所有配置键；保留纯 UI 键。
   - 重写 `components/settings/*ConfigManager.tsx` 的数据源。
5. **清理**
   - 删除 `encryptSettings`/`decryptSettings`（全局 JSON 加密版本），保留 Repository 内字段级加密工具。
   - 删除 `migrateEncryptedData`、`migrateLLMSecretsTransaction`。

**Rollback**：若上线后发现严重问题，回退到上一版本即可——上一版本会重新读取 `settings.json`，用户已有数据不会因本次改动被删除（我们只"停止读写"，不"删除"旧文件）。

## Open Questions

1. `recent_projects` 是否真的算"配置"？倾向是：算（跨进程、跨窗口共享），因此纳入本次。若后续证明不合适再拆出。
2. Plugin 的"权限清单"是否需要独立表？当前拟放 `plugin_registry.permissions_json`；若未来权限粒度扩展（per-capability 授权），可能需要拆分。本次先以 JSON 存储，不过度设计。
3. `config:bootstrap` 的返回是否做差量推送？首版返回全量；性能监控后再决定是否增量。
