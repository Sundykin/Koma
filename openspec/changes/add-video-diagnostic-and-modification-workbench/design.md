# Design: 视频诊断报告 + 选菜式修改工作台（纯工具版）

> 本设计以"纯技术工具"为定位：所有合规 / 法务 / 财务 / 安全责任由客户自负。
> Koma 仅交付能力，**不交付政策应对、不做内容审核、不签兜底条款**。

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│ Renderer（React）                                                │
│ ┌────────────────────────┐ ┌────────────────────────────────┐  │
│ │ <DiagnosticReportShell>│ │ <ModificationCartView>        │  │
│ │  - 12 维度浏览        │ │  - 购物车 + 嵌套条件          │  │
│ │  - 跨剧检索           │ │  - DAG 依赖编排               │  │
│ │  - 报告导出           │ │  - 任务进度反馈               │  │
│ └────────────────────────┘ └────────────────────────────────┘  │
│ ┌────────────────────────┐ ┌────────────────────────────────┐  │
│ │ <AssetVault>          │ │ <RenderQueue>                  │  │
│ │  - 物料版本树         │ │  - 任务列表 + 中间预览        │  │
│ └────────────────────────┘ └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
              │
┌─────────────▼──────────────────────────────────────────────────┐
│ Main（Electron）                                                 │
│  AnalysisOrchestrator → 12 维度 Service                         │
│         │                                                        │
│         ├─► TaskService（worker pool + GpuTaskQueue）           │
│         │     ↓                                                  │
│         │   Python Sidecar / ONNX GPU Workers                   │
│         │   (PySceneDetect / WhisperX / Demucs / SAM2 /         │
│         │    VideoMAE / PaddleOCR / AuraFace / SCRFD / RT-DETR /│
│         │    CLIP / CLAP / DeepFaceLab / IDM-VTON / Wan-Animate)│
│         │                                                        │
│         ▼                                                        │
│  ModificationOrchestrator → DAG → 7 个 stage executor           │
│         │                                                        │
│         ▼                                                        │
│  Storage (SQLite + 写串行化 + Postgres CDC + 向量库)            │
└─────────────────────────────────────────────────────────────────┘
```

**注意：原 R4 设计中的 ComplianceLayer 完全删除。** 不再有 C2PA / KYC / 审计哈希链 / 销毁 worker 等模块。

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

## 3. 12 维度技术栈（均可商用）

| 维度 | 模型 | 4090 性能 | A100 性能 | 许可 |
|---|---|---|---|---|
| 人物检测 | InsightFace SCRFD-10G | 3 min | 2 min | 代码 MIT（仅检测可用，识别 embedding 需替换） |
| 人物识别 embedding | **AuraFace 或 buffalo_l Apache fork**（替换 InsightFace 商业权重） | + ~10% 时长 | + ~10% | Apache / CC-BY |
| 跨镜头聚类 | HDBSCAN | < 30s | < 30s | BSD |
| 场景 | OpenCLIP ViT-L + SAM2.1 + Qwen3-VL-Plus | 2 min | 1.5 min | Apache / MIT |
| 镜头 | TransNetV2 + 自训分类器 + 光流 | 6 min | 4.5 min | MIT |
| 台词 | WhisperX + pyannote 3.1 | 1 min | 50s | MIT |
| 服装 | RT-DETR-L（替代 YOLOv8 AGPL）+ OpenCLIP + DeepSORT | 1 min | 45s | Apache |
| 动作 | VideoMAE V2 distilled (MMAction2) | 1.8 min | 1.3 min | Apache |
| 光照 | OpenCV 启发式 + 自研 CNN | 30s | 30s | — |
| OCR | PaddleOCR PP-OCRv5 | 1.1 min | 50s | Apache |
| 音乐 | Demucs htdemucs + LibROSA + CLAP-LAION | 3 min | 2 min | MIT |
| 风险 + 可行性 | 组合规则 | < 10s | < 10s | — |

**总耗时（45 min 1080p）**：
- H100 ×1：6 min
- A100 ×1：8 min（含 AuraFace ~10% 时长）
- 4090 ×1：11 min
- Mac M3 Max（云端 fallback）：35-45 min

## 4. Modification Pipeline 选型（均可商用）

| 修改类型 | 主选 | 备选 | 许可 |
|---|---|---|---|
| 换脸（中景） | SimSwap / Roop-Unleashed fork | InSwapper（注意 non-commercial 权重） | Apache / MIT 替代 |
| 换脸（特写） | DeepFaceLab SAEHD 512/768 | CanonSwap fork | 开源 |
| 表情迁移 | LivePortrait | FasterLivePortrait | Apache |
| 后处理 | GFPGAN v1.4 / CodeFormer | — | Apache |
| 体型替换 | Wan2.2-Animate 14B Character Replacement + IPAdapter | OmniHuman | Apache |
| 服装替换 | IDM-VTON + SAM2 + Wan-Animate 传播 | OutfitAnyone | Apache |
| 横竖屏 | MediaPipe 主体跟踪 + reframe + 字幕重排 + loudnorm | — | Apache |
| 多语言 dub | ElevenLabs / Deepdub / 火山 / 阿里 | — | BYOL |
| 嘴型对齐 | Sync.so / HeyGen API | wav2lip ONNX 兜底 | BYOL / MIT |
| 视频理解 | 阿里百炼 / 火山 / Gemini / Doubao | — | BYOL |
| 屏显 inpaint | PaddleOCR + IOPaint LaMa | — | Apache |
| 风格化重生成 | AnimateDiff + LoRA | Wan2.2-Animate | Apache |

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
  estCostCents: number;       // BYOL API 累计估算
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

## 7. 媒体处理层（与原 R4 一致，保留）

- TaskService 双层调度（内核 + child_process worker pool）
- GpuTaskQueue（H100 / A100 / 4090 调度）
- FFmpeg hwaccel 自动检测 + proxy media
- SQLite 写串行化
- 跨项目向量库

详见 `specs/media-pipeline-pro/spec.md`。

## 8. 10-12 月路线图

| 阶段 | 时长 | 核心交付 |
|---|---|---|
| **M0** 基建月 | 15 天 | TaskService 双层 + GpuTaskQueue + hwaccel + proxy + 写串行化 |
| **M1** 诊断报告 MVP | 4 月 | 12 维度解析 + Web/PDF 报告 + 跨剧检索 |
| **M2** 选菜界面 + 首批修改 | 3 月 | 选菜 UI + 换脸 Lite + 横竖屏 |
| **M3** 扩充菜式 | 4-5 月 | 多语言 → 服装 → 体型 → 换脸 Pro → 风格化 demo |

**比 R4 早期版本（14-16 月）快 4-6 月**，原因：
- M0 无前置法务流程（算法备案 / 保险洽谈 / 客户合同 / InsightFace 授权 全部删除）
- M2 无 C2PA / KYC / 名单审核 / SPV 实施
- M3 无销毁 worker / 审计哈希链 / 私有化合规模式

## 9. 商业模式（参考，客户自定）

- 诊断报告 SaaS：¥99-299/部
- 修改服务按项目：换脸 Lite 80-150 万/部 / Pro 300-1100 万/部 / 体型/服装 30-200 万/集 / 多语言 8-20 万/集
- 私有化部署：客户自购 GPU 集群（Koma 不强制销售硬件），软件 License 按团队规模收费

## 10. 与 Koma 现有架构的集成

| 现有点 | 扩展方式 |
|---|---|
| TaskService | 并发 4 → 32 + GpuTaskQueue + Python sidecar |
| ffmpeg.ts | hwaccel + proxy + progress |
| SQLite | 写串行化 + 12 维度独立表 + 向量库 |
| Provider 抽象（5 类）| + VideoAnalysisProvider + 7 类修改 provider，全 BYOL |
| 自动更新机制 | 复用 |
| 插件市场 | 复用 |
| sidebar 二创占位入口 | 改造为 `<RecreationWorkbenchShell>` 主入口 |

**ed25519 release-signing 不强制扩展为内容签名**。如未来客户要求 C2PA 可按需补，不在本 change。

## 11. 团队规模

20-25 人纯工程团队：

- 8 算法工程师（视频理解 + 换脸 + 体型 + 服装 + LoRA + 风格化）
- 4 桌面端工程师（Electron + ee-core 扩展）
- 3 平台 / DevOps
- 3 算法 SRE / 数据工程
- 4 QC（仅技术 QC，非合规 QC）
- 2 PM
- 销售 / 客户成功 / 法务 由客户公司自配（Koma 仅技术交付）

## 12. 风险（仅技术风险，合规风险不在本范围）

| 风险 | 缓解 |
|---|---|
| 12 维联合准确率天花板（理论 0.95^12 = 54%） | 工业目标 80-85%，每维度独立 QA 标注集回归 |
| 阿里 / 火山 视频理解 API 价格战 | 全 BYOL 模式，价格由客户支付，Koma 不背 |
| 团队核心算法 lead 被挖角 | 双工程师备份 + 模块文档化 |
| Wan-Animate 工业一致性边界 | 提前公开覆盖率预期 + 必须人工补帧 |
| Mac 性能不足 | 云端 fallback provider |

**合规风险全部转嫁客户**。客户自负监管约谈 / 政策红线 / 舆论应对 / 黑产滥用。

## 13. 用户已知情的事项（来自 4 轮多 agent 讨论）

详见 `docs/strategy/r1-r4-decision-reference.md`。本设计**假设用户已读、已接受**所有警告，包括但不限于：

- 主演正面特写换脸工业级 0 成功率（巴清传/三千鸦杀失败案例）
- Twelve Labs（最接近对标）ARR 仅 420 万美元
- 12 维联合准确率天花板
- 影视行业 2026 票房腰斩 51.29%
- 监管政策 2025-09-01 + 2026-01 治理趋势收紧

**用户决定：Koma 不操心，由客户自处理。**
