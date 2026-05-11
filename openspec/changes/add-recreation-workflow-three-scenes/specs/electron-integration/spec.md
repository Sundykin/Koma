# Spec Delta: electron-integration（二创工作流接入）

## ADDED Requirements

### Requirement: Recreation 与 MediaPipeline IPC 桥
系统 SHALL 在 preload bridge 暴露 `window.electronAPI.recreation` 与 `window.electronAPI.mediaPipeline` 两个独立命名空间，所有 IPC 通道纳入 ALLOWED_INVOKE_CHANNELS 白名单。

#### Scenario: recreation 通道
- **WHEN** preload 加载
- **THEN** `ALLOWED_INVOKE_CHANNELS` 包含：
  - `controller/recreation/trailer/{analyze, generateCutPlan, deriveVersion, ...}`
  - `controller/recreation/aspectAdapt/{previewReframe, runBatch, getDeliveryLog, ...}`
  - `controller/recreation/localization/{startPipeline, listLocales, submitTranslation, runDub, runLipSync, ...}`

#### Scenario: media-pipeline 通道
- **WHEN** preload 加载
- **THEN** `ALLOWED_INVOKE_CHANNELS` 包含：
  - `controller/mediaPipeline/{importSource, generateProxy, getHwAccelInfo, ...}`

#### Scenario: 状态广播
- **WHEN** worker 池任务进度变化
- **THEN** main 通过 `media-pipeline:task-progress` 广播到所有 renderer
- **AND** 物料状态变化通过 `recreation:material-state-changed` 广播

### Requirement: Recreation 与 MediaPipeline 生命周期挂载
系统 SHALL 在 ee-core Lifecycle 的 `electronAppReady` 钩子中初始化 MediaPipeline + Recreation services，挂载顺序确保 worker pool 先就绪。

#### Scenario: 启动初始化顺序
- **WHEN** Electron app 完成 ready
- **THEN** 按顺序初始化：
  1. MediaPipeline（启动 worker pool + hwaccel 探测）
  2. Recreation services（依赖 MediaPipeline 与 Provider Layer）
  3. IPC handler 注册
- **AND** 任一步失败不阻塞其他 service（降级运行）

#### Scenario: 关闭释放
- **WHEN** Lifecycle 的 `beforeClose` 触发
- **THEN** 所有 worker 子进程优雅退出（≤ 10s）
- **AND** 未完成的 task 持久化为 'paused' 状态，下次启动可恢复

### Requirement: 企业版 Provider 白名单
企业版（启用 enterprise profile 时）SHALL 严格限制所有 provider 调用为白名单内的本地服务，外部 API 调用被入口层拦截。

#### Scenario: 白名单读取
- **WHEN** 系统启动且 `~/.koma/enterprise-profile.json` 存在
- **THEN** 加载 `providerWhitelist` 配置
- **AND** 在所有 provider 调用入口（HTTP / SDK / gRPC）检查目标 host 是否在白名单

#### Scenario: 外部网络阻塞
- **WHEN** `blockExternalNetwork: true`
- **AND** 某个 provider 调用要访问白名单外的 host
- **THEN** 调用被拒绝并返回明确错误
- **AND** 记录被阻塞日志到 audit log

#### Scenario: 默认本地替代
- **WHEN** 客户切换到企业版
- **THEN** LLM provider 默认本地 vLLM
- **AND** TTI provider 默认本地 ComfyUI
- **AND** TTS provider 默认本地 Edge-TTS / GPT-SoVITS
- **AND** align provider 因无本地替代 → 该场景自动禁用（UI 显示原因）

### Requirement: 出网审计日志
系统 SHALL 记录所有 provider 调用的元数据（不含请求体明文），日志被 ed25519 签名以防篡改，保留 ≥180 天。

#### Scenario: 审计日志格式
- **WHEN** 任意 provider 被调用
- **THEN** 写入一条 JSON Lines 日志：`{ ts, callerService, providerKind, providerName, targetHost, requestBodySha256, statusCode, latencyMs, sigEd25519 }`
- **AND** 不写入请求/响应明文（避免泄露剧本）

#### Scenario: 签名验证
- **WHEN** 客户审计部门导出日志
- **THEN** 提供配套验证工具
- **AND** 工具用 Koma 公钥校验每行 `sigEd25519`
- **AND** 任一行签名不通过即标记日志被篡改

#### Scenario: 日志滚动
- **WHEN** 单文件 ≥ 100MB
- **THEN** 轮转到新文件
- **AND** 旧文件压缩 + 保留 ≥ 180 天

### Requirement: SourceMedia 持久化目录
系统 SHALL 提供独立的 source-media 与 proxy-cache 目录 helper，位于业务存储根下。

#### Scenario: 目录 helper
- **WHEN** 代码需要登记母带或生成代理
- **THEN** 调用 `getSourceMediaDir()` 返回 `~/.koma/source-media/`（仅元数据 sidecar，不存大文件）
- **AND** 调用 `getProxyMediaDir()` 返回 `~/.koma/proxy-media/`（H.264 代理 + 缩略图）

#### Scenario: 启动清理
- **WHEN** MediaPipeline 初始化
- **THEN** 清理 proxy-media 中关联 SourceMedia 已被删除的孤儿文件

## MODIFIED Requirements

### Requirement: TaskService 公开 worker dispatcher API
现有 TaskService 接口 SHALL 在保留外部契约不变的前提下，内部新增 child_process worker dispatcher，对调用方透明。

#### Scenario: 现有 API 向后兼容
- **WHEN** 现有代码调 `taskService.upsert(record)`
- **THEN** 行为与之前一致（外部不感知 worker 路由）
- **AND** task 状态 / 进度广播 / 失败重试机制完全保留

#### Scenario: 新 task type 自动路由
- **WHEN** 新增 task type 注册时声明 `kind: 'heavy'`
- **THEN** TaskService 自动路由到 worker pool
- **AND** 现有所有 task type 默认 `kind: 'light'`，运行在主进程不变

### Requirement: ee-core Lifecycle 钩子的初始化顺序硬约束
`electronAppReady` 钩子中初始化顺序 SHALL 保证 storage → taskService → mediaPipeline → recreation → marketplace → updater，任何顺序违反都视为严重 bug。

#### Scenario: 顺序检查
- **WHEN** 任一 service 初始化时其依赖 service 未就绪
- **THEN** 抛出明确错误（不允许静默 fallback）
- **AND** 日志记录依赖链
