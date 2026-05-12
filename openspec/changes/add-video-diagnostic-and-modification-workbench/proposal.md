# Change: 视频诊断报告 + 选菜式修改工作台（R4 完整版）

## Why

经 4 轮多 agent 对抗式评审（共 16 个 agent 分析，详见 `docs/strategy/r1-r4-decision-reference.md`），用户最终决定实施 R4 完整版：**"AI 视频诊断报告（独立产品）+ 基于报告的选菜式修改（统一台）"**。

这是对原 R3 七场景独立 service 设计的**形态重构**：

- **R3 形态**：客户从 7 个独立场景入口选一个，走专属 pipeline
- **R4 形态**：客户上传视频 → AI 一次性 12+ 维度逐帧解析 → 输出结构化"视频诊断报告"→ 客户在统一界面"勾菜"要改什么 → 后台调对应 pipeline → 出片

**关键设计转变**：
1. **解析报告独立成产品**：客户即使不做任何修改，光拿到 12 维度报告（人物表 / 场景表 / 镜头表 / 台词表 / 服装表 / 动作表 / 光照表 / 屏显文字表 / 音乐情绪表 / 风险标记 / 修改可行性预评估等）就有价值
2. **替换路径为主**：换脸 / 换体型 / 换服装 / 横竖屏 / 多语言等都是"修改 5-30% 像素，保留原画面"
3. **重生成明确标"概念演示"**：仅"风格化→动漫/动物"是 100% 重生成，UI 强制标识不承诺工业级
4. **R3 的 7 场景降级为后端 pipeline 模块**：不再有独立顶层入口，统一在"选菜界面"调用

**法务合规风险由影视公司自负**（已锁死前提），Koma 作为工具方仍承担"未尽审核义务"兜底（C2PA 强制 + 客户 KYC + 名单审核 + 输出水印 + SPV 隔离）。

## What Changes

### 第一段：视频诊断报告（独立产品）

12+ 维度逐帧解析，输出结构化报告：

| 维度 | 用途 | 关键技术栈 |
|---|---|---|
| 1. 项目元数据 | 时长 / 分辨率 / 编码 / HDR | ffprobe |
| 2. 人物表 | 角色 + 出场镜头 + CP + 屏占 | InsightFace SCRFD + ArcFace + HDBSCAN |
| 3. 场景表 | 场景类型 + 时段 + 持续时长 | OpenCLIP ViT-L + SAM2 + VLM 校验 |
| 4. 镜头表 | 镜头分割 + 景别 + 摄影机运动 | TransNetV2 + 自训分类器 + 光流 |
| 5. 台词表 | ASR + 说话人识别 | WhisperX + pyannote 3.1 |
| 6. 服装表 | 角色每集穿什么 + 颜色 / 材质 | RT-DETR + CLIP zero-shot |
| 7. 动作表 | 动作类型 + 强度 + 时段 | VideoMAE V2 distilled |
| 8. 光照表 | 日光 / 室内 / 强光 / 逆光 / 火光跳动 | OpenCV 启发式 + 自研分类器 |
| 9. 屏显文字表 | OCR 所有屏内文字 | PaddleOCR PP-OCRv5 |
| 10. 音乐情绪表 | BGM 节拍 + 情绪标记 | Demucs + LibROSA + CLAP-LAION |
| 11. 风险标记 | 特写比例 / 强光 / 侧脸 / 遮挡 自动打分 | A-J 维度组合 |
| 12. 修改可行性预评估 | 每镜头是否可换脸 / 换装 / 换体型 | A-J 维度组合 |

**报告产品形态**：
- JSON / Excel / 可视化 Web 报告 / PDF 四种导出
- 跨剧检索能力（"某演员在我所有项目里穿过红色衣服的镜头"）
- 单部 45 分钟剧集定价 ¥99-299 / 部
- 企业年订阅 ¥30 万/年（不限片量 + 跨剧检索 + 私有部署）

**性能预算（45 分钟 1080p 剧集）**：
- H100 ×1 全本地：6 分钟出报告
- A100 ×1：8 分钟
- RTX 4090 ×1：11 分钟
- Mac M3 Max（含云端 fallback）：35-45 分钟

### 第二段：选菜式修改工作台

统一 UI 上勾选要改什么，后台调对应 pipeline：

| 修改类型 | 路径 | 工业级可行性 |
|---|---|---|
| 换脸（替换 character） | 替换（InSwapper + GFPGAN / DeepFaceLab SAEHD 512） | 高（中景）/ 中（特写 90-94%）|
| 换体型 | 替换（Wan2.2-Animate Character Replacement） | 仅静态 / 半身镜头 |
| 换服装 | 替换（IDM-VTON + SAM2 + Wan-Animate 传播） | 高（颜色 95%，款式 60%） |
| 横竖屏适配 | 替换（主体跟踪 + 智能裁切 + 字幕重排 + loudnorm） | 高 |
| 多语言本地化 | 替换音轨 + 嘴部局部替换 | 高（亚洲语言）/ 中（欧洲语言对口型 70%） |
| 调色风格化 | 替换 LUT（不改像素结构） | 高 |
| 替换背景 | 替换（RVM 抠像 + 背景合成） | 中（绿幕高，自然背景中等） |
| 时长压缩 | 替换（silence-cut + 重要性打分） | 高 |
| 预告片选段 | 剪辑（基于报告 risk/action/audio_mood 信号） | 高 |
| 高光合集 | 剪辑（基于报告 CP/情绪/动作信号） | 高 |
| **风格化重生成（→动漫/动物拟人）** | **重生成**（AnimateDiff + LoRA） | **demo 级，UI 强制标"概念演示"** |

**选菜界面核心交互**：
- 浏览报告时随手"+ 改造"按钮加入修改单（购物车式）
- 修改单支持嵌套条件（"角色 A 在白天场景的红色服装→蓝色"）
- 任务依赖 DAG 自动推导（先换脸→再换体型→再换服装→C2PA 签名）
- 批量执行 50 个修改点 + 失败重试 + 版本树管理

### 强制合规基建（compliance-c2pa capability，新增）

- **C2PA 双标识**（c2pa-rs Rust + napi-rs）：显式水印 + BMFF uuid + 频域水印（DCT），UI 不可关闭
- **算法备案**（beian.cac.gov.cn）：Koma 作为深度合成"技术支持者"
- **客户 KYC**：广电制作经营许可证 + 法人 + 影视项目备案号
- **名单审核**：央政治局 + 国务院 + 已封艺人 + 港澳台敏感名单 + 未成年人脸（阿里云内容安全 API）
- **审计哈希链**（5 年保留）
- **30 天销毁**（脸库 / LoRA / 中间模型 + 第三方公证）
- **客户合同 8 条硬条款**（缺一不接）

### 公司治理 / 风险隔离

- **SPV 隔离**：换脸 / 体型 / 服装 / IP 迁移业务剥离至独立 SPV（Koma Vision Ltd.）
- **License 强绑定**：私有化客户机器硬件指纹 + 企业账号
- **危机预案**：3 套媒体公关模板预签字

### 私有化部署

| 档位 | 客户硬件 | 适用场景 | 客户采购 |
|---|---|---|---|
| 基础版 | RTX 4090 ×4 工作站 | 报告独立 + 基础修改 | 50-70 万 |
| 专业版 | H100 80G ×4 + A100 ×4 | + 工业级换脸 + 多语言 + 横竖屏 | 350-450 万 |
| 旗舰版 | H100 ×8 + A100 ×8 | + 体型/服装/IP 迁移 | 700-900 万 |

## Impact

### 新增 specs
- `video-diagnostic-report`（12+ 维度解析 capability）
- `modification-workbench`（选菜式修改 + 7 个 pipeline 后端 capability）
- `media-pipeline-pro`（worker pool + hwaccel + GPU 调度 + 向量库）
- `compliance-c2pa`（C2PA + KYC + 审计 + 销毁 + SPV）

### 修改 specs
- `electron-integration`（preload bridge 新增 12 维 + 修改 IPC；GPU 调度；私有化 profile）

### 新增代码
- `electron/service/analysis/`：12 维度独立 service + 4 个 provider（local-ffmpeg / aliyun-runvideoanalysis / doubao-vision / gemini-video）
- `electron/service/modification/`：planExecutor + 7 个 pipeline stage（face-swap / body-reshape / wardrobe / aspect-ratio / language-dub / stylization / cuts）
- `electron/service/recreation/`（原 7 场景 service）**降级为 modification stages**
- `electron/service/compliance/`：c2patool napi-rs + KYC + 名单同步 + 审计 + 销毁
- `electron/service/enterprise/`：License + Profile + 硬件指纹
- 前端：`frontend/src/diagnostic/`（报告浏览） + `frontend/src/modification/`（选菜界面） + `frontend/src/asset-vault/`（物料版本树）

### 修改代码
- `electron/service/tasks/TaskService.ts`：并发 4→32 + GpuTaskQueue
- `electron/service/ffmpeg.ts`：hwaccel + proxy + 进度上报
- `electron/service/storage/`：写串行化 + 向量库（pgvector / sqlite-vss）
- 12 个新数据模型（DiagnosticReport / Character / Scene / Shot / ScriptLine / Wardrobe / Action / Lighting / OnScreenText / MusicSegment / RiskMark / ModificationFeasibility）
- 7 个修改模型（ModificationPlan / FaceSwapItem / BodyReshapeItem / WardrobeItem / AspectRatioItem / LanguageDubItem / StylizationItem）

### 新增依赖
- `c2pa-rs` + napi-rs（C2PA 签名）
- `onnxruntime-node`（InsightFace + LivePortrait + GFPGAN + CLIP + RT-DETR）
- Python 边车（WhisperX / Demucs / SAM2 / VideoMAE / PaddleOCR / IOPaint / DeepFaceLab）
- 阿里云内容安全 SDK
- 阿里百炼 / 火山方舟 / Gemini Video API（云端 fallback）
- **InsightFace 商业授权**（M0 必须发起，预算万美元级）

### 团队规模与周期
- **30-35 人**：8 算法 + 4 前端 + 3 平台/DevOps + 3 SRE + 4 QC + 3 PM + 5 销售/法务/客户成功 + 2 PR/合规
- **14-16 个月**：
  - M0 (2 月) 基建 + 算法备案 + InsightFace 授权
  - M1 (4-5 月) **诊断报告独立产品** 上线（M1.1-M1.4）
  - M2 (3-4 月) 选菜界面 + 第一个修改 pipeline（换脸 Lite）+ 横竖屏
  - M3 (6-9 月) 扩充：多语言 → 服装 → 体型 → 风格化 demo → OCR 替换

### 一次性运维
- ed25519 keypair 已生成（复用 release-signing）
- 阿里云内容安全 SDK 接入
- 算法备案启动（10 工作日初审）
- SPV 法律实体注册（Koma Vision Ltd.）
- 保险洽谈（网络安全综合责任险 + 专业责任险）
- InsightFace 商业授权采购

## Non-goals

- ❌ 协作 Web 端（保留桌面架构）
- ❌ 自研基础大模型
- ❌ NLE 替代（保留 Premiere/DaVinci/Avid 互通定位）
- ❌ C 端公开销售（仅 B 端 + 企业 KYC）
- ❌ 主演正面特写换脸 95% SLA（实际 90-94%，剩余 6-10% 走 VFX 补拍）
- ❌ 真人→全四足动物（仅做拟人化站立穿衣造型）
- ❌ 整集 45 分钟全自动动漫化（仅 LoRA + Wan-Animate 半自动 55-70%）
- ❌ "诊断报告"宣称的准确率 > 95%（实际工业目标 12 维联合 80-85%）

## Risks（来自 R3-D + R4-D 累积警告）

**P0（致命）**：
1. 视频解析 12 维联合准确率天花板（独立假设 0.95^12 = 54%）
2. 阿里 / 火山 / Gemini 视频理解 API 价格战（字节正在补贴）
3. 监管约谈 / 责令停业（深度合成规定 + AI 标识办法 + 广电 AI 魔改治理）
4. 影视行业 2026 票房腰斩 51.29%，回款周期延长

**P1（高）**：
5. 客户法务撕碎合同保护伞（SLA / 模型归属 / 责任险）
6. 团队核心算法 lead 被通义/可灵挖角
7. POC 客户拿不出 60-90 分钟训练视频
8. Twelve Labs（最接近对标）ARR 只有 420 万美元（SaaS 健康线之下）
9. Filmustage（同类拆解工具）客户反馈"编辑 AI 输出比手工做还累"

**P2（中）**：
10. 私有化设备成本超预算（H100 价格上涨 20-30%）
11. Wan2.2-Animate 工业一致性边界（长剧跨集风格漂移）
12. C2PA 平台对接延迟（抖音/B站/爱优腾接口实施）

详细死亡时间表见 `docs/strategy/r1-r4-decision-reference.md` 第七节。

## Constraints

1. **基于现有 Koma Electron + ee-core + SQLite + ffmpeg 架构扩展**
2. **第三方 API 全部 BYOL**：HeyGen/Sync.so/ElevenLabs/Topaz/火山/阿里 等
3. **法务由影视公司自负**（已锁死），但 Koma 必须做工具方"未尽审核义务"兜底
4. **诊断报告 12 维联合准确率工业目标 80-85%**（非 95%）
5. **特写换脸一次过审 90-94%**（剩余走 VFX 补拍）
6. **风格化重生成 UI 强制标"概念演示"**
7. **企业级 KYC + 算法备案是开通修改功能的前置**
8. **InsightFace 商业授权必须在 M0 完成**（否则人物维度无法商用）
