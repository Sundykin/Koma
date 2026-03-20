## MODIFIED Requirements

### Requirement: Shot Image Generation Workflow
系统 SHALL 通过统一媒体生成工作流处理分镜图片生成。

#### Scenario: Generate shot image with normalized references
- **Given** 分镜存在可用的图片提示词，或可回退到 description 构建图片提示词
- **And** 项目已配置 `styleSnapshot` 和 TTI Provider
- **When** 用户触发分镜图片生成
- **Then** 系统 MUST 先将分镜参考图与关联资产图片解析为统一的 `ProviderAssetInput[]`
- **And** 系统 SHALL 通过统一媒体生成服务发起 TTI 请求
- **And** 生成结果 MUST 被持久化为结构化图片资产并绑定到分镜
- **And** 工作流 SHALL 不再直接写入分散的 `imagePath`、`imageUrl`、`imagePaths` 字段

#### Scenario: Generate shot image without description
- **Given** 分镜没有 description
- **When** 尝试生成分镜图片
- **Then** 系统 MUST 提示“请先生成分镜提示词”

## ADDED Requirements

### Requirement: Unified Media Task Orchestration
系统 SHALL 通过单一媒体生成编排层处理图片、视频和语音任务。

#### Scenario: All generation workflows use one orchestration boundary
- **When** 角色定妆照、场景图、道具图、预览视频、分镜图片或分镜配音开始生成
- **Then** 对应工作流 MUST 调用统一媒体生成服务
- **And** 请求 MUST 携带 `ownerRef` 标识结果应回写的实体或分镜版本
- **And** 任务创建、轮询、持久化和结果绑定 SHALL 不再散落在多个工作流中

#### Scenario: Recovered task binds result back to owner
- **When** 应用重启后恢复到一个已完成或恢复完成的媒体任务
- **Then** 系统 MUST 根据任务中的 `ownerRef` 将结果绑定回角色、场景、道具或分镜版本
- **And** 恢复流程 SHALL 不只记录任务日志
