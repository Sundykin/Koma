# Spec: media-pipeline-pro（媒体处理 + GPU 调度专业版）

## ADDED Requirements

### Requirement: TaskService 双层调度（GPU 扩展）
系统 SHALL 在 add-recreation-workflow-three-scenes 已有的 TaskService worker pool 基础上，新增 GPU 任务专属调度层，支持 H100 / A100 / RTX4090 集群。

#### Scenario: GPU 设备发现
- **WHEN** 系统启动
- **THEN** 自动检测可用 GPU 设备（NVIDIA / Apple Silicon / AMD）
- **AND** 探测每张卡的 VRAM 容量与计算能力
- **AND** 落入 `GpuTaskQueueConfig.devices` 列表

#### Scenario: 模型预热池
- **WHEN** 任意 GPU worker 启动
- **THEN** 自动加载常驻模型：`inswapper-128 / scrfd-10g / arcface-r100 / gfpgan-v1.4`
- **AND** LRU 驱逐策略：30 分钟未用模型从显存卸载

#### Scenario: 任务路由
- **WHEN** task.kind 属于 GPU 重活集合（face.swap.render / face.dfl.train / ip.wan-animate.render / body.reframe.render / outfit.virtual-tryon / face.restore）
- **THEN** 路由到 GpuTaskQueue
- **AND** 根据 maxConcurrentPerDevice 限制并发

#### Scenario: 独占任务
- **WHEN** task 为 `face.dfl.train` 或 `ip.wan-animate.render`
- **THEN** 该 GPU 设备进入独占模式
- **AND** 其他任务在该设备上阻塞排队

#### Scenario: 优先级抢占
- **WHEN** 'master' 优先级任务排队
- **AND** 'preview' / 'review' 任务正在跑
- **THEN** master 任务可抢占（preview/review 任务暂停，保存 checkpoint，让出 GPU）

#### Scenario: 中断 + 续跑
- **WHEN** 任意重活 task 中断（进程崩溃 / 用户取消 / OOM）
- **THEN** 该 task 的 progress.json checkpoint 持久化
- **AND** 重启后可从 checkpoint resume，**绝不重头跑**
- **AND** DFL 训练使用 .dfm 原生 checkpoint

### Requirement: 跨项目向量库
系统 SHALL 维护 ArcFace embedding 跨项目向量索引，支持"某演员在所有项目的所有镜头"类查询。

#### Scenario: Embedding 索引
- **WHEN** face.embed task 完成
- **THEN** 512 维 ArcFace embedding 写入向量库（pgvector / sqlite-vss）
- **AND** 索引按 projectId / characterId / shotId 分级

#### Scenario: 跨项目检索
- **WHEN** 用户查询"演员 X 的所有镜头"
- **THEN** 系统跨所有项目的向量库执行相似度搜索
- **AND** 返回时码 + 项目 + 集数 + 缩略图

#### Scenario: 隐私保护
- **WHEN** 跨项目查询涉及 confidential=true 的 FaceIdentity
- **THEN** 拒绝查询，要求企业管理员授权

### Requirement: Provider 抽象 7 类扩展
系统 SHALL 在现有 5 类 provider（LLM/TTI/ITV/TTS/image-hosting）基础上新增 7 类抽象：itv-pro / align / video-analysis / dub-pro / face-swap / body-swap / outfit-swap。

#### Scenario: face-swap provider 接口
- **WHEN** 用户配置 face-swap provider
- **THEN** 可选实现：local-onnx (InSwapper) / local-dfl (DeepFaceLab) / aliyun-facechain / volc-faceswap / akool / heygen
- **AND** 接口契约：input(video, identities, swapPlan) → AsyncIterable<progress, resultUri>

#### Scenario: body-swap provider 接口
- **WHEN** 用户配置 body-swap provider
- **THEN** 主选 wan22-animate (本地) / 备用 omnihuman (本地或云)
- **AND** 接口契约：input(video, bodyProfile, referenceImage) → output(processedVideo)

#### Scenario: outfit-swap provider 接口
- **WHEN** 用户配置 outfit-swap provider
- **THEN** 主选 idm-vton (本地) / 备用 outfit-anyone (本地或云)
- **AND** 接口契约：input(videoFrames, garmentImage, mask) → output(processedFrames)

#### Scenario: 失败自动 fallback
- **WHEN** 主选 provider 调用失败（超时 / 5xx / OOM / 配额满）
- **THEN** 自动 fallback 到备用 provider
- **AND** 失败原因记录到 audit log

#### Scenario: 健康度监控
- **WHEN** 同一类 provider 60 秒内成功率 < 70%
- **THEN** 触发健康度警告
- **AND** 自动降级到 fallback
