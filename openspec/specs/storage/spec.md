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
系统 SHALL 为每个项目创建独立的存储目录。

#### Scenario: 项目完整数据文件 (project.json)
- **WHEN** 保存项目完整数据时
- **THEN** project.json 包含：
  - 剧本文本 (scriptText)
  - 角色列表 (characters)
  - 场景列表 (scenes)
  - 道具列表 (props)
  - 分镜列表 (shots)
  - 项目级设置 (settings)
  - **llmConfigId**: 关联的 LLM 配置 ID（可选，null 表示使用全局默认）
- **AND** 此文件在打开项目时加载

#### Scenario: 项目元数据文件 (meta.json)
- **WHEN** 保存项目元数据时
- **THEN** meta.json 包含：
  - id, title, genre, mode
  - status: 'script' | 'storyboard' | 'generating' | 'completed'
  - thumbnail: 项目封面路径
  - episodes: 集数
  - createdAt, updatedAt
  - **llmConfigId**: 关联的 LLM 配置 ID（可选）
- **AND** 此文件用于快速列表显示，不包含完整项目数据

### Requirement: Asset Storage Management
系统 SHALL 管理素材文件的存储和引用。

#### Scenario: 导入素材
- **WHEN** 用户导入外部媒体文件
- **THEN** 复制文件到 `assets/{type}/` 目录
- **AND** 生成唯一文件名（{timestamp}_{originalName}）
- **AND** 在 assets.json 中记录元数据

#### Scenario: 素材去重
- **WHEN** 导入已存在的素材时
- **THEN** 计算文件 MD5 哈希值
- **AND** 如果哈希匹配已有素材，复用现有文件
- **AND** 显示提示告知用户

#### Scenario: 素材清理
- **WHEN** 用户执行「清理未使用素材」
- **THEN** 扫描所有素材文件
- **AND** 删除未被任何 Clip 引用的素材
- **AND** 显示将释放的空间大小
- **AND** 需要用户确认

### Requirement: Shot Generation Storage
系统 SHALL 管理分镜生成的中间产物。

#### Scenario: 生成结果存储
- **WHEN** 分镜生成完成时
- **THEN** 按版本号存储到 `shots/{shotId}/versions/v{n}/`
- **AND** 记录生成参数（prompt, seed, model, timestamp）
- **AND** 更新 shot.json 中的 currentVersion 指针

#### Scenario: 版本切换
- **WHEN** 用户切换到历史版本
- **THEN** 更新 currentVersion 指针
- **AND** 如果使用符号链接模式，更新链接目标
- **AND** 时间线自动刷新显示

#### Scenario: 版本清理
- **WHEN** 用户删除某个版本
- **THEN** 删除对应版本目录
- **AND** 如果删除的是当前版本，自动切换到最近版本
- **AND** 保留至少一个版本（最新版不可删除）

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
系统 SHALL 支持存储格式迁移。

#### Scenario: 版本升级迁移
- **WHEN** 应用更新��存储格式变化
- **THEN** 检测存储版本号
- **AND** 执行必要的数据迁移
- **AND** 备份原数据
- **AND** 更新版本号

#### Scenario: 项目导入
- **WHEN** 用户导入外部项目包（.koma.zip）
- **THEN** 解压到项目目录
- **AND** 验证目录结构完整性
- **AND** 注册到项目列表

#### Scenario: 项目导出
- **WHEN** 用户导出项目为包
- **THEN** 打包整个项目目录为 .koma.zip
- **AND** 包含所有素材和生成文件
- **AND** 可选择排除缓存和临时文件

### Requirement: Projects Index File
系统 SHALL 维护一个项目索引文件以提升列表性能。

#### Scenario: 索引文件结构
- **WHEN** 系统需要列出项目时
- **THEN** 读取 `{storageRoot}/projects-index.json`
- **AND** 索引包含所有项目的摘要信息（id, title, genre, mode, status, thumbnail, createdAt, updatedAt）
- **AND** 避免遍历项目目录读取每个 meta.json

#### Scenario: 索引同步 - 创建
- **WHEN** 创建新项目时
- **THEN** 在项目目录创建 meta.json 后
- **AND** 同步在索引文件中添加该项目条目

#### Scenario: 索引同步 - 更新
- **WHEN** 更新项目元数据时
- **THEN** 更新项目目录下的 meta.json
- **AND** 同步更新索引文件中对应条目

#### Scenario: 索引同步 - 删除
- **WHEN** 删除项目时
- **THEN** 删除项目目录
- **AND** 从索引文件中移除对应条目

#### Scenario: 索引重建
- **WHEN** 索引文件损坏或缺失
- **THEN** 系统遍历 `projects/` 目录
- **AND** 读取每个项目的 meta.json
- **AND** 重建完整的索引文件

### Requirement: Project Delete Operation
系统 SHALL 支持完整删除项目。

#### Scenario: 删除项目
- **WHEN** 用户确认删除某个项目
- **THEN** 递归删除 `{storageRoot}/projects/{projectId}/` 整个目录
- **AND** 从 `projects-index.json` 移除该项目
- **AND** 从 `recent-projects.json` 移除该项目（如果存在）

#### Scenario: 删除确认
- **WHEN** 用户点击删除按钮
- **THEN** 显示确认对话框
- **AND** 警告此操作不可恢复
- **AND** 显示项目名称以防误删

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

