# Review Round 2 — profileId 代理架构审查与优化

> 模式：规划 | 范围：P0 + P1 + P2 全推 | 决策者：Codex (后端权威) + Gemini (前端) + 魔尊

---

## 背景

上一轮 SQLite 改造后，魔尊已自行落地 `x-koma-channel-id` header 代理架构（前端 provider 不持明文 apiKey，主进程 NetController 解密注入 Authorization）。但覆盖不全，需要补齐并收紧安全边界。

---

## 决策矩阵

| 决策 | 取值 | 理由 |
|---|---|---|
| 推进策略 | **P0 + P1 + P2 全推** | 魔尊要求上线前一次性清账 |
| GeminiNative 方案 | **方案 B：扩 NetController 支持 query-key 代理** | 而非 fail-fast 禁用；保持服务可用 |
| Workflow LLM 是否改 transport | **不改** | Codex 结论：LLM 在主进程 LangChain 跑，本来就能解密；只需统一凭据解析策略 |
| 范围边界 | 前端 provider + NetController + ChannelConfigService | 不动 LLM 主进程调用链、不推翻 Registry 架构 |

---

## 10 个 PR 拆分（按优先级和依赖顺序）

### 🔴 P0（上线阻塞）

#### PR-1：TTS 全链路补 profileId 代理 — Task #23
**改动文件**：
- `frontend/src/types.ts` — `TTSConfig` 加 `profileId?: string`
- `frontend/src/providers/channel/resolver.ts` — `buildTTSConfigFromContext` 注入 profileId
- `frontend/src/providers/index.ts` — TTS 工厂传 `sandboxedFetch: safeFetch`（当前是原生 fetch）
- `frontend/src/providers/tts/OpenAITTSProvider.ts` — 双轨 header + safeFetch
- `frontend/src/providers/tts/FishAudioProvider.ts` — 同上

**目标**：远程 TTS 重启后可用，不再裸奔 apiKey

#### PR-2a：NanoBanana 补 profileId — Task #27
**改动文件**：`frontend/src/providers/tti/NanoBananaProvider.ts`

**目标**：加 profileId 分支，否则重启后会发 `Authorization: $ENC$`

#### PR-2b：GeminiNative query-key 代理 — Task #21
**改动文件**：
- `electron/controller/net.ts` — 扩展支持 `x-koma-channel-query-key-name` header
- `frontend/src/providers/tti/GeminiNativeTTIProvider.ts` — 移除手动 `?key=` 拼接

**设计**：主进程拦截 `x-koma-channel-query-key-name: key` → 解密后注入 URL query（参数名从 header 取）→ 删除标记 header。与 Authorization / x-koma-channel-id 互斥。

---

### 🟠 P1（必改）

#### PR-3：NetController 安全收紧 — Task #24
**改动文件**：`electron/controller/net.ts`

**目标**：
- `x-koma-channel-id` + `Authorization` 同时出现 → 400 conflict_auth_mode
- 敏感 header 大小写变体重复 → 400 duplicate_sensitive_header
- canonicalize 到 lowercase 再处理

#### PR-4：修 C-B1 buildRow patch 不清空字段 — Task #28
**改动文件**：`electron/service/settings/ChannelConfigService.ts`

**最小 diff**（Codex 给的）：
```ts
provider_config_json: input.providerConfig !== undefined
  ? JSON.stringify(rest)
  : (existing?.provider_config_json ?? '{}'),
```

**扩展**：审视 models / capabilities / polling / extras 所有字段，确保 undefined 时走 existing

#### PR-5：401 错误码结构化传递 — Task #20
**改动文件**：
- 新建 `frontend/src/providers/netError.ts`（parseNetError + ChannelApiKeyMissingError）
- TTI/ITV/TTS 所有 provider 的 !response.ok 分支调用
- 所有 Manager 的 error toast

**目标**：识别主进程 `{ error: { code: 'channel_api_key_missing' } }` → 显示"该渠道未配置 API Key"而不是"认证失败"

---

### 🟡 P2（应改）

#### PR-6：safeFetch 统一收口 — Task #25
**改动文件**：
- `frontend/src/providers/itv/SeedanceProvider.ts:467` — 素材下载
- `frontend/src/providers/index.ts` — TTS 工厂
- 扫描 `frontend/src/providers` 下所有直接 `fetch()` 调用

#### PR-7：bulkImport 非破坏性 upsert — Task #26
**改动文件**：`electron/service/settings/ChannelConfigService.ts`

**目标**：`bulkImport` 按 id 先查 existing → `buildRow(input, existing)` 而不是 (input, null)

#### PR-8：media_defaults 引用完整性 — Task #30
**改动文件**：`electron/service/settings/ChannelConfigService.ts`

**目标**：
- `setMediaDefault` 校验 channelId/modelId 存在且 category 匹配
- `deleteChannelConfig` 在同一 transaction 内清理对应 media_defaults

#### PR-9：IPC modelProvider 校验放宽 — Task #29
**改动文件**：`electron/service/chat/ipc.ts`

**目标**：`validateLLMQueryRequest` 不再硬限 `openai|anthropic|google`，允许任意非空 string（放行 openai-compatible + 插件 provider）

---

### ✅ 收尾

#### PR-10：typecheck + 测试 — Task #22
- electron tsc + frontend tsc 双绿
- 补齐 10 个新增测试文件
- vitest 全绿

---

## 新增测试文件清单

- `frontend/src/providers/tts/OpenAITTSProvider.test.ts`
- `frontend/src/providers/tts/FishAudioProvider.test.ts`
- `frontend/src/providers/tti/NanoBananaProvider.test.ts`
- `frontend/src/providers/tti/GeminiNativeTTIProvider.test.ts`
- `electron/controller/net.fetch.test.ts`（代理模式互斥 + 重复键）
- `electron/service/settings/ChannelConfigService.update-preserves-config.test.ts`（C-B1）
- `electron/service/settings/ChannelConfigService.bulkImport.test.ts`
- `electron/service/settings/ChannelConfigService.mediaDefaults.test.ts`
- `frontend/src/providers/netError.test.ts`

---

## 验收

- [ ] 所有 TTI/ITV/TTS provider（含 NanoBanana/GeminiNative）重启后仍可发请求
- [ ] `x-koma-channel-id` + `Authorization` 双传返回 400 而非静默绕过
- [ ] update channel 只改 name 不会抹 provider_config
- [ ] `$ENC$` / 真实 apiKey 不再进 URL query
- [ ] 401 channel_api_key_missing 前端显示友好文案
- [ ] typecheck 绿 + 新增测试全绿

---

## 顺序说明

执行顺序不是严格 P0→P1→P2，而是按**依赖关系**：
1. PR-4（C-B1）— 独立，先修
2. PR-3（NetController）— 独立，为 PR-2b 准备基础设施
3. PR-2b（GeminiNative query-key）— 依赖 PR-3 的 header canonicalize
4. PR-1（TTS）+ PR-2a（NanoBanana）— 并行
5. PR-5（错误码）— 依赖 PR-1/PR-2a/PR-2b 的 provider 调整
6. PR-6（safeFetch）+ PR-7（bulkImport）+ PR-8（media_defaults）+ PR-9（modelProvider）— 独立，并行
7. PR-10（typecheck + 测试）— 收尾
