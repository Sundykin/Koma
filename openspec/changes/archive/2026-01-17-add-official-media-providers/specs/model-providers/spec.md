# model-providers Spec Delta

## ADDED Requirements

### Requirement: NanoBanana TTI Provider
系统 SHALL 支持 nano-banana 官方文生图服务。

#### Scenario: 创建图片生成任务
- **WHEN** 调用 NanoBananaProvider.generate(prompt, options)
- **THEN** 向 `POST /api/nano-banana` 发送请求
- **AND** 请求体包含 model、prompt、aspect_ratio、image_size
- **AND** 返回 task_id 用于后续轮询

#### Scenario: 轮询任务状态
- **WHEN** 调用 NanoBananaProvider.checkProgress(taskId)
- **THEN** 向 `GET /api/nano-banana/task/{task_id}` 发送请求
- **AND** 返回 ProgressInfo 包含 state、data
- **AND** state 为 succeeded 时 data.images[0].url 是图片地址
- **AND** state 为 failed 时返回错误信息

#### Scenario: 测试连接
- **WHEN** 调用 NanoBananaProvider.testConnection()
- **THEN** 向 `GET /api/user/balance` 发送请求
- **AND** 返回 200 表示连接成功

### Requirement: Sora2 Official ITV Provider
系统 SHALL 支持 sora2 官方图生视频服务。

#### Scenario: 创建视频生成任务
- **WHEN** 调用 Sora2Provider.generate(imagePath, prompt, options)
- **THEN** 向 `POST /v1/videos/generations` 发送请求
- **AND** 请求体包含 model="sora-2"、prompt、aspect_ratio、duration、image_urls
- **AND** 返回任务 id 用于后续轮询

#### Scenario: 轮询任务状态
- **WHEN** 调用 Sora2Provider.checkProgress(taskId)
- **THEN** 向 `GET /v1/videos/tasks/{taskId}` 发送请求
- **AND** 返回 state、progress、data
- **AND** state 为 succeeded 时 data 包含视频 URL

### Requirement: Official Providers Only
系统 SHALL 默认仅展示官方渠道配置选项。

#### Scenario: TTI 渠道列表
- **WHEN** 用户打开 TTI 配置
- **THEN** TTI_PRESETS 仅包含 nano-banana（官方）
- **AND** 隐藏 ComfyUI、即梦、MidJourney 等第三方渠道

#### Scenario: ITV 渠道列表
- **WHEN** 用户打开 ITV 配置
- **THEN** ITV_PRESETS 仅包含 sora2（官方）
- **AND** 隐藏 Runway、可灵、Pika 等第三方渠道

#### Scenario: 保留第三方代码
- **GIVEN** 第三方 Provider 代码已存在
- **WHEN** 隐藏第三方渠道
- **THEN** 仅从预设列表中移除
- **AND** Provider 实现代码保留不删除
