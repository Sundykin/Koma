## MODIFIED Requirements

### Requirement: Image to Video Generation
系统 SHALL 通过统一视频生成流程处理分镜与资产预览视频。

#### Scenario: Shot video generation passes normalized image inputs
- **Given** 分镜存在当前主图，且可选存在附加参考图
- **When** 用户触发分镜视频化
- **Then** 系统 MUST 构建统一的 `ITVRequest`
- **And** `ITVRequest` MUST 包含 `primaryImage`
- **And** 附加参考图存在时 MUST 通过 `additionalReferences` 传递
- **And** 生成完成后视频 MUST 被持久化为结构化媒体资产并绑定到分镜版本

### Requirement: 预览视频任务 ID 保存
系统 SHALL 将预览视频任务元数据保存在结构化视频资产中。

#### Scenario: Save preview video task metadata inside asset
- **When** 角色或道具预览视频生成完成
- **Then** 系统 MUST 在结构化视频资产中记录 Provider 任务 ID 和本地视频路径
- **And** 调用方 SHALL 通过该结构化视频资产读取任务元数据
- **And** 业务对象 SHALL 不再依赖独立的 `previewVideoTaskId` 字段

#### Scenario: Character or prop extraction reads task metadata from asset
- **When** 用户触发角色提取或道具提取
- **Then** 系统 MUST 从预览视频资产元数据中读取 Provider 任务 ID
- **And** 若任务元数据缺失，则提示用户重新生成预览视频
