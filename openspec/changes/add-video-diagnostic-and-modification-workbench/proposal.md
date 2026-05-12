# Change: 视频诊断报告 + 选菜式修改工作台（纯工具版）

## Why

经 4 轮多 agent 对抗式评审 + 用户最终决策（详见 `docs/strategy/r1-r4-decision-reference.md`），Koma 将实施 R4 形态的二创工作流：

- **第一段（独立产品）**：客户上传视频 → AI 一次性 12+ 维度逐帧解析 → 输出结构化"视频诊断报告"
- **第二段**：客户基于报告"选菜式"勾选要改什么 → 后台调对应 pipeline → 出片

**关键定位（用户已锁死）**：
- **Koma 仅作为技术工具方**，**不承担**合规 / 法务 / 财务 / 安全 / 内容审核 / 经费规划 / 公司治理责任
- **影视公司（客户）自负**：算法备案、客户 KYC、名单审核、C2PA 水印、销毁回执、SPV 隔离、保险、媒体公关、监管应对、设备采购、GPU 集群成本

因此本 change 仅包含**纯工程能力**，不包含合规 / 财务 / 法律相关 spec。代码库中不出现 KYC / C2PA / 名单审核 / 销毁回执 / 算法备案 / 保险 / SPV 等任何合规模块。

## What Changes

### 第一段：视频诊断报告（独立产品）

12 维度逐帧解析，输出 `DiagnosticReport` JSON：

| 维度 | 用途 | 技术栈 |
|---|---|---|
| 1. 项目元数据 | 时长 / 分辨率 / 编码 / HDR | ffprobe |
| 2. 人物表 | 角色 + 出场镜头 + CP + 屏占 | **AuraFace + InsightFace SCRFD（仅检测，权重需替换）** + HDBSCAN |
| 3. 场景表 | 场景类型 + 时段 + 持续时长 | OpenCLIP ViT-L + SAM2 + VLM 校验 |
| 4. 镜头表 | 镜头分割 + 景别 + 摄影机运动 | TransNetV2 + 自训分类器 + 光流 |
| 5. 台词表 | ASR + 说话人识别 | WhisperX + pyannote 3.1 |
| 6. 服装表 | 角色每集穿什么 + 颜色 / 材质 | RT-DETR + CLIP zero-shot |
| 7. 动作表 | 动作类型 + 强度 | VideoMAE V2 distilled |
| 8. 光照表 | 日光 / 室内 / 强光 / 逆光 / 火光跳动 | OpenCV 启发式 + 自训 CNN |
| 9. 屏显文字表 | OCR 所有屏内文字 | PaddleOCR PP-OCRv5 |
| 10. 音乐情绪表 | BGM 节拍 + 情绪标记 | Demucs + LibROSA + CLAP-LAION |
| 11. 风险标记 | 特写比例 / 强光 / 侧脸 / 遮挡 评分 | 维度组合 |
| 12. 修改可行性预评估 | 每镜头是否可换脸 / 换装 / 换体型 | 维度组合 |

**所有模型均为可商用许可**（Apache / MIT / 自研）：
- InsightFace SCRFD（检测）用作辅助，但**人脸识别 embedding 用 AuraFace**（CC-BY-NC 替代为可商用方案，或社区 fork 的 buffalo_l Apache 实现）
- 不购买 InsightFace 商业授权
- 所有第三方 API（视频理解、ASR、配音、嘴型对齐等）走 BYOL（客户自带 key）

**性能预算（45 分钟 1080p 剧集）**：
- H100 ×1：6 分钟
- A100 ×1：8 分钟
- RTX 4090 ×1：11 分钟

### 第二段：选菜式修改工作台

统一 UI 上勾选要改什么，后台调对应 pipeline：

| 修改类型 | 路径 | 工业级可行性 |
|---|---|---|
| 换脸（替换 character） | 替换（InSwapper 替代品 / DeepFaceLab） | 高（中景）/ 中（特写） |
| 换体型 | 替换（Wan2.2-Animate Character Replacement） | 仅静态 / 半身镜头 |
| 换服装 | 替换（IDM-VTON + SAM2 + Wan-Animate 传播） | 颜色 95% / 款式 60% |
| 横竖屏适配 | 替换（主体跟踪 + 智能裁切 + 字幕重排 + loudnorm） | 高 |
| 多语言本地化 | 替换音轨 + 嘴部局部替换 | 高（亚洲）/ 中（欧洲对口型） |
| 调色风格化 | 替换 LUT | 高 |
| 替换背景 | 替换（RVM 抠像 + 背景合成） | 中 |
| 时长压缩 | 替换（silence-cut + 重要性打分） | 高 |
| 预告片选段 | 剪辑（基于报告 risk/action/audio_mood） | 高 |
| 高光合集 | 剪辑（基于报告 CP/情绪/动作） | 高 |
| **风格化重生成（→动漫/动物拟人）** | **重生成**（AnimateDiff + LoRA） | **demo 级，UI 文案标"概念演示"** |

**选菜界面核心交互**：
- 浏览报告时"+ 改造"加入购物车
- 修改单支持嵌套条件 DSL
- 任务依赖 DAG 自动推导
- 批量执行 50+ 修改点 + 失败重试 + 版本树管理

### 媒体处理层升级

- TaskService 双层调度：内核 + child_process worker pool + GpuTaskQueue
- FFmpeg 硬件加速自动检测（VideoToolbox / NVENC / VAAPI）+ 5-10× 加速
- Proxy Media 三层（原片 + 1080p H.264 代理 + 关键帧 webp）
- SQLite 写串行化（50 万 shot 不爆 SQLITE_BUSY）
- 跨项目向量库（pgvector / sqlite-vss）

### Provider 抽象扩展

新增 `VideoAnalysisProvider`（视频理解），扩展现有 LLM provider 支持 video input。所有 provider 走 BYOL：

| 类别 | 主选 | 备选 |
|---|---|---|
| 视频理解 | 阿里百炼 RunVideoAnalysis | 火山方舟 / Gemini 2.5 / Doubao Vision |
| 嘴型对齐 | Sync.so | HeyGen / wav2lip ONNX 兜底 |
| 多语言 dub | ElevenLabs | Deepdub / 火山豆包 / 阿里 CosyVoice |
| 视频生成 | Runway Gen-4 / 可灵 | Wan2.2-Animate 本地 |

### 私有化部署（仅技术层）

支持运行在客户机房 GPU 集群，**安全 / 隔离 / 出网控制由客户自行处理**。Koma 提供：
- License + 硬件指纹绑定（防盗版，非合规）
- 模型分发（U 盘镜像 / 客户内网 mirror）
- 内网更新通道
- 离线运行模式

**不提供**：审计日志、出网拦截、AirGapMode 强制、销毁回执 —— 客户自管。

## Impact

### 新增 specs
- `video-diagnostic-report`（12 维度解析）
- `modification-workbench`（选菜界面 + 7 个 pipeline）
- `media-pipeline-pro`（worker pool + hwaccel + GpuTaskQueue + 向量库）

### 修改 specs
- `electron-integration`（preload bridge 新增 IPC + Lifecycle 顺序 + License）

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
- `electron/service/analysis/`：12 维度独立 service
- `electron/service/modification/`：planExecutor + 7 个 pipeline stage
- `electron/service/media-pipeline/`：worker pool + GpuTaskQueue + ProxyMediaService
- 前端：`frontend/src/diagnostic/` + `frontend/src/modification/` + `frontend/src/asset-vault/`

### 修改代码
- `electron/service/tasks/TaskService.ts`：并发 4 → 32 + GPU dispatcher
- `electron/service/ffmpeg.ts`：hwaccel 自动检测 + proxy + progress
- `electron/service/storage/`：写串行化 + 12 维度 schema + 向量库
- 12 个新数据模型（Character / Scene / Shot / ScriptLine / Wardrobe / Action / Lighting / OnScreenText / MusicSegment / RiskMark / ModificationFeasibility / DiagnosticReport）
- 7 个修改模型（ModificationPlan + 6 个 Item 类型）

### 新增依赖
- `onnxruntime-node`（AuraFace + SCRFD 检测 + LivePortrait + GFPGAN + CLIP + RT-DETR + CLAP）
- Python 边车（WhisperX / Demucs / SAM2 / VideoMAE / PaddleOCR / IOPaint）
- 客户 BYOL API（阿里百炼 / 火山方舟 / Gemini / Sync.so / HeyGen / ElevenLabs 等）

### 团队规模与周期
- **20-25 人**（纯工程团队）：8 算法 + 4 前端 + 3 平台/DevOps + 3 SRE + 4 QC + 2 PM + 销售/客户成功客户自配
- **10-12 个月**：
  - M0 (15 天) 基建（无前置法务流程）
  - M1 (4 月) **诊断报告独立产品**上线
  - M2 (3 月) 选菜界面 + 换脸 Lite + 横竖屏
  - M3 (4-5 月) 扩充：多语言 → 服装 → 体型 → 换脸 Pro → 风格化 demo

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
2. **第三方 API 全部 BYOL**
3. **所有用到的模型必须可商用许可**（Apache / MIT / 自研），不购买 InsightFace 商业授权
4. **诊断报告 12 维联合准确率工业目标 80-85%**
5. **特写换脸一次过审 90-94%**（剩余走 VFX 补拍）
6. **风格化重生成 UI 文案标"概念演示"**（信息提示，非强制水印）
7. **代码库不出现合规相关模块**

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
