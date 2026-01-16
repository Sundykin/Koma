# itv Specification

## Purpose
TBD - created by archiving change add-antd-timeline-editor. Update Purpose after archive.
## Requirements
### Requirement: ITV Provider Interface
系统 SHALL 支持多种图生视频服务提供商。

#### Scenario: Provider 注册
- **WHEN** 应用启动时
- **THEN** 系统注册所有内置 ITV Provider
- **AND** 包括：Runway Gen-3、Kling（可灵）、Pika、Sora2、ComfyUI（AnimateDiff）

#### Scenario: Provider 切换
- **WHEN** 用户在设置中选择不同的 ITV Provider
- **THEN** 系统切换到对应的视频生成服务
- **AND** 保留各 Provider 的独立配置

### Requirement: Video Generation Parameters
系统 SHALL 支持视频生成参数配置。

#### Scenario: 基础参数
- **WHEN** 配置视频生成时
- **THEN** 可设置视频时长（如 4s、8s、16s）
- **AND** 可设置输出分辨率（720p、1080p、4K）
- **AND** 可设置帧率（24fps、30fps）
- **AND** 可设置宽高比（16:9、9:16、1:1）

#### Scenario: 运动控制
- **WHEN** 需要控制视频运动时
- **THEN** 可设置运动强度（motion strength）
- **AND** 可输入运动描述文本（motion prompt）
- **AND** 可选择摄像机运动类型（推进、拉远、平移、旋转等）

### Requirement: Image to Video Generation
系统 SHALL 支持从静态图片生成动态视频。

#### Scenario: 单图生成
- **WHEN** 用户触发分镜视频化
- **THEN** 系统读取分镜的静态图片
- **AND** 结合分镜描述生成运动提示词
- **AND** 调用 ITV Provider 生成视频
- **AND** 返回视频文件路径

#### Scenario: 批量生成
- **WHEN** 用户触发批量视频化
- **THEN** 系统按序处理多个分镜
- **AND** 显示整体进度和单个进度
- **AND** 支持取消和重试

#### Scenario: 首尾帧控制
- **WHEN** Provider 支持首尾帧模式
- **THEN** 可指定首帧图片和尾帧图片
- **AND** 生成平滑过渡的视频

### Requirement: Runway Gen-3 Provider
系统 SHALL 支持 Runway Gen-3 Alpha/Turbo。

#### Scenario: 配置
- **WHEN** 选择 Runway Provider
- **THEN** 需要配置 API Key
- **AND** 可选择模型版本（Gen-3 Alpha、Gen-3 Turbo）
- **AND** 支持 5s、10s 视频生成

#### Scenario: 运动提示
- **WHEN** 调用 Runway 生成
- **THEN** 支持 motion prompt 描述运动
- **AND** 支持 camera motion 参数

### Requirement: Kling (可灵) Provider
系统 SHALL 支持快手可灵 AI 视频生成。

#### Scenario: 配置
- **WHEN** 选择 Kling Provider
- **THEN** 需要配置 API Key（或账号 Cookie）
- **AND** 可选择模型版本（1.0、1.5、2.0）
- **AND** 支持标准/专业模式

#### Scenario: 特色功能
- **WHEN** 使用 Kling 生成
- **THEN** 支持首尾帧生成
- **AND** 支持运动笔刷控制
- **AND** 支持 5s、10s 视频

### Requirement: Pika Provider
系统 SHALL 支持 Pika Labs 视频生成。

#### Scenario: 配置
- **WHEN** 选择 Pika Provider
- **THEN** 需要配置 API Key
- **AND** 可选择模型版本

### Requirement: Sora2 Provider (占位)
系统 SHALL 预留 OpenAI Sora2 接口。

#### Scenario: 配置
- **WHEN** 选择 Sora2 Provider
- **THEN** 需要配置 OpenAI API Key
- **AND** 待 API 正式开放后实现

### Requirement: ComfyUI AnimateDiff Provider
系统 SHALL 支持本地 ComfyUI + AnimateDiff。

#### Scenario: 配置
- **WHEN** 选择 ComfyUI ITV Provider
- **THEN** 需要配置 ComfyUI 服务地址
- **AND** 需要上传或选择 AnimateDiff 工作流 JSON
- **AND** 系统自动映射输入节点（图片、提示词、种子等）

#### Scenario: 本地渲染
- **WHEN** 调用 ComfyUI 生成
- **THEN** 将图片和参数发送到本地 ComfyUI
- **AND** 通过 WebSocket 监听进度
- **AND** 获取生成的视频文件

### Requirement: Generation Progress
系统 SHALL 显示视频生成进度。

#### Scenario: 进度反馈
- **WHEN** 视频生成进行中
- **THEN** 显示当前状态（排队中/生成中/后处理）
- **AND** 对于支持的 Provider 显示百分比进度
- **AND** 显示预计剩余时间（如果可用）

#### Scenario: 轮询检查
- **WHEN** Provider 使用异步生成模式
- **THEN** 系统定期轮询任务状态
- **AND** 自动下载生成完成的视频

### Requirement: Video Cache
系统 SHALL 缓存生成的视频。

#### Scenario: 版本存储
- **WHEN** 视频生成完成
- **THEN** 存储到 `shots/{shotId}/versions/v{n}/video.mp4`
- **AND** 记录生成参数（provider, seed, prompt, motion）

#### Scenario: 版本回溯
- **WHEN** 用户切换视频版本
- **THEN** 加载对应版本的视频文件
- **AND** 更新时间线预览

