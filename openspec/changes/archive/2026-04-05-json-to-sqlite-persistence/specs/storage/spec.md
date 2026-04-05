## MODIFIED Requirements

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

### Requirement: Projects Index File
系统 SHALL 不再维护独立的 `projects-index.json` 文件。

#### Scenario: 项目列表查询
- **WHEN** 前端通过 IPC 请求项目列表
- **THEN** 后端直接查询 `projects` 表
- **AND** 无需索引文件

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

### Requirement: Project Delete Operation
系统 SHALL 通过数据库级联删除实现项目删除。

#### Scenario: 删除项目
- **WHEN** 前端通过 IPC 调用删除项目
- **THEN** 后端执行 `DELETE FROM projects WHERE id = ?`
- **AND** 外键 CASCADE 自动级联删除所有关联数据
- **AND** 后端删除文件系统中的项目目录
