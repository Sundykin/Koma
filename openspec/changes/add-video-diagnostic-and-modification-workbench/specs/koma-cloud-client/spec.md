# Spec: koma-cloud-client

> Koma 客户端访问 Koma 自建 new-api 网关的统一客户端层。所有 AI / GPU 算力（LLM / VLM / TTS / Lip-Sync / 视频生成 / 换脸 / 服装替换 / 体型替换 / 超分）均通过本层调用。客户端无任何本地 ML 推理。

## Milestone 分段

本 spec 的 Requirement 按交付节点分三个里程碑：

### M0（已实现 / 第一阶段）
- 鉴权 token 换发 / 自动刷新 / revoke 路径
- 凭据安全：refresh token + license 走 Electron safeStorage 加密落盘；access token 仅内存持有
- 统一 HTTP 客户端：5xx + 网络错误指数退避重试 3 次（1s / 2s / 5s）；401 强制 access token 失效后重试；AUTH_REVOKED 触发 handleRevoked + 广播
- 7 个能力 client：TTS 同步 + Lipsync / FaceSwap / VideoGen / Wardrobe / BodyReshape / Upscale 异步
- JobPoller：HTTP 5s 默认轮询、`min(etaSec/10, 5s)` 调整、启动时 `resumeOnBoot` 续查
- UsageService：5 分钟周期刷新 + `/v1/koma/estimate` 预检
- OfflineGuard：连续失败 3 次进 offline、连续成功 2 次出 offline
- IPC 边界错误脱敏：controller 全部返回 `{ ok, data } / { ok: false, error }`，丢弃 upstream message / httpStatus
- 敏感产物（outputUrls / metrics）不进 tasks 表 payload、不通过 `tasks:updated` 广播，UI 走 `getJobResult` IPC 显式拉取
- TLS 严格化：startup 拒绝 `NODE_TLS_REJECT_UNAUTHORIZED=0`（packaged build）
- endpoint 锁死：仅 dev 构建 + `KOMA_CLOUD_DEBUG_ENDPOINT_OVERRIDE=1` 才允许 override + 强制 https + host 白名单

  （上面 M0 已实现列表已在第五波 review 后扩充，补 license 预检 / WebSocket 升级 / Tus 上传 / 产物下载 / TaskScope / jitter / 节流 / fallback 幂等 等。完整功能口径见各 Requirement scenario。）

### M0 收尾（仅骨架，prod 上线前补全）
- SPKI pinning：tlsGuard 暴露 `verifyPeerCertificate` 纯函数 + 启动期 pin 列表 warn；**尚未接入 fetch 调用栈**——下一步用 undici Connector / `session.setCertificateVerifyProc` 注入，需要 prod cert SPKI 指纹（双指纹滚动）
- WebSocket：客户端实现完毕，等 new-api 端 `streamUrl` 字段联调
- Tus 上传：客户端骨架完毕，等 new-api 端 `/v1/koma/uploads` 端点联调
- 跨进程 Tus 续传：uploadUrl 持久化到 SQLite 后启动时 HEAD 续传（M0 仅进程内续传）

### M1+（未来 change）
- prod 构建剔除 OpenAI / Anthropic / Google provider（视 chat / channel 业务是否切到 koma-cloud-only 决定）
- 多端登录冲突 UI（被踢下线的明确弹窗 + reauth）
- WebSocket 服务端断流自适应重连（M0 是 onclose → HTTP fallback；M1 加 wss 自动重连）

> 命名 / 字段决议（与 proposal / 早期描述统一）：
> - 事件统一命名 `koma-cloud:online-state-changed`（非 offline-state-changed）；electronAPI 用 `onOnlineStateChanged`
> - UsageSnapshot 字段：`balanceUnits + capabilities map`（替代早期描述里 `balanceTokens / balanceJobs`，后者归并入 capabilities）
> - 轮询间隔上界 5s（与 spec 一致）
> - OfflineGuard 进 offline 条件：`net.isOnline()===false` OR 健康检查连续失败 3 次（任一满足）
> - 离线→在线切换时：`kickAllTrackers` 把现存 tracker 立刻提前轮询 + `resumeOnBoot` 扫表恢复漏掉的 tracker
> - 网络层 header：`Authorization` / `User-Agent` / `X-Koma-Trace-Id` / `X-Koma-Client-Version` 必注入；`X-Koma-Project-Id` 仅在业务侧传入 projectId 时注入

## ADDED Requirements

### Requirement: 鉴权与 token 换发
系统 SHALL 通过 `AuthService` 用 Koma license 换取 new-api short-lived token，**不存储长效 API key 到客户端**。

#### Scenario: license → token
- **WHEN** 客户端启动
- **THEN** `AuthService.login(license)` 调 new-api `/v1/auth/exchange` 拿到 access token + refresh token
- **AND** access token 内存持有，TTL 1 小时
- **AND** refresh token 加密存 KV，TTL 30 天

#### Scenario: token 自动刷新
- **WHEN** access token 剩余 TTL < 5 分钟 或调用返回 401
- **THEN** 自动用 refresh token 续期
- **AND** 续期过程中任务暂停 ≤ 2 秒后透明恢复

#### Scenario: 强制下线
- **WHEN** new-api 返回 `auth_revoked` 错误码
- **THEN** 客户端清理本地 token + 弹登录页
- **AND** 进行中的 cloud 任务挂起到 SQLite，重新登录后续查

#### Scenario: 多端登录策略
- **WHEN** 同 license 在另一台机器登录
- **THEN** 行为由 new-api 服务端策略决定（同时在线 / 单点登录）
- **AND** 客户端只响应服务端的 `auth_revoked` 信号

### Requirement: 统一 KomaCloudClient 基础设施
系统 SHALL 提供 `KomaCloudClient` 作为所有 new-api 调用的底层 HTTP / WebSocket 客户端。

#### Scenario: 请求注入
- **WHEN** 任何 client（TTS / Lipsync / FaceSwap 等）发起请求
- **THEN** 必经 `KomaCloudClient`
- **AND** 自动注入：`Authorization: Bearer {accessToken}` + `X-Koma-Client-Version` + `X-Koma-Trace-Id` + `X-Koma-Project-Id`

#### Scenario: 网络层重试
- **WHEN** 请求遇到 5xx / 网络中断
- **THEN** 按指数退避重试 3 次（1s / 2s / 5s）
- **AND** 4xx 不重试

#### Scenario: 统一错误码映射
- **WHEN** new-api 返回非 2xx
- **THEN** 转换为 `KomaCloudError` 枚举：`AUTH_EXPIRED / QUOTA_EXCEEDED / RATE_LIMITED / UPSTREAM_DOWN / INPUT_INVALID / JOB_FAILED / NETWORK / UNKNOWN`
- **AND** 错误对象携带：原始 HTTP code + new-api 错误码 + 用户友好提示文案（中文）+ 建议动作

#### Scenario: 大文件上传
- **WHEN** 上传媒体到 new-api（任务输入）
- **THEN** 走 Tus 断点续传协议
- **AND** 进度通过 task event 推送到 UI

### Requirement: 各能力 client（按能力拆分）
系统 SHALL 为每种 new-api 能力提供专用 client，**每个 client 一个文件，互不耦合**。

#### Scenario: LLM / VLM 走 llmProviderRegistry
- **WHEN** 调用 `/v1/chat/completions`
- **THEN** **不走 KomaCloudClient 直连**，复用 `llmProviderRegistry` 的 `koma-cloud` provider + LangChain `BaseChatModel`
- **AND** rationale: 复用现有 `LLMQueryService` 的 budget / strategy / observability / chunking 子系统

#### Scenario: TtsClient（同步）
- **WHEN** `TtsClient.synthesize({ text, voice, speed, lang })`
- **THEN** POST `/v1/koma/tts` 同步返回 `{ audioUrl, durationMs, costCents }`
- **AND** 客户端下载 audioUrl 到本地缓存
- **AND** 默认超时 60 秒

#### Scenario: LipsyncClient（异步 job）
- **WHEN** `LipsyncClient.submit({ videoUrl, audioUrl, faceTrackingHint? })`
- **THEN** POST `/v1/koma/lipsync` 返回 `{ jobId, etaSec, estCostCents }`
- **AND** 调用方接收 jobId，交给 `JobPoller` 统一轮询

#### Scenario: FaceSwapClient（异步 job）
- **WHEN** `FaceSwapClient.submit({ shotIds, referenceFaceUrl, qualityTier })`
- **THEN** POST `/v1/koma/face-swap` 返回 jobId
- **AND** `qualityTier ∈ { 'lite', 'pro' }` 决定 new-api 后端用哪条 pipeline

#### Scenario: VideoGenClient（异步 job）
- **WHEN** `VideoGenClient.submit({ mode, input, prompt? })`
- **THEN** POST `/v1/koma/video-gen` 返回 jobId
- **AND** `mode ∈ { 'background-replace', 'character-replace', 'stylization' }`

#### Scenario: WardrobeClient / BodyReshapeClient / UpscaleClient
- **WHEN** 调用对应 submit 方法
- **THEN** 分别 POST `/v1/koma/wardrobe` / `/v1/koma/body-reshape` / `/v1/koma/upscale` 返回 jobId
- **AND** 行为模式与上述异步 job 一致

### Requirement: JobPoller 统一长任务管理
系统 SHALL 提供 `JobPoller` 单例集中管理所有异步 jobId 的状态轮询、推送升级、断网续查。

#### Scenario: 注册 job
- **WHEN** 任一 client submit 返回 jobId
- **THEN** 调用 `JobPoller.track(jobId, { onProgress, onComplete, onError })`
- **AND** jobId 持久化到 SQLite `cloud_jobs` 表（重启可续）

#### Scenario: 轮询策略
- **WHEN** job 状态 ≠ terminal
- **THEN** 默认 5 秒轮询 GET `/v1/koma/jobs/{id}`
- **AND** new-api 返回 etaSec 后按 `min(etaSec/10, 5s)` 调整间隔

#### Scenario: WebSocket 升级
- **WHEN** new-api 在响应中带 `streamUrl`
- **THEN** JobPoller 自动升级到 WebSocket 接收推送
- **AND** WebSocket 断开自动回落到 HTTP 轮询

#### Scenario: 断网续查
- **WHEN** 客户端进程崩溃或断网超过 30 秒
- **THEN** 重启 / 联网后 JobPoller 从 SQLite 恢复全部未完成 jobId
- **AND** 调 GET `/v1/koma/jobs/{id}` 一次性同步状态
- **AND** 不重复提交

#### Scenario: 结果下载
- **WHEN** job 状态变 `completed`
- **THEN** 客户端从 result.outputUrls 下载产物到本地缓存
- **AND** 下载完成后回调 onComplete + 更新业务表
- **AND** 7 天后清理本地缓存（产物已落业务表）

#### Scenario: job 失败
- **WHEN** job 状态变 `failed`
- **THEN** 回调 onError 携带 `{ errorCode, errorMessage, retryable, suggestion }`
- **AND** UI 按 retryable 决定是否显示"重试"按钮

### Requirement: UsageService 套餐余额与 quota 预检
系统 SHALL 在任务提交前预检套餐余额，**避免提交后才发现 quota 不足**。

#### Scenario: 套餐余额查询
- **WHEN** 客户端启动 / 每 5 分钟 / 任务完成后
- **THEN** GET `/v1/koma/usage` 拉取：`{ planName, balanceTokens, balanceJobs, periodEndAt, usageThisPeriod }`
- **AND** 全局 store 缓存，前端套餐余额条订阅

#### Scenario: 任务前 quota 预检
- **WHEN** 用户准备提交 ModificationPlan
- **THEN** 客户端调 POST `/v1/koma/estimate` 传 plan 摘要
- **AND** new-api 返回 `{ estCostCents, estJobs, willExceedQuota: bool, suggestion? }`
- **AND** 超额时 UI 弹"升级套餐 / 缩减范围 / 仍然提交（透支）"三选项

#### Scenario: 用量上报
- **WHEN** 任务完成
- **THEN** new-api 自动记账，客户端不主动上报
- **AND** 客户端仅在 onComplete 后刷新本地余额缓存

### Requirement: OfflineGuard 离线降级
系统 SHALL 在网络中断或 new-api 不可达时友好降级，**绝不弹"未知错误"**。

#### Scenario: 网络状态监听
- **WHEN** Electron `net.isOnline() === false` **OR** new-api 健康检查 `GET /v1/health` 连续失败 3 次（任一满足）
- **THEN** 进入 `offline` 状态广播到前端
- **AND** 连续 2 次健康检查成功后退出 offline

#### Scenario: 离线时的 UI 行为
- **WHEN** 系统处于 `offline`
- **THEN** 所有"提交云端任务"按钮置灰，hover 提示"网络不可用，请检查连接"
- **AND** 已有 jobId 进入暂停轮询模式
- **AND** 报告浏览 / 本地剪辑 / 项目管理 / 物料看板**保持可用**

#### Scenario: 网络恢复
- **WHEN** 连续 2 次健康检查通过
- **THEN** 退出 `offline` 状态
- **AND** JobPoller 自动恢复所有 paused job 的轮询
- **AND** UI 解除置灰

#### Scenario: 服务端故障与网络中断区分
- **WHEN** 健康检查返回 5xx 而非超时
- **THEN** UI 提示"Koma 服务暂时不可用"（而非"网络问题"）
- **AND** 显示 new-api 返回的服务公告（如有）

### Requirement: 配置与 endpoint
系统 SHALL 在打包时固定 new-api 默认 endpoint，**普通用户不可改**。

#### Scenario: 默认 endpoint
- **WHEN** 客户端启动
- **THEN** 从打包内嵌的 `config.komaCloud.baseUrl` 读取
- **AND** 该值由 release 构建注入（生产 / staging / dev 各自值）

#### Scenario: 内部调试覆盖
- **WHEN** 启动参数包含 `--koma-cloud-endpoint=<url>` 且环境变量 `KOMA_INTERNAL_DEBUG=1`
- **THEN** 覆盖默认 endpoint
- **AND** UI 顶部显示醒目的"调试模式"红条
- **AND** 该路径仅 Koma 内部使用，不暴露给普通用户

### Requirement: 与 TaskService 集成
系统 SHALL 把所有 cloud 任务注册为 TaskService 的 `kind: 'cloud'` task，复用现有进度推送 / 任务列表 / 长任务静音逻辑。

#### Scenario: 注册
- **WHEN** 任一 client 提交任务并拿到 jobId
- **THEN** 创建 TaskRecord（kind=cloud, status=running, type=对应能力名, payload={jobId, ...}）
- **AND** JobPoller 进度更新通过 TaskService.update 反馈

#### Scenario: 与 longTaskGuard 协作
- **WHEN** cloud 任务运行中
- **THEN** updater 的 longTaskGuard 视为长任务，**静音更新弹窗**（沿用现有规则）

#### Scenario: 任务取消
- **WHEN** 用户点击任务列表的取消按钮
- **THEN** 调 POST `/v1/koma/jobs/{id}/cancel`
- **AND** 取消成功后 TaskRecord 状态 → cancelled
- **AND** new-api 侧的取消能否退款由服务端策略决定
