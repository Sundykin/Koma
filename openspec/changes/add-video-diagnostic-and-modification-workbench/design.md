# Design: 视频诊断报告 + 选菜式修改工作台（纯工具版）

> 本设计以"纯技术工具"为定位：所有合规 / 法务 / 财务 / 安全责任由客户自负。
> Koma 仅交付能力，**不交付政策应对、不做内容审核、不签兜底条款**。

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│ Koma 客户端（Electron）— 零 GPU 依赖                              │
│                                                                  │
│ Renderer（React）                                                │
│ ┌─────────────────────┐ ┌──────────────────┐ ┌──────────────┐  │
│ │ <DiagnosticReport>  │ │ <ModificationCart>│ │ <CloudUsage>│  │
│ │ <AssetVault>        │ │ <RenderQueue>     │ │ <OfflineBar>│  │
│ └─────────────────────┘ └──────────────────┘ └──────────────┘  │
│                              │                                   │
│ Main（Electron）                                                 │
│  AnalysisOrchestrator        ModificationOrchestrator           │
│   (12 维度 agent DAG)         (DAG → stage executor)            │
│         │                            │                           │
│         ▼                            ▼                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ koma-cloud（统一云调用层）                                │   │
│  │  ├─ AuthService (license→token)                          │   │
│  │  ├─ llmProviderRegistry["koma-cloud"]（LLM/VLM 走这条）    │   │
│  │  ├─ TtsClient / LipsyncClient / FaceSwapClient           │   │
│  │  │   VideoGenClient / WardrobeClient / BodyReshapeClient │   │
│  │  │   UpscaleClient                                       │   │
│  │  ├─ JobPoller (统一异步轮询)                              │   │
│  │  ├─ UsageService (套餐余额 + quota 预检)                  │   │
│  │  └─ OfflineGuard (网络降级)                              │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                            │                                     │
│  TaskService (worker pool) │  FFmpeg (本地预处理 / 代理 / 上传)   │
│  Storage (SQLite + 写串行 + sqlite-vss)                          │
└────────────────────────────┼─────────────────────────────────────┘
                             │
                             │  HTTPS / WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ new-api 网关（Koma 自建后端，独立 change）                         │
│  /v1/chat/completions   (LLM / VLM 同步)                         │
│  /v1/koma/tts           (TTS 同步)                               │
│  /v1/koma/lipsync       (异步 job)                              │
│  /v1/koma/face-swap     (异步 job)                              │
│  /v1/koma/video-gen     (异步 job)                              │
│  /v1/koma/wardrobe      (异步 job)                              │
│  /v1/koma/body-reshape  (异步 job)                              │
│  /v1/koma/upscale       (异步 job)                              │
│  /v1/koma/jobs/{id}     (轮询 + WebSocket 推送)                  │
│  /v1/koma/usage         (套餐余额)                               │
│  /v1/koma/estimate      (quota 预检)                             │
│  /v1/auth/exchange      (license→token)                          │
│                                                                  │
│  上游路由 / failover / 成本核算 / quota 控制                       │
└─────────────────────────────────────────────────────────────────┘
```

**注意：原 R4 设计中的 ComplianceLayer 完全删除。** 不再有 C2PA / KYC / 审计哈希链 / 销毁 worker 等模块。

**架构核心原则**：
1. **客户端零算力**：无 onnxruntime / Python sidecar / 本地模型 / GPU 任务。所有 AI 通过 new-api 网关
2. **LLM/VLM 复用现有抽象**：注册内置 provider `koma-cloud` 到 `llmProviderRegistry`，沿用 `LLMQueryService` / `AgentGraph` / `taskProfiles` / `budget` / `observability`
3. **非 LLM 能力一对一 endpoint**：TTS / Lipsync / FaceSwap 等各自一个 client，统一通过 `JobPoller` 管理异步状态
4. **套餐内消化计费**：客户付 Koma 订阅费，token / GPU 时长由 Koma 内部承担，需 quota + 限速防滥用
5. **必须联网**：所有 AI 能力依赖 new-api；离线时报告浏览 / 本地剪辑 / 项目管理保持可用

## 2. DiagnosticReport Schema

```ts
interface DiagnosticReport {
  reportId: string;
  sourceMediaId: string;
  mediaSha256: string;        // 仅用于完整性校验，非合规用途
  durationMs: number;
  resolution: { w: number; h: number; fps: number };
  generatedAt: string;
  schemaVersion: '1.0.0';
  dimensions: DimensionStatus[];
  characters: Character[];     // 含 faceEmbedding 512d
  scenes: Scene[];
  shots: Shot[];
  scriptLines: ScriptLine[];
  wardrobeTracks: Wardrobe[];
  actions: Action[];
  lightingSegments: Lighting[];
  onScreenTexts: OnScreenText[];
  musicSegments: MusicSegment[];
  riskMarks: RiskMark[];       // 修改可行性辅助，非合规风险
  feasibility: ModificationFeasibility[];
}
```

**注意：删除原 R4 设计中的 `signature: { algo: 'ed25519'; key; sig }` 字段** —— 报告完整性签名属于合规用途，本版本不强制做。如未来客户需要可由 release-signing 模块按需补。

## 3. 12 维度技术栈（客户端 / new-api 职责划分）

| 维度 | 客户端职责（本 change 范围） | new-api 端点 | 备注 |
|---|---|---|---|
| 1. 元数据 | **ffprobe 本地** | — | 纯本地 |
| 2. 人物 | ffmpeg 抽帧 + 上传 + 聚类结果落 sqlite-vss | `/v1/chat/completions`（VLM 人脸描述）+ 后端隐式人脸检测/embedding | 后端集成 InsightFace SCRFD + AuraFace（Koma 服务端选） |
| 3. 场景 | 切片上传 + 调用编排 | `/v1/chat/completions`（VLM 场景分类） | 虚拟模型 `koma-vlm-scene` |
| 4. 镜头 | 整片上传 + 结果聚合 | `/v1/chat/completions`（VLM 景别 + 运镜） | 虚拟模型 `koma-vlm-shot` |
| 5. 台词 | ffmpeg 抽音轨 + 上传 | `/v1/chat/completions`（ASR + 说话人聚类） | 虚拟模型 `koma-asr` |
| 6. 服装 | 抽帧上传 + 结果聚合 | `/v1/chat/completions`（检测 + 描述） | 虚拟模型 `koma-vlm-wardrobe` |
| 7. 动作 | 切片上传 | `/v1/chat/completions`（动作分类） | 虚拟模型 `koma-vlm-action` |
| 8. 光照 | **OpenCV 启发式本地** | 可选 `/v1/chat/completions` 复核 | 大部分本地完成 |
| 9. OCR | 抽帧上传 | `/v1/chat/completions`（OCR + 校对） | 虚拟模型 `koma-ocr` |
| 10. 音乐 | ffmpeg 音轨分离上传 | `/v1/chat/completions`（CLAP 情绪打标） | 虚拟模型 `koma-audio-tag` |
| 11. 风险 | **维度组合本地** | — | 纯本地规则 |
| 12. 可行性 | **维度组合本地** | — | 纯本地规则 |

**说明**：
- 客户端不感知具体模型，所有调用走 `LLMQueryService.query({ modelProvider: 'koma-cloud', modelName: 'koma-vlm-scene' })`
- 虚拟模型名由 Koma 维护 + 服务端解析，未来切换上游对客户端透明
- 维度 8 / 11 / 12 走本地是因为：算法简单且不依赖大模型，落地客户端节省调用成本 + 网络延迟

**端到端耗时（45 min 1080p 剧集）**：
| 阶段 | 耗时 |
|---|---|
| 本地预处理（切片 / 抽帧 / 抽音 / 代理转码） | 3-5 min（与客户端 CPU 相关） |
| 上传到 new-api（1080p 代理 ~1.2 GB，100 Mbps 上行） | 2-3 min |
| new-api 内部并发处理 12 维度 | 6-10 min（与服务端并发度相关） |
| 结果下载 + 本地维度 8/11/12 + 写 SQLite | 1-2 min |
| **总计** | **12-20 min**（取决于客户端机器 + 网络 + 服务端负载） |

## 4. Modification Pipeline（客户端 / new-api 职责划分）

> 客户端**不持有任何模型选型决策**。具体上游模型由 new-api 服务端决定并可随时热切。客户端仅按能力调对应 endpoint，由服务端通过 `qualityTier` / `mode` 等参数路由到具体 pipeline。

| 修改类型 | 客户端调用 | new-api 端点 | 服务端可选实现（参考） |
|---|---|---|---|
| 换脸 Lite | `FaceSwapClient.submit({ qualityTier: 'lite' })` | `/v1/koma/face-swap` | Wan 2.2-Animate Character Replacement + AuraFace + GFPGAN |
| 换脸 Pro | `FaceSwapClient.submit({ qualityTier: 'pro' })` | 同上 | DeepFaceLab 客户自训权重 + LivePortrait + GFPGAN |
| 体型替换 | `BodyReshapeClient.submit({ ... })` | `/v1/koma/body-reshape` | Wan 2.2-Animate 14B + IP-Adapter |
| 服装替换 | `WardrobeClient.submit({ mode })` | `/v1/koma/wardrobe` | IDM-VTON + SAM2 + Wan-Animate 传播 |
| 横竖屏 | 主跟踪走 VideoGenClient，裁切**本地 ffmpeg** | `/v1/koma/video-gen` (subject-tracking) + 本地 | MediaPipe / SAM2 主体跟踪 |
| TTS 配音 | `TtsClient.synthesize({ ... })` | `/v1/koma/tts` | CosyVoice 2 / OpenVoice V2 / ElevenLabs |
| 嘴型对齐 | `LipsyncClient.submit({ ... })` | `/v1/koma/lipsync` | LatentSync 1.6 / MuseTalk / Sync.so |
| 视频生成 | `VideoGenClient.submit({ mode })` | `/v1/koma/video-gen` | Wan 2.2-Animate / AnimateDiff / Runway |
| 4K 超分 | `UpscaleClient.submit({ ... })` | `/v1/koma/upscale` | Real-ESRGAN / RIFE / Topaz |
| 屏显 inpaint | VideoGenClient(mode='inpaint') + 本地 ffmpeg | `/v1/koma/video-gen` | PaddleOCR + IOPaint LaMa |
| 风格化重生成 | `VideoGenClient.submit({ mode: 'stylization' })` | `/v1/koma/video-gen` | AnimateDiff + LoRA |
| 字幕翻译 / 时长压缩重要性打分 | `llmQueryService.query()` 走 koma-cloud | `/v1/chat/completions` | LLM (虚拟模型 `koma-llm-translate` / `koma-llm-rank`) |

**计费模式（Koma 套餐内消化）**：
- 客户付 Koma 订阅费（按席位 / 项目 / 集数）
- 客户端不暴露 token / cost 数字（前端仅显示"剩余 X 次换脸 / Y 集分析"等套餐配额）
- new-api 侧记账 + 限流 + 上游成本核算
- 超额行为：UI 提示"升级套餐 / 缩减范围 / 透支"，由 new-api 返回的 `willExceedQuota` 标记触发

**服务端 license 黑名单（new-api 侧的硬约束）**：上游集成时禁止：F5-TTS / IndexTTS 2 / Spark-TTS / SimSwap / Wav2Lip / InSwapper-128 商业权重 / InsightFace ArcFace 商业权重 / YOLOv8（AGPL）。客户端不感知这一层。

## 5. 选菜式修改 ModificationPlan

```ts
interface ModificationPlan {
  planId: string;
  reportId: string;
  sourceMediaId: string;
  items: ModificationItem[];
  createdAt: string;
  dag: DagEdge[];
}

type ModificationItem =
  | FaceSwapItem
  | BodyReshapeItem
  | WardrobeItem
  | AspectRatioItem
  | LanguageDubItem
  | StylizationItem;

interface BaseItem {
  itemId: string;
  scope: { shotIds?: string[]; sceneIds?: string[]; allShots?: true };
  estQuotaUnits: number;      // 套餐配额累计估算（new-api /v1/koma/estimate 返回）
  estDurationSec: number;
  feasibilityScore: Score;
  conceptOnly?: boolean;      // 风格化重生成必须 true
}
```

DAG 依赖：换脸 → 表情对齐 → 体型 → 服装 → 调色 → 横竖屏 → 字幕 → 导出。

**导出不强制嵌入 C2PA**。若客户需要可在导出对话框勾选"嵌入 AI 标识"（默认关闭）。

## 6. UX 关键设计

### 6.1 二创工作台首页
大上传区 + 历史项目列表 + 报告库 + 渲染队列 + 推荐操作。

### 6.2 诊断报告浏览
12 维度左侧导航 + 主区域可视化（人物卡片 / 镜头时间线 / 双栏台词 / 服装矩阵 / 动作色带）。

### 6.3 选菜界面
浏览报告时随手"+ 改造" → 加入修改单 → 主页面统一管理（嵌套条件、DAG 自动排序、批量提交、估价估时实时显示）。

### 6.4 任务进度
`<RenderQueue>` 抽屉式，按物料分组，长任务每 5 分钟出片段预览，失败可单镜头重做。

### 6.5 风格化"概念演示"提示
UI 文案标注（非强制水印）："此修改将完全重新生成画面，结果可能与原片差异较大"。客户决定是否接受。

## 7. 媒体处理层（客户端，无 GPU）

- TaskService 单层调度（worker pool + cloud kind）
- FFmpeg hwaccel 自动检测 + proxy media（**仅本地预处理**）
- SQLite 写串行化
- sqlite-vss 向量索引（embedding 来自 new-api）

详见 `specs/media-pipeline-pro/spec.md`。所有 GPU 算力在 new-api 后端，**不在本 change 范围**。

## 8. 8-10 月路线图

| 阶段 | 时长 | 核心交付 |
|---|---|---|
| **M0** 基建月 | 15 天 | koma-cloud 客户端基础设施 + llmProviderRegistry 接入 + TaskService cloud kind + ffmpeg / proxy / 写串行化 |
| **M1** 诊断报告 MVP | 3 月 | 12 维度解析编排 + 8 个云端维度接入 + 4 个本地维度 + 报告 UI |
| **M2** 选菜界面 + 首批修改 | 2-3 月 | 选菜 UI + FaceSwapClient + 横竖屏（VideoGenClient + 本地 ffmpeg） |
| **M3** 扩充菜式 | 3-4 月 | TtsClient + LipsyncClient + WardrobeClient + BodyReshapeClient + VideoGenClient(stylization) + UpscaleClient |

**比 R4 早期版本（14-16 月）快 6-8 月**，原因：
- 客户端无 GPU 任务 / 无 Python sidecar / 无本地模型集成（M0 缩减 50%）
- 算法工程不在客户端 change 范围（迁移到 new-api 后端独立 change）
- 无前置法务流程 / 无 C2PA / KYC / SPV
- **客户端与服务端并行交付**，本 change 团队仅 8-10 人

## 9. 商业模式（参考，客户自定）

- 诊断报告 SaaS：按集数 / 按时长 / 按月套餐多种方案
- 修改服务：套餐内含一定额度的换脸 / 多语言 / 服装替换 quota，超额加购
- 企业年订阅：不限片量 + 跨剧检索 + 专属 quota 优先级
- **客户零硬件 / 算力 / 模型部署成本**（new-api 后端由 Koma 运营）

## 10. 与 Koma 现有架构的集成

| 现有点 | 扩展方式 |
|---|---|
| TaskService | 并发 4 → 32（**仅 CPU + 网络任务**，新 kind: `cloud`，无 GpuTaskQueue） |
| ffmpeg.ts | hwaccel + proxy + progress（**仅本地预处理**） |
| SQLite | 写串行化 + 12 维度独立表 + sqlite-vss 向量索引 |
| **`chat/providers/llmProviderRegistry`** | **直接复用**：新增内置 provider `koma-cloud`，固定 baseUrl 指向 new-api |
| **`chat/LLMQueryService`** | **直接复用**：所有 LLM / VLM 调用走 `query()` |
| **`chat/AgentGraph + AgentOrchestrator + AgentWorker`** | **直接复用**：12 维度并行编排为多 agent DAG |
| **`llm/config/taskProfiles`** | **扩展**：新增 `video-analysis-*` / `script-translate` / `shot-rank` 等 profile，仅决定虚拟模型名 + 超时 + 重试 |
| **`llm/budget` / `llm/strategy` / `llm/observability`** | **直接复用**：长视频分块、trace 全部沿用；budget 改为查询 new-api `/v1/koma/usage` |
| **`chat/mcp`** | **直接复用**：本地工具调用（ffprobe / 文件 IO）注册为 MCP tool |
| **`electron/service/koma-cloud/`（新增）** | 鉴权 / 各能力 client / JobPoller / Usage / Offline |
| 自动更新机制 | 复用 |
| 插件市场 | 复用 |
| sidebar 二创占位入口 | 改造为 `<RecreationWorkbenchShell>` 主入口 |

**ed25519 release-signing 不强制扩展为内容签名**。如未来客户要求 C2PA 可按需补，不在本 change。

## 11. 团队规模

**客户端团队（本 change 范围）：8-10 人**
- 4 桌面端工程师（Electron + ee-core 集成 + koma-cloud client + UI）
- 2 前端（诊断报告 + 修改工作台 + 物料看板）
- 1 平台 / DevOps（打包 + 更新 + 监控）
- 1 QC
- 1 PM

**服务端团队（new-api 后端，独立 change）：12-15 人**
- 6 算法工程师（VLM / TTS / Lip-Sync / 视频生成 / 换脸 / 服装 上游接入与调优）
- 3 后端（new-api 网关 / 鉴权 / 计费 / 路由）
- 2 SRE / GPU 集群运维
- 1 数据工程
- 1 PM

## 12. 风险（仅本 change 范围内的客户端风险）

| 风险 | 缓解 |
|---|---|
| 12 维联合准确率天花板（理论 0.95^12 = 54%） | 工业目标 80-85%，由服务端模型组合保障，客户端只负责编排 |
| 上行带宽瓶颈（1080p 母带 ~5GB） | 默认上传 H.264 代理（~1.2GB），仅高质量超分场景上传母带 |
| 网络中断中断长任务 | JobPoller 断网续查 + jobId SQLite 持久化 |
| Koma SaaS 总停机 | new-api 后端多机房 + 健康检查 + 用户友好降级（本地报告浏览可用） |
| 客户敏感素材上行 | new-api 侧负责加密 / 隔离 / 销毁（服务端责任，客户端不涉及） |
| 套餐用量预估偏差 | `/v1/koma/estimate` 任务前预检 + 透支策略提示 |

**合规风险全部转嫁客户**。客户自负监管约谈 / 政策红线 / 舆论应对 / 黑产滥用。

## 13. new-api 后端依赖（独立 change `add-koma-cloud-backend`）

本 change 假设以下能力在 new-api 端已就绪：

| 端点 | 能力 |
|---|---|
| `/v1/auth/exchange` | license → access/refresh token |
| `/v1/chat/completions` | OpenAI 兼容 LLM / VLM（支持图像 content parts，未来视频 content parts） |
| `/v1/koma/tts` | 同步 TTS |
| `/v1/koma/lipsync` | 异步嘴型对齐 |
| `/v1/koma/face-swap` | 异步换脸（qualityTier: lite/pro） |
| `/v1/koma/video-gen` | 异步视频生成（mode: stylization / character-replace / inpaint / subject-tracking） |
| `/v1/koma/wardrobe` | 异步服装替换 |
| `/v1/koma/body-reshape` | 异步体型替换 |
| `/v1/koma/upscale` | 异步 4K 超分 |
| `/v1/koma/jobs/{id}` | 长任务轮询 + WebSocket 推送 |
| `/v1/koma/jobs/{id}/cancel` | 长任务取消 |
| `/v1/koma/usage` | 套餐余额 |
| `/v1/koma/estimate` | quota 预检 |
| `/v1/health` | 健康检查（OfflineGuard 使用） |

new-api 内部上游路由 / 模型选型 / 成本核算 / 限流 / failover 等均为后端 change 责任，本 change 不约束。

## 13. 用户已知情的事项（来自 4 轮多 agent 讨论）

详见 `docs/strategy/r1-r4-decision-reference.md`。本设计**假设用户已读、已接受**所有警告，包括但不限于：

- 主演正面特写换脸工业级 0 成功率（巴清传/三千鸦杀失败案例）
- Twelve Labs（最接近对标）ARR 仅 420 万美元
- 12 维联合准确率天花板
- 影视行业 2026 票房腰斩 51.29%
- 监管政策 2025-09-01 + 2026-01 治理趋势收紧

**用户决定：Koma 不操心，由客户自处理。**
