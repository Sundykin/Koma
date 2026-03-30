## MODIFIED Requirements

### Requirement: Shot Generation Storage
系统 SHALL 将分镜生成结果存储为结构化媒体资产记录。

#### Scenario: Version directory stores structured media assets
- **When** 分镜图片、视频或语音生成完成
- **Then** 文件仍按版本号存储到 `shots/{shotId}/versions/v{n}/`
- **And** 对应元数据 MUST 记录为结构化媒体资产对象
- **And** 结构化媒体资产 MUST 至少包含 `localPath`、`createdAt`，并在可用时记录 `remoteUrl`、`providerTaskId`、媒体尺寸或时长
- **And** 分镜和分镜版本 SHALL 不再依赖分散的路径与远程 URL 字段组合表示当前结果

## ADDED Requirements

### Requirement: Media Source Normalization
系统 SHALL 统一处理媒体输入输出的来源协议。

#### Scenario: Persist provider output from multiple source schemes
- **Given** Provider 输出可能是本地路径、远程 URL、`blob:` URL 或 `data:` URL
- **When** 系统准备将媒体结果保存到项目目录
- **Then** 系统 MUST 先将资源物化为项目内文件
- **And** 最终返回统一的结构化媒体资产对象
- **And** 工作流与 Store SHALL 不再自行判断 URL scheme

### Requirement: Legacy Media Fields Unsupported
系统 SHALL 不再在运行时迁移旧媒体字段。

#### Scenario: Legacy media fields do not get auto-migrated
- **Given** 项目数据中仍包含 `imagePath`、`imageUrl`、`previewVideoPath`、`previewVideoTaskId` 或等价旧字段
- **When** 用户打开项目
- **Then** 系统 SHALL 只读取结构化媒体槽位（`media.*`）
- **And** 宿主 SHOULD 给出清晰提示，说明旧项目需要离线迁移或重新生成媒体资产
