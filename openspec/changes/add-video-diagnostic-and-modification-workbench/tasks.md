# Tasks: 视频诊断报告 + 选菜式修改工作台（纯工具版）

> 10-12 月路线图。**所有合规 / 法务 / 财务 / 安全 task 已删除**（客户自负）。

## Phase M0 (15 天)：基建月

### 0.1 TaskService 双层 + GpuTaskQueue
- [ ] 0.1.1 并发 4 → 32（p-queue 改造）
- [ ] 0.1.2 child_process worker pool + worker-protocol
- [ ] 0.1.3 GPU 设备探测 + LRU 模型驱逐 + 优先级抢占
- [ ] 0.1.4 中断 + 续跑（checkpoint）
- [ ] 0.1.5 1000 task 30 分钟完成率 ≥ 99% 压测

### 0.2 FFmpeg hwaccel + Proxy
- [ ] 0.2.1 hwaccel 自动检测（mac=videotoolbox / win=nvenc/qsv / linux=vaapi）
- [ ] 0.2.2 ProRes → H.264 1080p 加速 ≥ 5×
- [ ] 0.2.3 ProxyMediaService：1080p H.264 代理 + 关键帧 webp
- [ ] 0.2.4 80GB ProRes 不阻塞 UI（30fps+）

### 0.3 SQLite 写串行化 + 向量库
- [ ] 0.3.1 WriteSerializer + repo 接入
- [ ] 0.3.2 50 万 shot 压测不爆 SQLITE_BUSY
- [ ] 0.3.3 pgvector / sqlite-vss 向量库选型与接入
- [ ] 0.3.4 ArcFace embedding 跨项目索引

### 0.4 模型分发器
- [ ] 0.4.1 模型清单 + sha256（不要求 ed25519 签名，客户自处理完整性）
- [ ] 0.4.2 分块下载 + 续传
- [ ] 0.4.3 U 盘镜像支持（私有化客户）

**M0 验收**：80GB ProRes 抽帧不阻塞 UI + 1000 task 并发 32 + 50 万 shot 不爆库。

## Phase M1 (4 个月)：诊断报告独立产品

### 1.1 4 维度先上（人物 / 镜头 / 台词 / OCR）
- [ ] 1.1.1 InsightFace SCRFD-10G ONNX 集成（检测，代码 MIT 可用）
- [ ] 1.1.2 **AuraFace 或 buffalo_l Apache fork 集成**（替代 InsightFace 商业 ArcFace）
- [ ] 1.1.3 HDBSCAN 跨镜头聚类
- [ ] 1.1.4 TransNetV2 镜头分割
- [ ] 1.1.5 景别分类 + 摄影机运动（光流）
- [ ] 1.1.6 WhisperX + pyannote 边车
- [ ] 1.1.7 PaddleOCR Node binding
- [ ] 1.1.8 DiagnosticReport schema（无 signature 字段）
- [ ] 1.1.9 报告浏览 UI（4 维度页面）

### 1.2 4 维度补全（场景 / 服装 / 动作 / 音乐）
- [ ] 1.2.1 OpenCLIP + SAM2.1 场景分类
- [ ] 1.2.2 RT-DETR-L 服装识别（替代 YOLOv8 AGPL）
- [ ] 1.2.3 VideoMAE V2 动作识别（MMAction2）
- [ ] 1.2.4 Demucs + LibROSA + CLAP-LAION 音乐
- [ ] 1.2.5 修改可行性预评估（K 维度）
- [ ] 1.2.6 8 维度报告浏览 UI

### 1.3 收尾 + 云端 fallback + Mac 调优
- [ ] 1.3.1 光照（G）+ 风险（J）维度
- [ ] 1.3.2 VideoAnalysisProvider 抽象 + 4 个云端 fallback（阿里 / 火山 / Gemini / Doubao），全 BYOL
- [ ] 1.3.3 Mac 性能调优（CoreML EP + MPS）
- [ ] 1.3.4 增量解析
- [ ] 1.3.5 跨剧检索

### 1.4 报告产品化
- [ ] 1.4.1 JSON / Excel / Web 可视化 / PDF 四种导出
- [ ] 1.4.2 报告分享链接（带防盗水印图层，不带 C2PA）
- [ ] 1.4.3 试用客户 onboarding
- [ ] 1.4.4 定价上线：¥99-299/部 + 企业 ¥30 万/年

**M1 验收**：8 维度报告可售，3 家试点客户购买。

## Phase M2 (3 个月)：选菜界面 + 首批修改

### 2.1 选菜界面
- [ ] 2.1.1 ModificationPlan schema + DAG 推导
- [ ] 2.1.2 `<ModificationCartView>` 主页面
- [ ] 2.1.3 浏览报告时随手 + 改造（购物车式）
- [ ] 2.1.4 嵌套条件 `<ConditionBuilder>`
- [ ] 2.1.5 估价 + 估时实时计算
- [ ] 2.1.6 版本树 SQLite

### 2.2 换脸 Lite（可商用替代品）
- [ ] 2.2.1 **SimSwap 或 Roop-Unleashed fork ONNX 集成**（替代 InSwapper 商业权重）
- [ ] 2.2.2 GFPGAN v1.4 后处理
- [ ] 2.2.3 face.swap.render task + 自动 QC（embedding 相似度 + SSIM）
- [ ] 2.2.4 QC Workbench UI（三栏对比 + 置信度热力图）
- [ ] 2.2.5 客户决定是否强制人工 QC（默认开启可关闭）
- [ ] 2.2.6 单部 45 分钟 ≤ 48 小时

### 2.3 横竖屏适配
- [ ] 2.3.1 8 平台 ReleaseSpec 预设
- [ ] 2.3.2 主体跟踪 + reframe + 字幕重排
- [ ] 2.3.3 audio loudnorm
- [ ] 2.3.4 AspectAdaptService + Studio UI
- [ ] 2.3.5 性能：1 集 24 分钟 → 8 平台 ≤ 8 分钟

**M2 验收**：选菜界面 + 换脸 Lite + 横竖屏，端到端可用。

## Phase M3 (4-5 个月)：扩充菜式

### 3.1 多语言本地化
- [ ] 3.1.1 align provider（Sync.so + HeyGen，BYOL）
- [ ] 3.1.2 dub provider（ElevenLabs / Deepdub / 火山 / 阿里，BYOL）
- [ ] 3.1.3 audio.source-separation（Demucs 边车）
- [ ] 3.1.4 audio.stt（WhisperX）
- [ ] 3.1.5 LocaleTrack 数据模型
- [ ] 3.1.6 onscreen.text-detect / inpaint（PaddleOCR + IOPaint）
- [ ] 3.1.7 LocalizationWorkbench UI
- [ ] 3.1.8 人工译审流程（客户决定是否强制）

### 3.2 服装替换
- [ ] 3.2.1 IDM-VTON SDXL 集成
- [ ] 3.2.2 SAM2 视频分割
- [ ] 3.2.3 Wan-Animate 关键帧传播
- [ ] 3.2.4 时序去闪

### 3.3 体型替换（静态 / 半身）
- [ ] 3.3.1 Wan2.2-Animate 14B 集成
- [ ] 3.3.2 IPAdapter 锁脸 / 锁服
- [ ] 3.3.3 UI 拒绝动态打戏

### 3.4 换脸 Pro（DeepFaceLab）
- [ ] 3.4.1 DFL CLI 边车 + Python 运行时
- [ ] 3.4.2 SAEHD 512/768 训练 task
- [ ] 3.4.3 特写镜头逐镜 fine-tune
- [ ] 3.4.4 LivePortrait + GFPGAN ensemble
- [ ] 3.4.5 时序去抖（EbSynth / PRAFT）

### 3.5 风格化 demo
- [ ] 3.5.1 LoRA 训练 pipeline
- [ ] 3.5.2 Wan2.2-Animate Character Replacement
- [ ] 3.5.3 ControlNet DWPose + Depth
- [ ] 3.5.4 关键帧绘师 panel
- [ ] 3.5.5 IPTransferJob ≤ 5 分钟硬上限
- [ ] 3.5.6 UI 文案标"概念演示"（信息提示，非水印强制）

### 3.6 私有化打包（仅技术）
- [ ] 3.6.1 License + 硬件指纹（防盗版，非合规审计）
- [ ] 3.6.2 模型分发（U 盘镜像 / 客户内网 mirror）
- [ ] 3.6.3 LTS 分支 18 月支持
- [ ] 3.6.4 客户决定是否启用离线模式（不强制 AirGap）

**M3 验收**：7 个修改 pipeline 全部上线 + 私有化可部署。

## Phase M4+：运维

- [ ] M4.1 每月回归测试（每场景 ≥ 3 部新样片）
- [ ] M4.2 每月技术 SLA 报告（仅性能指标，无合规指标）
- [ ] M4.3 Provider 价格波动监控
- [ ] M4.4 Bug 修复 SLA：P0 4h / P1 24h / P2 7 天

## 关键依赖

- **客户 BYOL API key**：HeyGen / Sync.so / ElevenLabs / 阿里 / 火山 等
- **客户提供 GPU 集群**（私有化客户）
- **客户自行处理**：算法备案 / KYC / C2PA / 销毁 / 保险 / 监管应对

## 已删除（相比 R4 早期版本）

- ~~InsightFace 商业授权采购~~
- ~~算法备案启动~~
- ~~SPV 注册~~
- ~~保险洽谈~~
- ~~阿里云内容安全 API（KYC / 名单）~~
- ~~媒体公关 3 套模板~~
- ~~客户合同 8 条法务过稿~~
- ~~C2PA 全链路（c2patool + 频域水印 + UI 不可关闭）~~
- ~~30 天销毁 worker + 联盟链上链~~
- ~~审计哈希链~~
- ~~T+0/T+1周/T+1月/T+3月 最坏情况预案~~
