# Channel Config Round3 — ChannelAuth Strategy 层收敛

> 模式：规划 | 方案 β（Codex 策略层重构 + Gemini Secret Intent 补强） | NanoBanana 先验证
> 基线：round2 已落地 `settings.db v2 / channel:* IPC / bridge 白名单 / NetController 双模式代理 / buildRow patch 保留 / 4 类 Manager 对齐 channelConfig store`

## 落地进度（本会话后）

| 工作包 | 状态 | 备注 |
|---|---|---|
| A1 · Seedance safeFetch | ✅ 完成 | 改走 fs.downloadFile（validateUrl + redirect 复检），避免 safeFetch string 破坏二进制 |
| A2 · delete 事务级联 + setMediaDefault 校验 | ✅ 完成 | settingsDB.transaction + deleteByChannelId + channel/category/model 校验 |
| A3 · bulkImport upsert | ✅ 完成 | 事务内先查 existing → buildRow(input, existing)；Repo 弃用 INSERT OR REPLACE |
| B1 · channel/auth.ts + netError.ts | ✅ 完成 | 3 mode + $ENC$ 防御；结构化错误解析 + toast；17 单测绿 |
| B2 · GeminiNative query-key | ✅ 完成 | fetchWithChannelAuth(mode=query-key, queryKeyName=key) |
| B3 · TTS OpenAI/Fish 接入 auth | ✅ 完成 | TTSConfig.profileId + resolver 注入；EdgeTTS/GPT-SoVITS 仅类型兼容 |
| B4a · NanoBanana 兼容性 Gate | 🟡 待魔尊人工验证 | 需实测 Authorization: Bearer <k> vs Authorization: <k> |
| B4b · raw-authorization mode | ✅ 完成 | NetController 三互斥校验 + 注入分支；NanoBananaProvider 默认 raw-authorization；B4a verdict 确认后一行切 mode 即可 |
| C1 · LLM modelProvider 端到端放宽 | ✅ 完成 | 4 处放宽：chatIPC / IPCLLMProvider / service/chat/ipc / LLMQueryService |
| §5 · Secret Intent（废 $ENC$） | ✅ 完成 | dtoToFrontend 不回传占位符；4 Manager apiKey 输入动态 placeholder + required |
| D1 · typecheck + 回归 | 🟡 持续 | electron tsc 0 / frontend tsc 0（本轮相关）/ vitest 30/30 绿 |

---


## 0. 最终决策摘要

```
Phase A：先修 blocker      → A1 (Seedance safeFetch) / A2 (delete cascade) / A3 (bulkImport upsert)
Phase B：统一 auth strategy → B1 (auth.ts + netError.ts) / B2 (GeminiNative) / B3 (TTS 远程 2 provider) / B4a (NanoBanana Gate) / B4b (条件性 raw-auth)
Phase C：LLM 端到端放宽     → C1 (chatIPC + IPCLLMProvider + ipc + LLMQueryService)
Phase D：回归封板          → D1 (typecheck + 新增测试矩阵 + 人工回归 + NanoBanana verdict)

并行策略：A 串行完成 → B/C 并行 → D 收尾
```

---

## 1. Phase A — 数据一致性与安全旁路

### A1 · 封堵 Seedance 远程素材下载旁路（Critical）

**改动文件**
- `frontend/src/providers/itv/SeedanceProvider.ts`：`454-520`（`uploadImage` 中 `asset.transport === 'remote-url'` 分支）
- `frontend/src/providers/itv/SeedanceProvider.ts`：`528-532`（复用上传链路）

**核心 diff 思路**
```ts
// Before
response = await fetch(asset.value);
// After
response = await safeFetch(asset.value, { method: 'GET' });
// 保持 arrayBuffer() → Blob → FormData 流程不变
```

**新增测试**
- `frontend/src/providers/itv/SeedanceProvider.safe-fetch.test.ts`
  - 远程素材走 safeFetch
  - 非 2xx 抛出结构化错误
  - data-url / base64 分支不受影响

**验收**：远程素材下载进入 `safeFetch → NetController → validateUrl`；上传/生成/轮询链路不回归。

---

### A2 · 事务化删除 channel 并级联清理 `media_defaults`（High）

**改动文件**
- `electron/service/settings/ChannelConfigService.ts`：`200-286`
- `electron/service/storage/repositories/SqliteMediaDefaultsRepository.ts`：`20-42`
- `electron/service/storage/repositories/settingsInterfaces.ts`：`57-61`

**代码形态**
```ts
// ChannelConfigService.ts
export function deleteChannelConfig(id: string): boolean {
  return settingsDB.transaction(() => {
    const existing = configRepo.getById(id);
    if (!existing) return false;
    defaultsRepo.deleteByChannelId(id);          // 批量清所有 category 引用
    const removed = configRepo.delete(id);
    if (!removed) throw new Error(`channel_configs delete failed: ${id}`);
    return true;
  });
}

// SqliteMediaDefaultsRepository.ts
deleteByChannelId(channelId: string): number {
  const info = settingsDB.getDb()
    .prepare('DELETE FROM media_defaults WHERE channel_id = ?').run(channelId);
  return info.changes;
}
```

顺手补 `setMediaDefault` 业务校验（见 §2.C）。

**新增测试**
- `electron/service/settings/ChannelConfigService.delete-cascade.test.ts`
- `electron/service/settings/ChannelConfigService.setMediaDefault.validation.test.ts`

**验收**：删除 channel 无悬挂 defaults；全在一次事务；`setMediaDefault` 拒绝无效 channelId/modelId/category。

---

### A3 · `bulkImport` preserve-existing upsert（High）

**改动文件**
- `electron/service/settings/ChannelConfigService.ts`：`138-180`（buildRow 分支）
- `electron/service/settings/ChannelConfigService.ts`：`217-223`（bulkImport 本体）
- `electron/service/storage/repositories/SqliteChannelConfigRepository.ts`：`48-107`（弃 `INSERT OR REPLACE`）

**代码形态**
```ts
export function bulkImportChannelConfigs(inputs: ChannelConfigInput[]): { imported: number } {
  return settingsDB.transaction(() => {
    let imported = 0;
    for (const input of inputs) {
      const existing = input.id ? configRepo.getById(input.id) : null;
      const row = buildRow(input, existing);
      existing ? configRepo.update(row.id, row) : configRepo.insert(row);
      imported += 1;
    }
    return { imported };
  });
}
```

**废弃**：`INSERT OR REPLACE`（destructive，抹 `api_key_cipher / provider_config_json / created_at`）。
**SQL 层可选**：改写 `INSERT ... ON CONFLICT(id) DO UPDATE SET ...`，但前提是 row 已基于 existing merge。

**新增测试**
- `electron/service/settings/ChannelConfigService.bulkImport.upsert.test.ts`

---

## 2. 后端事务边界设计

### A. `deleteChannelConfig` + `media_defaults` 级联
见 §1.A2。关键点：事务在 `ChannelConfigService`，不依赖前端 soft cleanup；同一 channelId 可被多 category 引用，必须批量清理。

### B. `bulkImport` 分支策略
见 §1.A3。**弃用 `INSERT OR REPLACE`**；业务决策点在 `ChannelConfigService.ts`。

### C. `setMediaDefault` 校验
**位置**：`electron/service/settings/ChannelConfigService.ts`（`229-266` 一带）。`ipc.ts` 只做 transport。

```ts
function assertMediaDefaultTarget(
  category: MediaCategory,
  channelId: string,
  modelId?: string | null,
): { channel: ChannelConfigRow; effectiveModelId: string | null } {
  const channel = configRepo.getById(channelId);
  if (!channel) throw new Error(`channel_configs not found: ${channelId}`);
  if (channel.category !== category) {
    throw new Error(`channel ${channelId} category mismatch: expected ${category}, got ${channel.category}`);
  }
  const models = safeJsonParse<Array<{ id?: string }>>(channel.models_json, []);
  const requiresModel = category !== 'image-hosting';
  const effectiveModelId = modelId ?? channel.default_model_id ?? models[0]?.id ?? null;
  if (requiresModel && !effectiveModelId) throw new Error(`media default requires modelId for ${category}`);
  if (effectiveModelId && !models.some(m => m?.id === effectiveModelId)) {
    throw new Error(`model ${effectiveModelId} not found under channel ${channelId}`);
  }
  return { channel, effectiveModelId };
}
```

---

## 3. Phase B — ChannelAuth Strategy 收敛

### B1 · 抽取 `channel/auth.ts` + `netError.ts`

**新建文件**
- `frontend/src/providers/channel/auth.ts`
- `frontend/src/providers/netError.ts`

**`channel/auth.ts` API**
```ts
export type ChannelAuthMode = 'bearer-header' | 'query-key' | 'raw-authorization';

export interface ChannelAuthOptions {
  channelId?: string;        // 有 channelId → 主进程代理；无 → 回退明文
  apiKey?: string;           // 回退用
  mode: ChannelAuthMode;
  queryKeyName?: string;     // mode='query-key' 时必填
  headers?: HeadersInit;
}

/**
 * 构造请求头 / URL query，不发请求（Provider 自行调用 safeFetch）。
 * - channelId 存在 → x-koma-channel-id (+ x-koma-channel-query-key-name / x-koma-channel-raw-authorization)
 * - channelId 缺失但有 apiKey → Authorization: Bearer / query ?key=
 * - 拦截 '$ENC$' 占位符，视为"无可用凭据"（Secret Intent 迁移后废弃）
 */
export function buildChannelAuthRequest(opts: ChannelAuthOptions): {
  url?: (base: string) => string;
  headers: Record<string, string>;
};

/**
 * 高阶封装：内部调 safeFetch，非 2xx 自动 parseNetError 并抛 ChannelNetError。
 */
export async function fetchWithChannelAuth(
  url: string,
  opts: ChannelAuthOptions & { fetchOptions?: RequestInit }
): Promise<Response>;
```

**与 `safeFetch` 关系**：`fetchWithChannelAuth` 内部调 `safeFetch`；`safeFetch` 仍为通用层（SSRF 校验 + 重试）。

**`netError.ts` API**
```ts
export interface ChannelNetError extends Error {
  code: string;              // 主进程返回的 code 原样透传
  status: number;
  channelId?: string;
  i18nKey: string;           // 'settings.error.<code>'
  actionable: boolean;       // 是否提供"去配置"按钮
}

export class ChannelApiKeyMissingError extends Error implements ChannelNetError { ... }

export async function parseNetError(res: Response, channelId?: string): Promise<ChannelNetError>;

export function translateToToast(
  err: ChannelNetError,
  t: (key: string) => string,
  navigate: (url: string) => void,
): { message: string; description?: string; btn?: React.ReactNode };
```

**已知 code 集合**：`channel_api_key_missing / conflict_auth_mode / duplicate_sensitive_header / missing_channel_id_for_query_key / invalid_query_key_name / channel_api_key_decrypt_failed / unknown_error`

**i18n key 规范**：`settings.error.<code>`，code 与主进程返回完全一致。

**新增测试**
- `frontend/src/providers/channel/auth.test.ts`
- `frontend/src/providers/netError.test.ts`

---

### B2 · GeminiNative 接入 query-key 代理

**改动文件**
- `frontend/src/providers/tti/GeminiNativeTTIProvider.ts`：`191-207`（validate）/ `214-273`（testConnection + start）

**核心 diff 思路**
```ts
validate() {
  return Boolean(this.config.profileId || this.config.apiKey) && Boolean(this.config.modelName);
}

// Before: url = `${baseUrl}?key=${apiKey}`
// After:
const response = await fetchWithChannelAuth(baseUrl, {
  channelId: this.config.profileId,
  apiKey: this.config.apiKey,
  mode: 'query-key',
  queryKeyName: 'key',
  fetchOptions: { method: 'POST', body: JSON.stringify(...) },
});
```

**新增测试**
- `frontend/src/providers/tti/GeminiNativeTTIProvider.query-key.test.ts`

---

### B3 · TTS 精准改造（仅 OpenAI/Fish）

**必改项**
- `frontend/src/types.ts`：`376-382` `TTSConfig` 加 `profileId?: string`
- `frontend/src/providers/channel/resolver.ts`：`338-348` `buildTTSConfigFromContext` 注入 `profileId: context.channelConfig.id`
- `frontend/src/providers/tts/OpenAITTSProvider.ts`：`37-74` `validate` 改 `Boolean(profileId || apiKey)`；请求走 `fetchWithChannelAuth`（`bearer-header` mode）
- `frontend/src/providers/tts/FishAudioProvider.ts`：`17-65` + `89-101` 同上

**豁免项**
- `EdgeTTS` / `GPT-SoVITS`：仅类型兼容 `profileId`，运行时忽略（无 API key 场景）

**新增测试**
- `frontend/src/providers/tts/OpenAITTSProvider.channel-auth.test.ts`
- `frontend/src/providers/tts/FishAudioProvider.channel-auth.test.ts`

---

### B4a · NanoBanana 兼容性验证（Gate，无代码改动）

**目标**：确认 NanoBanana 上游接受 `Authorization: Bearer <apiKey>` 还是 `Authorization: <apiKey>`。

**验证步骤**
1. 使用同一 channel config 分别发测试请求，endpoint 至少包含：
   - `/api/user/balance`
   - `/api/nano-banana`
   - `/api/nano-banana/task/:id`
2. Header 对比：`Authorization: Bearer <apiKey>` vs `Authorization: <apiKey>`
3. 记录 HTTP status / 响应摘要

**verdict 模板**（回填 §9）
```
### NanoBanana Compatibility Verdict
- Date:
- Channel ID:
- Endpoint(s):
- Header Mode A: Authorization: Bearer <apiKey>
- Result A: (status / response summary)
- Header Mode B: Authorization: <apiKey>
- Result B:
- Final Verdict: compatible-with-bearer | requires-raw-authorization
- Next Action: skip B4b | execute B4b
```

---

### B4b · 条件性 raw-authorization mode（仅 B4a=requires-raw-authorization 时执行）

**改动文件**
- `electron/controller/net.ts`：`197-217` / `220-269` / `257-269` / `301-336`
- `frontend/src/providers/channel/auth.ts`：扩展 `raw-authorization` mode
- `frontend/src/providers/tti/NanoBananaProvider.ts`：`60-135`

**新 header**：`x-koma-channel-raw-authorization: true`，必须配 `x-koma-channel-id`，与 `queryKeyName` 互斥，与显式 `Authorization` 互斥。

**代码形态**
```ts
const rawAuthorization = ['1','true','yes'].includes(
  String(getHeaderValue(args.headers, 'x-koma-channel-raw-authorization') || '').toLowerCase()
);

if ((channelId || queryKeyName || rawAuthorization) && hasExplicitAuth) {
  return badRequest('conflict_auth_mode', '...');
}
if (rawAuthorization && !channelId) return badRequest('missing_channel_id_for_raw_authorization', '...');
if (rawAuthorization && queryKeyName) return badRequest('conflict_auth_mode', '...');

if (channelId) {
  const plainKey = getDecryptedApiKey(channelId);
  if (!plainKey) return channel_api_key_missing;
  if (queryKeyName)          { /* URL query inject */ }
  else if (rawAuthorization) { headers['Authorization'] = plainKey; }
  else                       { headers['Authorization'] = `Bearer ${plainKey}`; }
}
```

**新增测试**
- `electron/controller/net.fetch.raw-auth.test.ts`
- `frontend/src/providers/tti/NanoBananaProvider.raw-auth.test.ts`

---

## 4. Phase C — LLM 端到端放宽（4 处精确改动）

### C1

**4.1 · `frontend/src/chat/ipc/chatIPC.ts`**（`55-67` + `171-201`）
- `SessionConfig.modelProvider` 由 `'openai' | 'anthropic' | 'google'` 放宽为 `string`
- `LLMQueryRequest.config.modelProvider` + `LLMConnectionTestRequest.modelProvider` 同步

**4.2 · `frontend/src/providers/llm/IPCLLMProvider.ts`**（`27-37` + `115-133`）
- `mapProvider` 只做别名归一化：
  ```ts
  private mapProvider(provider: string): string {
    if (provider === 'claude') return 'anthropic';
    if (provider === 'gemini') return 'google';
    return provider;  // openai-compatible / plugin 原样透传
  }
  ```

**4.3 · `electron/service/chat/ipc.ts`**（`20-57`）
- 删 `VALID_PROVIDERS`；`validateLLMQueryRequest` 改为：
  ```ts
  if (cfg.modelProvider !== undefined
      && (typeof cfg.modelProvider !== 'string' || cfg.modelProvider.trim().length === 0)) {
    return false;
  }
  ```

**4.4 · `electron/service/chat/LLMQueryService.ts`**（`30-62` + `72-83`）
- request types → `modelProvider?: string`
- `resolveConfig` 透传 trim 后的 string：
  ```ts
  function normalizeProvider(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  ```

**插件 provider 扩展**：`llmProviderRegistry.register({ type, name, pluginId, factory })` 已有；`AgentGraph.createLLM` 未注册时 fallback `openai-compatible`，本轮不改。

**新增测试**
- `frontend/src/providers/llm/IPCLLMProvider.model-provider.test.ts`
- `electron/service/chat/ipc.model-provider.test.ts`

---

## 5. Secret Intent Pattern 迁移（可选加强项）

> 魔尊未拒绝；此项是"长期清爽度"提升，若时间紧可挪 round4。

### 5.1 Schema 变化
```ts
// Before
apiKey?: string;   // '$ENC$' 或明文或 undefined
// After
apiKey?: { hasValue: boolean; newValue?: string };
```

### 5.2 `channelConfigService.ts` 改写要点
```ts
// dtoToFrontend
providerConfig.apiKey = { hasValue: dto.hasApiKey, newValue: undefined };

// frontendToInput
const secret = providerConfig.apiKey as { newValue?: string };
if (secret && typeof secret.newValue === 'string' && secret.newValue.length > 0) {
  providerConfig.apiKey = secret.newValue;  // 发送新值
} else {
  delete providerConfig.apiKey;             // 不更新
}
```

### 5.3 4 个 ConfigManager 适配
- `Input.Password` + `placeholder={apiKey?.hasValue ? t('settings.apiKeyStored') : t('settings.enterApiKey')}`
- 共享逻辑放 `frontend/src/components/settings/channelManagerShared.ts`
- 表单 dirty-check：`newValue.length > 0` 才视为已修改

### 5.4 迁移策略
项目未上线 → **不兼容旧 `$ENC$`，直接推翻**。`channel/auth.ts` 初版保留 `$ENC$` 拦截兜底（防御代码），迁移完成后可清理。

---

## 6. Manager 侧改造（保留独立组件）

**4 个 ConfigManager 不重构结构**，只做：
1. **接入 `netError.translateToToast`**：替换 `handleSave / handleTestConnection` 的 `message.error(err.message)` 为：
   ```ts
   const toast = translateToToast(err, t, navigate);
   notification.error(toast);
   ```
2. **统一 `apiKey` 输入**：4 个 Manager 都用 `Input.Password`
3. **（可选）测试连接按钮**：已有的保留；缺的 round4 补
4. **Secret Intent 适配**（§5）：仅在采纳 §5 时改

**行号范围**
- `LLMConfigManager.tsx`：`250-290`
- `ITVConfigManager.tsx`：`335-370`
- `TTIConfigManager.tsx`：`285-320`
- `TTSConfigManager.tsx`：`248-280`

**共享工具**：`channelManagerShared.ts` 中新增 `createNetErrorHandler(t, navigate)` 返回统一 catch handler。

---

## 7. i18n 文案（中/英）

```json
{
  "settings": {
    "error": {
      "channel_api_key_missing":           { "zh": "该渠道未配置 API Key",              "en": "Channel API key missing" },
      "conflict_auth_mode":                { "zh": "认证模式冲突",                     "en": "Conflicting auth modes" },
      "duplicate_sensitive_header":        { "zh": "敏感请求头重复",                   "en": "Duplicate sensitive header" },
      "missing_channel_id_for_query_key":  { "zh": "query-key 代理缺少 channel ID",    "en": "Missing channel ID for query-key mode" },
      "invalid_query_key_name":            { "zh": "无效的 query-key 参数名",          "en": "Invalid query-key name" },
      "channel_api_key_decrypt_failed":    { "zh": "API Key 解密失败，请重新保存",     "en": "Failed to decrypt stored API key" },
      "unknown_error":                     { "zh": "请求失败",                         "en": "Request failed" }
    },
    "apiKeyStored":  { "zh": "已加密存储", "en": "Stored (encrypted)" },
    "enterApiKey":   { "zh": "输入 API Key", "en": "Enter API key" },
    "goToConfig":    { "zh": "去配置", "en": "Go to settings" }
  }
}
```

**actionable 跳转**：`navigate(/settings?tab=<category>&channel=<id>)`（category 由 `ChannelNetError.channelId` 反查 store）

---

## 8. 最终数据走向（ASCII）

```
┌─ Shared Config Write Path ──────────────────────────────────────┐
│  User → Managers (LLM/TTI/ITV/TTS)                              │
│    → channelConfigService.ts (channel:* IPC)                    │
│    → settings/ipc.ts → ChannelConfigService.ts                  │
│      ├─ safeStorage.encrypt / decrypt                           │
│      ├─ settingsDB.transaction(...)                             │
│      ├─ configRepo   (channel_configs)                          │
│      └─ defaultsRepo (media_defaults, cascade on delete)        │
│    → SettingsDB → settings.db                                   │
└─────────────────────────────────────────────────────────────────┘

┌─ HTTP Media Provider Runtime Path ──────────────────────────────┐
│  resolver.ts (build{TTI,ITV,TTS}ConfigFromContext 注入 profileId)│
│    → Provider Adapters                                          │
│      (Seedance/Sora2/Kling/Vidu/Pika/Runway/CustomITV/          │
│       Grok2Imagine/OpenAICompat TTI/Gemini3Pro/                 │
│       GeminiNative/NanoBanana/OpenAI TTS/Fish)                  │
│      → channel/auth.ts (ChannelAuth Strategy) ←─┐               │
│      → netError.ts (parse/translate)            │ shared infra  │
│      → safeFetch.ts                             │               │
│    → bridge.ts → NetController                  │               │
│      ├─ validateUrl()                                            │
│      ├─ bearer-header inject                                     │
│      ├─ query-key inject                                         │
│      └─ raw-authorization inject (conditional, B4b only)        │
│    → Upstream HTTP APIs                                         │
└─────────────────────────────────────────────────────────────────┘

┌─ LLM Runtime Path ──────────────────────────────────────────────┐
│  resolver.ts buildLLMConfigFromContext                          │
│    → IPCLLMProvider.ts (mapProvider 别名归一化)                 │
│    → chatIPC.ts → service/chat/ipc.ts                           │
│    → LLMQueryService.ts → AgentGraph.ts                         │
│    → llmProviderRegistry (plugin provider 注册扩展)             │
│    → Upstream LLM APIs                                          │
└─────────────────────────────────────────────────────────────────┘
```

**共享基础设施**：`channel/auth.ts` / `netError.ts` / `safeFetch.ts` / `NetController` / `channelConfigService.ts` / `ChannelConfigService.ts` / `SettingsDB.ts` / `llmProviderRegistry`

---

## 9. 回归测试矩阵

### 自动化
| 场景 | 测试文件 |
|---|---|
| 重启后 `$ENC$` 不发出去 | `auth.test.ts` + 各 provider 专项 |
| `bulkImport` preserve existing | `ChannelConfigService.bulkImport.upsert.test.ts` |
| 删除 channel 级联清 defaults | `ChannelConfigService.delete-cascade.test.ts` |
| `setMediaDefault` 校验 | `ChannelConfigService.setMediaDefault.validation.test.ts` |
| LLM plugin provider string 可过校验 | `IPCLLMProvider.model-provider.test.ts` + `ipc.model-provider.test.ts` |
| GeminiNative query-key 工作 | `GeminiNativeTTIProvider.query-key.test.ts` |
| TTS OpenAI/Fish 重启后可发 | `OpenAITTSProvider.channel-auth.test.ts` / `FishAudioProvider.channel-auth.test.ts` |
| Seedance 远程素材不裸 fetch | `SeedanceProvider.safe-fetch.test.ts` |
| 条件性 raw-auth mode | `net.fetch.raw-auth.test.ts` / `NanoBananaProvider.raw-auth.test.ts` |

### 人工回归
- 保存渠道 → 重启应用 → 发实际请求（记录成功/失败 provider + error code）
- GeminiNative：仅保留 profileId 后是否仍成功
- TTS OpenAI/Fish：不重新输入 key 是否成功
- delete channel 级联：被设为默认的 channel 删除后 UI defaults 是否自动消失
- LLM plugin：注册插件 provider string 后 `llm:query` 是否命中 registry

### NanoBanana Compatibility Verdict（B4a 回填）
```
- Date:
- Channel ID:
- Endpoint(s):
- Header Mode A / Result A:
- Header Mode B / Result B:
- Final Verdict:
- Next Action:
```

---

## 10. 风险矩阵

| 级别 | 风险 | 处理 |
|---|---|---|
| Critical | SeedanceProvider 裸 fetch 绕过 SSRF | **A1 本 Phase** |
| High | 删除 channel 悬挂 defaults | **A2 本 Phase** |
| High | bulkImport 盲覆盖 existing | **A3 本 Phase** |
| High | TTS OpenAI/Fish 重启后发 `$ENC$` | **B3 本 Phase** |
| High | NanoBanana 若盲改 Bearer 直接回归 | **B4a Gate 验证** |
| High | LLM 放宽只改 `chat/ipc.ts` 不通 | **C1 端到端 4 处** |
| Medium | query-key 泄漏 URL | 仅 GeminiNative 使用，不推广 |
| Medium | Linux safeStorage backend 不稳定 | round4（若 backend=basic_text 提前升级） |
| Medium | DNS rebinding / redirect 复检不足 | round4 |
| Medium | `$ENC$` 魔术字符串 | §5 Secret Intent 采纳则解决，否则 round4 |
| Low | EdgeTTS/GPT-SoVITS 不走 auth 层 | 文档明确豁免，不算债务 |

---

## 11. 执行顺序

```
Phase A (串行, 2-3 天)
├─ A1 Seedance safeFetch
├─ A2 delete cascade + setMediaDefault validation
└─ A3 bulkImport upsert

Phase B (并行, 3-4 天)
├─ B1 auth.ts + netError.ts          (基础设施)
├─ B2 GeminiNative query-key         (依赖 B1)
├─ B3 TTS OpenAI/Fish                (依赖 B1)
├─ B4a NanoBanana Gate               (可与 B1/B2/B3 并行)
└─ B4b raw-authorization (条件性)    (依赖 B4a=requires-raw-authorization)

Phase C (可与 B 并行, 1-2 天)
└─ C1 LLM end-to-end 放宽

§5 Secret Intent (可选, 2-3 天)
└─ 若采纳，与 Manager 改造一起做；否则挪 round4

Phase D (1-2 天)
└─ D1 typecheck + 测试全绿 + 人工回归 + NanoBanana verdict
```

**总估**：不含 §5 约 7-11 天工作量；含 §5 约 10-14 天。

---

## 12. 对 `review-round2.md` 的最终修订

- **PR-1** → B3（TTS 仅 OpenAI/Fish 改造，EdgeTTS/GPT-SoVITS 豁免）
- **PR-2a** → B4a 先验证，B4b 条件执行（不默认 Bearer）
- **PR-2b** → B2（GeminiNative query-key strategy）
- **PR-3** → ✅ 已落地（net.ts 敏感 header 收紧）
- **PR-4** → ✅ 已落地（buildRow patch 保留）
- **PR-5** → B1（netError.ts 与 auth.ts 一起做）
- **PR-6** → A1（Seedance safeFetch，优先级提升至 Critical）
- **PR-7** → A3（bulkImport upsert）
- **PR-8** → A2（media_defaults 级联）
- **PR-9** → C1（端到端 4 处，不只改 `chat/ipc.ts`）
- **PR-10** → D1

---

## Sources
- Electron safeStorage: https://www.electronjs.org/docs/latest/api/safe-storage
- Codex SESSION_ID: `019db511-abd2-7d00-95fe-3487e23ba9b2`
- Gemini SESSION_ID: `310d79d5-f4b7-47d0-aec4-b6188798d769`
