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

#### Scenario: 项目目录结构
- **WHEN** 创建新项目时
- **THEN** 在 `{storageRoot}/projects/{projectId}/` 创建以下结构：
```
{projectId}/
├── project.json          # 项目元数据
├── timeline.json         # 时间线数据
├── assets/
│   ├── images/           # 图片素材
│   ├── videos/           # 视频素材
│   ├── audio/            # 音频素材
│   └── fonts/            # 字体文件
├── shots/
│   └── {shotId}/
│       ├── shot.json     # 分镜元数据
│       ├── versions/     # 历史版本
│       │   ├── v1/
│       │   │   ├── image.png
│       │   │   ├── video.mp4
│       │   │   └── audio.mp3
│       │   └── v2/
│       └── current/      # 当前使用版本（符号链接或复制）
├── cache/
│   ├── thumbnails/       # 缩略图缓存
│   ├── waveforms/        # 音频波形缓存
│   └── previews/         # 预览帧缓存
├── exports/              # 导出文件
└── temp/                 # 临时文件（启动时清理）
```

#### Scenario: 项目元数据文件
- **WHEN** 保存项目时
- **THEN** project.json 包含：
  - id, title, genre, mode
  - createdAt, updatedAt
  - characters, scenes, props 引用
  - settings (项目级模型配置覆盖)
- **AND** 使用 JSON Schema 验证结构

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
├── settings.json         # 全局设置（模型配置、主题、快捷键等）
├── recent-projects.json  # 最近项目列表
├── model-presets/        # 模型预设导出
│   └── {presetName}.json
├── licenses/             # 许可证文件
└── logs/                 # 应用日志
    └── {date}.log
```

#### Scenario: 设置加密
- **WHEN** 存储敏感信息（API Key）
- **THEN** 使用 AES-256-GCM 加密
- **AND** 密钥派生自机器唯一标识
- **AND** 加密字段标记为 `encrypted: true`

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

