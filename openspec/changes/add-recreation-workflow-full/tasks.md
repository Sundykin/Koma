# Tasks: 二创工作流完整工业版本（7 场景 / 14-16 月）

> 本任务清单基于 `proposal.md` + `design.md`，按 M0-M16 拆分。每月伴随：回归测试 / C2PA 抽测 / 审计校验 / 公关预案演练（不重复列出）。

---

## Phase M0-M1 (2 个月)：基建月

### 0.1 算法备案 + 法务结构
- [ ] 0.1.1 提交《算法自评估报告》至 `beian.cac.gov.cn`，预计 10 工作日初审
- [ ] 0.1.2 注册 SPV：Koma Vision Ltd.（高风险业务剥离主体）
- [ ] 0.1.3 启动保险洽谈：网络安全综合责任险 + 专业责任险（年保费 20-30 万 / 500 万保额）
- [ ] 0.1.4 客户合同 8 条模板法务过稿 + Notion 应急仓库

### 0.2 TaskService 双层扩展
- [ ] 0.2.1 并发 4 → 32（p-queue 改造，~50 行）
- [ ] 0.2.2 新建 `electron/service/media-pipeline/worker/worker-protocol.ts`
- [ ] 0.2.3 新建 `WorkerPool`：CPU/2 + GPU 独占 worker
- [ ] 0.2.4 新建 `ffmpeg-worker.ts` 子进程入口
- [ ] 0.2.5 改 `TaskRunner.ts`：按 task.kind 路由
- [ ] 0.2.6 1000 task 压测 30 分钟完成率 ≥ 99%

### 0.3 FFmpeg hwaccel + Proxy
- [ ] 0.3.1 启动时探测 hwaccel（mac=videotoolbox / win=nvenc/qsv / linux=vaapi）
- [ ] 0.3.2 ffmpeg 命令自动注入 hwaccel 参数
- [ ] 0.3.3 ProRes → H.264 1080p 加速 ≥ 5×（实测）
- [ ] 0.3.4 ProxyMediaService：1080p H.264 代理 + 关键帧 webp
- [ ] 0.3.5 80GB ProRes 抽帧不阻塞 UI（操作流畅度 ≥ 30fps）

### 0.4 SQLite 写串行化 + Postgres CDC
- [ ] 0.4.1 WriteSerializer 单 worker 串行
- [ ] 0.4.2 各 repo 写方法接入 WriteSerializer
- [ ] 0.4.3 50 万 shot 压测不爆 SQLITE_BUSY
- [ ] 0.4.4 Postgres 只读镜像 CDC（企业版可选）

### 0.5 GpuTaskQueue
- [ ] 0.5.1 设备发现 + VRAM 探测
- [ ] 0.5.2 模型预热池（InSwapper / SCRFD / ArcFace / GFPGAN 常驻）
- [ ] 0.5.3 LRU 模型驱逐
- [ ] 0.5.4 优先级抢占（preview < review < master）

---

## Phase M2 (1 月)：S1 预告片

- [ ] M2.1 视觉理解 provider 抽象扩展（LLM 加 videoInput 字段）
- [ ] M2.2 接入阿里百炼 RunVideoAnalysis（主选）
- [ ] M2.3 接入火山方舟视频理解（备用）
- [ ] M2.4 接入 Gemini 2.x video（海外）
- [ ] M2.5 `video.shotsplit` task：PySceneDetect 边车
- [ ] M2.6 备用：TransNetV2 ONNX
- [ ] M2.7 ShotSegment 自动 tag（动作 / 情绪 / 角色）
- [ ] M2.8 CutPlan 数据模型 + LLM 选片模板（悬念 / 爆点 / 角色弧）
- [ ] M2.9 30/60/90 时长自适应派生
- [ ] M2.10 TrailerCutService 编排
- [ ] M2.11 与现有 storyboard 集成 + 节奏分析侧边面板
- [ ] M2.12 controller/recreation.ts trailer IPC
- [ ] M2.13 客户验收：3 部样片盲测 ≥ 70% 满意度

---

## Phase M3 (1 月)：S2 横竖屏

- [ ] M3.1 ReleaseSpec / ExportPreset 数据模型
- [ ] M3.2 预置 8 个主流平台模板（抖音 / 快手 / 小红书 / B 站 / 视频号 / Twitter / YT Shorts / TikTok）
- [ ] M3.3 接入 MediaPipe / YOLO 本地推理（onnxruntime-node）
- [ ] M3.4 reframe 算法：横→竖智能裁切，主体居中
- [ ] M3.5 字幕重排：竖版字幕避开 UI 安全区
- [ ] M3.6 UI：主体跟随框预览 + 用户手动微调
- [ ] M3.7 `audio.loudnorm` task：ffmpeg loudnorm 双 pass
- [ ] M3.8 AspectAdaptService + AspectAdaptStudio UI
- [ ] M3.9 8 平台版本一键派生 + 单失败可重试
- [ ] M3.10 DeliveryLog 表
- [ ] M3.11 性能：1 集 24 分钟 → 8 平台 ≤ 8 分钟

---

## Phase M4 (1 月)：S3 多语言

- [ ] M4.1 `align` provider kind 抽象（嘴型对齐）
- [ ] M4.2 接入 Sync.so lipsync-2-pro（主选）+ HeyGen（备用）
- [ ] M4.3 `dub` 扩展为含克隆音色：ElevenLabs / Deepdub / 火山豆包 / 阿里 CosyVoice
- [ ] M4.4 `audio.source-separation` task：Demucs 边车
- [ ] M4.5 `audio.stt` task：WhisperX 边车 + 火山 + 阿里 ASR
- [ ] M4.6 LocaleTrack 数据模型 + segments / onScreenTextOverrides
- [ ] M4.7 `onscreen.text-detect` task：PaddleOCR Node.js
- [ ] M4.8 `onscreen.text-inpaint` task：IOPaint LaMa
- [ ] M4.9 `subtitle.burn` / `subtitle.export` task
- [ ] M4.10 LocalizationWorkbench UI：双栏 + 嘴型预览 + 屏显标记
- [ ] M4.11 **人工译审硬约束**（UI 无法跳过）
- [ ] M4.12 LocalizationService 编排
- [ ] M4.13 性能：1 集 45 分钟 → 单语种 ≤ 25 分钟

---

## Phase M5 (1 月)：S4 Crisis Lite + C2PA 全链路

### 5.1 S4 Crisis Lite（48h 救火，中景以上）
- [ ] M5.1.1 face-detect / face-align / face-embed task（InsightFace SCRFD + ArcFace ONNX）
- [ ] M5.1.2 face-cluster task（HDBSCAN）
- [ ] M5.1.3 FaceIdentity / SourceActor 数据模型 + repo
- [ ] M5.1.4 SwapPlan 数据模型 + 状态机
- [ ] M5.1.5 InSwapper-128 ONNX 集成（onnxruntime-node）
- [ ] M5.1.6 face.swap.render task + GFPGAN 后处理
- [ ] M5.1.7 SwapResult + 自动 QC 指标（ArcFace 相似度 / 时序 SSIM）
- [ ] M5.1.8 QC Workbench UI（三栏对比 + 置信度热力图 + JKL 键盘）
- [ ] M5.1.9 **人工 QC 强制完成**才能导出（硬约束）
- [ ] M5.1.10 客户 Lite 报价：80-150 万/部

### 5.2 C2PA 全链路（强制）
- [ ] M5.2.1 引入 `c2pa-rs` Rust + napi-rs binding
- [ ] M5.2.2 c2patool 封装 `electron/service/compliance/c2patool.ts`
- [ ] M5.2.3 显式水印：FFmpeg drawtext 角标 + 片头 1.5s 白板 + 字幕轨
- [ ] M5.2.4 隐式标识：BMFF uuid box + C2PA Manifest
- [ ] M5.2.5 频域水印（invisible-watermark DCT）
- [ ] M5.2.6 客户子证书签发流程（复用 release-signing 公钥）
- [ ] M5.2.7 三层水印 UI 不可关闭（写死）
- [ ] M5.2.8 平台对接：抖音 / B 站 / 视频号 AIGC 接口

### 5.3 KYC + 名人脸审核
- [ ] M5.3.1 接入阿里云内容安全人脸识别 API
- [ ] M5.3.2 自建名单库：央政治局 + 国务院 + 已封艺人 + 港澳台名单
- [ ] M5.3.3 每周自动同步（人民日报 + 网信办通报 + 中演协）
- [ ] M5.3.4 未成年人脸检测（阿里云人脸属性，年龄 < 20 拒绝）
- [ ] M5.3.5 政治敏感人物名单实时同步
- [ ] M5.3.6 客户 KYC：广电制作许可证 + 法人 + 项目备案号校验

---

## Phase M6-M7 (2 月)：S4 Crisis Pro

### 6.1 DeepFaceLab 集成
- [ ] M6.1.1 DFL CLI 边车（Python 嵌入运行时）
- [ ] M6.1.2 DFL extractor：8000-15000 张训练集生成
- [ ] M6.1.3 DFL SAEHD 512 训练 task（GPU 独占）
- [ ] M6.1.4 DFL SAEHD 768 高阶训练 task
- [ ] M6.1.5 face.dfl.train 14-18 天独占 H100 ×4-8
- [ ] M6.1.6 模型 checkpoint（.dfm）持久化
- [ ] M6.1.7 镜头分级（远景/中景/近景/正面特写）自动分桶

### 6.2 逐镜微调 + 多模型 ensemble
- [ ] M6.2.1 特写镜头逐镜 fine-tune（5000-15000 步/shot）
- [ ] M6.2.2 LivePortrait 集成（FasterLivePortrait TRT）
- [ ] M6.2.3 GFPGAN v1.4 / CodeFormer 后处理
- [ ] M6.2.4 HiFiVFS face blending
- [ ] M6.2.5 时序去抖（EbSynth / PRAFT 光流）
- [ ] M6.2.6 三套模型 ensemble + senior 工程师双签

### 6.3 SLA 与合规
- [ ] M6.3.1 自动风险标记（特写比例 + 强光 + 侧脸角度 + 遮挡率 + 表情幅度）
- [ ] M6.3.2 风险分 > 70 强制 senior 双人复核
- [ ] M6.3.3 风险分 > 85 转 VFX 补拍流程
- [ ] M6.3.4 合同保护伞条款（特写 4s+ / 强逆光 / 侧脸 >45° / 遮挡 >20% / 强表演 不兜底）
- [ ] M6.3.5 SLA：特写 90-94% / 中景 90% / 远景 85% 一次过审
- [ ] M6.3.6 客户 Pro 报价：300-1100 万/部
- [ ] M6.3.7 客户验收：2 部样片 30s+ 正面特写盲测扛 4K 院线

---

## Phase M8 (1 月)：S5 体型 + 服装替换

### 8.1 体型替换（静态 / 半身）
- [ ] M8.1.1 Wan2.2-Animate 14B 集成（BF16，H100 80G ×1）
- [ ] M8.1.2 IPAdapter 锁脸 / 锁服装
- [ ] M8.1.3 静态镜头自动可用率 70-80%
- [ ] M8.1.4 OmniHuman（字节）备用 provider
- [ ] M8.1.5 **拒绝动态打戏 / 快速运动镜头**（UI 拦截）
- [ ] M8.1.6 BodyOutfitPlan 数据模型 + 状态机
- [ ] M8.1.7 静态站立换体型 demo（30-50 万/集）

### 8.2 服装替换
- [ ] M8.2.1 IDM-VTON SDXL 集成（关键帧生成）
- [ ] M8.2.2 SAM2 视频分割衣服区域
- [ ] M8.2.3 Wan-Animate 关键帧传播
- [ ] M8.2.4 时序去闪
- [ ] M8.2.5 整集换主角服装 pipeline
- [ ] M8.2.6 单集 45 分钟换装：H100 ≈ 130h + QC 5 天
- [ ] M8.2.7 服装换装报价：120-200 万/集

---

## Phase M9-M10 (2 月)：S6 真人→动漫

### 9.1 LoRA 训练 + 注册
- [ ] M9.1.1 LoRAModel 数据模型 + repo
- [ ] M9.1.2 单角色 LoRA 训练 pipeline（kohya / diffusers）
- [ ] M9.1.3 4-8h/角色（4090）/ 1-2h（H100）
- [ ] M9.1.4 10 主角 + 20 配角 + 50 场景 LoRA 库
- [ ] M9.1.5 跨项目复用追踪 + 引用计数
- [ ] M9.1.6 单角色 LoRA 训练成本：1.5-2 万

### 9.2 Wan-Animate + ControlNet 联动
- [ ] M9.2.1 Wan2.2-Animate Character Replacement Mode 集成
- [ ] M9.2.2 ControlNet DWPose + Depth
- [ ] M9.2.3 SAM2 镜头分类（中远景/对话/特写/打戏）
- [ ] M9.2.4 中远景/对话：Wan-Animate + LoRA 自动
- [ ] M9.2.5 特写/打戏：导出关键帧 → 人工绘师补帧 → AnimateDiff 重插值

### 9.3 关键帧绘师 panel
- [ ] M9.3.1 桌面端绘师工作面板（关键帧逐帧编辑）
- [ ] M9.3.2 单帧导入导出
- [ ] M9.3.3 与 timeline 同步
- [ ] M9.3.4 PRAFT 光流对齐

### 9.4 IPTransferJob 数据模型 + 输出限制
- [ ] M9.4.1 状态机：draft → lora-training → rendering → manual-touch → qc → approved
- [ ] M9.4.2 **单次任务输出 ≤ 5 分钟硬上限**
- [ ] M9.4.3 单集 45 分钟半自动报价：220-320 万

---

## Phase M11 (1 月)：S7 真人→动物（拟人化）

- [ ] M11.1 拟人化动物角色 LoRA 库（兔/狐狸/熊等站立穿衣造型）
- [ ] M11.2 **拒绝四足全动物**（UI 拦截 + 文案说明）
- [ ] M11.3 5-30s 短镜头工业级 pipeline
- [ ] M11.4 营销片整片 30 镜配置
- [ ] M11.5 单镜头报价：1-3 万
- [ ] M11.6 营销片整片报价：30-90 万

---

## Phase M12 (1 月)：私有化部署

### 12.1 三档客户硬件套件
- [ ] M12.1.1 基础版：RTX 4090 ×4 工作站套件
- [ ] M12.1.2 专业版：H100 80G ×4 + A100 ×4 服务器
- [ ] M12.1.3 旗舰版：H100 ×8 + A100 ×8

### 12.2 License + 硬件指纹
- [ ] M12.2.1 License 文件 + 企业账号 + 硬件指纹三锁
- [ ] M12.2.2 离线激活流程
- [ ] M12.2.3 AirGapMode（禁用外网 + 本地 HSM）

### 12.3 模型分发
- [ ] M12.3.1 U 盘镜像（sha256 + ed25519 签名）
- [ ] M12.3.2 客户内网 mirror 协议
- [ ] M12.3.3 模型包总大小约 100 GB
- [ ] M12.3.4 分块下载 + 续传 + 校验

### 12.4 内网更新通道
- [ ] M12.4.1 不走 GitHub Releases
- [ ] M12.4.2 客户内部 HTTPS 静态服务器
- [ ] M12.4.3 LTS 分支 18 个月支持

---

## Phase M13-M14 (2 月)：SLA 调优 + 算法备案完成

### 13.1 监控埋点
- [ ] M13.1.1 每个 task 成功率 + P50/P95 延迟 + 月可用率
- [ ] M13.1.2 Provider 失败率 > 5% 自动报警
- [ ] M13.1.3 月度 SLA 报告生成

### 13.2 审计哈希链
- [ ] M13.2.1 AuditEvent 每条 ed25519 签名
- [ ] M13.2.2 链式 prevHash 防篡改
- [ ] M13.2.3 客户审计导出工具（CSV / JSONL + 公钥验证）
- [ ] M13.2.4 保留期 5 年（覆盖民事 / 行政追诉时效）

### 13.3 销毁 worker
- [ ] M13.3.1 30 天后自动销毁脸库 / LoRA / 中间模型
- [ ] M13.3.2 销毁回执（hash + 时间戳）
- [ ] M13.3.3 联盟链上链（阿里联盟链 / 蚂蚁链）
- [ ] M13.3.4 第三方公证可选（5000 元/次）

### 13.4 算法备案最终通过
- [ ] M13.4.1 监管补充材料提交
- [ ] M13.4.2 备案号公示在 koma.cn 显著位置
- [ ] M13.4.3 与平台 AIGC 通道完成对接（抖音 / B 站 / 爱优腾）

---

## Phase M15-M16 (2 月)：GA 上线 + 客户交付

### 15.1 GA 上线
- [ ] M15.1.1 全场景回归测试（每场景 ≥ 5 部新样片）
- [ ] M15.1.2 性能基线最终确认
- [ ] M15.1.3 用户文档 + SOP 完整版
- [ ] M15.1.4 培训视频系列

### 15.2 第一批客户交付
- [ ] M15.2.1 3-5 家头部影视公司 KA 私有化部署
- [ ] M15.2.2 第一批样片交付（每客户 ≥ 1 部全场景物料）
- [ ] M15.2.3 客户验收 + 尾款收款
- [ ] M15.2.4 续约谈判（年度框架合同）

### 15.3 监督预案演练
- [ ] M15.3.1 模拟监管约谈应对
- [ ] M15.3.2 模拟舆论二次发酵
- [ ] M15.3.3 模拟客户甩锅
- [ ] M15.3.4 SPV 切割演练

---

## 持续运维（M16+）

- [ ] 每月回归测试（每场景 ≥ 3 部新样片）
- [ ] 每月 SLA 报告 + 客户对账
- [ ] Provider 价格波动监控 + fallback 更新
- [ ] Bug 修复 SLA：P0 4 小时 / P1 24 小时 / P2 7 天
- [ ] 算法备案二代准备（2027 年中）
- [ ] 团队扩张：50+ 人（若顺利）

---

## 关键依赖（外部）

- **Apple Developer 证书**（mac 签名，与本 change 不冲突，可后期补）
- **客户 BYOL 许可**：HeyGen / Sync.so / ElevenLabs / Topaz / 火山 / 阿里 / Runway / 可灵
- **Python 边车环境**：Python 3.11 + PyTorch + onnxruntime + 各模型依赖；客户机器装 100 GB 模型 + 5 GB Python 环境
- **阿里云内容安全 API**（KYC + 名人脸 + 未成年人审核），月费 3-8 万
- **保险承保**：网络安全综合责任险 + 专业责任险，年费 20-30 万

---

## 不在本 change 范围内（明确）

- ❌ 协作 Web 端 / 云端 SaaS
- ❌ 自研基础大模型
- ❌ NLE 替代（保留 Premiere/DaVinci/Avid 互通定位）
- ❌ C 端公开销售
- ❌ 主演正面特写 95% SLA 承诺（实际 90-94%，剩余走 VFX 补拍）
- ❌ 真人→全四足动物（仅做拟人化站立穿衣造型）
- ❌ 整集 45 分钟全自动动漫化（仅做半自动 55-70%）
