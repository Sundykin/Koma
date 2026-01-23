## ADDED Requirements

### Requirement: Configurable Channel Framework
系统 SHALL 支持通过配置方式定义新的媒体生成渠道。

#### Scenario: 渠道配置结构
- **WHEN** 定义新的渠道配置时
- **THEN** 配置包含以下核心字段：
  - type: 渠道类型（tti/itv/character/remix）
  - auth: 鉴权配置（type, keyName, keyValue）
  - generate: 生成接口配置（url, method, bodyTemplate, responseMapping）
  - query: 查询接口配置（url, responseMapping, statusMapping）
  - polling: 轮询配置（interval, maxDuration）

#### Scenario: 模板引擎
- **WHEN** 构建 API 请求时
- **THEN** 系统解析 bodyTemplate 中的占位符
- **AND** 支持 `{{prompt}}`, `{{imageUrl}}`, `{{duration}}` 等变量
- **AND** 将变量替换为实际值

#### Scenario: 响应映射
- **WHEN** 解析 API 响应时
- **THEN** 使用 JSONPath 表达式提取字段
- **AND** 支持 `$.id`, `$.data.task_id`, `$.result.data[0].url` 等路径
- **AND** 将提取的值映射到统一的 ProgressInfo 结构

#### Scenario: 状态映射
- **WHEN** 解析任务状态时
- **THEN** 根据 statusMapping 配置将原始状态转换为统一状态
- **AND** 统一状态包括：pending, processing, completed, failed

### Requirement: Custom Channel Management
系统 SHALL 支持用户管理自定义渠道配置。

#### Scenario: 添加自定义渠道
- **WHEN** 用户在设置中添加自定义渠道
- **THEN** 打开 JSON 配置编辑器
- **AND** 用户填写渠道配置后保存
- **AND** 系统验证配置格式正确性
- **AND** 新渠道出现在渠道选择列表中

#### Scenario: 编辑自定义渠道
- **WHEN** 用户编辑已有的自定义渠道
- **THEN** 加载现有配置到编辑器
- **AND** 保存时更新配置
- **AND** 使用该渠道的项目自动使用新配置

#### Scenario: 删除自定义渠道
- **WHEN** 用户删除自定义渠道
- **THEN** 检查是否有项目正在使用
- **AND** 若有则提示用户确认
- **AND** 确认后从配置列表中移除

#### Scenario: 连接测试
- **WHEN** 用户点击自定义渠道的「测试连接」
- **THEN** 系统使用配置的鉴权信息发送测试请求
- **AND** 显示连接成功或失败状态

### Requirement: Gemini-3-Pro TTI Provider
系统 SHALL 支持 toapis.com 的 Gemini-3-Pro 文生图服务。

#### Scenario: 创建图片生成任务
- **WHEN** 调用 Gemini3ProProvider.generateImage(prompt, options)
- **THEN** 向 `POST /v1/images/generations` 发送请求
- **AND** 请求体包含 model="gemini-3-pro-image-preview"、prompt、size、n、image_urls
- **AND** 返回任务 id 用于后续轮询

#### Scenario: 轮询任务状态
- **WHEN** 调用 Gemini3ProProvider.checkProgress(taskId)
- **THEN** 向 `GET /v1/images/generations/{task_id}` 发送请求
- **AND** 返回 status、progress、result
- **AND** status 为 completed 时 result.data[0].url 是图片地址

#### Scenario: 支持图生图
- **WHEN** options.imageUrls 不为空
- **THEN** 将图片 URL 列表添加到请求体
- **AND** 最多支持 14 张参考图片

### Requirement: Sora2 Enhanced Video Generation
系统 SHALL 支持 Sora2 增强的视频生成功能。

#### Scenario: 角色引用生成
- **WHEN** 调用视频生成并指定 characterUrl
- **THEN** 请求体包含 metadata.character_url 参数
- **AND** 生成的视频包含指定角色
- **AND** 可在 prompt 中使用 @username 格式引用角色

#### Scenario: 风格控制
- **WHEN** 指定 style 参数
- **THEN** 请求体包含 metadata.style
- **AND** 支持 thanksgiving、comic、news、selfie、nostalgic、anime 等风格

#### Scenario: 故事板模式
- **WHEN** 启用 storyboard 参数
- **THEN** 请求体包含 metadata.storyboard=true
- **AND** 提供更精细的视频生成控制

#### Scenario: 高清模式
- **WHEN** 使用 sora-2-pro 模型并启用 hd 参数
- **THEN** 请求体包含 metadata.hd=true
- **AND** 生成高清视频（时长不可为 25 秒）

### Requirement: Character Extraction with Status Query
系统 SHALL 支持完整的角色提取流程，包括状态查询。

#### Scenario: 创建角色提取任务
- **WHEN** 调用角色提取 API
- **THEN** 向 `POST /v1/videos/generations` 发送请求
- **AND** 请求体包含 model、timestamps、url 或 from_task
- **AND** 返回任务 id

#### Scenario: 查询角色提取状态
- **WHEN** 调用 checkCharacterProgress(taskId)
- **THEN** 向 `GET /v1/characters_tasks/{task_id}` 发送请求
- **AND** 返回 status、progress、result
- **AND** status 为 completed 时 result.data.characters 包含角色列表

#### Scenario: 角色信息解析
- **WHEN** 角色提取完成
- **THEN** 解析 characters 数组获取角色信息
- **AND** 包含 id、username、display_name 等字段
- **AND** username 可用于 prompt 中 @username 引用

### Requirement: Video Remix
系统 SHALL 支持对已生成视频进行混音编辑。

#### Scenario: 创建混音任务
- **WHEN** 调用 remixVideo(videoId, prompt, options)
- **THEN** 向 `POST /v1/videos/{video_id}/remix` 发送请求
- **AND** 请求体包含 model、prompt、duration、aspect_ratio
- **AND** 返回任务 id

#### Scenario: 查询混音状态
- **WHEN** 调用 checkProgress(taskId) 查询混音任务
- **THEN** 复用视频任务查询接口
- **AND** 返回混音后的视频 URL

#### Scenario: 混音 UI 入口
- **WHEN** 用户在时间线编辑器选中视频片段
- **THEN** 显示「混音」操作按钮
- **AND** 点击后打开混音参数配置对话框
- **AND** 配置完成后提交混音任务

## MODIFIED Requirements

### Requirement: Sora2 Provider (占位)
系统 SHALL 支持 OpenAI Sora2 视频生成服务（已正式实现）。

#### Scenario: 配置
- **WHEN** 选择 Sora2 Provider
- **THEN** 需要配置 API Key（toapis.com）
- **AND** 可选择模型版本（sora-2、sora-2-pro）
- **AND** 支持 10s、15s、25s 视频生成

#### Scenario: 视频生成
- **WHEN** 调用 Sora2Provider.generate()
- **THEN** 向 `POST /v1/videos/generations` 发送请求
- **AND** 支持文生视频、图生视频、角色引用
- **AND** 返回任务 id

#### Scenario: 任务查询
- **WHEN** 调用 Sora2Provider.checkProgress(taskId)
- **THEN** 向 `GET /v1/videos/generations/{task_id}` 发送请求
- **AND** 返回 status、progress、result
- **AND** status 为 completed 时 result.data[0].url 是视频地址
