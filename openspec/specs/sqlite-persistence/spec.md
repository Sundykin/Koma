# sqlite-persistence Specification

## Purpose
TBD - created by archiving change json-to-sqlite-persistence. Update Purpose after archive.
## Requirements
### Requirement: Database Connection Management
系统 SHALL 提供统一的 SQLite 数据库连接管理模块 (BaseDB)。

#### Scenario: 初始化数据库连接
- **WHEN** 应用主进程启动时
- **THEN** 在 `{storageRoot}/db/` 目录下创建或打开 `koma.db`
- **AND** 启用 WAL 模式 (`PRAGMA journal_mode=WAL`)
- **AND** 启用外键约束 (`PRAGMA foreign_keys=ON`)
- **AND** 设置 busy_timeout 为 6000ms

#### Scenario: 关闭数据库连接
- **WHEN** 应用关闭 (`before-close` 生命周期)
- **THEN** 执行 `PRAGMA wal_checkpoint(TRUNCATE)` 刷新 WAL
- **AND** 关闭数据库连接

#### Scenario: 数据库目录不存在
- **WHEN** `{storageRoot}/db/` 目录不存在时
- **THEN** 系统自动创建该目录
- **AND** 然后创建数据库文件

### Requirement: Schema Initialization
系统 SHALL 在首次连接时自动初始化数据库表结构。

#### Scenario: 首次启动建表
- **WHEN** 数据库文件新创建时
- **THEN** 执行完整的 DDL 脚本创建所有表：projects、characters、scenes、props、shots、shot_versions、assets、episodes、timelines、timeline_tracks、timeline_clips、schema_version
- **AND** 创建所有索引
- **AND** 在 schema_version 表记录初始版本

#### Scenario: Schema 版本检查
- **WHEN** 打开已有数据库时
- **THEN** 读取 schema_version 表获取当前版本
- **AND** 如果版本低于应用期望版本，执行增量迁移脚本
- **AND** 每次迁移在事务中执行

### Requirement: Repository Interface Abstraction
系统 SHALL 通过 Repository 接口抽象数据访问，与存储引擎解耦。

#### Scenario: Repository 接口定义
- **WHEN** 业务代码需要操作数据时
- **THEN** 通过 Repository 接口调用（IProjectRepository、ICharacterRepository 等）
- **AND** 接口定义 `list()`, `getById()`, `create()`, `update()`, `delete()` 等方法
- **AND** 返回值为纯数据对象

#### Scenario: SQLite 实现注入
- **WHEN** 应用初始化时
- **THEN** 创建 SQLite Repository 实例
- **AND** 注入到 Service 层

#### Scenario: 事务支持
- **WHEN** 需要原子操作（如创建项目 + 初始化关联数据）时
- **THEN** Repository SHALL 在同一事务中执行所有 SQL
- **AND** 任何一步失败则全部回滚

### Requirement: IPC Data Interface Layer
系统 SHALL 通过 IPC 接口暴露所有数据操作，前端不直接操作存储。

#### Scenario: 实体级 IPC 通道
- **WHEN** 前端需要操作项目/角色/场景/分镜等数据时
- **THEN** 通过对应的 IPC 通道调用后端 Controller
- **AND** Controller 调用 Service → Repository 完成数据操作
- **AND** 返回纯数据结果给前端

#### Scenario: 关联数据查询
- **WHEN** 前端需要项目及其关联数据（角色、场景等）时
- **THEN** 后端 Service 负责组装关联数据
- **AND** 一次 IPC 调用返回完整数据
- **AND** 前端不做多次调用后拼接

#### Scenario: 批量操作
- **WHEN** 前端需要批量创建/更新/删除数据时
- **THEN** 后端在一个事务中完成批量操作
- **AND** 前端只发一次 IPC 调用

### Requirement: Media Asset Metadata Storage
系统 SHALL 在数据库中仅存储媒体资产的元数据，不存储二进制内容。

#### Scenario: 存储图片资产元数据
- **WHEN** 导入或生成图片资产时
- **THEN** 数据库 `assets` 表存储：id、project_id、kind='image'、local_path（相对路径）、remote_url（可空）、mime_type、width、height、file_size、fingerprint
- **AND** 实际图片文件存储在 `{projectDir}/assets/images/` 目录

#### Scenario: 存储视频资产元数据
- **WHEN** 导入或生成视频资产时
- **THEN** 数据库 `assets` 表存储：id、project_id、kind='video'、local_path、remote_url、mime_type、width、height、duration_ms、fps、file_size
- **AND** 实际视频文件存储在 `{projectDir}/assets/videos/` 目录

#### Scenario: 存储音频资产元数据
- **WHEN** 导入或生成音频资产时
- **THEN** 数据库 `assets` 表存储：id、project_id、kind='audio'、local_path、remote_url、mime_type、duration_ms、file_size
- **AND** 实际音频文件存储在 `{projectDir}/assets/audio/` 目录

#### Scenario: 资产删除联动
- **WHEN** 通过 IPC 调用删除资产时
- **THEN** 后端删除数据库记录
- **AND** 同时删除对应的本地文件
- **AND** 如果文件不存在则静默跳过

### Requirement: Build and Native Module Compilation
系统 SHALL 支持 better-sqlite3 原生模块在各平台编译。

#### Scenario: macOS 构建
- **WHEN** 在 macOS 上执行 `npm run re-sqlite`
- **THEN** `electron-rebuild` 重编译 better-sqlite3 以匹配当前 Electron 版本

#### Scenario: Windows 构建
- **WHEN** 在 Windows 上执行 `npm run re-sqlite`
- **THEN** 需要 Visual Studio Community 已安装且勾选 C++ 桌面开发工作负载
- **AND** `electron-rebuild` 使用 MSVC 编译器重编译 better-sqlite3

#### Scenario: 构建失败恢复
- **WHEN** `npm run re-sqlite` 失败时
- **THEN** 可通过删除 `node_modules/better-sqlite3` 后重新安装再 rebuild

### Requirement: Project Data CRUD via SQLite
系统 SHALL 通过 SQLite 实现项目数据的完整 CRUD 操作。

#### Scenario: 列出所有项目
- **WHEN** 前端通过 IPC 调用 `listProjects()`
- **THEN** 后端查询 `projects` 表，动态计算 episodes 计数
- **AND** 返回按 `updated_at DESC` 排序的项目列表

#### Scenario: 创建项目
- **WHEN** 前端通过 IPC 调用 `createProject(meta)`
- **THEN** 后端在事务中：INSERT 项目记录 + 创建文件目录结构 + 插入默认 timeline
- **AND** 事务失败则回滚并清理已创建目录

#### Scenario: 更新项目
- **WHEN** 前端通过 IPC 调用 `updateProject(projectId, updates)`
- **THEN** 后端执行 UPDATE 并自动更新 updated_at

#### Scenario: 删除项目
- **WHEN** 前端通过 IPC 调用 `deleteProject(projectId)`
- **THEN** 后端 DELETE 项目记录（CASCADE 级联删除关联数据）
- **AND** 删除文件系统中的项目目录

#### Scenario: 加载项目详情
- **WHEN** 前端通过 IPC 调用 `loadProject(projectId)`
- **THEN** 后端关联查询 projects + characters + scenes + props 等
- **AND** 组装为完整数据对象一次性返回

### Requirement: Episode Data Storage
系统 SHALL 在 SQLite 中存储集数数据。

#### Scenario: 集数 CRUD
- **WHEN** 前端通过 IPC 调用集数相关操作
- **THEN** 后端在 episodes 表中执行对应的 INSERT/SELECT/UPDATE/DELETE
- **AND** 通过 project_id 关联项目

### Requirement: Timeline Data Storage
系统 SHALL 在 SQLite 中存储时间线、轨道、片段数据。

#### Scenario: 创建默认时间线
- **WHEN** 新建项目时
- **THEN** 后端插入 timelines 记录（fps=30, resolution=1920x1080）
- **AND** 插入 3 条 timeline_tracks（video、audio、subtitle）

#### Scenario: 加载时间线
- **WHEN** 前端通过 IPC 请求时间线数据时
- **THEN** 后端查询 timelines → tracks → clips 三层关联
- **AND** 组装为嵌套结构一次性返回

#### Scenario: 更新片段
- **WHEN** 前端通过 IPC 调用更新片段时
- **THEN** 后端执行 UPDATE timeline_clips

