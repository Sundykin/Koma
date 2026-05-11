# Spec: media-pipeline

## ADDED Requirements

### Requirement: TaskService 双层调度
系统 SHALL 在保留 TaskService 现有持久化与状态机能力的前提下，将 CPU/GPU 重活迁移到 child_process worker pool，UI 主进程不被阻塞。

#### Scenario: 任务路由
- **WHEN** TaskService 接收 task
- **AND** task.kind 属于重活集合（`media-transcode / media-extract-frames / media-proxy-gen / media-loudnorm / face-detection / face-clustering / video-shotsplit / audio-source-separation`）
- **THEN** 任务被路由到 worker pool 由子进程执行
- **AND** 子进程完成后通过 stdin/stdout JSON 协议返回结果给父进程

#### Scenario: 并发上限
- **WHEN** 系统配置默认并发
- **THEN** TaskService 全局并发 ≤ 32
- **AND** worker pool 大小 = CPU/2 + 1（GPU worker）

#### Scenario: UI 不阻塞硬约束
- **WHEN** 用户对 80GB ProRes 母带触发抽帧
- **THEN** 主进程消息循环响应延迟 ≤ 16ms
- **AND** UI 滚动 / 点击 / 输入流畅度 ≥ 30fps

#### Scenario: 压测目标
- **WHEN** 提交 1000 个并发 task（混合重活与轻活）
- **THEN** 30 分钟内完成率 ≥ 99%
- **AND** 失败 task 自动重投 ≤ 3 次

### Requirement: FFmpeg 硬件加速自动检测
系统 SHALL 启动时探测可用的硬件加速 backend，并在所有 transcode/encode 任务中自动注入对应参数。

#### Scenario: 平台对应 backend
- **WHEN** 系统在 macOS 启动
- **THEN** 探测 `videotoolbox`，所有 H.264/H.265 编码任务使用 `h264_videotoolbox / hevc_videotoolbox`
- **WHEN** 系统在 Windows 启动
- **THEN** 探测 `nvenc / qsv / amf` 按优先级选择
- **WHEN** 系统在 Linux 启动
- **THEN** 探测 `vaapi / nvenc`

#### Scenario: 加速比
- **WHEN** ProRes → H.264 1080p 转码
- **THEN** 启用 hwaccel 后耗时减少 ≥ 5×（相比软编）

#### Scenario: 失败回落
- **WHEN** hwaccel 编码失败（如显存不足）
- **THEN** 自动 fallback 到软编
- **AND** 写 warning 日志

### Requirement: Proxy Media 三层结构
系统 SHALL 在母带导入时自动生成 1080p H.264 代理 + 关键帧缩略图，UI 操作使用代理，导出时回链原片。

#### Scenario: 三层结构
- **WHEN** 用户导入 ProRes 4K 母带
- **THEN** 系统登记 SourceMedia.originalPath
- **AND** 后台 task 生成 `<id>.proxy.mp4`（1080p H.264，目标码率 8Mbps）
- **AND** 生成关键帧 webp 缩略图（每秒 1 帧）

#### Scenario: UI 操作代理
- **WHEN** 用户在 timeline 拖动 clip
- **THEN** 播放使用 proxy 文件
- **AND** 缩略图直接读 webp

#### Scenario: 导出回链原片
- **WHEN** 用户导出最终成片
- **THEN** ffmpeg 命令使用 SourceMedia.originalPath 作为输入
- **AND** 代理文件仅用于编辑阶段

### Requirement: SQLite 写串行化
系统 SHALL 通过单 worker 串行化所有 INSERT/UPDATE/DELETE 操作，避免多写者锁竞争导致 SQLITE_BUSY。

#### Scenario: 写串行化
- **WHEN** 32 个并发 task 同时写 shot 表
- **THEN** 所有写操作进入单 worker 队列依次执行
- **AND** 不产生 SQLITE_BUSY 错误

#### Scenario: 读并发不受影响
- **WHEN** 32 个并发 task 同时读 shot 表
- **THEN** 读操作并行执行，不进入写队列

#### Scenario: 阻塞告警
- **WHEN** 单个写操作在队列中阻塞 ≥ 500ms
- **THEN** 写 warning 日志（含队列长度）
- **WHEN** 阻塞 ≥ 5s
- **THEN** 写 error 日志 + 触发监控报警

#### Scenario: 压测目标
- **WHEN** 单项目 shot 表写入达到 50 万行
- **THEN** 系统不爆 SQLITE_BUSY
- **AND** 平均写入延迟 ≤ 50ms

### Requirement: Provider 抽象扩展
系统 SHALL 在现有 LLM/TTI/ITV/TTS/image-hosting 5 类 provider 基础上新增 `itv-pro` / `align` / `video-analysis` 三类抽象，每类至少接入 2 家供应商支持失败热备。

#### Scenario: itv-pro 抽象
- **WHEN** 用户配置 itv-pro provider
- **THEN** 可选 Runway Gen-4（主）/ 可灵（备）
- **AND** 接口契约：input(video, prompt) → output(processed_video)

#### Scenario: align 抽象
- **WHEN** 用户配置 align provider
- **THEN** 可选 Sync.so lipsync-2-pro（主）/ HeyGen Avatar IV（备）
- **AND** 接口契约：input(video, audio) → output(aligned_video)

#### Scenario: video-analysis 扩展
- **WHEN** 用户配置 video-analysis provider
- **THEN** 复用现有 LLM provider 接口（新增 videoInput 字段）
- **AND** 可选阿里百炼 RunVideoAnalysis / 火山方舟视频理解 / Gemini 2.x video

#### Scenario: 自动 fallback
- **WHEN** 主选 provider 调用失败（超时 / 5xx / 配额满）
- **THEN** 自动 fallback 到备用 provider
- **AND** 记录失败原因到 audit log

#### Scenario: 失败率监控
- **WHEN** 同一类 provider 7 天内失败率 > 5%
- **THEN** 系统触发监控报警
