# Change: 视频诊断报告 + 选菜式修改工作台（纯工具版）

## Why

经 4 轮多 agent 对抗式评审 + 用户最终决策（详见 `docs/strategy/r1-r4-decision-reference.md`），Koma 将实施 R4 形态的二创工作流：

- **第一段（独立产品）**：客户上传视频 → AI 一次性 12+ 维度逐帧解析 → 输出结构化"视频诊断报告"
- **第二段**：客户基于报告"选菜式"勾选要改什么 → 后台调对应 pipeline → 出片

**关键定位（用户已锁死）**：
- **Koma 仅作为技术工具方**，**不承担**合规 / 法务 / 财务 / 安全 / 内容审核 / 经费规划 / 公司治理责任
- **影视公司（客户）自负**：算法备案、客户 KYC、名单审核、C2PA 水印、销毁回执、SPV 隔离、保险、媒体公关、监管应对
- **客户零硬件 / 算力 / 模型部署成本**（所有 AI 算力通过 Koma 自建 new-api 网关交付，客户付 Koma 套餐订阅费）

因此本 change 仅包含**纯工程能力**，不包含合规 / 财务 / 法律相关 spec。代码库中不出现 KYC / C2PA / 名单审核 / 销毁回执 / 算法备案 / 保险 / SPV 等任何合规模块。

## What Changes

### 第一段：视频诊断报告（独立产品）

12 维度逐帧解析，输出 `DiagnosticReport` JSON：

| 维度 | 用途 | 客户端做什么 | new-api 做什么 |
|---|---|---|---|
| 1. 项目元数据 | 时长 / 分辨率 / 编码 / HDR | **ffprobe 本地** | — |
| 2. 人物表 | 角色 + 出场镜头 + CP + 屏占 | ffmpeg 抽帧 → 上传 | 人脸检测 + embedding + 聚类 |
| 3. 场景表 | 场景类型 + 时段 + 持续时长 | 切片上传 | VLM 语义分类 |
| 4. 镜头表 | 镜头分割 + 景别 + 摄影机运动 | 整片上传 | 镜头分割 + VLM 景别分类 |
| 5. 台词表 | ASR + 说话人识别 | 抽音轨上传 | ASR + 说话人聚类 |
| 6. 服装表 | 角色每集穿什么 + 颜色 / 材质 | 抽帧上传 | 检测 + VLM 描述 |
| 7. 动作表 | 动作类型 + 强度 | 切片上传 | 动作分类 |
| 8. 光照表 | 日光 / 室内 / 强光 / 逆光 / 火光跳动 | **OpenCV 启发式本地** | VLM 复核（可选） |
| 9. 屏显文字表 | OCR 所有屏内文字 | 抽帧上传 | OCR + VLM 校对 |
| 10. 音乐情绪表 | BGM 节拍 + 情绪标记 | **音轨分离本地 ffmpeg** | CLAP 情绪打标 |
| 11. 风险标记 | 特写比例 / 强光 / 侧脸 / 遮挡 评分 | **维度组合本地** | — |
| 12. 修改可行性预评估 | 每镜头是否可换脸 / 换装 / 换体型 | **维度组合本地** | — |

**客户端职责（无 GPU 依赖）**：
- ffmpeg / ffprobe 预处理（切片 / 抽帧 / 抽音轨 / 横竖屏 reframe 主体跟踪）—— 这些是 CPU 任务，减少上行带宽
- 12 维度 orchestrator + agent DAG 编排
- 调用 new-api 各能力 endpoint + 结果聚合
- SQLite 存储 + 写串行化 + 项目向量索引

**new-api 后端选型由 Koma 侧决定（客户端不感知）**，但服务侧仍遵循以下原则避免上游 license 陷阱：
- ❌ 禁止上游使用：F5-TTS（CC-BY-NC）/ IndexTTS 2（书面授权）/ Spark-TTS（CC-BY-NC-SA）/ SimSwap（CC-BY-NC）/ Wav2Lip（LRS2 禁商用）/ InSwapper-128 商业权重 / InsightFace ArcFace 商用权重 / YOLOv8（AGPL）

**性能预算（45 分钟 1080p 剧集，端到端含上下行 + new-api 处理）**：
- 标准套餐：12 维度全跑约 12-15 分钟（new-api 内部并发拉满）
- 上传瓶颈：1080p 母带 ~5 GB，按 100 Mbps 上行约 7 分钟（可代理转码后上传，压到 1-1.5 GB）
- 客户端实际可用：上传完成后即可关闭 / 后台运行，结果回调到 SQLite

### 第二段：选菜式修改工作台

统一 UI 上勾选要改什么，后台调对应 new-api 能力：

| 修改类型 | new-api 端点 | 客户端职责 | 可行性 |
|---|---|---|---|
| 换脸 | `/v1/koma/face-swap` | 抽参考脸 + 提交镜头列表 + 收成片 | 高（中景）/ 中（特写） |
| 换体型 | `/v1/koma/body-reshape` | 同上 | 仅静态 / 半身镜头 |
| 换服装 | `/v1/koma/wardrobe` | 上传参考服装 + 镜头列表 | 颜色 95% / 款式 60% |
| 横竖屏适配 | **本地 ffmpeg + MediaPipe（new-api 主体跟踪）** | 主跟踪 jobs + 本地裁切 + 字幕重排 | 高 |
| 多语言本地化 | `/v1/koma/tts` + `/v1/koma/lipsync` + 本地 ffmpeg 混音 | 译文 → TTS → 嘴部对齐 | 高（亚洲）/ 中（欧洲对口型） |
| 调色风格化 | **本地 ffmpeg LUT** | 完全本地 | 高 |
| 替换背景 | `/v1/koma/video-gen`（背景合成模式） | 抠像参数 + 背景 prompt | 中 |
| 时长压缩 | **本地 silence-cut + LLM 重要性打分**（LLM 调 `/v1/chat/completions`） | 基于报告 score 选段 | 高 |
| 预告片选段 | **本地剪辑（基于报告字段）** | 完全本地 | 高 |
| 高光合集 | **本地剪辑（基于报告字段）** | 完全本地 | 高 |
| **风格化重生成** | `/v1/koma/video-gen`（stylization 模式） | UI 文案标"概念演示" | demo 级 |

**选菜界面核心交互**：
- 浏览报告时"+ 改造"加入购物车
- 修改单支持嵌套条件 DSL
- 任务依赖 DAG 自动推导
- 批量执行 50+ 修改点 + 失败重试 + 版本树管理

### 媒体处理层升级（客户端，无 GPU 依赖）

- TaskService 双层调度：内核 + child_process worker pool（**仅 CPU 任务**：ffmpeg / 上传 / new-api 轮询）
- FFmpeg 硬件加速自动检测（VideoToolbox / NVENC / VAAPI）+ 5-10× 加速（仅用于本地预处理转码）
- Proxy Media 三层（原片 + 1080p H.264 代理 + 关键帧 webp）—— 代理用于 UI 流畅 + 减少上传体积
- SQLite 写串行化（50 万 shot 不爆 SQLITE_BUSY）
- 跨项目向量库（sqlite-vss 本地，embedding 由 new-api 返回后写入）
- **删除**：`GpuTaskQueue` / GPU 调度（无客户端 GPU 任务）

### 算力接入：全部走 Koma 自建 new-api 网关

**所有 AI / GPU 算力（含 LLM、VLM、TTS、嘴型对齐、视频生成、换脸、服装替换、超分等）统一通过 Koma 自建的 new-api 网关调用**：

- **客户零 GPU 部署成本**：Koma 客户端纯 UI + 业务编排，无 onnxruntime / Python sidecar / 本地模型
- **客户配置极简**：单一 endpoint + 单一 Koma 签发 license（client 内部换 token）
- **计费模式**：Koma 套餐内消化，客户感知不到 token / 上游 provider 存在
- **上游路由 Koma 侧决定**：new-api 后端可同时挂 Gemini / Doubao Vision / Qwen-VL / 自建 vLLM，按任务标签 + 成本 + 限流自动路由
- **客户端不选模型**：客户端仅按"任务类型"贴标签（如 `video-analysis-scene` / `tts-zh-female`），具体模型由 new-api 解析虚拟模型名映射

**API 协议契约（new-api 暴露给客户端的能力）**：

| 端点 | 协议 | 用途 |
|---|---|---|
| `POST /v1/chat/completions` | OpenAI 兼容（同步） | 所有 LLM / VLM 调用（视频帧通过 `image_url` content parts 传入） |
| `POST /v1/koma/tts` | 自定义（同步返下载 url） | TTS 配音 |
| `POST /v1/koma/lipsync` | 自定义（返 jobId）| 嘴型对齐 |
| `POST /v1/koma/face-swap` | 自定义（返 jobId）| 换脸 |
| `POST /v1/koma/video-gen` | 自定义（返 jobId）| 视频生成 |
| `POST /v1/koma/wardrobe` | 自定义（返 jobId）| 服装替换 |
| `POST /v1/koma/body-reshape` | 自定义（返 jobId）| 体型替换 |
| `POST /v1/koma/upscale` | 自定义（返 jobId）| 4K 超分 |
| `GET  /v1/koma/jobs/{id}` | 轮询 / WebSocket 推送 | 长任务状态 + 进度 + 结果下载 url |
| `GET  /v1/koma/usage` | 套餐余额 / 用量 | quota 预检 |

**客户端代码层面**：
- **LLM / VLM 调用**：复用现有 `electron/service/chat/providers/llmProviderRegistry`，仅注册一个内置 provider `koma-cloud`，固定 baseUrl 指向 new-api，走 LangChain `openai-compatible` 路径
- **非 LLM 能力**：新增 `electron/service/koma-cloud/`，每种能力一个 client（`TtsClient` / `LipsyncClient` / `FaceSwapClient` / `VideoGenClient` / `WardrobeClient` / `BodyReshapeClient` / `UpscaleClient`）+ 统一的 `JobPoller` + 鉴权 / quota / 离线降级中间层
- **删除**：之前讨论过的 `LocalVLMProvider` / `MediaPipelineProvider` 抽象 / onnxruntime-node 依赖 / Python sidecar

### 网络与离线行为

- **必须联网**：所有 AI 能力依赖 new-api，断网时禁用相关 UI
- **离线可用**：ffmpeg 本地预处理（切片 / 抽帧 / 转码 / 横竖屏 reframe 主体跟踪）+ 报告浏览 + 项目管理 + 物料版本树
- **断网降级**：进行中的长任务保留 jobId，恢复网络后自动续查；新任务提交前预检网络

## Impact

### 新增 specs
- `koma-cloud-client`（**核心**：new-api 鉴权 / 用量 / 各能力 client / 离线降级 / Job 轮询）
- `video-diagnostic-report`（12 维度解析编排）
- `modification-workbench`（选菜界面 + 修改单 DAG 编排）
- `media-pipeline-pro`（本地 ffmpeg / proxy / 写串行化 / 向量索引；**无 GPU**）

### 修改 specs
- `electron-integration`（preload bridge 新增 IPC + Lifecycle 顺序 + License + 复用 llmProviderRegistry）

### 删除内容（相比 R4 早期版本）
- ❌ `compliance-c2pa` spec（全部删除）
- ❌ C2PA 水印代码
- ❌ KYC 校验代码
- ❌ 名单审核代码
- ❌ 销毁 worker 代码
- ❌ 审计哈希链代码
- ❌ SPV 法律实体相关
- ❌ 保险洽谈相关
- ❌ 危机预案模板
- ❌ 最坏情况 T+0/T+1周/T+1月/T+3月 退路
- ❌ InsightFace 商业授权采购

### 新增代码
- `electron/service/koma-cloud/`（**核心新增**）：
  - `AuthService.ts`：Koma license → new-api token 换发 + 刷新
  - `KomaCloudClient.ts`：统一 HTTP / WebSocket 基础设施 + 重试 + 错误码映射
  - `TtsClient.ts` / `LipsyncClient.ts` / `FaceSwapClient.ts` / `VideoGenClient.ts` / `WardrobeClient.ts` / `BodyReshapeClient.ts` / `UpscaleClient.ts`
  - `JobPoller.ts`：长任务统一轮询 + WebSocket 升级 + 断网续查
  - `UsageService.ts`：套餐余额 / 用量上报 / quota 预检
  - `OfflineGuard.ts`：网络状态监听 + 友好降级
- `electron/service/chat/providers/`：**新增内置 provider `koma-cloud`**，固定 baseUrl 指向 new-api，走 `openai-compatible` LangChain 实现；删除 `LocalVLMProvider` 设想
- `electron/service/analysis/`：12 维度 orchestrator + 维度 worker 适配层（编排上传 + 调 koma-cloud client + 结果聚合写 SQLite）
- `electron/service/modification/`：planExecutor + 编排 koma-cloud 各 client 的 DAG 调度
- `electron/service/media-pipeline/`：worker pool + ProxyMediaService（**仅本地 ffmpeg / 上传 / 轮询**，无 GPU）
- 前端：`frontend/src/diagnostic/` + `frontend/src/modification/` + `frontend/src/asset-vault/` + `frontend/src/components/cloud/`（套餐余额条 + 离线提示）

### 修改代码
- `electron/service/tasks/TaskService.ts`：并发 4 → 32（**仅 CPU + 网络任务**，无 GPU dispatcher）
- `electron/service/ffmpeg.ts`：hwaccel 自动检测 + proxy + progress（仅本地预处理用）
- `electron/service/storage/`：写串行化 + 12 维度 schema + 向量库（embedding 来自 new-api）
- 12 个新数据模型（Character / Scene / Shot / ScriptLine / Wardrobe / Action / Lighting / OnScreenText / MusicSegment / RiskMark / ModificationFeasibility / DiagnosticReport）
- 7 个修改模型（ModificationPlan + 6 个 Item 类型）

### 新增依赖
- 客户端：**仅 HTTP / WebSocket 客户端 + ffmpeg 静态二进制**（已有）
- **删除**：`onnxruntime-node` / Python 边车（WhisperX / Demucs / SAM2 / VideoMAE / PaddleOCR / IOPaint）/ 任何 ML 推理库
- **删除**：客户 BYOL API key 管理（客户不直接调上游）

### 服务端依赖（new-api 后端，不在本 change 范围）
- new-api 网关本身（Calcium-Ion/new-api 或自研）
- 上游 provider 接入：OpenAI / Anthropic / Gemini / 阿里百炼 / 火山豆包 / 自建 vLLM
- 非 LLM 算力：Sync.so / HeyGen / ElevenLabs / Runway / 可灵 / 自建 ComfyUI 等
- **本 change 仅交付客户端集成；new-api 后端建设是独立 change（建议命名 `add-koma-cloud-backend`）**

### 团队规模与周期
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
- 销售 / 客户成功客户自配

**周期：8-10 个月（客户端 + 服务端并行）**
- M0 (15 天) 客户端 koma-cloud 基础设施 + 鉴权 + 第一个端点联调
- M1 (3 月) **诊断报告独立产品**上线（依赖服务端先把 12 维度能力齐）
- M2 (2-3 月) 选菜界面 + 换脸 + 横竖屏（依赖服务端换脸 + lipsync 能力）
- M3 (3-4 月) 扩充：多语言 → 服装 → 体型 → 风格化

## Non-goals

- ❌ 协作 Web 端
- ❌ 自研基础大模型
- ❌ NLE 替代
- ❌ C 端公开销售
- ❌ 任何合规 / 法务 / 财务 / SPV / 保险 / 公关相关功能（**客户自负**）
- ❌ 主演正面特写 95% SLA（实际 90-94%，剩余走 VFX 补拍）
- ❌ 真人→全四足动物（仅拟人化）
- ❌ 整集全自动动漫化（仅半自动 55-70%）

## Constraints

1. **基于现有 Electron + ee-core + SQLite + ffmpeg 架构扩展**
2. **所有 AI 算力统一走 Koma 自建 new-api 网关**，客户端无任何本地 ML 推理 / GPU 任务 / 第三方 API 直连
3. **客户端不暴露任何上游 provider / API key / 模型名给最终用户**，仅暴露 Koma 套餐
4. **必须联网才能使用 AI 能力**；离线时报告浏览 / 本地剪辑保持可用
5. **诊断报告 12 维联合准确率工业目标 80-85%**
6. **特写换脸一次过审 90-94%**（剩余走 VFX 补拍）
7. **风格化重生成 UI 文案标"概念演示"**（信息提示，非强制水印）
8. **代码库不出现合规相关模块**

## 不在本 change 范围（明确客户自负）

- 算法备案（Koma 不申请）
- C2PA 水印 / AI 标识嵌入
- 客户 KYC / 资质审核
- 名人 / 政治敏感 / 未成年人脸输入审核
- 操作审计日志哈希链
- 30 天素材销毁 / 销毁回执 / 上链
- SPV 法律实体隔离
- 网络安全 / 专业责任险
- 危机预案 / 媒体公关模板
- 监管约谈应对
- 私有化设备采购预算

以上由影视公司在购买 Koma 工具后自行处理。Koma 默认假设客户已合规。
