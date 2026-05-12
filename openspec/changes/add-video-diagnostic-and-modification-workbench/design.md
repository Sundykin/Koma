# Design: 视频诊断报告 + 选菜式修改工作台

> 本设计文档综合 R4 三轮 agent 输出。**所有数字、模型选型、API 定价**已经过 WebSearch 实证（详见 `docs/strategy/r1-r4-decision-reference.md`）。

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
│  AnalysisOrchestrator  ────►  12 维度独立 Service               │
│         │                                                        │
│         ├─►  TaskService（worker pool + GpuTaskQueue）          │
│         │      ↓                                                 │
│         │   Python Sidecar + ONNX GPU Workers                   │
│         │   (PySceneDetect / WhisperX / Demucs / SAM2 / VideoMAE│
│         │    / PaddleOCR / SCRFD / ArcFace / RT-DETR / CLIP /   │
│         │    CLAP / DeepFaceLab / IDM-VTON / Wan-Animate)       │
│         │                                                        │
│         ▼                                                        │
│  ModificationOrchestrator → DAG → 7 个 stage executor           │
│         │                                                        │
│         ▼                                                        │
│  ComplianceLayer (C2PA / KYC / 名单 / 审计 / 销毁)              │
│         │                                                        │
│         ▼                                                        │
│  Storage (SQLite + 写串行化 + Postgres CDC + 向量库)            │
└─────────────────────────────────────────────────────────────────┘
```

## 2. DiagnosticReport 完整 Schema

完整 TypeScript 定义见 `specs/video-diagnostic-report/spec.md`，核心字段：

```ts
interface DiagnosticReport {
  reportId: string;
  sourceMediaId: string;
  mediaSha256: string;
  durationMs: number;
  resolution: { w: number; h: number; fps: number };
  generatedAt: string;
  schemaVersion: '1.0.0';
  dimensions: DimensionStatus[];  // 哪些跑了 / 模型版本 / 延迟
  characters: Character[];         // 含 faceEmbedding 512d
  scenes: Scene[];
  shots: Shot[];                   // 含 shotSize / cameraMovement / motionBlur / occlusion
  scriptLines: ScriptLine[];       // ASR 词级时间戳
  wardrobeTracks: Wardrobe[];      // 跨镜头跟踪
  actions: Action[];               // Kinetics-700 类
  lightingSegments: Lighting[];
  onScreenTexts: OnScreenText[];   // OCR
  musicSegments: MusicSegment[];   // BPM + 情绪
  riskMarks: RiskMark[];           // 自动评分
  feasibility: ModificationFeasibility[];  // 每镜头可改性
  signature: { algo: 'ed25519'; key: string; sig: string };
}
```

## 3. 12 维度技术栈（R4-C 实证）

| 维度 | 模型 | 4090 性能 | A100 性能 | 许可 |
|---|---|---|---|---|
| 人物 | InsightFace SCRFD-10G + ArcFace R100 + HDBSCAN | 3 min | 2 min | **权重 non-commercial，须商业授权** |
| 场景 | OpenCLIP ViT-L + SAM2.1-Hiera-L + Qwen3-VL-Plus VLM 校验 | 2 min | 1.5 min | Apache / MIT |
| 镜头 | TransNetV2 + 自训景别分类器 + 光流 | 6 min | 4.5 min | MIT |
| 台词 | WhisperX large-v3 + pyannote 3.1 | 1 min | 50s | MIT |
| 服装 | RT-DETR-L + OpenCLIP zero-shot + DeepSORT | 1 min | 45s | Apache |
| 动作 | VideoMAE V2 distilled (MMAction2) | 1.8 min | 1.3 min | Apache |
| 光照 | OpenCV 启发式 + 自研 CNN | 30s | 30s | — |
| OCR | PaddleOCR PP-OCRv5 | 1.1 min | 50s | Apache |
| 音乐 | Demucs htdemucs + LibROSA + CLAP-LAION | 3 min | 2 min | MIT |
| 风险 | 组合规则 | <5s | <5s | — |
| 可行性 | 组合规则 | <5s | <5s | — |

**总耗时（45 min 1080p）**：
- H100 ×1：~6 min
- A100 ×1：~8 min
- 4090 ×1：~11 min
- Mac M3 Max（云端 fallback）：~35-45 min

## 4. Modification Pipeline 选型

| 修改类型 | 主选模型 | 备选 | 许可 |
|---|---|---|---|
| 换脸（中景以上） | InsightFace InSwapper-128 + GFPGAN v1.4 | SimSwap | 商业授权 |
| 换脸（特写工业级） | DeepFaceLab SAEHD 512/768 + LivePortrait + GFPGAN + HiFiVFS | CanonSwap | 开源 / 商业 |
| 体型替换（静态） | Wan2.2-Animate 14B Character Replacement + IPAdapter | OmniHuman | Apache / Apache |
| 服装替换 | IDM-VTON + SAM2 + Wan-Animate 传播 | OutfitAnyone | 各开源 |
| 横竖屏适配 | MediaPipe + 主体跟踪 + 智能裁切 + 字幕重排 + loudnorm | — | Apache |
| 多语言 dub | ElevenLabs / Deepdub / 火山豆包 / 阿里 CosyVoice | — | API（BYOL） |
| 嘴型对齐 | Sync.so lipsync-2-pro / HeyGen | wav2lip ONNX 兜底 | API（BYOL） |
| 视频理解 | 阿里百炼 / 火山方舟 / Gemini 2.5 Pro/Flash / Doubao Vision | — | API（BYOL） |
| 屏显文字 inpaint | PaddleOCR + IOPaint LaMa | — | Apache |
| 风格化重生成 | AnimateDiff + LoRA | Wan2.2-Animate | Apache |

## 5. 视频解析 Provider 抽象（R2 LLM provider 扩展）

新增 `VideoAnalysisProvider` 接口（详见 `media-pipeline-pro/spec.md`），实现：

```
LocalProvider              本地 ffmpeg + onnxruntime（默认）
AliyunRunVideoAnalysisProvider   ¥0.1-0.4 元/分钟
DoubaoVisionProvider       豆包 Seed 1.6-vision，¥1.9-8/部 45 分钟
GeminiVideoProvider        $0.21-0.89 / 45 分钟（Flash / Pro）
TwelveLabsProvider         $0.042/min index + $0.021/min API
```

主备 fallback 策略：本地优先 → 云端兜底（VLM 校验 / 服装难判 / 长视频）。

## 6. 选菜式修改的 ModificationPlan

完整 TypeScript 定义见 `specs/modification-workbench/spec.md`，核心：

```ts
interface ModificationPlan {
  planId: string;
  reportId: string;
  sourceMediaId: string;
  items: ModificationItem[];
  createdAt: string;
  dag: DagEdge[];        // 自动推导的依赖图
}

type ModificationItem =
  | FaceSwapItem
  | BodyReshapeItem
  | WardrobeItem
  | AspectRatioItem
  | LanguageDubItem
  | StylizationItem;     // conceptOnly: true
```

每个 item 含：
- `scope`: 全片 / 规则筛选（DSL）/ 手动镜头列表
- `feasibilityScore`: 从报告同步过来，UI 显示红绿灯
- `estCostCents` / `estDurationSec`: 实时预估
- `conceptOnly`: 风格化重生成强制 true，UI 强制显示警告

DAG 依赖：换脸 → 表情对齐 → 体型 → 服装 → 调色 → 横竖屏 → 字幕 → C2PA → 导出。

## 7. UX 关键设计（R4-B 输出）

### 7.1 二创工作台首页改造

```
┌────────────────────────────────────────────────────────┐
│ Koma 二创工作台                                          │
│ ┌──大上传区──────────────────────────────────────┐   │
│ │ 拖拽视频 或 [选择文件] [从已有项目] [从飞书]   │   │
│ └────────────────────────────────────────────────┘   │
│                                                        │
│ ◆ 进行中（3） · 最近报告（5） · 推荐操作             │
└────────────────────────────────────────────────────────┘
```

### 7.2 诊断报告浏览界面 `<DiagnosticReportShell>`

12 维度左侧导航 + 主区域可视化（人物卡片网格 / 镜头时间线 / 双栏台词编辑 / 服装矩阵 / 动作色带）。

### 7.3 选菜界面（推荐购物车式 + 规则化批量）

浏览报告时随手"+ 改造"按钮 → `<QuickAddDrawer>` → 加入修改单 → `<ModificationCartView>` 主页面（支持嵌套条件、DAG 自动排序、批量提交）。

### 7.4 任务进度

`<RenderQueue>` 抽屉式，按物料分组，长任务每 5 分钟出片段预览，失败可单镜头重做。

## 8. 性能预算

### 解析 pipeline（已列在 §3）

### 修改 pipeline（45 分钟单集）

| 修改 | A100 ×4 | 4090 ×1 |
|---|---|---|
| 换脸 InSwapper Lite | 30 分钟 | 1.5 小时 |
| 换脸 DFL Pro（含训练 14 天） | 22-32 小时（不含训练）/ 训练 9-12 天 | 不建议 |
| 横竖屏 8 平台一键派生 | 8 分钟 | 25 分钟 |
| 多语言完整链（dub + 嘴型 + 字幕 + 屏显） | 18-25 分钟（不含译审）| 35-50 分钟 |
| 服装替换整集 | 15 小时 | 不建议 |
| 风格化 demo 30s | 5-10 分钟 | 20-30 分钟 |

## 9. 14-16 月路线图（R4 重排）

| 阶段 | 时长 | 核心交付 |
|---|---|---|
| **M0** 基建月 | 30 天 | TaskService 双层 + GpuTaskQueue + hwaccel + proxy + 写串行化 + 算法备案启动 + InsightFace 授权采购 |
| **M1** 诊断报告 MVP | 4-5 月 | 12 维度解析 pipeline + Web/PDF 报告 + 跨剧检索 + **报告独立可售产品上线** |
| **M2** 选菜界面 + 首批修改 | 3-4 月 | 选菜 UI + 换脸 Lite + 横竖屏 + C2PA 全链路 + KYC + 名单审核 |
| **M3** 扩充菜式 | 6-9 月 | 多语言（嘴型 + 屏显）→ 服装替换 → 体型替换 → 换脸 Pro（DFL）→ 风格化 demo → SPV 隔离 → 私有化打包 |

**保守诚实总周期：14-16 个月到 M2 完成**（"AI 视频改造工作站"可对外推广），比 R3 形态快 6-9 个月。

## 10. 商业模式

- **诊断报告 SaaS**：¥99-299/部，企业年订阅 ¥30 万/年
- **修改服务按项目**：换脸 Lite 80-150 万/部，Pro 300-1100 万/部，体型/服装 30-200 万/集，多语言 8-20 万/集
- **私有化部署**：基础 50-70 万 / 专业 350-450 万 / 旗舰 700-900 万 客户硬件，软件按 License 收费
- **B 端 KA**：3-5 家头部影视公司打标杆

## 11. 与 Koma 现有架构的集成

| 现有点 | 扩展方式 |
|---|---|
| TaskService (并发 4) | 4→32 + GpuTaskQueue + Python sidecar |
| ffmpeg.ts (无 hwaccel) | hwaccel 自动检测 + proxy + progress |
| SQLite | 写串行化 + 12 维度独立表 + 向量库 + Postgres CDC |
| Provider 抽象（LLM/TTI/ITV/TTS/image-hosting） | + VideoAnalysisProvider + 7 类修改 provider |
| ed25519 (release-signing) | + 内容签名子密钥（C2PA + 审计日志） |
| 自动更新机制 | 复用，新增企业内网更新通道 |
| 插件市场 | 复用，新增"企业插件仓库" |
| sidebar 二创占位入口 | 改造为 `<RecreationWorkbenchShell>` 主入口 |

## 12. 风险时间表（R3-D + R4-D 累积）

| 月份 | 事件 | 缓解 |
|---|---|---|
| 2026-06 | POC 客户素材不达标 | 合同附录 A 标准 + 拒绝权 |
| 2026-08 | 算法 lead 离职 | 双工程师备份 + 期权激励 |
| 2026-09 | Wan-Animate 一致性问题 | 提前公开覆盖率预期 |
| 2026-10 | 影视行业回款延期 | 首付 30% + 里程碑 + 不接全后付 |
| 2026-11 | 客户法务撕碎合同 | 8 条硬条款 + SPV + 保险 |
| 2027-03 | 监管约谈 | 算法备案 + C2PA + 预案 |
| 2027-06 | 舆论二次发酵 | 3 套公关模板预签 |

**关键监控**：每月现金流 / 团队 NPS / 客户付款 / 监管动态，任一指标恶化触发应急。

## 13. 何时降级

如果以下任一发生，启动应急路径：

1. M1 后 6 个月内**无单家影视公司付费购买诊断报告**（独立营收线不成立）→ 砍 B 坊（IP 迁移），收缩到 A 坊
2. 12 维度联合准确率始终 < 70% → 收缩为 6 维度
3. 阿里 / 火山 视频理解 API 降价 50%+ → 转向"上层应用 + 调云端 API"路线，本地解析弃守
4. 监管约谈 → 立即下线换脸 / IP 迁移 → 仅保留 S1-S3
5. 团队走超 5 人 → SPV 切割 + Koma2 重组（仅保留 S1-S3 + 风格化）

详细预案见 `compliance-c2pa/spec.md` 最坏情况预案。
