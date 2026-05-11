# Tasks: 二创工作流三场景工业级实现

## Phase 0: 准备（实施开始前）

- [ ] 0.1 与影视公司客户对齐 3 场景验收指标（每场景至少 3 部样片盲测）
- [ ] 0.2 收集客户的 Topaz / HeyGen / Sync.so / ElevenLabs / 火山 / 阿里 等 API key（BYOL）
- [ ] 0.3 确认客户的母带规格（4K ProRes / 8K RAW / DPX 等），写入"支持规格白名单"
- [ ] 0.4 准备 5 部不同类型样片（短剧 / 剧集 / 综艺 / 电影预告 / 微短剧）用于回归测试集

---

## Phase M0 (30 天): 基建月

### TaskService 双层扩展

- [ ] M0.1 `electron/service/tasks/TaskService.ts`：并发上限 4 → 32（p-queue 配置 + 文档）
- [ ] M0.2 新建 `electron/service/media-pipeline/worker/worker-protocol.ts`：父子进程消息协议（dispatch / progress / result / error / abort）
- [ ] M0.3 新建 `electron/service/media-pipeline/worker/worker-pool.ts`：池管理（CPU/2 + 1 GPU worker）+ 健康检查 + 失败重投 + 超时杀进程
- [ ] M0.4 新建 `electron/service/media-pipeline/worker/ffmpeg-worker.ts`：子进程入口，纯 stdin/stdout JSON 协议
- [ ] M0.5 改 `electron/service/tasks/TaskRunner.ts`：根据 task.kind 路由（GPU/CPU 重活 → worker pool；轻活 → 内进程）
- [ ] M0.6 单元测试：mock 一个 60s ffmpeg 任务，验证不阻塞主进程消息循环
- [ ] M0.7 压测：1000 task 并发 32，30 分钟完成率 ≥ 99%

### FFmpeg 硬件加速

- [ ] M0.8 改 `electron/service/ffmpeg.ts`：启动时探测可用 hwaccel（macOS=videotoolbox / Win=nvenc/qsv / Linux=vaapi）
- [ ] M0.9 改 ffmpeg 命令构建：自动注入 `-hwaccel <检测到的>` + `-c:v <对应编码器>`
- [ ] M0.10 实测：ProRes → H.264 1080p 转码加速 ≥ 5×
- [ ] M0.11 失败回落：hwaccel 失败时自动 fallback 到软编 + 日志告警

### Proxy Media 三层

- [ ] M0.12 新建 `electron/service/media-pipeline/ProxyMediaService.ts`：原片登记 → 后台 task 生成 proxy + 缩略图
- [ ] M0.13 数据模型新增 `SourceMedia` 表（schema + repository）
- [ ] M0.14 UI 操作 proxy 路径，导出时通过 SourceMedia 回链原片
- [ ] M0.15 80GB ProRes 抽帧实测：不阻塞 UI（操作流畅度 ≥ 30fps）

### SQLite 写串行化

- [ ] M0.16 新建 `electron/service/storage/WriteSerializer.ts`：单 worker 串行所有 INSERT/UPDATE/DELETE
- [ ] M0.17 改各 repository 的写方法：通过 WriteSerializer 提交
- [ ] M0.18 读操作保持并发不变
- [ ] M0.19 压测：32 并发写入 shot 表 + 5 万行不出 SQLITE_BUSY
- [ ] M0.20 队列阻塞 ≥ 500ms 警告日志；≥ 5s 错误日志

### M0 验收

- [ ] M0.21 写技术报告：worker pool 设计 + hwaccel 收益 + proxy media 流程 + 写串行化压测结果
- [ ] M0.22 demo：200GB ProRes 同时跑 32 个抽帧任务，UI 流畅、SQLite 不爆、30 分钟完成

---

## Phase M1 (60 天): 预告片场景

### 视觉理解 provider 抽象扩展

- [ ] M1.1 扩展 LLM provider 接口：新增 `videoInput` 字段（base64 / url）
- [ ] M1.2 接入阿里百炼 RunVideoAnalysis（首选）
- [ ] M1.3 接入火山方舟视频理解（备用）
- [ ] M1.4 接入 Gemini 2.x video（海外客户备用）
- [ ] M1.5 失败自动 fallback（首选超时 / 5xx → 备用）

### 视频拆条

- [ ] M1.6 新增 task type `video-shotsplit`
- [ ] M1.7 实现 PySceneDetect 边车（child_process Python sidecar；或纯 JS 替代如 transnetv2-onnx）
- [ ] M1.8 实现阿里云 SplitVideoParts API 备选路径
- [ ] M1.9 输出 ShotSegment（自动 tag：动作 / 情绪 / 角色，via 视觉理解 provider）

### CutPlan 模板

- [ ] M1.10 新增 `CutPlan` 数据模型（剧情大纲 / 选段列表 / 转场）
- [ ] M1.11 LLM 选片模板（按"悬念 / 爆点 / 角色弧"）
- [ ] M1.12 30/60/90 长度自适应（同模板派生）

### TrailerCutService

- [ ] M1.13 新建 `electron/service/recreation/TrailerCutService.ts`：编排"拆条 → 选片 → CutPlan → 派生"
- [ ] M1.14 与现有 storyboard / timeline 集成（用户在现有 UI 看到自动选段结果）
- [ ] M1.15 新增"节奏分析视图"侧边面板（不新增页面）
- [ ] M1.16 controller `electron/controller/recreation.ts`：trailer 相关 IPC

### M1 验收

- [ ] M1.17 demo：输入一部 24 分钟剧集，自动产出 30s/60s/90s 三个时长候选
- [ ] M1.18 客户验收：3 部样片盲测 ≥ 70% 满意度
- [ ] M1.19 性能：从导入到首版候选 ≤ 10 分钟（24 分钟剧集）

---

## Phase M2 (90 天): 横竖屏适配

### ReleaseSpec / ExportPreset

- [ ] M2.1 新增 `ReleaseSpec` 数据模型（平台规格集合：分辨率 / 码率 / 时长上限 / LUFS / 字幕策略 / 封面比例）
- [ ] M2.2 新增 `ExportPreset` 数据模型（ffmpeg 参数模板，绑定 ReleaseSpec）
- [ ] M2.3 预置 8 个主流平台模板（抖音 / 快手 / 小红书 / B站 / 视频号 / Twitter / YT Shorts / TikTok）

### 主体跟随 + Reframe

- [ ] M2.4 接入 MediaPipe / YOLO（本地推理，ONNX runtime）做主体检测
- [ ] M2.5 实现 reframe 算法：横→竖智能裁切，主体居中
- [ ] M2.6 字幕重排：竖版字幕避开 UI 安全区（抖音底部 20%）
- [ ] M2.7 UI：主体跟随框预览 + 用户手动微调

### 音频 loudnorm

- [ ] M2.8 新增 task type `audio-loudnorm`
- [ ] M2.9 ffmpeg loudnorm 双 pass，按平台 LUFS 目标（YT/TikTok −14 / Douyin −16）
- [ ] M2.10 自动应用到每个平台版本

### AspectAdaptService

- [ ] M2.11 新建 `electron/service/recreation/AspectAdaptService.ts`：fan-out → reframe → 字幕重排 → loudnorm → 编码
- [ ] M2.12 新建 `AspectAdaptStudio` UI 模块（前端）
- [ ] M2.13 一键导出 8 个平台版本 + 失败重试单个平台

### DeliveryLog

- [ ] M2.14 新增 `DeliveryLog` 表（每次导出记录：平台 / 文件哈希 / 水印 ID / 时间）

### M2 验收

- [ ] M2.15 demo：单条横屏成片 → 8 平台版本一键派生 + 单次失败可重试
- [ ] M2.16 客户验收：3 部样片盲测主体跟随准确率 ≥ 90%
- [ ] M2.17 性能：1 集 24 分钟 → 8 平台版本 ≤ 8 分钟（含 loudnorm）

---

## Phase M3 (150 天): 多语言本地化

### Provider 抽象扩展

- [ ] M3.1 新增 `align` provider kind（嘴型对齐）
- [ ] M3.2 接入 Sync.so lipsync-2-pro（主选）
- [ ] M3.3 接入 HeyGen Avatar IV（备用）
- [ ] M3.4 新增 `dub` provider kind 扩展（已有 TTS 抽象 → 扩展为含克隆音色的 dub）
- [ ] M3.5 接入 ElevenLabs Multilingual v3（英/西/葡）
- [ ] M3.6 接入 Deepdub（高端剧集）
- [ ] M3.7 接入火山引擎大模型语音（中文出海）

### 人声分离

- [ ] M3.8 新增 task type `audio-source-separation`
- [ ] M3.9 接入 Demucs（本地 ONNX）或火山 API（云端）
- [ ] M3.10 输出三轨：人声 / BGM / SFX

### ASR

- [ ] M3.11 新增 task type `audio-stt`
- [ ] M3.12 接入 Whisper-large（本地）+ 火山 ASR（云端）+ 阿里 ASR
- [ ] M3.13 输出 STT JSON（含时码 + 置信度）

### LocaleTrack 数据模型

- [ ] M3.14 新增 `LocaleTrack` 表（含 segments / onScreenTextOverrides）
- [ ] M3.15 双写：每个 segment 同时存原文 STT + 译文 + 配音音频路径 + 嘴型对齐视频路径

### 屏显文字处理

- [ ] M3.16 新增 task type `onscreen-text-detect`
- [ ] M3.17 接入 PaddleOCR（本地）
- [ ] M3.18 新增 task type `onscreen-text-inpaint`
- [ ] M3.19 接入 lama-cleaner ONNX（本地）+ ffmpeg overlay 重新合成

### 字幕

- [ ] M3.20 新增 task type `subtitle-burn / subtitle-export`
- [ ] M3.21 ffmpeg subtitle filter（硬烧）+ SRT/ASS 外挂（软字幕）

### LocalizationWorkbench UI

- [ ] M3.22 双栏编辑器（原文 STT × 译文，时码轴对齐）
- [ ] M3.23 单段配音回放 + 重新生成按钮
- [ ] M3.24 嘴型对齐预览（before/after 切换）
- [ ] M3.25 屏显 OCR 标记 + 本地化版本切换
- [ ] M3.26 **人工译审必经流程**（UI 无法跳过 — 工程红线）

### LocalizationService

- [ ] M3.27 新建 `electron/service/recreation/LocalizationService.ts`：编排"分离 → ASR → 译 → TTS → 嘴型 → 屏显 inpaint → 重混 → loudnorm → 字幕"

### M3 验收

- [ ] M3.28 demo：中文剧 → 英 + 日 + 西 三语完整链
- [ ] M3.29 客户验收：盲测 AI 配音 + 嘴型对齐 ≥ 行业 baseline（HeyGen / Deepdub）
- [ ] M3.30 性能：1 集 45 分钟 → 单语种完整链 ≤ 25 分钟（不含人工译审时间）

---

## Phase M4 (180 天): 私有化 + SLA 调优

### Provider Profile

- [ ] M4.1 新建 `electron/service/enterprise/ProviderProfile.ts`：读 `~/.koma/enterprise-profile.json` 配置白名单
- [ ] M4.2 在所有 provider 调用入口加白名单检查（不在白名单 → 拒绝并报错）
- [ ] M4.3 接入本地 vLLM（LLM）/ ComfyUI（TTI）/ Edge-TTS（TTS）
- [ ] M4.4 企业版安装包：默认 `blockExternalNetwork: true`

### 出网审计日志

- [ ] M4.5 新建 `electron/service/enterprise/AuditLog.ts`：所有 provider 调用记录（时间 / 调用方 / 目标 host / 请求体哈希 / 状态 / 耗时）
- [ ] M4.6 ed25519 签名每条日志（用现有 release-signing 私钥的"审计子密钥"）
- [ ] M4.7 JSON Lines 落盘 + 滚动（≥ 180 天）
- [ ] M4.8 导出审计报告（CSV）

### 素材 ed25519 指纹

- [ ] M4.9 SourceMedia 入库时计算 SHA512 + ed25519 签名 → 写 sidecar `<media>.koma.sig`
- [ ] M4.10 导出/分发自动附带签名
- [ ] M4.11 验证工具：给定 (media, sig) 返回是否来源可信

### SLA 调优

- [ ] M4.12 监控埋点：每个 task 成功率 + P50/P95 延迟 + 月可用率
- [ ] M4.13 Provider 失败率 > 5% 自动报警
- [ ] M4.14 SLA 报告生成（月度）
- [ ] M4.15 目标：任务成功率 ≥ 95% / P50 ≤ 承诺时长 1.2× / 月可用 ≥ 99.0%

### 企业版打包

- [ ] M4.16 新建 `cmd/builder-enterprise.json`（独立 productName + appId + enterprise-profile 默认值）
- [ ] M4.17 内网更新通道（不走 GitHub Releases，改走客户内部 HTTPS 静态服务器）
- [ ] M4.18 离线激活（license 文件 + 机器码绑定）

### M4 验收

- [ ] M4.19 企业版部署到客户内网，**任何外部 API 调用都被阻塞**
- [ ] M4.20 SLA 报告达标
- [ ] M4.21 审计日志可被客户审计部门导出 + 验证签名

---

## Phase M5: 上线运维（持续）

- [ ] M5.1 每月回归测试（每场景 ≥3 部新样片）
- [ ] M5.2 Provider 价格波动监控
- [ ] M5.3 客户每月 SLA 报告
- [ ] M5.4 Bug 修复 SLA：P0 4 小时 / P1 24 小时 / P2 7 天

---

## 关键依赖（外部）

- Apple Developer 证书（仅 mac 签名，可后期补，与本 change 不冲突）
- 客户 BYOL：HeyGen / Sync.so / ElevenLabs / Topaz / 火山 / 阿里 等 API key
- Python 边车（PySceneDetect / Demucs / lama-cleaner）：需要客户机器装 Python 3.10+ + pip 包；Windows/mac/linux 跨平台兼容性测试

---

## 不在本 change 范围内（明确）

- ❌ 4K 修复（客户 BYOL Topaz，本期不集成 CLI 调度）
- ❌ NLE 互通（AAF/XML/EDL/OTIO）
- ❌ 协作 Web 端
- ❌ 法务红线扫描器
- ❌ 高光合集 / 解说版 / 续集铺垫 / 素材授权包 / IP 衍生
