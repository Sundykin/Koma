# Spec Delta: electron-integration（二创完整版接入）

## ADDED Requirements

### Requirement: 7 场景 IPC 桥
系统 SHALL 在 preload bridge 暴露 7 场景的独立 namespaces，所有 IPC 通道纳入白名单。

#### Scenario: namespace 注册
- **WHEN** preload 加载
- **THEN** `window.electronAPI.recreation` 暴露 7 个子 namespace：
  - `trailer.*`（S1）
  - `aspectAdapt.*`（S2）
  - `localization.*`（S3）
  - `faceSwap.*`（S4）
  - `bodySwap.*`（S5 体型）
  - `outfitSwap.*`（S5 服装）
  - `ipTransfer.*`（S6/S7）
- **AND** 每个 namespace 至少 10 个方法

#### Scenario: 合规通道
- **WHEN** preload 加载
- **THEN** 新增 `window.electronAPI.compliance` namespace：
  - `c2pa.sign / c2pa.verify`
  - `audit.export / audit.verify`
  - `kyc.submit / kyc.status`
  - `destruction.schedule / destruction.execute / destruction.verify`

#### Scenario: 状态广播
- **WHEN** 任意 GPU 任务进度变化
- **THEN** main 通过 `media-pipeline:gpu-task-progress` 广播到 renderer
- **AND** 物料状态变化通过 `recreation:material-state-changed`
- **AND** 审计事件通过 `compliance:audit-event`

### Requirement: 启动初始化顺序
ee-core Lifecycle 的 `electronAppReady` 钩子 SHALL 按严格顺序初始化各 service。

#### Scenario: 初始化顺序
- **WHEN** Electron app ready
- **THEN** 按顺序：
  1. storage（SQLite + WAL + 写串行化）
  2. taskService（worker pool + GpuTaskQueue）
  3. compliance（C2PA 签名 + 名单库 + 审计哈希链）
  4. mediaPipeline（hwaccel + proxy）
  5. recreation services（7 个）
  6. enterprise profile（私有化时）
  7. marketplace + updater
- **AND** 任一 service 初始化失败 → 抛出明确错误，不允许静默 fallback

### Requirement: 企业版强制水印
启用 enterprise profile 时，系统 SHALL 强制所有 S4-S7 输出嵌入 C2PA 双标识，且 UI 上水印开关不可关闭。

#### Scenario: 水印强制
- **WHEN** 企业 profile 加载
- **THEN** UI 上"水印开关"按钮 disabled + 显示"企业策略锁定"
- **AND** ffmpeg 命令构建时 drawtext + C2PA 写入命令写死，不读 UI 状态

#### Scenario: 客户尝试绕过
- **WHEN** 客户通过本地修改 settings.json 试图关闭水印
- **THEN** 系统启动时校验失败 + 拒绝开启 S4-S7
- **AND** 记录到审计日志（被禁用尝试）

### Requirement: License + 硬件指纹双锁
私有化版本 SHALL 通过 License 文件 + 企业账号 + 硬件指纹三锁绑定客户机器。

#### Scenario: License 文件
- **WHEN** 客户安装企业版
- **THEN** 必须导入 License 文件（ed25519 签名）
- **AND** License 含：客户机器硬件指纹（CPU + 主板 + 网卡 UUID 哈希）+ 企业账号 + 有效期

#### Scenario: 启动校验
- **WHEN** Electron 启动
- **THEN** 校验：当前机器硬件指纹 === License 内硬件指纹
- **AND** 不匹配则拒绝启动 + 显示"机器已变更，联系运维"

#### Scenario: AirGapMode
- **WHEN** License 含 `airgap=true`
- **THEN** 启动后禁用所有外网请求（fetch wrapper + session.webRequest + Node net.connect 三层拦截）
- **AND** C2PA 签名走本地 HSM
- **AND** 模型升级走客户内网 mirror

## MODIFIED Requirements

### Requirement: TaskService 公开 GPU dispatcher API
现有 TaskService 接口 SHALL 在保留外部契约不变的前提下，内部新增 GPU dispatcher。

#### Scenario: 透明扩展
- **WHEN** 现有代码调 `taskService.upsert(record)`
- **THEN** 行为与之前一致
- **AND** 任务进度 / 失败重试机制完全保留

#### Scenario: 新 task 自动 GPU 路由
- **WHEN** 新增 task type 注册时声明 `kind: 'gpu'`
- **THEN** TaskService 自动路由到 GpuTaskQueue
- **AND** 现有 task 默认 `kind: 'light'`，运行在主进程不变
- **AND** 'heavy' task（来自 add-recreation-workflow-three-scenes）继续路由到 child_process worker pool

### Requirement: 现有 LLM provider 抽象支持 video input
现有 LLM provider 抽象 SHALL 扩展支持视频输入字段，以支持视觉理解 provider。

#### Scenario: 兼容旧 provider
- **WHEN** 旧 provider 不支持视频输入
- **THEN** 抽象层自动 fallback 到"忽略 videoInput 字段"行为
- **AND** 不抛错

#### Scenario: 新视觉理解 provider
- **WHEN** provider 声明 `supportsVideoInput: true`
- **THEN** 可处理 `request.videoInput.{url|base64}` 字段
- **AND** 返回结构化输出（场景描述 / 动作 tag / 情绪 tag / 台词时码）
