# Design: 二创工作流三场景工业级实现

## 1. 决策动机与约束

### 1.1 为什么是这 3 个场景

多轮多角色（架构师 / 工程师 / 质疑者 / 后期总监）独立给出方向收敛：

| 来源 | 推荐场景 |
|---|---|
| 架构师（修订后） | 预告片 + 多语言 + 横竖屏 |
| 工程师（评分 ≥4/5） | 横竖屏 5/5 + 解说 4/5 + 多语言 4/5 |
| 后期总监（必付费） | 预告片 + 横竖屏 + 多语言 |

三方独立收敛，**统计上叫共识**。解说生成因"差异化弱、剪映影视版已成熟"砍掉。

### 1.2 为什么不做 9 个

| 砍掉的场景 | 砍掉理由 |
|---|---|
| 4K 修复 | Topaz 商用 EULA 限制 + 客户自带许可更合理；自研打不过 |
| 续集铺垫 | 创意活，非流水线 |
| 素材授权包 | BD 活，非工程问题 |
| IP 衍生 | 5 年内 AI 做不到工业级 |
| 法务红线扫描 | 客户自负（用户明确指令） |
| 解说版 | 赛道太卷，差异化弱 |
| 高光合集 | 剪映影视版已成熟 |

### 1.3 关键工程约束

1. **不推翻现有架构**：Electron + 本地 SQLite + 本地 ffmpeg 保留
2. **改动比 ≤ 重度扩展上限**（4/12 核心模块改动比 33%）
3. **API 全部 BYOL**：客户自带 Topaz/HeyGen/Sync.so/ElevenLabs 等许可
4. **POC 60 天 2 个 demo 场景**（预告 + 横竖屏简版）
5. **80GB ProRes 不阻塞 UI**（worker 隔离硬约束）
6. **50 万 shot 不爆 SQLITE_BUSY**（写串行化硬约束）

---

## 2. 整体架构

```
┌────────────────────────────────────────────────────────┐
│  Renderer (React)                                       │
│  ┌────────────────┐  ┌────────────────┐               │
│  │ Storyboard     │  │ Localization   │               │
│  │ + Rhythm view  │  │ Workbench      │               │
│  │ (Trailer 复用) │  │ (新增)         │               │
│  └────────────────┘  └────────────────┘               │
│  ┌────────────────┐                                   │
│  │ Aspect Adapt   │                                   │
│  │ Studio (新增)  │                                   │
│  └────────────────┘                                   │
└──────────│──────────────────│──────────────────────────┘
           │ window.electronAPI.recreation
┌──────────▼──────────────────▼──────────────────────────┐
│  Main (Electron)                                        │
│  ┌──────────────────────────────────────────┐         │
│  │ Recreation Services（新增）               │         │
│  │  TrailerCutService                       │         │
│  │  AspectAdaptService                      │         │
│  │  LocalizationService                     │         │
│  └──────────────┬──────────────────────────┘         │
│                 │                                       │
│  ┌──────────────▼──────────────────────────┐         │
│  │ MediaPipeline（新增）                    │         │
│  │  ProxyMediaService                       │         │
│  │  HwAccelFFmpeg                           │         │
│  │  WorkerPoolDispatcher (child_process)    │         │
│  └──────────────┬──────────────────────────┘         │
│                 │                                       │
│  ┌──────────────▼──────────────────────────┐         │
│  │ TaskService（扩展）                      │         │
│  │  并发 4→32                               │         │
│  │  内核 + 外置 worker 双层                 │         │
│  └──────────────┬──────────────────────────┘         │
│                 │                                       │
│  ┌──────────────▼──────────────────────────┐         │
│  │ Provider Layer（扩展）                   │         │
│  │  现有: LLM/TTI/ITV/TTS/image-hosting     │         │
│  │  新增: itv-pro / align / video-analysis  │         │
│  │  每类 ≥2 家热备                          │         │
│  └──────────────┬──────────────────────────┘         │
│                 │                                       │
│  ┌──────────────▼──────────────────────────┐         │
│  │ Storage（扩展）                          │         │
│  │  SQLite（写串行化层）                    │         │
│  │  Postgres 只读镜像 (CDC，企业版可选)     │         │
│  └──────────────────────────────────────────┘         │
└────────────────────────────────────────────────────────┘
```

---

## 3. TaskService 扩展（M0 基建月核心）

### 3.1 双层调度

```
┌──────────────────────────────────────┐
│  TaskService (内核)                  │
│  - 持久化（SQLite）                  │
│  - 状态机（pending/running/done/...）│
│  - 并发上限 32                       │
│  - 流式进度（200ms 节流）            │
└────────────┬─────────────────────────┘
             │ dispatch by task.kind
   ┌─────────┼──────────────────┐
   │         │                  │
┌──▼──┐  ┌──▼──┐         ┌─────▼──────┐
│LLM  │  │TTI  │   ...   │ media-     │
│worker│  │worker│        │  worker(s) │
│(内进 │  │(内进 │        │ (子进程池)  │
│ 程)  │  │ 程)  │        │            │
└─────┘  └─────┘         └────────────┘
```

### 3.2 child_process worker 协议

新增 `electron/service/media-pipeline/worker/`：
- `index.ts`：父进程 dispatcher
- `worker-protocol.ts`：消息类型定义
- `ffmpeg-worker.ts`：子进程入口（每个 CPU/2 + 1 个 GPU worker）
- `worker-pool.ts`：池管理 + 健康检查 + 失败重投

任务类型路由：
- `media-transcode / media-extract-frames / media-proxy-gen / media-loudnorm` → media-worker
- `face-detection / face-clustering / video-shotsplit` → media-worker
- `dub-render / lip-sync / video-understand` → 仅 Provider 调用，主进程内异步即可

### 3.3 SQLite 写串行化

```
┌─────────────────────────────────────┐
│  WriteSerializer (新增)              │
│  - 单 worker 串行执行所有 INSERT/    │
│    UPDATE/DELETE                    │
│  - 读操作并发不受限                  │
│  - 队列长度 + 超时告警               │
└─────────────────────────────────────┘
```

阻塞 ≥ 500ms 的写入打 warning 日志；阻塞 ≥ 5s 报错。

### 3.4 Postgres 只读镜像（企业版可选）

- CDC（Change Data Capture）：SQLite trigger + worker 异步同步到 Postgres
- 用途：跨项目检索（"某演员在所有项目里的所有镜头"）+ BI 报表
- 不依赖：单机版可不启用，所有功能仍可工作

---

## 4. FFmpeg 硬件加速 + Proxy Media

### 4.1 硬件加速自动检测

启动时探测 ffmpeg 可用的 hwaccel：
- macOS：`videotoolbox`
- Windows：`nvenc` / `qsv` / `amf`
- Linux：`vaapi` / `nvenc`

存到全局 config，所有 transcode/encode 任务自动注入 `-hwaccel <检测到的>` + `-c:v <对应编码器>`。

实测加速比：5–10× （ProRes → H.264 1080p 转码从 30 分钟/小时 降到 3–6 分钟/小时）。

### 4.2 Proxy Media 三层

```
SourceMedia
├── 原片（落盘，路径登记）
├── proxy/1080p.mp4 (H.264 软编 → hwaccel)
└── thumbnails/{timecode}.webp (每秒 1 帧关键帧)
```

UI 操作 proxy，导出时回链原片。proxy 生成是后台 task，导入即触发。

---

## 5. 三个场景的实现路径

### 5.1 预告片多版本

**输入**：成片 + 现有 Shot/Character 库
**流程**：
1. `video-shotsplit`（PySceneDetect 边车 / 阿里云 SplitVideoParts API 二选一）
2. 自动 tag（动作 / 情绪 / 角色）via 视觉理解 provider
3. LLM 按"剪辑大纲模板"（悬念 / 爆点 / 角色弧）选片 → 输出 `CutPlan`
4. 30/60/90 三个长度上限派生（同模板）
5. 用户在现有 storyboard + timeline 精修
6. 导出 ProRes 母版 → 进入横竖屏适配线

**人工 review**：导演选 cut、爆点替换、配乐合规
**输出**：每个时长 × 每个版本 = 3 × 3 = 9 个 MaterialPackage

### 5.2 横竖屏多平台适配

**输入**：成片或已批准剪辑版
**流程**：
1. 按 ReleaseSpec 列表 fan-out（抖音 9:16 / 小红书 4:5 / Twitter 2:1 等）
2. `video-outpainting` 或智能裁切（YOLO/MediaPipe 主体跟随）
3. 字幕重排（竖版字幕避开 UI 安全区）
4. `audio-loudnorm` 按平台 LUFS 目标（YT/TikTok −14 LUFS）
5. ExportPreset 编码（hwaccel）
6. 输出 DeliveryLog（每平台一份成片 + 封面 + 文案 + 标签）

**人工 review**：主体跟随框、封面、文案
**输出**：单条成片 → 8 个平台版本

### 5.3 多语言本地化

**输入**：成片 + 时间线 + 原始音频分轨
**流程**：
1. `audio-source-separation`（Demucs/MDX 本地或 API）→ 分离人声 + BGM/SFX
2. `audio-stt`（火山 / Whisper-large）出原文
3. LLM 译文 + 术语库 + 人工译审（LocalizationWorkbench 双栏编辑）
4. `dub-render`（ElevenLabs/Deepdub/火山）按角色克隆音色
5. `lip-sync`（Sync.so lipsync-2-pro $0.04–0.133/sec 主选 / HeyGen $2/min 备用）
6. `onscreen-text-detect / onscreen-text-inpaint`（PaddleOCR + lama-cleaner ONNX）
7. 与原 BGM/SFX 重混合 → loudnorm
8. 字幕烧录 / 外挂双输出

**人工 review**：译文（必须）、声线选型、口型抽查、屏显合成
**输出**：每语种一份完整 LocaleTrack + 成片 + 字幕

---

## 6. Provider 抽象扩展

### 6.1 现有 5 类
LLM / TTI / ITV / TTS / image-hosting（保留不动）

### 6.2 新增 3 类

**`itv-pro`**（vid2vid / 视频生成增强）
- Runway Gen-4 / 可灵 / Pika
- 主备：Runway 主 + 可灵备
- 用途：场景 1 续集铺垫的镜头补拍（如果未来开启）；本期主要用于横竖屏 outpainting

**`align`**（嘴型对齐）
- Sync.so / HeyGen
- 主备：Sync.so 主 + HeyGen 备
- 协议：输入 video + audio → 输出对齐后的 video

**video-analysis**（视频理解，扩展现有 LLM provider）
- 阿里百炼 RunVideoAnalysis / 火山方舟 / Gemini 2.x video
- 输入新增 `video_url`/`video_b64` 字段
- 输出结构化（场景描述、动作 tag、情绪 tag、台词时码）

### 6.3 热备策略

每类 provider 至少 2 家。失败自动 fallback：
- 第一家超时 / 5xx / 配额满 → 切换第二家
- 7 天内同一类 provider 连续失败率 > 5% → 报警

---

## 7. 数据模型扩展

仅新增 3 个核心实体（精简后）：

### 7.1 SourceMedia
```ts
{
  id: string
  projectId: string
  originalPath: string       // 母带路径（仅本地）
  originalSize: bigint
  originalCodec: string
  duration: number           // 秒
  proxyPath: string | null   // 1080p H.264 代理
  thumbnailsDir: string
  importedAt: number
  hwAccelUsed: string | null // 用了哪种硬件加速
}
```

### 7.2 MaterialPackage
```ts
{
  id: string
  projectId: string
  scene: 'trailer' | 'aspect-adapt' | 'localization'
  status: 'draft' | 'producing' | 'first-review' | 'final-review' | 'delivered'
  spec: ReleaseSpec | LocaleSpec | TrailerSpec  // discriminated union
  ownerId: string
  deadline: number | null
  deliverables: Array<{ path: string; sha256: string; sizeBytes: number }>
  createdAt: number
  updatedAt: number
}
```

### 7.3 LocaleTrack
```ts
{
  id: string
  materialPackageId: string
  locale: string             // 'en-US' / 'es-LA' / 'ja-JP' ...
  segments: Array<{
    startMs: number
    endMs: number
    originalText: string     // STT 出
    translatedText: string   // LLM 译
    reviewedBy: string | null
    dubAudioPath: string | null
    lipSyncVideoPath: string | null
  }>
  onScreenTextOverrides: Array<{
    timecodeMs: number
    bbox: [number, number, number, number]
    originalText: string
    translatedText: string
    inpaintedFramePath: string
  }>
}
```

---

## 8. 私有化部署

### 8.1 Provider Profile

```jsonc
// ~/.koma/enterprise-profile.json (企业版才存在)
{
  "providerWhitelist": {
    "llm": ["local-vllm"],
    "tti": ["local-comfyui"],
    "tts": ["local-edge-tts"],
    "align": []  // 嘴型对齐无本地方案 → 此场景禁用
  },
  "blockExternalNetwork": true,
  "auditLogPath": "/path/to/audit"
}
```

服务端启动读取此文件，若 `blockExternalNetwork: true` 则拦截所有外部 HTTP 请求（除已白名单的本地服务）。

### 8.2 出网审计日志

所有 provider 调用记录：时间戳 / 调用方 / 目标 URL host / 请求体哈希 / 响应状态 / 耗时。**不记录内容明文**（避免日志泄露剧本）。

格式：JSON Lines，每条日志再 ed25519 签名（用现有 release-signing 私钥的"审计专用子密钥"，独立轮换）。

### 8.3 素材 ed25519 指纹

每个 SourceMedia 入库时计算 SHA512 → 用现有 ed25519 私钥签名 → 存为 sidecar 文件 `<media>.koma.sig`。导出/分发时附带签名，可被另一台 Koma 验证来源。

---

## 9. 6 个月里程碑

| 月 | 内容 | 交付物 |
|---|---|---|
| **M0 (30 天) 基建月** | TaskService 双层扩展 / child_process worker pool / FFmpeg hwaccel + proxy media / SQLite 写串行化 | 200GB ProRes 抽帧不阻塞 UI 的 demo / 50 万 shot 写入压测通过 |
| **M1 (60 天) 预告片** | TrailerCutService / 节奏分析视图 / video-shotsplit + 视觉理解 provider 接入 / CutPlan 模板（30/60/90） | 用户能在 storyboard 上看到自动拆条结果 + 选段建议；输出 3 个时长版本 |
| **M2 (90 天) 横竖屏** | AspectAdaptService / AspectAdaptStudio UI / 主体跟随 + 字幕重排 / ReleaseSpec 矩阵 / loudnorm | 一进十出：8 个平台版本一键派生 |
| **M3 (150 天) 多语言** | LocalizationService / LocalizationWorkbench UI / align provider 接入 / 屏显文字 inpaint / dub + 嘴型完整链 | 中文剧 → 英/日/西 三语完整链跑通 |
| **M4 (180 天) 私有化 + SLA** | Enterprise profile / 出网审计 / 素材 ed25519 指纹 / SLA 调优（任务成功率 ≥95% / P50 延迟 / 月可用 ≥99.0%） | 企业版打包；SLA 报告 |

每月伴随：

- 回归测试集（每场景 ≥3 部不同类型成片）
- 自动更新通道发版
- 文档（用户手册 + 客户私有化部署指南）

---

## 10. 工程红线（不可妥协）

1. 80GB ProRes 抽帧**不阻塞 UI**（worker 进程隔离）
2. 50 万 shot 不爆 SQLITE_BUSY（写串行化）
3. 1000 task / 30 分钟跑完（并发 32）
4. 单条 60s 预告 API 边际成本 ≤ 30 元
5. M2 完成时 8 平台版本一键派生 + 单次失败可重试
6. M3 完成时**人工译审是必经步骤**（UI 上无法跳过）
7. 私有化版本启动后**任何外部 API 调用都被阻塞**（除非白名单）

---

## 11. 关键风险与缓解

| 风险 | 缓解 |
|---|---|
| 多语言 AI 质量边界（情绪迁移 / 口型差一点会被骂"AI 味"） | M3 之前用 5 部样片盲测，未达标准推迟交付 |
| Provider API SLA 抖动（链路 7 调用 → 81% 成功率） | 每类 provider ≥2 家热备 + 失败自动降级 |
| 第三方 API 涨价 | 合同条款：涨价 70% 由甲方承担 30% 由乙方承担 |
| POC 第 60 天预告 + 横竖屏 demo 不能演示 → 直接判崩 | M0 30 天打牢基建后再上 M1；M1 早期就准备 demo 素材 |
| Topaz EULA 不允许商用 SaaS 转售（4K 修复） | 不在本期范围内；客户 BYOL |
| Electron 主进程阻塞导致 demo 假死 | M0 必须先验证 worker 池能扛住 80GB ProRes |

---

## 12. 不可推翻的现状假设

本设计严格基于以下事实，若现状变化需要重新评估：

- Electron 39 + ee-core 4 + electron-builder 26
- 本地 SQLite（WAL 已开）
- TaskService 268 行（无 worker 池）
- ffmpeg.ts 976 行（无 hwaccel）
- 12 个核心模块，本次扩展涉及 4 个（33%，重度扩展踩线）
- 现有 LLM/TTI/ITV/TTS/image-hosting 5 类 provider 抽象
- ed25519 签名仅用于 release 验签
- 无任何 NLE 互通

任一假设不成立 → design.md 需修订。
