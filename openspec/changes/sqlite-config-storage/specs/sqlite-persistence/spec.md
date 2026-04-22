## ADDED Requirements

### Requirement: Config Tables Schema
系统 SHALL 在 `koma.db` 中新增配置类表族，并通过 `schema_version` 管理升级。

#### Scenario: 首次启动建表
- **WHEN** 数据库文件新创建时
- **THEN** 除业务表外，DDL 脚本 MUST 同时创建配置表：`channel_configs`、`prompt_templates`、`visual_style_presets`、`plugin_registry`、`mcp_servers`、`agent_profiles`、`recent_projects`、`kv_configs`
- **AND** 创建对应索引（`channel_configs(kind, is_default)`、`prompt_templates(type)`、`recent_projects(last_opened_at DESC)` 等）
- **AND** 在 `schema_version` 表写入当前版本号

#### Scenario: 已有库升级
- **WHEN** 打开已有业务数据但无配置表的数据库时
- **THEN** 升级脚本 MUST 在事务中 `CREATE TABLE IF NOT EXISTS` 所有配置表并 seed 默认数据
- **AND** MUST NOT 读取或迁移 `settings.json` 等旧文件
- **AND** 升级失败 MUST 回滚并保留原 `schema_version`

#### Scenario: 种子幂等
- **WHEN** 升级脚本多次执行 seed 操作
- **THEN** MUST 使用 `INSERT OR IGNORE` 或等效手段跳过已存在行
- **AND** MUST NOT 覆盖 `prompt_templates.user_modified_at IS NOT NULL` 的用户编辑记录

### Requirement: Config Repository Implementations
系统 SHALL 在 `electron/service/storage/repositories/` 下实现配置类 Repository。

#### Scenario: Repository 清单
- **WHEN** 应用启动初始化 Repository 容器时
- **THEN** MUST 实例化：`SqliteChannelConfigRepository`、`SqlitePromptTemplateRepository`、`SqliteVisualStylePresetRepository`、`SqlitePluginRegistryRepository`、`SqliteMCPServerRepository`、`SqliteAgentProfileRepository`、`SqliteRecentProjectRepository`、`SqliteKvConfigRepository`
- **AND** 每个 Repository 共享 `BaseDB` 连接
- **AND** 每个 Repository 实现对应接口定义于 `repositories/interfaces.ts`

#### Scenario: Repository 内加密
- **WHEN** Repository 处理包含敏感字段的行
- **THEN** 写入前 MUST 加密敏感列，读取后 MUST 解密
- **AND** 加密工具复用全局加密模块（AES-256-GCM + machineId）
- **AND** 业务层（Service/Controller）看到的对象 MUST 只包含明文

### Requirement: Config IPC Controller
系统 SHALL 通过 `config:*` IPC 通道暴露所有配置操作给前端。

#### Scenario: Controller 注册
- **WHEN** 主进程初始化 IPC 时
- **THEN** MUST 注册 `configController`，其将所有 `config:*` 通道映射到对应 Repository 方法
- **AND** 所有写操作 MUST 在 Repository 事务中完成
- **AND** 写操作完成后 MUST 通过 `webContents.send('config:changed', payload)` 广播到所有渲染进程

#### Scenario: 批量启动查询
- **WHEN** 前端调用 `config:bootstrap`
- **THEN** Controller MUST 一次性查询并返回所有配置表的快照
- **AND** 单次 IPC 调用 MUST 覆盖前端首屏所需的全部配置

### Requirement: Plugin Binary Vs Metadata Separation
系统 SHALL 在 SQLite 中只存储插件元数据，插件包文件保持文件系统存储。

#### Scenario: 安装插件
- **WHEN** 用户通过 IPC 安装插件
- **THEN** 后端 MUST 解压 `.zip` 到 `{storageRoot}/plugins/<pluginId>/`
- **AND** 在 `plugin_registry` 表 INSERT 元数据行
- **AND** 如果任一步骤失败，MUST 事务回滚并清理已解压目录

#### Scenario: 卸载插件
- **WHEN** 用户通过 IPC 卸载插件
- **THEN** 后端 MUST DELETE `plugin_registry` 行并 `fs.rm` 对应目录
- **AND** 目录不存在时静默跳过

## MODIFIED Requirements

### Requirement: Schema Initialization
系统 SHALL 在首次连接时自动初始化数据库表结构，并覆盖业务表与配置表。

#### Scenario: 首次启动建表
- **WHEN** 数据库文件新创建时
- **THEN** 执行完整的 DDL 脚本创建所有业务表（projects、characters、scenes、props、shots、shot_versions、assets、episodes、timelines、timeline_tracks、timeline_clips）
- **AND** 同时创建所有配置表（`channel_configs`、`prompt_templates`、`visual_style_presets`、`plugin_registry`、`mcp_servers`、`agent_profiles`、`recent_projects`、`kv_configs`、`schema_version`）
- **AND** 创建所有索引
- **AND** 在 schema_version 表记录初始版本
- **AND** 在事务中 seed 内置 Prompt 模板与内置视觉风格预设

#### Scenario: Schema 版本检查
- **WHEN** 打开已有数据库时
- **THEN** 读取 schema_version 表获取当前版本
- **AND** 如果版本低于应用期望版本，执行增量迁移脚本（DDL + seed，不含旧数据迁移）
- **AND** 每次升级在事务中执行
