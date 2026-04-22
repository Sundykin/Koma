## Why

目前应用配置散落在多个地方：`settings.json`（Electron 全局文件）、`localStorage`（浏览器键值对，共 10+ 个键）、插件/Agent/MCP 的独立 JSON 注册表。这种多源存储带来三类问题：(1) 相同概念在两套存储中容易漂移，例如 LLM/TTI/ITV/TTS 配置既写 `settings.json` 又回落 `koma_settings`；(2) 文件级读写在高频更新（如 Prompt 模板编辑、插件启停）下产生竞态且难以做事务；(3) 新增配置项时需要同时改前端 `STORAGE_KEYS`、后端 `settings.json` 读写、加密模块，维护成本高。项目业务数据（projects/shots/timelines 等）已在 SQLite 中落地并证明稳定，现在把"配置"也归一到同一个 SQLite 存储，消除散落点、统一 IPC 通道和事务语义。

## What Changes

- **新增** `app_configs` 类表族（详见 specs）：按领域分表存储 LLM/TTI/ITV/TTS 渠道配置、视觉风格预设、Prompt 模板（默认 + 自定义）、存储与缓存配置、插件/扩展工具注册表。
- **新增** 统一的 `ConfigRepository` 接口 + SQLite 实现，复用 `BaseDB` 的连接、WAL、事务与外键设置。
- **新增** IPC 命名空间 `config:*`，前端通过 IPC 读写配置，不再直接访问 `localStorage` 或 `settings.json`。
- **新增** 敏感字段（API Key、密钥等）在 SQLite 中的加密存储规范（复用现有 AES-256-GCM + machineId 派生密钥）。
- **BREAKING** 删除 `settings.json`、`recent-projects.json`、`model-presets/` 目录读写路径；删除 `STORAGE_KEYS.*` 中所有配置类键（保留纯 UI 态如语言切换可后续再评估）。
- **BREAKING** 删除 `frontend/src/store/settings/core.ts` 中的 JSON 加载/保存逻辑和 `migrateEncryptedData`、`migrateLLMSecretsTransaction` 等迁移兼容代码。
- **BREAKING** 插件/MCP/Agent 注册表从 JSON 文件迁移到 SQLite；运行时资源（插件包 `.zip`、静态资源）保持文件系统存储，仅元数据入库。
- **不提供** 任何旧数据迁移：全新启动即空配置，用户重新录入；不读取、不备份、不转换旧 JSON/localStorage。

## Capabilities

### New Capabilities
- `app-config-storage`: 定义配置类数据在 SQLite 中的表结构、Repository 接口、IPC 契约、加密规则与缓存策略。作为"项目业务数据 → sqlite-persistence"的兄弟能力，专门覆盖跨项目的全局/应用级配置。

### Modified Capabilities
- `storage`: 移除 `settings.json`、`recent-projects.json`、`model-presets/` 文件结构要求；明确 `{storageRoot}/` 下只保留 `db/`（SQLite）、`assets/`、`cache/`、`temp/`、`exports/`、`logs/`、`plugins/`（插件包文件）等纯资源目录。
- `sqlite-persistence`: 扩展 schema，新增配置域表；扩展 `schema_version` 升级策略（注意：本变更本身不做数据迁移，但后续 schema 变更仍走正常版本升级流程）。
- `model-providers`: 渠道配置（LLM/TTI/ITV/TTS）的持久化介质由 JSON 改为 SQLite，`ChannelConfig[]` 的读写路径、事务语义、默认渠道指针均通过 `ConfigRepository` 完成。
- `prompt-templates`: 默认模板与自定义模板统一存入 SQLite；前端不再从 `localStorage` 读取模板；默认模板从代码常量写入数据库种子。
- `visual-style-management`: 视觉风格预设（style preset）由 SQLite 存储，预设的 CRUD 与导入导出通过 IPC 完成。
- `tts`: TTS 渠道配置落地到 SQLite。
- `itv`: ITV 渠道配置落地到 SQLite。

## Impact

- **后端（electron/）**
  - `electron/service/storage/schema.ts`：新增配置域 DDL 与索引。
  - `electron/service/storage/repositories/`：新增 `SqliteConfigRepository`（或按域拆成多个 Repository）。
  - `electron/service/chat/LLMProfileStore.ts`、`LLMChannelConfigTransactionService.ts`：改走 `ConfigRepository`。
  - `electron/service/plugin/registries/*`：`ProviderRegistry`、`MCPRegistry`、`AgentRegistry` 的持久化层替换为 SQLite。
  - `electron/controller/`：新增 `configController`，暴露 `config:*` IPC 通道。
- **前端（frontend/src/）**
  - 删除或重写 `store/settings/core.ts`、`store/promptTemplates.ts`、`store/settings/recentProjects.ts`、`store/settings/modelPresets.ts`、`store/chatHistoryStore.ts`（仅配置部分）、`store/storageConfig.ts`。
  - `constants/storageKeys.ts`：仅保留纯 UI 态（如 `app-language`），其余删除。
  - `components/settings/*ConfigManager.tsx`：改调用 `config:*` IPC，不再写 localStorage。
  - `services/electronService.ts`、`providers/channel/resolver.ts`：配置来源切换到 IPC。
- **依赖**
  - 不新增依赖；复用 `better-sqlite3`、现有加密模块。
- **构建 & 运行时**
  - 首次启动在 `{storageRoot}/db/koma.db` 中 seed 默认 Prompt 模板与内置视觉风格；无网络依赖。
- **测试**
  - 新增 Repository 单元测试（基于 in-memory SQLite）。
  - 重写 `store/settings/core.test.ts` 为 IPC mock 下的集成测试。
- **文档**
  - 更新 `openspec/specs/storage/` 与 `openspec/specs/sqlite-persistence/` 的快照，归档旧的 JSON 文件结构段落。
