# storage Specification

## Purpose
TBD - created by archiving change add-antd-timeline-editor. Update Purpose after archive.
## Requirements
### Requirement: Configurable Storage Root
系统 SHALL 支持用户自定义全局存储根目录。

#### Scenario: 默认存储位置
- **WHEN** 用户首次启动应用
- **THEN** 默认存储根目录为 `%USERPROFILE%/.koma` (Windows) 或 `~/.koma` (macOS/Linux)
- **AND** 如果目录不存在则自动创建

#### Scenario: 修改存储根目录
- **WHEN** 用户在设置中修改存储根目录
- **THEN** 系统保存新路径到注册表/配置文件
- **AND** 提示用户是否迁移现有数据
- **AND** 如果选择迁移，复制所有项目数据到新位置

#### Scenario: 验证存储路径
- **WHEN** 用户设置存储路径时
- **THEN** 系统验证路径可写
- **AND** 验证磁盘剩余空间充足
- **AND** 无效路径显示错误提示

### Requirement: Project Storage Structure
系统 SHALL 使用 SQLite 数据库作为项目数据的主存储引擎，替代原有的 JSON 文件存储。

#### Scenario: 项目完整数据存储
- **WHEN** 保存项目完整数据时
- **THEN** 项目元数据存储在 `projects` 表中
- **AND** 角色列表存储在 `characters` 表中
- **AND** 场景列表存储在 `scenes` 表中
- **AND** 道具列表存储在 `props` 表中
- **AND** 分镜列表存储在 `shots` 表和 `shot_versions` 表中
- **AND** 时间线数据存储在 `timelines`、`timeline_tracks`、`timeline_clips` 表中
- **AND** 所有表通过 `project_id` 外键关联

#### Scenario: 项目元数据查询
- **WHEN** 需要列出项目时
- **THEN** 直接查询 `projects` 表
- **AND** 不再维护 `projects-index.json` 索引文件
- **AND** 集数通过 `SELECT COUNT(*) FROM episodes WHERE project_id = ?` 动态计算

### Requirement: Asset Storage Management
系统 SHALL 通过数据库元数据管理素材引用，文件保持文件系统存储。

#### Scenario: 导入素材
- **WHEN** 用户通过 IPC 调用导入外部媒体文件
- **THEN** 后端复制文件到 `assets/{type}/` 目录
- **AND** 在 `assets` 数据库表中插入元数据记录
- **AND** 记录 local_path（相对路径）和 remote_url（如适用）

#### Scenario: 素材去重
- **WHEN** 导入已存在的素材时
- **THEN** 后端计算文件 MD5 哈希值
- **AND** 查询 `assets` 表的 fingerprint 字段
- **AND** 如果匹配则复用现有文件

#### Scenario: 素材清理
- **WHEN** 用户通过 IPC 执行「清理未使用素材」
- **THEN** 后端查询未被引用的资产记录
- **AND** 删除对应文件和数据库记录

### Requirement: Shot Generation Storage
系统 SHALL 通过数据库管理分镜生成的版本数据。

#### Scenario: 生成结果存储
- **WHEN** 分镜生成完成时
- **THEN** 后端在 `shot_versions` 表插入新版本记录
- **AND** 记录 image/video/audio 的 local 路径和 remote URL
- **AND** 记录生成参数（prompt、seed、model）
- **AND** 更新 `shots` 表的 `current_version`

#### Scenario: 版本切换
- **WHEN** 前端通过 IPC 调用切换版本
- **THEN** 后端 UPDATE shots SET current_version = ?

#### Scenario: 版本清理
- **WHEN** 前端通过 IPC 调用删除版本
- **THEN** 后端 DELETE shot_versions 记录并删除本地文件
- **AND** 如果删除当前版本，自动切换到最新版本

### Requirement: Cache Management
系统 SHALL 管理缓存文件以优化性能。

#### Scenario: 缩略图缓存
- **WHEN** 首次访问视频/图片素材
- **THEN** 生成缩略图并存储到 `cache/thumbnails/`
- **AND** 文件名为 `{sourceHash}_{size}.jpg`
- **AND** 后续访问直接读取缓存

#### Scenario: 波形缓存
- **WHEN** 首次加载音频到时间线
- **THEN** 提取波形数据并存储到 `cache/waveforms/`
- **AND** 文件名为 `{sourceHash}.json`

#### Scenario: 缓存清理
- **WHEN** 用户执行「清理缓存」或磁盘空间不足
- **THEN** 删除 `cache/` 目录下所有文件
- **AND** 下次访问时重新生成

### Requirement: Temporary Files
系统 SHALL 管理临时文件的生命周期。

#### Scenario: 临时文件创建
- **WHEN** 需要创建临时文件（如 FFmpeg 中间产物）
- **THEN** 存储到 `temp/` 目录
- **AND** 使用唯一文件名

#### Scenario: 临时文件清理
- **WHEN** 应用启动时
- **THEN** 清空所有项目的 `temp/` 目录
- **AND** 操作完成后也主动清理

### Requirement: Export Storage
系统 SHALL 管理导出文件。

#### Scenario: 导出位置选择
- **WHEN** 用户触发导出
- **THEN** 默认导出到 `exports/` 目录
- **AND** 用户可选择自定义导出路径
- **AND** 文件名格式：`{projectTitle}_{timestamp}.{ext}`

#### Scenario: 导出历史
- **WHEN** 导出完成后
- **THEN** 记录到 exports.json
- **AND** 包含文件路径、导出设置、时间戳

### Requirement: Global Settings Storage
系统 SHALL 在存储根目录保存全局配置。

#### Scenario: 全局存储结构
- **WHEN** 应用运行时
- **THEN** 在 `{storageRoot}/` 下维护：
```
{storageRoot}/
├── settings.json         # 全局设置（模型配置列表、主题、快捷键等）
├── recent-projects.json  # 最近项目列表
├── model-presets/        # 模型预设导出
│   └── {presetName}.json
├── licenses/             # 许可证文件
└── logs/                 # 应用日志
    └── {date}.log
```

#### Scenario: LLM 配置存储结构
- **WHEN** 存储 LLM 配置时
- **THEN** settings.json 中使用以下结构：
```json
{
  "llmConfigs": [
    {
      "id": "uuid",
      "name": "DeepSeek Chat",
      "provider": "openai-compatible",
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "encrypted:xxx",
      "modelName": "deepseek-chat",
      "isDefault": true,
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    }
  ],
  "defaultLLMConfigId": "uuid"
}
```
- **AND** apiKey 字段使用加密存储

#### Scenario: 设置加密
- **WHEN** 存储敏感信息（API Key）
- **THEN** 使用 AES-256-GCM 加密
- **AND** 密钥派生自机器唯一标识
- **AND** 加密字段值以 `encrypted:` 前缀标识

#### Scenario: 旧配置迁移
- **WHEN** 检测到旧的单模型配置格式（llm 字段为对象）
- **THEN** 自动迁移为新的数组格式
- **AND** 原配置作为第一个配置项且设为默认
- **AND** 备份原 settings.json 为 settings.json.bak

### Requirement: Storage Migration
系统 SHALL 不提供旧数据迁移能力。

#### Scenario: 全新启动
- **WHEN** 应用首次启动
- **THEN** 创建空的 SQLite 数据库并初始化 schema
- **AND** 不检测或迁移旧 JSON 数据

#### Scenario: 项目导入
- **WHEN** 用户通过 IPC 导入项目包（.koma.zip）
- **THEN** 后端解压文件、读取数据、插入 SQLite 数据库

#### Scenario: 项目导出
- **WHEN** 用户通过 IPC 导出项目
- **THEN** 后端从数据库查询数据，导出为可移植格式打包

### Requirement: Projects Index File
系统 SHALL 不再维护独立的 `projects-index.json` 文件。

#### Scenario: 项目列表查询
- **WHEN** 前端通过 IPC 请求项目列表
- **THEN** 后端直接查询 `projects` 表
- **AND** 无需索引文件

### Requirement: Project Delete Operation
系统 SHALL 通过数据库级联删除实现项目删除。

#### Scenario: 删除项目
- **WHEN** 前端通过 IPC 调用删除项目
- **THEN** 后端执行 `DELETE FROM projects WHERE id = ?`
- **AND** 外键 CASCADE 自动级联删除所有关联数据
- **AND** 后端删除文件系统中的项目目录

### Requirement: Project LLM Configuration
系统 SHALL 支持项目级别的 LLM 模型配置。

#### Scenario: 新建项目默认配置
- **WHEN** 创建新项目时
- **THEN** 自动关联全局默认 LLM 配置
- **AND** 如果没有全局默认配置，llmConfigId 为 null

#### Scenario: 切换项目模型
- **WHEN** 用户在项目设置中选择不同的 LLM 模型
- **THEN** 更新项目的 llmConfigId
- **AND** 后续该项目的 LLM 调用使用新选择的模型

#### Scenario: 使用全局默认
- **WHEN** 用户选择「使用全局默认」选项
- **THEN** 将 llmConfigId 设为 null
- **AND** 项目将动态使用当前的全局默认配置

#### Scenario: 引用的配置被删除
- **WHEN** 项目引用的 LLM 配置被删除
- **THEN** 系统检测到无效引用
- **AND** 自动回退到使用全局默认配置
- **AND** 显示提示告知用户

### Requirement: AppSettings Structure
系统 SHALL 使用统一的应用设置结构。

#### Scenario: 设置字段
- **WHEN** 加载 AppSettings 时
- **THEN** 包含以下媒体配置数组：
  - llmConfigs: LLMModelConfig[]
  - ttiConfigs: TTIConfig[]
  - itvConfigs: ITVConfig[]
  - ttsConfigs: TTSConfig[]
- **AND** 兼容处理旧版单配置字段

