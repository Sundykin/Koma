# Spec: media-pipeline-pro

## ADDED Requirements

### Requirement: TaskService 双层 + GpuTaskQueue
系统 SHALL 在 TaskService 内核 worker pool 基础上新增 GPU 专属调度层。

#### Scenario: GPU 路由
- **WHEN** task.kind ∈ { face.swap.render, face.dfl.train, ip.wan-animate.render, body.reframe.render, outfit.virtual-tryon, face.restore, video.analysis.* }
- **THEN** 路由到 GpuTaskQueue
- **AND** 按 maxConcurrentPerDevice 限制

#### Scenario: 独占任务
- **WHEN** task = face.dfl.train 或 ip.wan-animate.render
- **THEN** GPU 设备独占模式

#### Scenario: 中断 + 续跑
- **WHEN** GPU task 中断
- **THEN** checkpoint 持久化 + resume 时不重头

### Requirement: FFmpeg hwaccel 自动检测
系统 SHALL 启动时探测可用 hwaccel 并自动注入参数。

#### Scenario: 跨平台 backend
- **WHEN** macOS → videotoolbox / win → nvenc/qsv/amf / linux → vaapi
- **THEN** 自动配置 + dry-run 验真

#### Scenario: 加速比
- **WHEN** ProRes → H.264 1080p
- **THEN** hwaccel ≥ 5×

#### Scenario: 失败回落
- **WHEN** hwaccel 失败（显存不足等）
- **THEN** fallback 软编 + warning 日志

### Requirement: Proxy Media 三层
系统 SHALL 自动生成 1080p H.264 代理 + 关键帧 webp。

#### Scenario: 生成参数
- **WHEN** 母带导入
- **THEN** 生成 `scale=-2:540` + `-b:v 1500k` + `-g 60` + `-c:a aac -b:a 96k` proxy
- **AND** 每秒 1 帧关键帧 webp

#### Scenario: UI 操作代理
- **WHEN** Timeline 拖动 clip
- **THEN** 播放使用 proxy + 缩略图读 webp

### Requirement: SQLite 写串行化
系统 SHALL 通过单 worker 串行化所有写操作。

#### Scenario: 并发写
- **WHEN** 32 个并发 task 写 shot 表
- **THEN** 进入单 worker 队列依次执行
- **AND** 不爆 SQLITE_BUSY

#### Scenario: 读并发不影响
- **WHEN** 读操作
- **THEN** 并发执行

#### Scenario: 50 万 shot 压测
- **WHEN** 单项目 shot 表 ≥ 50 万行
- **THEN** 平均写入延迟 ≤ 50ms

### Requirement: VideoAnalysisProvider 抽象
系统 SHALL 新增 VideoAnalysisProvider 抽象，全 BYOL 模式。

#### Scenario: 本地 provider
- **WHEN** 配置 LocalProvider
- **THEN** ffmpeg + onnxruntime 全本地

#### Scenario: 云端 provider
- **WHEN** 配置 Aliyun / Doubao / Gemini / TwelveLabs
- **THEN** 用客户 BYOL API key 调云端
- **AND** Koma 不代持客户 API key

#### Scenario: 主备 fallback
- **WHEN** 本地优先失败
- **THEN** 自动 fallback 云端

### Requirement: 跨项目向量库
系统 SHALL 维护 ArcFace embedding 跨项目向量索引。

#### Scenario: 索引写入
- **WHEN** face.embed task 完成
- **THEN** 512 维 embedding 写入 pgvector / sqlite-vss
- **AND** 索引按 projectId / characterId / shotId 分级

#### Scenario: 跨项目相似度
- **WHEN** 查询"演员 X 的所有镜头"
- **THEN** 跨项目向量库执行相似度搜索
- **AND** 返回时码 + 项目 + 集数 + 缩略图
