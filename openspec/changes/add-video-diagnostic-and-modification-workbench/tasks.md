# Tasks: 视频诊断报告 + 选菜式修改工作台

> 14-16 月路线图。每月伴随：回归测试 / C2PA 抽测 / 审计校验 / 公关预案演练（不重复列出）。

## Phase M0 (30 天)：基建月

### 0.1 法务 / 商务 / 合规启动
- [ ] 0.1.1 算法备案：提交《算法自评估报告》至 beian.cac.gov.cn（10 工作日初审）
- [ ] 0.1.2 SPV 注册：Koma Vision Ltd.
- [ ] 0.1.3 保险洽谈：网络安全 + 专业责任险（年保费 20-30 万）
- [ ] 0.1.4 客户合同 8 条模板法务过稿
- [ ] 0.1.5 **InsightFace 商业授权采购**（4-8 周，必须 day 1 启动）
- [ ] 0.1.6 阿里云内容安全 SDK 账号 + AK/SK

### 0.2 TaskService 双层 + GpuTaskQueue
- [ ] 0.2.1 并发 4 → 32
- [ ] 0.2.2 child_process worker pool + worker-protocol
- [ ] 0.2.3 GPU 设备探测 + LRU 模型驱逐 + 优先级抢占
- [ ] 0.2.4 中断 + 续跑（checkpoint）
- [ ] 0.2.5 1000 task 30 分钟完成率 ≥ 99% 压测

### 0.3 FFmpeg hwaccel + Proxy
- [ ] 0.3.1 hwaccel 自动检测（mac=videotoolbox / win=nvenc/qsv / linux=vaapi）
- [ ] 0.3.2 ProRes → H.264 1080p 加速 ≥ 5×
- [ ] 0.3.3 ProxyMediaService：1080p H.264 代理 + 关键帧 webp
- [ ] 0.3.4 80GB ProRes 不阻塞 UI（30fps+）

### 0.4 SQLite 写串行化 + Postgres CDC
- [ ] 0.4.1 WriteSerializer
- [ ] 0.4.2 各 repo 接入
- [ ] 0.4.3 50 万 shot 压测不爆 SQLITE_BUSY
- [ ] 0.4.4 Postgres 只读镜像 CDC

### 0.5 模型分发器
- [ ] 0.5.1 模型清单 + sha256 + ed25519 签名
- [ ] 0.5.2 分块下载 + 续传 + 校验
- [ ] 0.5.3 U 盘镜像支持（私有化客户）

## Phase M1 (4-5 月)：诊断报告独立产品

### 1.1 4 维度先上（人物 / 镜头 / 台词 / OCR）
- [ ] 1.1.1 SCRFD-10G + ArcFace ONNX 集成
- [ ] 1.1.2 HDBSCAN 跨镜头聚类
- [ ] 1.1.3 TransNetV2 镜头分割
- [ ] 1.1.4 景别分类 + 摄影机运动（光流）
- [ ] 1.1.5 WhisperX + pyannote 边车
- [ ] 1.1.6 PaddleOCR Node binding
- [ ] 1.1.7 DiagnosticReport schema + ed25519 签名
- [ ] 1.1.8 报告浏览 UI（4 维度页面）

### 1.2 4 维度补全（场景 / 服装 / 动作 / 音乐）
- [ ] 1.2.1 OpenCLIP + SAM2.1 场景分类
- [ ] 1.2.2 RT-DETR-L 服装识别（替代 YOLOv8 AGPL）
- [ ] 1.2.3 VideoMAE V2 动作识别（MMAction2）
- [ ] 1.2.4 Demucs + LibROSA + CLAP-LAION 音乐
- [ ] 1.2.5 修改可行性预评估（K 维度）
- [ ] 1.2.6 8 维度报告浏览 UI

### 1.3 收尾 + 云端 fallback + Mac 调优
- [ ] 1.3.1 光照（G）+ 风险（J）维度
- [ ] 1.3.2 VideoAnalysisProvider 抽象 + 4 个云端 fallback（阿里 / 火山 / Gemini / Doubao）
- [ ] 1.3.3 Mac 性能调优（CoreML EP + MPS）
- [ ] 1.3.4 增量解析（用户中途加新维度）
- [ ] 1.3.5 跨剧检索（向量库）

### 1.4 报告产品化
- [ ] 1.4.1 JSON / Excel / Web 可视化 / PDF 四种导出
- [ ] 1.4.2 C2PA Manifest 嵌入报告签名
- [ ] 1.4.3 报告分享链接 + 水印
- [ ] 1.4.4 试用客户 onboarding
- [ ] 1.4.5 定价上线：¥99-299/部 + 企业 ¥30 万/年

**M1 验收**：8 维度可用，3 家试点客户购买报告，月营收 ≥ ¥5 万。

## Phase M2 (3-4 月)：选菜界面 + 首批修改

### 2.1 选菜界面 + 修改单
- [ ] 2.1.1 ModificationPlan schema + DAG 推导
- [ ] 2.1.2 `<ModificationCartView>` 主页面
- [ ] 2.1.3 浏览报告时随手 + 改造（购物车式）
- [ ] 2.1.4 嵌套条件 `<ConditionBuilder>`（角色 AND 服装 AND 场景）
- [ ] 2.1.5 估价 + 估时 实时计算
- [ ] 2.1.6 版本树 SQLite（source_media 加 parent_id）

### 2.2 换脸 Lite（中景以上）
- [ ] 2.2.1 InSwapper-128 ONNX + GFPGAN
- [ ] 2.2.2 face.swap.render task + 自动 QC（ArcFace 相似度 + SSIM）
- [ ] 2.2.3 QC Workbench UI（三栏对比 + 置信度热力图）
- [ ] 2.2.4 人工 QC 强制（UI 无法跳过）
- [ ] 2.2.5 客户报价：80-150 万/部

### 2.3 横竖屏适配
- [ ] 2.3.1 8 平台 ReleaseSpec 预设
- [ ] 2.3.2 主体跟踪 + reframe + 字幕重排
- [ ] 2.3.3 audio loudnorm（YT/TikTok -14 / Douyin -16）
- [ ] 2.3.4 AspectAdaptService + Studio UI
- [ ] 2.3.5 性能：1 集 24 分钟 → 8 平台 ≤ 8 分钟

### 2.4 C2PA 全链路 + KYC + 名单审核
- [ ] 2.4.1 c2pa-rs + napi-rs binding
- [ ] 2.4.2 显式水印（drawtext 角标 + 片头白板 + 字幕轨）
- [ ] 2.4.3 隐式标识（BMFF uuid + DCT 频域）
- [ ] 2.4.4 三层水印 UI 不可关闭
- [ ] 2.4.5 阿里云内容安全 API 集成
- [ ] 2.4.6 名单库每周同步（央政治局 + 国务院 + 已封艺人 + 港澳台）
- [ ] 2.4.7 未成年人脸检测（年龄 < 20 拒绝）
- [ ] 2.4.8 客户 KYC：广电制作经营许可证 + 法人 + 项目备案号

**M2 验收**：选菜界面 + 换脸 Lite + 横竖屏 + C2PA 全链路，第一家影视公司 KA 签约。

## Phase M3 (6-9 月)：扩充菜式

### 3.1 多语言本地化
- [ ] 3.1.1 align provider（Sync.so + HeyGen）
- [ ] 3.1.2 dub provider（ElevenLabs / Deepdub / 火山 / 阿里 CosyVoice）
- [ ] 3.1.3 audio.source-separation（Demucs 边车）
- [ ] 3.1.4 audio.stt（WhisperX）
- [ ] 3.1.5 LocaleTrack 数据模型
- [ ] 3.1.6 onscreen.text-detect / inpaint（PaddleOCR + IOPaint）
- [ ] 3.1.7 LocalizationWorkbench UI（双栏 + 嘴型预览 + 屏显标记）
- [ ] 3.1.8 人工译审硬约束

### 3.2 服装替换
- [ ] 3.2.1 IDM-VTON SDXL 集成
- [ ] 3.2.2 SAM2 视频分割衣服
- [ ] 3.2.3 Wan-Animate 关键帧传播
- [ ] 3.2.4 时序去闪
- [ ] 3.2.5 报价：120-200 万/集

### 3.3 体型替换（静态 / 半身）
- [ ] 3.3.1 Wan2.2-Animate 14B 集成（BF16，H100 80G）
- [ ] 3.3.2 IPAdapter 锁脸 / 锁服
- [ ] 3.3.3 UI 拒绝动态打戏
- [ ] 3.3.4 报价：30-50 万/集

### 3.4 换脸 Pro（DeepFaceLab）
- [ ] 3.4.1 DFL CLI 边车 + Python 运行时
- [ ] 3.4.2 SAEHD 512/768 训练 task
- [ ] 3.4.3 特写镜头逐镜 fine-tune
- [ ] 3.4.4 LivePortrait + GFPGAN + HiFiVFS ensemble
- [ ] 3.4.5 时序去抖（EbSynth / PRAFT）
- [ ] 3.4.6 自动风险标记 + senior 双人复核
- [ ] 3.4.7 合同保护伞条款
- [ ] 3.4.8 SLA：特写 90-94% / 中景 90% / 远景 85%
- [ ] 3.4.9 报价：300-1100 万/部

### 3.5 风格化 demo（→动漫/拟人化动物）
- [ ] 3.5.1 LoRA 训练 pipeline（角色 / 场景 / 风格）
- [ ] 3.5.2 Wan2.2-Animate Character Replacement
- [ ] 3.5.3 ControlNet DWPose + Depth
- [ ] 3.5.4 关键帧绘师 panel
- [ ] 3.5.5 IPTransferJob ≤ 5 分钟硬上限
- [ ] 3.5.6 UI 强制标"概念演示"
- [ ] 3.5.7 报价：220-320 万/集（半自动）

### 3.6 SPV 隔离 + 私有化打包
- [ ] 3.6.1 SPV 业务剥离（高风险业务到 Koma Vision Ltd.）
- [ ] 3.6.2 License 文件 + 硬件指纹
- [ ] 3.6.3 AirGapMode（禁用外网 + 本地 HSM）
- [ ] 3.6.4 三档客户硬件套件（基础 / 专业 / 旗舰）
- [ ] 3.6.5 模型分发（U 盘镜像 / 客户内网 mirror）
- [ ] 3.6.6 LTS 分支 18 月支持

### 3.7 SLA 调优 + 监控埋点
- [ ] 3.7.1 月度 SLA 报告
- [ ] 3.7.2 Provider 失败率 > 5% 自动报警
- [ ] 3.7.3 审计哈希链 5 年保留
- [ ] 3.7.4 销毁 worker（30 天 + 联盟链）
- [ ] 3.7.5 算法备案最终通过 + 公示

**M3 验收**：7 个修改 pipeline 全部上线，3-5 家影视公司 KA 私有化部署。

## Phase M4 (持续)：运维

- [ ] M4.1 每月回归测试（每场景 ≥ 3 部新样片）
- [ ] M4.2 每月 SLA 报告 + 客户对账
- [ ] M4.3 Provider 价格波动监控
- [ ] M4.4 Bug 修复 SLA：P0 4h / P1 24h / P2 7 天
- [ ] M4.5 算法备案二代准备
- [ ] M4.6 团队扩张到 50+ 人（若顺利）

## 关键依赖

- **InsightFace 商业授权**（M0 必须完成）
- **阿里云内容安全 API**（KYC + 名单），月费 3-8 万
- **保险**：网络安全 + 专业责任险，年费 20-30 万
- **客户 BYOL**：HeyGen / Sync.so / ElevenLabs / Topaz / 火山 / 阿里 等

## 何时降级（应急路径）

详见 design.md 第 13 节。
