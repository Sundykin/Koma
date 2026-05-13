# Spec: media-pipeline-pro

> 本 spec 仅覆盖**客户端本地**的媒体处理基础设施（CPU + 网络任务）。所有 AI / GPU 算力通过 `koma-cloud-client` 调用 new-api 网关，详见对应 spec。

## ADDED Requirements

### Requirement: TaskService 单层（仅 CPU + 网络任务）
系统 SHALL 在 TaskService 内核 worker pool 基础上承载所有 CPU + 网络任务。**不新增 GpuTaskQueue**（无客户端 GPU 任务）。

#### Scenario: 任务分类
- **WHEN** 系统启动
- **THEN** TaskService 仅承载以下 kind：
  - `light`：UI 主进程内同步任务
  - `heavy`：child_process worker pool（ffmpeg / hash / 压缩 / 上传 / 解析）
  - `cloud`：网络 IO 任务（new-api 调用 + JobPoller 轮询）

#### Scenario: 并发上限
- **WHEN** 系统稳态
- **THEN** `heavy` worker pool ≤ 8（视 CPU 核数）
- **AND** `cloud` 并发由 koma-cloud 侧 quota 决定，TaskService 仅做排队

#### Scenario: 中断 + 续跑
- **WHEN** `cloud` 任务进程崩溃
- **THEN** jobId 持久化到 SQLite，重启后 JobPoller 自动续查
- **AND** 不重复提交

### Requirement: FFmpeg hwaccel 自动检测（仅本地预处理）
系统 SHALL 启动时探测可用 hwaccel 并自动注入参数。仅用于本地预处理（代理生成 / 抽帧 / 横竖屏 reframe / 字幕烧录 / 混音）。

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
系统 SHALL 自动生成 1080p H.264 代理 + 关键帧 webp，主要目的是 **UI 流畅 + 减少上传到 new-api 的带宽**。

#### Scenario: 生成参数
- **WHEN** 母带导入
- **THEN** 生成 `scale=-2:540` + `-b:v 1500k` + `-g 60` + `-c:a aac -b:a 96k` proxy
- **AND** 每秒 1 帧关键帧 webp

#### Scenario: UI 操作代理
- **WHEN** Timeline 拖动 clip
- **THEN** 播放使用 proxy + 缩略图读 webp

#### Scenario: 上传优化
- **WHEN** 客户端调用 koma-cloud 各能力 endpoint 上传媒体
- **THEN** 默认上传 1080p H.264 代理（约 1-1.5 GB / 45 min）
- **AND** 仅在高质量超分场景上传母带
- **AND** 上传走断点续传协议（Tus）

### Requirement: SQLite 写串行化
系统 SHALL 通过单 worker 串行化所有写操作。

#### Scenario: 并发写
- **WHEN** 多个 cloud 任务回调同时写 shot 表
- **THEN** 进入单 worker 队列依次执行
- **AND** 不爆 SQLITE_BUSY

#### Scenario: 读并发不影响
- **WHEN** 读操作
- **THEN** 并发执行

#### Scenario: 50 万 shot 压测
- **WHEN** 单项目 shot 表 ≥ 50 万行
- **THEN** 平均写入延迟 ≤ 50ms

### Requirement: 复用现有 llmProviderRegistry 接入 new-api LLM 通道
系统 SHALL **复用现有** `electron/service/chat/providers/llmProviderRegistry` 注册一个内置 provider `koma-cloud`，固定指向 new-api 的 `/v1/chat/completions` endpoint。

#### Scenario: koma-cloud provider 注册
- **WHEN** 系统启动
- **THEN** `llmProviderRegistry.register({ type: 'koma-cloud', factory })` 注册内置 provider
- **AND** factory 返回 LangChain `ChatOpenAI` 实例，`baseUrl` 锁定 new-api，`apiKey` 由 `AuthService` 动态注入
- **AND** 不暴露其他 provider type 给客户（OpenAI / Anthropic / Google 仅供 Koma 开发期调试，发布构建中可移除）

#### Scenario: 多模态视频帧透传
- **WHEN** 视频分析需要 VLM 推理
- **THEN** 通过 LangChain 标准 `HumanMessage.content = [{type: 'image_url', image_url: dataUrl}, ...]` 传入抽帧
- **AND** new-api 侧负责将图像帧分发到具体 VLM 上游

#### Scenario: 虚拟模型名
- **WHEN** 客户端发起 LLM / VLM 请求
- **THEN** `modelName` 使用 Koma 定义的虚拟名（如 `koma-vlm-scene` / `koma-llm-extract` / `koma-vlm-risk`）
- **AND** 由 new-api 解析为真实上游模型
- **AND** 客户端不感知具体模型

#### Scenario: TaskProfile 简化
- **WHEN** 12 维度分析通过 `LLMQueryService.query()` 发起
- **THEN** `taskProfiles.ts` 仅决定虚拟模型名 + 超时 + 重试
- **AND** 不做 provider 切换（仅一个 provider）

### Requirement: 跨项目向量库（embedding 来自 new-api）
系统 SHALL 维护人脸 embedding 跨项目向量索引。**embedding 数值由 new-api 返回，客户端不本地计算**。

#### Scenario: 索引写入
- **WHEN** koma-cloud 人物检测任务返回带 embedding 的结果
- **THEN** 客户端将 512 维 embedding 写入 sqlite-vss
- **AND** 索引按 projectId / characterId / shotId 分级

#### Scenario: 跨项目相似度
- **WHEN** 查询"演员 X 的所有镜头"
- **THEN** 本地 sqlite-vss 执行相似度搜索
- **AND** 返回时码 + 项目 + 集数 + 缩略图
- **AND** 无需调用 new-api（embedding 已落库）

#### Scenario: embedding schema 兼容
- **WHEN** new-api 返回的 embedding 维度变更
- **THEN** 客户端按 schema 版本号迁移本地索引
- **AND** 旧索引保留为只读，新索引重建

## 已删除 Requirements（相比早期版本）

- ~~GpuTaskQueue / GPU 设备独占 / GPU checkpoint 续跑~~（客户端无 GPU 任务）
- ~~VideoAnalysisProvider 抽象~~（全部走 koma-cloud `/v1/chat/completions`）
- ~~MediaPipelineProvider 抽象~~（全部走 koma-cloud 各能力 endpoint，详见 `koma-cloud-client` spec）
- ~~LocalVLMProvider（本地 Qwen2.5-VL / InternVL / MiniCPM-V）~~（客户端无本地推理）
- ~~License 黑名单守门~~（迁移到 new-api 服务端，客户端不感知上游 license）
