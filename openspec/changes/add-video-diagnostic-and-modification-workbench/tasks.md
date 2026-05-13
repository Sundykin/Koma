# Tasks: 视频诊断报告 + 选菜式修改工作台（云算力版）

> 8-10 月路线图。**客户端零 ML 推理、零 GPU 依赖、零 Python sidecar**，所有 AI 能力通过 Koma 自建 new-api 网关调用。

## Phase M0 (15 天)：基础设施

### 0.1 koma-cloud 客户端基础设施（核心）
- [ ] 0.1.1 `electron/service/koma-cloud/AuthService.ts`：license → access/refresh token 换发 + 自动刷新 + 401 处理
- [ ] 0.1.2 `KomaCloudClient.ts`：底层 HTTP / WebSocket + 重试 + 错误码映射 + traceId 注入
- [ ] 0.1.3 `JobPoller.ts`：jobId 注册 + 5s 轮询 + WebSocket 升级 + 断网续查 + SQLite 持久化
- [ ] 0.1.4 `UsageService.ts`：套餐余额查询 + 任务前 quota 预检
- [ ] 0.1.5 `OfflineGuard.ts`：网络状态监听 + 健康检查 + 友好降级广播
- [ ] 0.1.6 controller/komaCloud.ts + preload bridge 暴露 IPC
- [ ] 0.1.7 与 new-api staging 环境联调通过（mock + 真接口各跑一遍）

### 0.2 接入现有 llmProviderRegistry
- [ ] 0.2.1 注册内置 provider `koma-cloud` 到 `llmProviderRegistry`，factory 返回 `ChatOpenAI` 锁定 baseUrl
- [ ] 0.2.2 改 `AuthService` 暴露同步获取 token 方法，factory 调用时取最新
- [ ] 0.2.3 `taskProfiles.ts` 新增 `video-analysis-*` / `script-translate` 等 profile
- [ ] 0.2.4 现有 ChatService / LLMQueryService 改默认 provider 为 `koma-cloud`
- [ ] 0.2.5 删除发布构建中的 OpenAI / Anthropic / Google provider（保留开发模式可用）

### 0.3 TaskService cloud kind
- [ ] 0.3.1 并发 4 → 32（p-queue 改造）
- [ ] 0.3.2 新增 `kind: 'cloud'` 路由到 JobPoller
- [ ] 0.3.3 child_process worker pool 仅承载 `heavy`（ffmpeg / upload）
- [ ] 0.3.4 cloud job 进程崩溃后从 SQLite 续查测试

### 0.4 FFmpeg hwaccel + Proxy（仅本地预处理）
- [ ] 0.4.1 hwaccel 自动检测（mac=videotoolbox / win=nvenc/qsv / linux=vaapi）
- [ ] 0.4.2 ProRes → H.264 1080p 加速 ≥ 5×
- [ ] 0.4.3 ProxyMediaService：1080p H.264 代理 + 关键帧 webp（用于 UI 流畅 + 减少上传体积）
- [ ] 0.4.4 Tus 协议上传客户端集成

### 0.5 SQLite 写串行化 + 向量索引
- [ ] 0.5.1 WriteSerializer + repo 接入
- [ ] 0.5.2 50 万 shot 压测不爆 SQLITE_BUSY
- [ ] 0.5.3 sqlite-vss 向量索引接入（embedding 来自 new-api 返回）
- [ ] 0.5.4 cloud_jobs 表 schema（jobId 持久化）

**M0 验收**：在 staging new-api 上跑通"上传 → submit → 轮询 → 下载结果"全链路；80GB ProRes 抽帧不阻塞 UI；断网重连后 job 自动续查成功。

## Phase M1 (3 个月)：诊断报告独立产品

### 1.1 12 维度 orchestrator 框架
- [ ] 1.1.1 `AnalysisOrchestrator` + 12 维度 agent worker 适配层
- [ ] 1.1.2 复用 `AgentGraph` 编排多维度并行
- [ ] 1.1.3 DiagnosticReport schema 定义（无 signature 字段）
- [ ] 1.1.4 维度间依赖图（人物 → 场景 → 服装 等）

### 1.2 客户端本地维度（无 new-api 依赖）
- [ ] 1.2.1 维度 1（元数据）：ffprobe 解析
- [ ] 1.2.2 维度 8（光照）：OpenCV.js 启发式（亮度直方图 / 色温估计）
- [ ] 1.2.3 维度 11（风险标记）：维度组合规则引擎
- [ ] 1.2.4 维度 12（修改可行性）：维度组合规则引擎

### 1.3 云端维度接入（按 new-api endpoint 拆分）
- [ ] 1.3.1 维度 2（人物）：ffmpeg 抽帧 + 上传 + 调 `/v1/chat/completions` (koma-vlm-face) + embedding 落 sqlite-vss
- [ ] 1.3.2 维度 3（场景）：切片上传 + 调 koma-vlm-scene
- [ ] 1.3.3 维度 4（镜头）：整片上传 + 调 koma-vlm-shot（含镜头分割）
- [ ] 1.3.4 维度 5（台词）：抽音轨上传 + 调 koma-asr
- [ ] 1.3.5 维度 6（服装）：抽帧上传 + 调 koma-vlm-wardrobe
- [ ] 1.3.6 维度 7（动作）：切片上传 + 调 koma-vlm-action
- [ ] 1.3.7 维度 9（OCR）：抽帧上传 + 调 koma-ocr
- [ ] 1.3.8 维度 10（音乐）：音轨分离上传 + 调 koma-audio-tag

### 1.4 报告浏览 UI
- [ ] 1.4.1 `<DiagnosticReportShell>` + 12 维度页面
- [ ] 1.4.2 人物卡片 + 镜头时间线 + 双栏台词 + 服装矩阵 + 动作色带
- [ ] 1.4.3 跨剧检索（sqlite-vss 本地查询）
- [ ] 1.4.4 增量解析（仅跑变更镜头）
- [ ] 1.4.5 报告导出（JSON / Excel / Web / PDF）

### 1.5 套餐 UI + 离线 UI
- [ ] 1.5.1 顶部套餐余额条
- [ ] 1.5.2 离线提示组件 + 全局按钮置灰逻辑
- [ ] 1.5.3 任务前 quota 预检对话框
- [ ] 1.5.4 RenderQueue 抽屉接入 cloud 任务

### 1.6 报告产品化
- [ ] 1.6.1 试用客户 onboarding 流程
- [ ] 1.6.2 套餐定价上线
- [ ] 1.6.3 用量统计后台（new-api 侧）

**M1 验收**：12 维度报告可售；3 家试点客户走通联网 SaaS 模式。

## Phase M2 (2-3 个月)：选菜界面 + 首批修改

### 2.1 选菜界面
- [ ] 2.1.1 ModificationPlan schema + DAG 推导
- [ ] 2.1.2 `<ModificationCartView>` 主页面
- [ ] 2.1.3 浏览报告时随手 + 改造（购物车式）
- [ ] 2.1.4 嵌套条件 `<ConditionBuilder>`
- [ ] 2.1.5 调 `/v1/koma/estimate` 实时估价 + 估时
- [ ] 2.1.6 版本树 SQLite

### 2.2 换脸（Lite + Pro 共用同一 client）
- [ ] 2.2.1 `FaceSwapClient.ts` 实现
- [ ] 2.2.2 face_swap 修改单 stage executor
- [ ] 2.2.3 QC Workbench UI（三栏对比 + 置信度热力图）—— 数据来自 new-api 返回的 metrics
- [ ] 2.2.4 客户决定是否强制人工 QC（默认开启可关闭）
- [ ] 2.2.5 端到端：单部 45 分钟 Lite ≤ 48 小时

### 2.3 横竖屏适配
- [ ] 2.3.1 8 平台 ReleaseSpec 预设
- [ ] 2.3.2 主跟踪走 `VideoGenClient.submit({ mode: 'subject-tracking' })` 获取轨迹
- [ ] 2.3.3 本地 ffmpeg 裁切 + 字幕重排 + loudnorm
- [ ] 2.3.4 AspectAdaptService + Studio UI
- [ ] 2.3.5 性能：1 集 24 分钟 → 8 平台 ≤ 8 分钟

**M2 验收**：选菜界面 + 换脸 + 横竖屏，端到端可用。

## Phase M3 (3-4 个月)：扩充菜式

### 3.1 多语言本地化
- [ ] 3.1.1 `TtsClient.ts` 实现
- [ ] 3.1.2 `LipsyncClient.ts` 实现
- [ ] 3.1.3 字幕翻译走 `llmQueryService` (koma-llm-translate profile)
- [ ] 3.1.4 屏显字幕替换：PaddleOCR.wasm 本地检测 + `VideoGenClient(mode='inpaint')` + 本地 Pillow.wasm 重绘
- [ ] 3.1.5 本地 ffmpeg 混音 + 字幕烧录
- [ ] 3.1.6 LocaleTrack 数据模型
- [ ] 3.1.7 LocalizationWorkbench UI
- [ ] 3.1.8 人工译审流程（客户决定是否强制）

### 3.2 服装替换
- [ ] 3.2.1 `WardrobeClient.ts` 实现
- [ ] 3.2.2 wardrobe 修改单 stage executor
- [ ] 3.2.3 参考服装上传 + 模式选择 UI（recolor / replace）

### 3.3 体型替换（静态 / 半身）
- [ ] 3.3.1 `BodyReshapeClient.ts` 实现
- [ ] 3.3.2 UI 自动剔除快速运动镜头（光流 > 12 px/frame）

### 3.4 视频生成 / 风格化
- [ ] 3.4.1 `VideoGenClient.ts` 实现（mode: stylization / background-replace / character-replace）
- [ ] 3.4.2 风格化关键帧绘师 panel
- [ ] 3.4.3 IPTransferJob ≤ 5 分钟硬上限
- [ ] 3.4.4 UI 文案标"概念演示"

### 3.5 4K 超分
- [ ] 3.5.1 `UpscaleClient.ts` 实现
- [ ] 3.5.2 母带上传选项（仅高质量超分场景，绕过代理）

### 3.6 私有化部署（可选，弱化优先级）
- [ ] 3.6.1 License + 硬件指纹（防盗版）
- [ ] 3.6.2 私有化客户的 new-api 部署文档（服务端事项，不在本 change）
- [ ] 3.6.3 客户配置自定义 endpoint 的开关（默认锁定，需 enterprise license）

**M3 验收**：7 个修改 pipeline 全部上线。

## Phase M4+：运维

- [ ] M4.1 每月回归测试（每能力 ≥ 3 部新样片）
- [ ] M4.2 每月技术 SLA 报告（仅性能指标，无合规指标）
- [ ] M4.3 new-api quota / 用量异常告警
- [ ] M4.4 Bug 修复 SLA：P0 4h / P1 24h / P2 7 天

## 关键依赖

- **new-api 后端能力齐备**（独立 change `add-koma-cloud-backend`，与本 change 并行交付）
- **客户付费套餐设计**（产品 + 商务）
- **客户自行处理**：算法备案 / KYC / C2PA / 销毁 / 保险 / 监管应对

## 已删除（相比早期 GPU 本地版本）

- ~~GpuTaskQueue / GPU 设备探测 / LRU 模型驱逐~~
- ~~InsightFace SCRFD / AuraFace / HDBSCAN 本地集成~~
- ~~TransNetV2 / WhisperX / pyannote / PaddleOCR 本地集成~~
- ~~OpenCLIP / SAM2 / RT-DETR / VideoMAE / Demucs / CLAP 本地集成~~
- ~~SimSwap / Roop / DeepFaceLab / GFPGAN / LivePortrait 本地集成~~
- ~~IDM-VTON / Wan-Animate / AnimateDiff / Real-ESRGAN 本地集成~~
- ~~LocalVLMProvider / MediaPipelineProvider 抽象~~
- ~~onnxruntime-node / Python sidecar / CoreML EP / MPS 调优~~
- ~~模型分发器 / U 盘镜像分发 / 客户 GPU 集群部署~~
- ~~InsightFace 商业授权采购~~
- ~~算法备案 / SPV / 保险 / 阿里云内容安全 / C2PA / 销毁 worker / 审计哈希链~~
- ~~客户 BYOL API key 管理（HeyGen / Sync.so / ElevenLabs / 阿里 / 火山）~~
