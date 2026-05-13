# Spec Delta: electron-integration

## ADDED Requirements

### Requirement: 诊断 + 修改 IPC 桥
系统 SHALL 在 preload bridge 暴露 2 类新 namespace（不含 compliance）。

#### Scenario: namespace
- **WHEN** preload 加载
- **THEN** `window.electronAPI` 暴露：
  - `videoAnalysis.{run, incrementalRun, getReport, cancel, onProgress, crossProjectSearch}`
  - `modification.{createPlan, executePlan, onItemProgress, rollback, getVersionTree}`
  - `komaCloud.{login, logout, getUsage, estimatePlan, onUsageChanged, onOfflineStateChanged}`
  - `enterprise.{loadLicense, getHardwareFingerprint}`（仅防盗版，非合规审计）
- **AND** `videoAnalysis` controller 内部走现有 `llmQueryService` + `AgentGraph` + `koma-cloud` 各 client，**不暴露独立的 cloud 调用 IPC**（避免渲染进程直接对 new-api 发请求）

#### Scenario: 广播事件
- **WHEN** 解析 / 修改 进度变化
- **THEN** main 通过 `analysis:progress` / `modification:progress` 广播

### Requirement: 启动初始化顺序
ee-core Lifecycle `electronAppReady` SHALL 按严格顺序初始化。

#### Scenario: 顺序
- **WHEN** Electron app ready
- **THEN** 按：storage → taskService → mediaPipeline → komaCloud (AuthService + UsageService + OfflineGuard) → llmProviderRegistry 注册 `koma-cloud` provider → analysis services → modification services → license 校验 → marketplace + updater
- **AND** 任一失败抛错

### Requirement: License + 硬件指纹（仅防盗版）
私有化版本 SHALL 通过 License + 硬件指纹绑定，**仅用于防盗版**，不用于合规审计。

#### Scenario: License 文件
- **WHEN** 企业版安装
- **THEN** 必须导入 License（ed25519 签名，复用 release-signing）
- **AND** License 含硬件指纹 + 企业账号 + 有效期

#### Scenario: 硬件指纹变更
- **WHEN** 当前机器指纹 ≠ License 指纹
- **THEN** 拒绝启动 + 提示"机器已变更，联系运维"

### Requirement: 现有 sidebar 占位入口改造
现有 `Sidebar` 的"二创"占位入口 SHALL 改造为 R4 工作台主入口。

#### Scenario: 入口接入
- **WHEN** 用户点 sidebar 二创入口
- **THEN** 进入 `<RecreationWorkbenchShell>`
- **AND** Tab 切换：概览 / 物料看板 / 报告库 / 修改单 / 渲染队列 / 模板

## MODIFIED Requirements

### Requirement: TaskService 公开 cloud dispatcher API
现有 TaskService SHALL 保留外部契约不变，内部新增 cloud 调度（**无 GPU dispatcher**，客户端无 GPU 任务）。

#### Scenario: 向后兼容
- **WHEN** 现有代码调 `taskService.upsert(record)`
- **THEN** 行为不变 + 自动按 kind 路由

#### Scenario: 新 kind 自动路由
- **WHEN** task 声明 `kind: 'cloud'`
- **THEN** 由 koma-cloud / JobPoller 统一管理生命周期
- **AND** `kind: 'heavy'` 路由 child_process worker pool（仅 ffmpeg / 上传等 CPU 任务）
- **AND** 默认 `kind: 'light'` 主进程不变
- **AND** **不接受 `kind: 'gpu'`**（客户端无 GPU）

### Requirement: 复用 llmProviderRegistry 接入 new-api
现有 `electron/service/chat/providers/llmProviderRegistry` SHALL **保持接口不变**，新增内置 provider `koma-cloud` 指向 new-api，**不暴露其他 provider type 给客户**。

#### Scenario: 注册 koma-cloud provider
- **WHEN** 主进程 `electronAppReady`
- **THEN** 通过 `llmProviderRegistry.register({type: 'koma-cloud', factory})` 注册
- **AND** factory 返回 LangChain `ChatOpenAI` 实例，`baseUrl = config.komaCloud.baseUrl + '/v1'`
- **AND** `apiKey` 由 `koma-cloud/AuthService` 动态注入（每次 createChatModel 调用时取最新 access token）

#### Scenario: 视频帧透传
- **WHEN** 视频分析调用 LLM
- **THEN** 视频帧通过 LangChain 标准 `HumanMessage.content = [{type: 'image_url', image_url: ...}]` parts 传入
- **AND** 不新增 `videoInput` / `supportsVideoInput` 字段

#### Scenario: 复用 LLMQueryService 不另起 service
- **WHEN** 12 维度分析需要 LLM / VLM 推理
- **THEN** 走现有 `llmQueryService.query(request)`，`config.modelProvider = 'koma-cloud'`
- **AND** 复用现有 `taskProfiles` / `budget` / `strategy` / `observability` 子系统
- **AND** 不在 `electron/service/analysis/` 重复造 LLM 调用层

#### Scenario: 非 LLM 能力不走 llmProviderRegistry
- **WHEN** 调用 TTS / Lipsync / FaceSwap / VideoGen / Wardrobe / BodyReshape / Upscale
- **THEN** 走 `electron/service/koma-cloud/` 各 client，**不走** llmProviderRegistry
- **AND** rationale: 这些是非 OpenAI 协议的自定义 endpoint，强行套 BaseChatModel 会扭曲抽象

## 已删除 Requirements（相比 R4 早期版本）

- ~~Compliance IPC namespace（c2pa / kyc / 审计 / 销毁）~~
- ~~企业版强制水印~~
- ~~AirGapMode 强制外网拦截~~（客户决定是否启用网络限制）
