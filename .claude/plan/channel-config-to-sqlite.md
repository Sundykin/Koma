# 渠道配置迁移至 SQLite — 最终形态

> 模式：已执行 | 范围：LLM / TTI / ITV / TTS / image-hosting 渠道配置 + 媒体默认值
> 路径定型：独立 `{userData}/settings.db` + Electron `safeStorage` 加密 | **未上线项目，无旧数据迁移包袱**

---

## 1. 决策结论（已锁定并实施）

| 决策项 | 取值 | 理由 |
|---|---|---|
| 数据库 | **独立** `{userData}/settings.db` | 项目级 `koma.db` 生命周期与全局渠道配置不同；混库会污染 schema |
| 加密方案 | Electron `safeStorage` | `encryptString` → BLOB；`isEncryptionAvailable()=false` 直接抛错，不降级明文 |
| Schema | **v2 平铺列**（非 extras 黑盒） | source / plugin_id / default_model_id / provider_config_json 等字段独立成列 |
| MediaCategory | **llm / tti / itv / tts / image-hosting** | TEXT 列无需 DDL 变更，前后端类型对齐 |
| 旧数据 | **不做迁移** | 项目未上线，一切推倒重来；旧 `settings.json` 字段在 saveSettings 中被剥离 |
| LLM 链路 | **与 TTI/ITV/TTS 统一走 channel:\*** | 废除 `llm:saveChannelConfig` / `LLMChannelConfigTransactionService` / `LLMProfileStore` |

---

## 2. 最终数据走向（用户新增 → 前端 → 后端 → SQLite）

```
┌─────────────────────────────────────────────────────────────────────┐
│  用户在 LLM/TTI/ITV/TTS ConfigManager 新增渠道                        │
└───────────────────┬─────────────────────────────────────────────────┘
                    ↓
  frontend/src/store/settings/channelConfig.ts
    addChannelConfig(cfg) / updateChannelConfig(id, patch) / deleteChannelConfig(id)
                    ↓
  frontend/src/services/channelConfigService.ts
    createChannel / updateChannel / deleteChannel
    → electronService.ipc.invoke('channel:create', input)
                    ↓
  electron/preload/bridge.ts
    ALLOWED_INVOKE_CHANNELS ∋ 'channel:create' → ipcRenderer.invoke
                    ↓
  electron/service/settings/ipc.ts
    ipcMain.handle('channel:create', ...) → ChannelConfigService.createChannelConfig
                    ↓
  electron/service/settings/ChannelConfigService.ts
    apiKey → safeStorage.encryptString → Buffer
    其它字段 → provider_config_json / models_json / capabilities_json
                    ↓
  electron/service/storage/SqliteChannelConfigRepository.ts
    INSERT INTO channel_configs (...) → {userData}/settings.db
```

**LLM 执行时读 apiKey**：
```
LLMQueryService.resolveConfig(req)
  → resolveApiKeyForProfile(req.profileId)
    → ChannelConfigService.getDecryptedApiKey(profileId)
      → SqliteChannelConfigRepository.getById(profileId).api_key_cipher
      → safeStorage.decryptString → 明文
```

---

## 3. Schema v2

```sql
CREATE TABLE channel_configs (
  id                    TEXT PRIMARY KEY,
  category              TEXT NOT NULL,              -- llm|tti|itv|tts|image-hosting
  channel_def_id        TEXT NOT NULL,              -- ≡ 前端 providerType
  name                  TEXT NOT NULL,
  description           TEXT,
  base_url              TEXT,
  api_key_cipher        BLOB,                       -- safeStorage 密文
  provider_config_json  TEXT NOT NULL DEFAULT '{}', -- providerConfig 去 apiKey 后的剩余
  models_json           TEXT NOT NULL DEFAULT '[]',
  capabilities_json     TEXT NOT NULL DEFAULT '[]',
  polling_json          TEXT,
  extras_json           TEXT NOT NULL DEFAULT '{}',
  default_model_id      TEXT,
  source                TEXT NOT NULL DEFAULT 'builtin', -- builtin|plugin
  plugin_id             TEXT,
  enabled               INTEGER NOT NULL DEFAULT 1,
  is_default            INTEGER NOT NULL DEFAULT 0,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);
CREATE INDEX idx_channel_configs_category ON channel_configs(category, sort_order);
CREATE INDEX idx_channel_configs_source ON channel_configs(source, plugin_id);

CREATE TABLE media_defaults (
  category     TEXT PRIMARY KEY,
  channel_id   TEXT NOT NULL,
  model_id     TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  updated_at   INTEGER NOT NULL
);

CREATE TABLE app_settings_kv (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

---

## 4. IPC 契约（11 channels，全部在 bridge 白名单）

```
channel:list           (args?: { category? })                     => ChannelConfigDTO[]
channel:get            (args: { id })                             => ChannelConfigDTO | null
channel:count          ()                                         => number
channel:create         (args: ChannelConfigInput)                 => ChannelConfigDTO
channel:update         (args: { id, patch })                      => ChannelConfigDTO
channel:delete         (args: { id })                             => boolean
channel:bulkImport     (args: { configs })                        => { imported }
channel:setDefault     (args: { category, channelId, modelId? })  => MediaDefaultDTO
channel:getDefault     (args: { category })                       => MediaDefaultDTO | null
channel:listDefaults   ()                                         => MediaDefaultDTO[]
channel:deleteDefault  (args: { category })                       => boolean
```

返回形如 `{ ok: true, data }` 或 `{ ok: false, code, message }`。

---

## 5. 清理掉的历史代码

| 删除 | 替代 |
|---|---|
| `electron/service/chat/LLMProfileStore.ts`（整个文件） | `ChannelConfigService.getDecryptedApiKey` |
| `electron/service/chat/LLMChannelConfigTransactionService.ts`（整个文件） | `ChannelConfigService.{create,update,delete}ChannelConfig` |
| `llm:saveChannelConfig` / `llm:deleteChannelConfig` / `llm:migrateSettingsSecrets` IPC handlers | `channel:create` / `channel:delete` |
| `llm:saveProfile` / `llm:deleteProfile` IPC handlers | 同上（profileId = channelId） |
| bridge `saveChannelConfig` / `deleteChannelConfig` / `migrateSettingsSecrets` / `saveProfile` / `deleteProfile` | 无（直接走 `invokeMain('channel:...')`） |
| `chatIPC.ts`: `saveLLMChannelConfigTransaction` / `deleteLLMChannelConfigTransaction` / `migrateLLMSecretsTransaction` / `saveLLMProfile` / `deleteLLMProfile` | 无 |
| `chatIPC.ts`: 5 个废弃请求类型接口 | 无 |
| `core.ts`: `migrateLLMSecretsTransaction` 调用块 | 无 |
| `chatIPC.profile.test.ts` / `chatIPC.transaction.test.ts` | 无 |

---

## 6. 验收标准（✅ 已落地）

- [x] `settings.db` 在首启自动创建，schema_version=2
- [x] 前端 ChannelConfig 增删改全部走 IPC（`channel:*`）
- [x] LLM 调用链直接从 SQLite 解 apiKey（不再读 `llm-profiles.json`）
- [x] `saveSettings` 剥离 `channelConfigs`/`mediaDefaults`，json 与 db 不双写
- [x] 前端 / Electron typecheck 与本次变更相关文件全部为 0 error
- [x] `bridge.ts` 白名单同步更新，`channel:*` 11 条 invoke channel 可用

---

## 7. 代码拓扑（最终形态）

**新增**
- `electron/service/storage/SettingsDB.ts`
- `electron/service/storage/settingsSchema.ts`
- `electron/service/storage/repositories/settingsInterfaces.ts`
- `electron/service/storage/repositories/SqliteChannelConfigRepository.ts`
- `electron/service/storage/repositories/SqliteMediaDefaultsRepository.ts`
- `electron/service/storage/repositories/SqliteAppSettingsKvRepository.ts`
- `electron/service/settings/ChannelConfigService.ts`
- `electron/service/settings/ipc.ts`
- `frontend/src/services/channelConfigService.ts`

**修改**
- `electron/preload/index.ts` — 注册 `registerSettingsIpc()`
- `electron/preload/bridge.ts` — 白名单加 `channel:*`，删 `llm:save*/delete*/migrate*`
- `electron/service/index.ts` — `initServices()` 调 `settingsDB.init()`
- `electron/service/storage/index.ts` — 导出 settings 相关
- `electron/service/chat/ipc.ts` — 删 5 个废弃 handler + import 清理
- `electron/service/chat/LLMQueryService.ts` — `resolveApiKeyForProfile` 改用 SQLite
- `electron/service/chat/AgentGraph.ts` — `createLLM` 改用 SQLite
- `frontend/src/store/settings/core.ts` — `loadSettings` 从 SQLite 拼渠道；`saveSettings` 剥离渠道字段
- `frontend/src/store/settings/channelConfig.ts` — 改造为 SQLite-only；保留 Koma 官方激活语义
- `frontend/src/store/settings/index.ts` — 删 `cleanupLegacyConfigs`
- `frontend/src/store/globalStore.ts` — 同上
- `frontend/src/chat/ipc/chatIPC.ts` — 删 5 个废弃 wrapper + 5 个请求类型
- `frontend/src/components/settings/LLMConfigManager.tsx` — 走新链路 `addChannelConfig/updateChannelConfig/deleteChannelConfig`

**删除**
- `electron/service/chat/LLMProfileStore.ts`
- `electron/service/chat/LLMChannelConfigTransactionService.ts`
- `frontend/src/chat/ipc/chatIPC.profile.test.ts`
- `frontend/src/chat/ipc/chatIPC.transaction.test.ts`
