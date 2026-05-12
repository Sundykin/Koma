# Spec Delta: electron-integration（R4 接入）

## ADDED Requirements

### Requirement: 诊断 + 修改 + 合规 IPC 桥
系统 SHALL 在 preload bridge 暴露 4 类新 namespace。

#### Scenario: namespace
- **WHEN** preload 加载
- **THEN** `window.electronAPI` 暴露：
  - `videoAnalysis.{run, incrementalRun, getReport, cancel, onProgress, crossProjectSearch}`
  - `modification.{createPlan, executePlan, onItemProgress, rollback, getVersionTree}`
  - `compliance.{c2paSign, c2paVerify, auditExport, auditVerify, kycSubmit, destructionSchedule}`
  - `enterprise.{loadProfile, getHardwareFingerprint, getAuditLog}`

#### Scenario: 广播事件
- **WHEN** 解析 / 修改 进度变化
- **THEN** main 通过 `analysis:progress` / `modification:progress` 广播
- **AND** 合规事件通过 `compliance:audit-event`

### Requirement: 启动初始化顺序
ee-core Lifecycle `electronAppReady` SHALL 按严格顺序初始化。

#### Scenario: 顺序
- **WHEN** Electron app ready
- **THEN** 按：storage → taskService → compliance → mediaPipeline → analysis services → modification services → enterprise profile → marketplace + updater
- **AND** 任一失败抛错，不允许静默 fallback

### Requirement: 企业版 License + 硬件指纹
私有化版本 SHALL 通过 License + 企业账号 + 硬件指纹三锁绑定。

#### Scenario: License 文件
- **WHEN** 企业版安装
- **THEN** 必须导入 License（ed25519 签名）
- **AND** License 含硬件指纹（CPU + 主板 + 网卡 UUID 哈希）+ 企业账号 + 有效期

#### Scenario: AirGapMode
- **WHEN** License airgap=true
- **THEN** 三层网络拦截（fetch wrapper + session.webRequest + Node net.connect）
- **AND** C2PA 签名走本地 HSM
- **AND** 模型升级走客户内网 mirror

#### Scenario: 硬件指纹变更
- **WHEN** 当前机器指纹 ≠ License 指纹
- **THEN** 拒绝启动 + 提示"机器已变更，联系运维"

### Requirement: 现有 sidebar 占位入口改造
现有 `Sidebar` 的"二创"占位入口 SHALL 改造为 R4 工作台主入口。

#### Scenario: 入口接入
- **WHEN** 用户点 sidebar 二创入口
- **THEN** 进入 `<RecreationWorkbenchShell>`（替代原占位卡片页）
- **AND** 默认 Tab "概览"
- **AND** Tab 切换：概览 / 物料看板 / 报告库 / 修改单 / 渲染队列 / 模板

## MODIFIED Requirements

### Requirement: TaskService 公开 GPU dispatcher API
现有 TaskService SHALL 保留外部契约不变，内部新增 GPU dispatcher。

#### Scenario: 向后兼容
- **WHEN** 现有代码调 `taskService.upsert(record)`
- **THEN** 行为不变 + 自动按 kind 路由

#### Scenario: 新 kind 自动路由
- **WHEN** task 声明 `kind: 'gpu'`
- **THEN** 路由 GpuTaskQueue
- **AND** `kind: 'heavy'` 路由 child_process worker pool
- **AND** 默认 `kind: 'light'` 主进程不变

### Requirement: LLM provider 扩展支持 video input
现有 LLM provider 抽象 SHALL 扩展支持视频输入字段。

#### Scenario: 兼容旧 provider
- **WHEN** 旧 provider 不支持视频
- **THEN** 抽象层自动 fallback 忽略 videoInput
- **AND** 不抛错

#### Scenario: 视频理解 provider
- **WHEN** provider 声明 `supportsVideoInput: true`
- **THEN** 可处理 `request.videoInput.{url|base64}` 字段
- **AND** 返回结构化输出（场景描述 / 动作 tag / 情绪 tag / 台词时码）
