# Design: 二创工作流完整工业版本（7 场景）

> 本设计基于三轮多 agent 对抗评审结论。R3 黑魂质疑者给出的死亡时间表（2026-06 → 2027-05）已纳入"风险与缓解"章节，作为风险预警基线。

## 1. 决策动机

### 1.1 为何 7 场景

三轮讨论甲方需求收敛过程：
- R1：3 场景（预告 / 横竖屏 / 多语言）+ 后期总监要求加场景
- R2：+ 换脸（甲方付费意愿排第 1）
- R3：+ 体型 / 服装 / IP 迁移（甲方"两个坊"明确）

最终用户决策：**7 场景全做，14-16 月 / 30-35 人**。本设计是该决策的工程落地。

### 1.2 工程约束（已锁死）

1. 基于现有 Electron + ee-core + 本地 SQLite + 本地 ffmpeg 架构扩展（不重写）
2. 第三方 API 全部 BYOL（客户自带许可）
3. 法务由影视公司自负，Koma 做工具方"未尽审核义务"兜底
4. 主演特写一次过审 90-94%（不承诺 95%）
5. B 坊单次输出 ≤ 5 分钟（防滥用）

---

## 2. 整体架构

### 2.1 模块分层

```
┌──────────────────────────────────────────────────────────────────┐
│  Renderer（React）                                               │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐      │
│  │ Trailer     │ AspectAdapt │ Localization│ FaceSwap    │      │
│  │ + Storyboard│ Studio      │ Workbench   │ Studio      │      │
│  │ + Rhythm    │             │ (双栏 + 嘴 │ + QC        │      │
│  │ 复用        │             │  型 + 屏显)│  Workbench  │      │
│  └─────────────┴─────────────┴─────────────┴─────────────┘      │
│  ┌─────────────┬─────────────┬─────────────────────────────┐    │
│  │ Body/Cloth  │ IP Transfer │ Material Board (跨场景统一) │    │
│  │ Studio      │ (LoRA +     │                              │    │
│  │             │  Wan-Anim)  │                              │    │
│  └─────────────┴─────────────┴─────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
              │ window.electronAPI.recreation.*
┌─────────────▼────────────────────────────────────────────────────┐
│  Main（Electron）                                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Recreation Services（7 个）                             │    │
│  │   TrailerCutService / AspectAdaptService /             │    │
│  │   LocalizationService / FaceSwapService /              │    │
│  │   BodySwapService / OutfitSwapService /                │    │
│  │   IPTransferService                                     │    │
│  └─────────────────────┬─────────────────────────────────┘    │
│                        │                                          │
│  ┌─────────────────────▼─────────────────────────────────┐    │
│  │ MediaPipelinePro                                       │    │
│  │   ProxyMediaService / HwAccelFFmpeg                    │    │
│  │   WorkerPoolDispatcher (child_process + worker_threads)│    │
│  │   GpuTaskQueue（H100/A100/4090 调度）                  │    │
│  └─────────────────────┬─────────────────────────────────┘    │
│                        │                                          │
│  ┌─────────────────────▼─────────────────────────────────┐    │
│  │ TaskService（扩展）  并发 4→32                          │    │
│  │   内核队列 + 外置 worker 双层                          │    │
│  │   + 12 个新 task type（face.* / body.* / outfit.* /    │    │
│  │     ip.* / lora.* / inswapper.* / dfl.* / sync.*）     │    │
│  └─────────────────────┬─────────────────────────────────┘    │
│                        │                                          │
│  ┌─────────────────────▼─────────────────────────────────┐    │
│  │ Provider Layer（扩展）                                 │    │
│  │   现有: LLM/TTI/ITV/TTS/image-hosting                  │    │
│  │   新增: itv-pro / align / video-analysis / dub-pro /  │    │
│  │         face-swap / body-swap / outfit-swap            │    │
│  │   每类 ≥2 家热备 + fallback                            │    │
│  └─────────────────────┬─────────────────────────────────┘    │
│                        │                                          │
│  ┌─────────────────────▼─────────────────────────────────┐    │
│  │ Compliance Layer（强制层）                             │    │
│  │   C2PA 双标识签名（c2pa-rs Rust）                      │    │
│  │   名人脸 / 政治敏感 / 未成年人审核（阿里云）           │    │
│  │   操作审计哈希链（180-1825 天保留）                    │    │
│  │   销毁 worker（30 天）                                  │    │
│  │   算法备案接口（beian.cac.gov.cn）                     │    │
│  └─────────────────────┬─────────────────────────────────┘    │
│                        │                                          │
│  ┌─────────────────────▼─────────────────────────────────┐    │
│  │ Storage（扩展）                                         │    │
│  │   SQLite（写串行化层 + WAL）                           │    │
│  │   Postgres 只读镜像 CDC（企业版可选）                  │    │
│  │   向量库（pgvector / sqlite-vss，ArcFace 跨集索引）    │    │
│  └────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                                ▼
┌──────────────────────┐        ┌──────────────────────┐
│  Python Sidecar      │        │  GPU Workers         │
│  (child_process)     │        │  (CUDA / MPS / DirectML)│
│   PySceneDetect      │        │   DeepFaceLab CLI    │
│   Demucs             │        │   InSwapper          │
│   WhisperX           │        │   LivePortrait       │
│   IOPaint (LaMa)     │        │   GFPGAN/CodeFormer  │
│   PaddleOCR          │        │   Wan2.2-Animate     │
│   DFL extractor      │        │   IDM-VTON           │
└──────────────────────┘        │   OmniHuman          │
                                │   LoRA Trainer       │
                                └──────────────────────┘
```

### 2.2 7 场景到模块映射

| 场景 | 主 Service | 依赖 |
|---|---|---|
| S1 预告片 | TrailerCutService | shot-detect + video-analysis + LLM + ffmpeg |
| S2 横竖屏 | AspectAdaptService | subject-tracking + reframe + loudnorm + hwaccel |
| S3 多语言 | LocalizationService | source-separation + STT + LLM + dub + align + OCR + inpaint |
| S4 换脸 | FaceSwapService | face-detect + face-cluster + InSwapper/DFL + LivePortrait + GFPGAN |
| S5 体型/服装 | BodySwapService + OutfitSwapService | Wan-Animate + IDM-VTON + SAM2 |
| S6 IP→动漫 | IPTransferService | LoRA 训练 + Wan-Animate Character Replacement + ControlNet |
| S7 IP→动物 | IPTransferService（共用 S6） | 风格 LoRA + 拟人化角色限制 |

---

## 3. 7 场景实施路径（每个 100-150 字）

### S1 预告片
SourceMedia → `video.shotsplit` → 自动 tag（动作/情绪/角色，via 视觉理解 provider）→ LLM 选片模板（悬念/爆点/角色弧）→ 派生 30/60/90 三个时长版本 → 用户精修 → 输出 9 个 MaterialPackage（3 时长 × 3 风格）。**人工 review**：导演选 cut；爆点替换；配乐合规。**SLA**：24 分钟剧集 → 首版 ≤ 10 分钟。

### S2 横竖屏
按 ReleaseSpec fan-out → MediaPipe / YOLO 主体跟踪 → reframe（横→竖智能裁切）→ 字幕重排（避开抖音底部 20% 安全区）→ ffmpeg loudnorm 双 pass（YT/TikTok -14 LUFS / Douyin -16 LUFS）→ ExportPreset 编码（hwaccel）→ DeliveryLog。**人工 review**：主体跟随框、封面、文案。**SLA**：1 集 24 分钟 → 8 平台版本 ≤ 8 分钟。

### S3 多语言
`audio.source-separation`（Demucs/MDX）→ `audio.stt`（WhisperX 词级时间戳）→ LLM 译文 + 术语库 + **人工译审必经**（UI 无法跳过）→ `dub.render`（ElevenLabs/Deepdub/火山）→ `lip.align`（Sync.so / HeyGen fallback）→ `onscreen.text-inpaint`（PaddleOCR + IOPaint）→ BGM/SFX 重混 + loudnorm → 字幕烧录/外挂。**SLA**：1 集 45 分钟 → 单语种 ≤ 25 分钟（不含译审）。

### S4 换脸（Crisis Lite + Pro）
**Lite（48h 救火）**：仅中景以上 + InSwapper-128 + GFPGAN，明确告知客户特写需 14 天追加。报价 80-150 万/部。
**Pro（14-21 天）**：DeepFaceLab SAEHD 512/768 + 单艺人 fine-tune（14-18 天，H100 ×4-8）→ 镜头分级（远/中/近/特写）→ 特写逐镜头微调（5000-15000 步）→ LivePortrait 表情对齐 → GFPGAN 4K 回升 → EbSynth/PRAFT 时序去抖 → C2PA 嵌入 → 总监验收。报价 300-1100 万/部。**SLA**：特写一次过审 90-94%，剩余 6-10% 走 VFX 补拍。

### S5 体型/服装
**体型替换**（动态镜头工业级做不出来）：仅做静态/半身（Wan2.2-Animate Character Replacement Mode + IPAdapter 锁脸/服）。走/打戏不接。**服装替换**：单帧 IDM-VTON 关键帧 → SAM2 视频分割 → Wan2.2-Animate 传播到全段 → 时序去闪。整集 45 分钟换主角服装：H100 ≈ 130 小时 + QC 5 天 + 报价 120-200 万。

### S6 真人→动漫
SAM2 分割 → 镜头分类（中远景/对话/特写/打戏）→ ID Bank 取角色 LoRA + ControlNet (DWPose+Depth) → 中远景/对话：Wan2.2-Animate + LoRA 自动 → 特写/打戏：导出关键帧 → 人工绘师 Koma 桌面补帧 → AnimateDiff 重新插值 → 时序对齐（PRAFT 光流）+ C2PA。**覆盖率**：自动 55-70%，半自动 20-30%，必须人工 10-25%。**单集报价**：220-320 万。

### S7 真人→动物（拟人化）
仅做"穿衣服站立的兔子/狐狸"（迪士尼《疯狂动物城》风格），**不做四足全动物**。技术栈同 S6，但角色 LoRA 训练拟人化动物造型库。**单镜头**（5-30s）报价 1-3 万/镜头。营销片整片 30 镜 ≈ 30-90 万。

---

## 4. 数据模型扩展（精简后）

复用 S1-S3 的 SourceMedia / MaterialPackage / LocaleTrack（详见 `add-recreation-workflow-three-scenes/design.md`）。

新增 S4-S7 实体（TypeScript 定义）：

```ts
// 替身演员脸库（S4）
interface FaceIdentity {
  id: string;
  projectId: string;
  name: string;
  source: 'photoset' | 'video';
  refMediaIds: string[];
  embeddingCentroid: Float32Array;      // 512 维 ArcFace
  embeddingCount: number;
  modelPreference: 'inswapper-128' | 'inswapper-512' | 'dfl-saehd-512' | 'dfl-saehd-768' | 'wan-animate';
  dflModelPath?: string;
  confidential: boolean;
  fingerprint: string;                  // ed25519 签名
  createdAt: number;
  updatedAt: number;
}

// 被换演员（S4）
interface SourceActor {
  id: string;
  projectId: string;
  sourceMediaId: string;
  clusterId: string;
  displayName: string;
  embeddingCentroid: Float32Array;
  occurrences: { startMs: number; endMs: number; shotId?: string }[];
}

// 换脸计划（S4）
interface SwapPlan {
  id: string;
  scene: 'face' | 'body' | 'outfit';   // S4/S5 共用
  projectId: string;
  sourceMediaId: string;
  segments: {
    startMs: number; endMs: number;
    sourceActorId: string;
    targetIdentityId: string;
    engine: FaceIdentity['modelPreference'];
    refineExpression: boolean;
    restorePreset: 'gfpgan' | 'codeformer' | 'none';
  }[];
  status: 'draft' | 'queued' | 'rendering' | 'qc' | 'approved' | 'rejected';
}

// 体型 / 服装替换计划（S5）
interface BodyOutfitPlan {
  id: string;
  scene: 'body' | 'outfit';
  projectId: string;
  sourceMediaId: string;
  targetReferenceImageUri?: string;     // 服装参考图（IDM-VTON）
  targetBodyProfile?: { height: number; weight: number };
  shotMode: 'static' | 'semi-dynamic';  // 动态打戏拒绝
  status: 'draft' | 'queued' | 'rendering' | 'qc' | 'approved';
}

// LoRA 模型注册（S6/S7）
interface LoRAModel {
  id: string;
  scope: 'character' | 'scene' | 'style';
  refImages: string[];
  trainedAt: number;
  modelPath: string;
  baseModel: 'sdxl' | 'sd15' | 'wan22';
  reusableProjects: string[];           // 跨项目复用清单
}

// IP 迁移任务（S6/S7）
interface IPTransferJob {
  id: string;
  projectId: string;
  sourceMediaId: string;
  targetStyle: 'anime' | 'cartoon' | 'anthropomorphic-animal' | 'watercolor' | 'pixel';
  characterLoRAs: string[];             // LoRAModel.id
  outputDurationMs: number;             // ≤ 300_000ms（5 分钟硬上限）
  segments: { startMs: number; endMs: number; mode: 'auto' | 'semi-auto' | 'manual' }[];
  status: 'draft' | 'lora-training' | 'rendering' | 'manual-touch' | 'qc' | 'approved';
}

// 操作审计（compliance）
interface AuditEvent {
  ts: number;
  orgId: string;
  userId: string;
  projectId?: string;
  taskId?: string;
  action: 'pipeline.start' | 'provider.call' | 'face.swap.render' | 'export.sign' | 'destruction.complete';
  payload: Record<string, unknown>;
  hostFingerprint: string;
  prevHash: string;
  hash: string;                         // SHA-256（去 hash + sig 后规范化 JSON）
  signature: string;                    // ed25519
}
```

---

## 5. TaskService 双层 + GPU 队列

详见 `add-recreation-workflow-three-scenes/design.md` 第 3 节（保持不变）。本 change 在该基础上新增：

### 5.1 新增 task type（12 个）

```
face.shot.detect
face.detect / face.align / face.embed / face.cluster
face.identity.build
face.dfl.train（GPU 独占，最长 14-18 天）
face.swap.render
face.expression.refine
face.restore（GFPGAN / CodeFormer）
face.consistency.check
face.c2pa.sign
body.reframe.render
outfit.virtual-tryon
ip.lora.train
ip.wan-animate.render
ip.manual-keyframe
```

### 5.2 GPU 队列调度（新增 `GpuTaskQueue`）

```ts
interface GpuTaskQueueConfig {
  devices: { index: number; vramGB: number; busy: boolean; type: 'h100' | 'a100' | 'rtx4090' }[];
  modelPoolWarmup: ['inswapper-128', 'scrfd-10g', 'arcface-r100', 'gfpgan-v1.4'];
  evictionPolicy: 'lru';
  maxConcurrentPerDevice: {
    'face.swap.render': 2;
    'face.dfl.train': 1;                 // 独占
    'ip.wan-animate.render': 1;          // H100 80G 必须独占
    'face.restore': 4;
  };
  preemption: { 'preview' < 'review' < 'master' };
}
```

### 5.3 中断 + 续跑

- 所有重活 task 产出 `progress.json` checkpoint
- DFL 训练用 .dfm 原生 checkpoint
- 崩溃恢复时按 checkpoint resume，**绝不重头**

---

## 6. C2PA 双标识强制实现

详见 `compliance-c2pa/spec.md`。关键决策：

- **Rust 库**：`c2pa-rs`（CAI 开源，c2patool v0.26.56+）
- **napi-rs 绑定到 Node**：避免 child_process 启动成本
- **三层标识**：
  1. 显式：FFmpeg `drawtext` 加角标 + 片头 1.5s 白板 + 字幕轨独立写
  2. 隐式：C2PA Manifest（BMFF uuid box）
  3. 兜底：DCT 频域水印（开源 invisible-watermark）
- **签名密钥**：复用现有 `electron/service/release-signing/` 的 ed25519，新增"内容签名子密钥"（独立轮换）
- **UI 不可关闭**：实现位置在 ffmpeg 最后一道 pass，写死

---

## 7. 跨平台 + 私有化部署

| OS | 推理后端 | 限制 |
|---|---|---|
| macOS (Apple Silicon) | ONNX Runtime CoreML EP | 仅作客户端预演 + 验证 |
| Windows (NVIDIA) | ORT CUDA + TensorRT | 主力编辑机 |
| Windows (AMD/Intel) | ORT DirectML | 性能 ~9-10ms/face frame |
| Linux (NVIDIA) | ORT CUDA + TRT + Docker | 渲染集群主力 |
| Linux (AMD ROCm) | ORT ROCm | 实验级，DFL 兼容差 |

私有化部署关键：

- **License + 硬件指纹双锁**
- **AirGapMode**：禁用所有外网，C2PA 签名走本地 HSM
- **模型分发**：U 盘镜像（含 sha256 + ed25519 签名）+ 客户内网 mirror
- **模型包大小**：约 100 GB（含 DFL + InSwapper + LivePortrait + Wan-Animate 14B + IDM-VTON + GFPGAN + AnimateDiff + LoRA 框架）

---

## 8. 14-16 个月路线图

| 月 | 内容 | 交付 |
|---|---|---|
| **M0-M1（2 月）基建** | TaskService 双层 + worker pool + hwaccel + proxy media + 写串行化 + 算法备案启动 | 200GB ProRes 不阻塞 UI + 50 万 shot 压测通过 + 备案受理回执 |
| **M1-M2（合并）** | S1 预告片场景 | 24 分钟剧集 → 30/60/90 三个时长版本 |
| **M3** | S2 横竖屏场景 | 一进十出 8 平台版本 |
| **M4** | S3 多语言场景 | 中文剧 → 英/日/西 三语完整链 |
| **M5** | S4 Crisis Lite（48h 救火）+ C2PA 全链路 | InSwapper + GFPGAN 中景以上换脸 + 强制水印 |
| **M6-M7** | S4 Crisis Pro（14-21 天）：DFL SAEHD 512/768 + 逐镜微调 + LivePortrait + GFPGAN ensemble | 主演特写 90-94% 一次过审 |
| **M8** | S5 服装替换（IDM-VTON + SAM2 + Wan-Animate 传播）+ 体型替换静态/半身 | 整集主角换服装 + 静态站立换体型 |
| **M9-M10** | S6 IP→动漫（LoRA + Wan-Animate Character Replacement + 关键帧绘师 panel） | 单集半自动覆盖 55-70% |
| **M11** | S7 IP→动物拟人化 | 5-30s 短镜头工业级 |
| **M12** | 私有化部署包（基础/专业/旗舰版） | 客户机房 H100 集群部署套件 |
| **M13-M14** | SLA 调优 + 监控埋点 + Provider fallback 完整化 + 算法备案最终通过 | 月可用率 ≥ 99.0% + 备案号公示 |
| **M15-M16** | GA 上线 + 老客户迁移 + 5-10 部样片回归测试 | 第一批付费客户交付 |

每月伴随：

- 回归测试（每场景 ≥ 3 部新样片）
- C2PA 标识抽测
- 审计日志完整性校验
- 媒体公关预案演练

---

## 9. 商务防御（合同 8 条 + 财务保护）

详见 `compliance-c2pa/spec.md`。8 条不签不接：

1. 客户资质（广电制作许可证 + 法人 KYC + 项目备案号）
2. 素材合法性兜底（艺人书面授权 + 客户独立担责）
3. 使用范围限制（仅本项目本艺人）
4. 标识不可拆除（删水印视为客户违法）
5. 审计配合（监管要求无需通知客户）
6. 赔偿上限（Koma 责任 ≤ 服务费 100%）
7. 保险代位（客户购影视责任险 ≥ 500 万）
8. 30 天销毁 + 第三方公证

**SPV 隔离**：高风险业务（S4/S5/S6/S7）剥离至独立 SPV（Koma Vision Ltd.）。

**保险**：网络安全综合责任险 + 专业责任险（科技服务）组合，年保费约 20-30 万 / 500 万保额。

---

## 10. 风险时间表（R3 D 输出 + 缓解）

| 月份 | 风险事件 | 缓解措施 |
|---|---|---|
| 2026.06 (M1) | 第一个 POC 客户素材给不到 60-90 分钟 | 合同附录 A 明确素材标准 + 不达标乙方有权拒绝 |
| 2026.08 (M3) | A 坊算法 lead 离职风险 | 双工程师备份 + 文档化 + 期权激励 |
| 2026.09 (M4) | B 坊 Wan-Animate 一致性问题 | 提前公开"55-70% 自动 + 25-45% 人工补"预期 |
| 2026.10 (M5) | 影视行业回款延期 6-12 月 | 首付 30% + 里程碑付款 + 不接全押后付 |
| 2026.11 (M6) | 客户法务撕碎合同保护伞 | 8 条硬条款 + SPV 隔离 + 保险 |
| 2027.03 (M10) | 监管约谈 / 责令停业 | 算法备案完成 + C2PA 全链路 + 危机预案 |
| 2027.06 (M13) | 舆论二次发酵 | 3 套媒体公关模板预签字 |

**关键监控指标**：每月现金流 / 团队 NPS / 客户付款周期 / 监管动态。**任一指标恶化 → 立即触发应急路径**（缩范围 + SPV 切割 + 重组）。

---

## 11. 12 个月后 vs 24 个月后

| 状态 | 12 月 | 24 月 |
|---|---|---|
| 团队 | 30-35 人 | 50+ 人（若顺利） |
| 客户 | 3-5 家头部影视公司 KA | 15-20 家含中型 |
| 月 ARR | 500-800 万 | 2000-3000 万 |
| 私有化客户 | 1-2 家旗舰版 | 5-8 家 |
| 算法备案 | 通过（M14） | 二代算法新增备案 |
| 监管约谈 | 可能 1-2 次 | 不可避免，预案应对 |

**最坏情况预案**：见 `compliance-c2pa/spec.md` 第 10 节（T+0 / T+1周 / T+1月 / T+3月 退路）。

---

## 12. 总结

完整版本 = 7 场景 + 14-16 月 + 30-35 人 + ~3 亿天花板 ARR。风险等级 P0 三条全部由 R3 已识别并预先缓解。**这是公司级押注**，要么 Koma 成为中国影视后期 AI 工业化的 No.1 桌面工具，要么按 R3 D 给出的死亡时间表清算。**没有第三条路**。
