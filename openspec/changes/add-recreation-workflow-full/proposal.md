# Change: 二创工作流 — 完整工业版本（7 场景）

## Why

经三轮多角色对抗式评审（架构师 / 工程师 / 后期总监 / 黑魂质疑者各三轮，共 12 个 agent 分析），影视公司客户的真实需求超出原 3 场景方案。完整工业级二创需求集合：

- **3 场景基础** —— 预告片 / 横竖屏 / 多语言（已有 `add-recreation-workflow-three-scenes` 设计基础）
- **A 坊新增** —— 应急换人 3 子场景：主演换脸 / 体型替换 / 服装替换
- **B 坊新增** —— IP 迁移创作：真人剧重制为动漫 / 真人剧重制为动物角色（拟人化）

本 change **超越**原 3 场景 change，作为完整版本路线图。**法务合规风险由影视公司自负**（已锁死前提），但 Koma 作为工具方仍承担"未尽审核义务"兜底（C2PA 强制 + 客户身份验证 + 输出水印）。

## What Changes

### 7 个工业级场景

| # | 场景 | 单价 | 月产能 | 难度 |
|---|---|---|---|---|
| S1 | 预告片多版本（30/60/90 × 风格 × 国内/海外） | 20-80 万/片 | 20 片/月 | 中 |
| S2 | 多平台横竖屏适配（8+ 平台） | 5-15 万/集 | 100 集/月 | 中 |
| S3 | 多语言本地化（dub + 嘴型 + 字幕 + 屏显文字） | 8-20 万/集 | 60 集/月 | 中高 |
| **S4** | **A 坊换脸**（Crisis Lite 48h / Crisis Pro 14-21 天） | 80-1100 万/部 | 4-8 项目/月 | **极高** |
| **S5** | **A 坊体型/服装替换** | 30-200 万/集 | 2-4 项目/月 | **极高** |
| **S6** | **B 坊真人→动漫**（LoRA + Wan2.2-Animate 半自动） | 220-320 万/集 | 4-6 集/月 | **极高** |
| **S7** | **B 坊真人→动物**（拟人化 / 短镜头概念片段） | 1-3 万/镜头 | 30 镜头/月 | **高** |

### 媒体处理 / GPU 调度（media-pipeline-pro capability，新增）

- **TaskService 双层扩展**：保留内核 + 新增 child_process worker pool（CPU/2 + GPU 独占）
- **FFmpeg 硬件加速 + Proxy Media 三层**：VideoToolbox/NVENC，5-10× 加速；1080p H.264 代理 + 关键帧 webp
- **GPU Task Queue**：H100 ×8 集群调度（私有化客户），A100/4090 fallback
- **SQLite 写串行化**：50 万 shot 不爆 SQLITE_BUSY
- **跨项目向量库**：ArcFace embedding 跨集 / 跨剧角色聚类

### 模型与第三方依赖

| 类别 | 主选 | 备用 | 部署 |
|---|---|---|---|
| 拆条 | PySceneDetect 边车 | TransNetV2 ONNX | 本地 |
| 人脸检测 | InsightFace SCRFD-10G | MediaPipe BlazeFace | 本地 ONNX |
| 嵌入 | InsightFace ArcFace R100 | — | 本地 |
| 换脸（默认） | InsightFace InSwapper-128 + GFPGAN | SimSwap | 本地 |
| 换脸（高端） | DeepFaceLab SAEHD 512/768 | HiFiVFS / CanonSwap | 本地训练 |
| 表情迁移 | LivePortrait | FasterLivePortrait | 本地 |
| 体型/全身合成 | Wan2.2-Animate（阿里通义） | OmniHuman（字节） | 本地大模型 / 云端 |
| 服装替换 | IDM-VTON + SAM2 | OutfitAnyone | 本地 |
| 视频传播 | Wan2.2-Animate Character Replacement | AnimateDiff | 本地 |
| 多语言 dub | ElevenLabs / Deepdub | 火山豆包 / 阿里 CosyVoice | API（BYOL） |
| 嘴型对齐 | Sync.so lipsync-2-pro | HeyGen | API（BYOL）+ wav2lip ONNX 兜底 |
| 视频理解 | 阿里百炼 RunVideoAnalysis | 火山方舟 / Gemini | API（BYOL） |
| 字幕 OCR | PaddleOCR Node.js | EasyOCR | 本地 |
| 字幕 inpaint | IOPaint (LaMa) | lama-cleaner ONNX | 本地 |

### 强制合规基建（compliance-c2pa capability，新增）

- **C2PA 双标识**（c2pa-rs Rust + napi-rs）：成片必嵌 manifest + 显式水印 + 频域水印（DCT），三层并行不可被前端关闭
- **算法备案**：Koma 作为深度合成"技术支持者"在 `beian.cac.gov.cn` 完成算法备案，预计 10 工作日初审
- **名人脸 / 政治敏感 / 未成年人审核**：每次输入素材调阿里云内容安全 API + 自建名单库（人民日报系名单 + 中演协自律名单 + 已封艺人）
- **客户 KYC**：必须提供广电制作经营许可证 / 网络剧备案号；自然人客户一律拒绝
- **输出审计**：每帧记录 modelChain + 操作员 + 任务 ID，落 SQLite append-only 表 + 哈希链防篡改，保留 5 年
- **销毁回执**：30 天后 worker 自动销毁脸库 / LoRA / 中间模型，回执上链（阿里联盟链或蚂蚁链）

### 客户合同必签 8 条（不签不接）

1. 客户资质（广电制作经营许可证 + 法人 KYC + 影视项目备案号）
2. 素材合法性兜底（艺人书面授权 + 客户独立承担权属风险）
3. 使用范围限制（仅本项目本艺人，跨项目复用违约）
4. 标识不可拆除（删水印视为客户违法，Koma 单方面解约）
5. 审计配合（监管要求时无需通知客户即提交日志）
6. 赔偿上限（Koma 责任上限 = 服务费 × 100%）
7. 保险代位（客户购影视责任险 ≥ 500 万，Koma 列附加被保险人）
8. 数据销毁（30 天销毁 + 第三方公证审计报告）

### 公司治理 / 风险隔离

- **SPV 隔离**：A 坊 + B 坊高风险业务剥离至独立 SPV（Koma Vision Ltd.），主公司持有核心 IP 授权
- **License 强绑定**：私有化客户机器硬件指纹 + 企业账号双锁
- **危机预案**：3 套媒体公关应答模板（被指控滥用 / 被指控违法 / 员工内鬼）法务+PR 预先签字存档

### 私有化部署

| 档位 | 客户硬件 | 适用场景 | 客户采购 |
|---|---|---|---|
| 基础版 | RTX 4090 ×4 工作站 | S1-S4 Crisis Lite | 50-70 万 |
| 专业版 | H100 80G ×4 + A100 ×4 | + S4 Pro + S5 | 350-450 万 |
| 旗舰版 | H100 ×8 + A100 ×8 | + S6/S7 全场景 | 700-900 万 |

## Impact

### 新增 specs
- `recreation-workflow-full`（7 场景 capability，含 A 坊 / B 坊）
- `media-pipeline-pro`（worker pool + hwaccel + 跨项目向量库 + GPU 调度）
- `compliance-c2pa`（C2PA 双标识 + 算法备案 + KYC + 审计 + 销毁）

### 修改 specs
- `electron-integration`（preload bridge 新增 7 场景 namespaces；GPU 任务调度 IPC；私有化 profile）

### 新增代码（预估）
- `electron/service/recreation/`：9 个 service + 4 个 provider 抽象扩展（itv-pro / align / video-analysis / dub-pro）
- `electron/service/face-swap/`：模型 registry + Python 边车 + GPU 队列 + 加密 + C2PA 签名
- `electron/service/recreation/face-swap/`：FaceSwapService + 7 个 provider 实现
- `electron/service/recreation/aspect-adapt/` / `localization/` / `trailer-cut/`
- `electron/service/recreation/ip-transfer/`（B 坊）：LoRA 训练 + Wan-Animate 集成 + 关键帧绘师面板
- `electron/service/tasks/handlers/face*`：12 个新 task type
- `electron/service/storage/repositories/`：6 个新 repo（FaceIdentity / SourceActor / SwapPlan / SwapResult / LoRAModel / IPTransferJob）
- `electron/service/compliance/`：c2patool 封装 + 算法备案接口 + 名人脸审核 + 销毁 worker
- `electron/service/enterprise/`：License + Profile + 硬件指纹 + 审计哈希链
- 前端：`frontend/src/face-swap/` + `frontend/src/ip-transfer/` + `frontend/src/aspect-adapt/` 等 7 套场景 UI

### 修改代码
- `electron/service/tasks/TaskService.ts`：并发 4→32 + GPU worker dispatcher
- `electron/service/ffmpeg.ts`：hwaccel 自动检测 + proxy 生成 + 进度上报
- `electron/service/storage/`：写串行化层 + Postgres CDC（私有化客户）
- `electron/preload/bridge.ts`：新增 50+ IPC 通道
- 现有 LLM provider 抽象：支持 video input 字段

### 新增依赖
- `c2pa-rs`（Rust + napi-rs，C2PA 标识）
- `onnxruntime-node`（InsightFace + LivePortrait + GFPGAN）
- Python 边车环境（PySceneDetect / Demucs / WhisperX / IOPaint / DeepFaceLab CLI）
- `adm-zip`（已有）
- 阿里云内容安全 SDK（KYC + 名人脸审核）

### 团队规模与周期
- **30-35 人**：8 算法 + 4 桌面端 + 3 平台/DevOps + 3 算法 SRE + 4 QC + 3 PM + 5 销售/法务/客户成功 + 2 PR/合规
- **14-16 个月**：M0 基建（2 月） + M1 S1 + M2 S2 + M3 S3 + M4 S4 Lite + M5 S4 Pro + M6 S5 + M7-8 S6 + M9 合规链路 + M10-11 S7 + M12 私有化交付 + M13-14 SLA 调优 + M15-16 GA + 上线

### 一次性运维
- ed25519 keypair 已生成（复用现有 release-signing）
- 阿里云内容安全 SDK 接入（账号 + AK/SK）
- 算法备案启动（提交《算法自评估报告》到网信办）
- SPV 法律实体注册（Koma Vision Ltd.）
- 保险洽谈（网络安全综合责任险 + 专业责任险）

## Non-goals（明确不做）

- ❌ 协作 Web 端（保留桌面架构）
- ❌ 自研基础大模型（仅微调/集成开源/调商业 API）
- ❌ NLE 替代（保留与 Premiere/DaVinci/Avid 互通定位）
- ❌ C 端公开销售（仅 B 端 + 企业 KYC）
- ❌ 主演正面特写换脸 SLA 承诺（特写镜头工业级 90-94%，剩余 8-10% 走 VFX 补拍 fallback）
- ❌ 真人→全四足动物（违反生物学骨骼，仅做拟人化）
- ❌ 整集 45 分钟全自动动漫化（仅做 LoRA + Wan-Animate 半自动 55-70% 覆盖 + 25-45% 人工补帧）

## Risks

### 风险等级 P0（致命）
1. **政策黑天鹅**：广电 2026-01 AI 魔改专项治理扩展至影视公司"自用换脸"
2. **回款断裂**：影视行业 2026 一季度票房腰斩 51.29%，备案数下滑，客户付款周期延长至 6-12 月
3. **团队跑路**：核心算法 lead 被通义/可灵挖角（薪资市场 +20-30%）

### 风险等级 P1（高）
4. **客户法务撕碎合同保护伞**：SLA / 模型归属 / 责任险三条被压回
5. **舆论二次发酵**：成片播出后被网友扒帧 Koma 品牌污染
6. **私有化设备成本超预算**：H100 价格上涨 20-30%（trendforce 2026-04）

### 风险等级 P2（中）
7. **POC 训练素材质量不达标**：客户给不出 60-90 分钟干净训练视频
8. **Wan2.2-Animate 工业一致性边界**：长剧跨集风格漂移
9. **C2PA 平台对接延迟**：抖音/B站/爱优腾接口实施进度

## Constraints

1. **基于现有 Koma Electron + ee-core + SQLite + ffmpeg 架构扩展**，不重写
2. **第三方 API 全部 BYOL**：客户自带 HeyGen/Sync.so/ElevenLabs/Topaz/火山/阿里 等许可
3. **法务由影视公司自负**（已锁死），但 Koma 必须做工具方"未尽审核义务"兜底
4. **特写镜头 90-94% 一次过审**（不承诺 95%，剩余走 VFX 补拍混合工作流）
5. **B 坊单次任务 ≤ 5 分钟输出**（防 UGC 渠道滥用做长视频）
6. **企业级 KYC + 算法备案是开通换脸 / 体型 / 服装 / IP 迁移功能的前置**
