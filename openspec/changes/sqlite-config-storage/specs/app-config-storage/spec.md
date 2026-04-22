## ADDED Requirements

### Requirement: Config Database Location
系统 SHALL 将所有配置数据存储在与项目业务数据相同的 SQLite 文件中。

#### Scenario: 配置表位置
- **WHEN** 应用初始化数据库
- **THEN** 所有配置相关表 MUST 位于 `{storageRoot}/db/koma.db`
- **AND** 与 projects/characters/shots 等业务表共用同一个 `BaseDB` 连接
- **AND** 共享 WAL 模式、外键约束、busy_timeout 设置

#### Scenario: 多窗口并发访问
- **WHEN** 多个渲染进程同时读写配置
- **THEN** SQLite WAL + busy_timeout MUST 保证数据一致
- **AND** 主进程 Controller SHALL 通过事务串行化冲突写入

### Requirement: Channel Config Table
系统 SHALL 使用统一表 `channel_configs` 存储 LLM/TTI/ITV/TTS 四类渠道配置。

#### Scenario: 表结构
- **WHEN** 初始化 schema 时
- **THEN** 创建表 `channel_configs`，至少包含列：`id TEXT PRIMARY KEY`、`kind TEXT CHECK(kind IN ('llm','tti','itv','tts')) NOT NULL`、`name TEXT NOT NULL`、`provider TEXT NOT NULL`、`base_url TEXT`、`api_key TEXT`、`model_name TEXT`、`is_default INTEGER DEFAULT 0`、`meta_json TEXT`、`created_at INTEGER NOT NULL`、`updated_at INTEGER NOT NULL`
- **AND** 在 `(kind, is_default)` 上创建索引

#### Scenario: 默认渠道唯一性
- **WHEN** 用户将某个渠道设为默认
- **THEN** 后端 MUST 在事务中：UPDATE 同 `kind` 下所有其他行 `is_default=0`；UPDATE 目标行 `is_default=1`

#### Scenario: 敏感字段加密
- **WHEN** 写入 `api_key` 列
- **THEN** Repository MUST 使用 AES-256-GCM 加密
- **AND** 值以 `encrypted:` 前缀存储
- **AND** Repository 读取后对外返回明文

### Requirement: Prompt Template Table
系统 SHALL 使用表 `prompt_templates` 存储所有默认模板与用户自定义模板。

#### Scenario: 表结构
- **WHEN** 初始化 schema 时
- **THEN** 创建表 `prompt_templates`，至少包含列：`id TEXT PRIMARY KEY`、`type TEXT NOT NULL`、`name TEXT NOT NULL`、`description TEXT`、`template TEXT NOT NULL`、`variables_json TEXT`、`is_builtin INTEGER DEFAULT 0`、`user_modified_at INTEGER`、`created_at INTEGER NOT NULL`、`updated_at INTEGER NOT NULL`
- **AND** 在 `type` 上创建索引

#### Scenario: 默认模板 seed
- **WHEN** 数据库首次创建或升级到引入此表的 schema 版本时
- **THEN** 系统 MUST 将代码常量中的所有默认 Prompt 模板批量 INSERT
- **AND** `is_builtin=1`、`user_modified_at=NULL`

#### Scenario: 用户编辑内置模板
- **WHEN** 用户修改内置模板内容
- **THEN** 后端 MUST UPDATE 该行的 `template`/`variables_json`，设置 `user_modified_at=now()`
- **AND** 保留 `is_builtin=1`，但之后应用升级时 seed 逻辑 MUST 跳过 `user_modified_at != NULL` 的行

#### Scenario: 重置为默认
- **WHEN** 用户触发"重置模板"
- **THEN** 后端 MUST 将模板内容还原为代码常量，并清空 `user_modified_at`

### Requirement: Visual Style Preset Table
系统 SHALL 使用表 `visual_style_presets` 存储内置与自定义视觉风格预设。

#### Scenario: 表结构
- **WHEN** 初始化 schema 时
- **THEN** 创建表 `visual_style_presets`，至少包含列：`id TEXT PRIMARY KEY`、`name TEXT NOT NULL`、`description TEXT`、`tti_prefix TEXT`、`llm_suffix TEXT`、`thumbnail_path TEXT`、`is_builtin INTEGER DEFAULT 0`、`sort_order INTEGER DEFAULT 0`、`created_at INTEGER NOT NULL`、`updated_at INTEGER NOT NULL`

#### Scenario: 内置预设不可删除
- **WHEN** 用户尝试删除 `is_builtin=1` 的预设
- **THEN** IPC Controller MUST 返回错误并拒绝操作

### Requirement: Plugin Registry Table
系统 SHALL 使用表 `plugin_registry` 存储已安装插件的元数据，插件二进制包保持文件系统存储。

#### Scenario: 表结构
- **WHEN** 初始化 schema 时
- **THEN** 创建表 `plugin_registry`，至少包含列：`id TEXT PRIMARY KEY`、`name TEXT NOT NULL`、`version TEXT NOT NULL`、`source TEXT CHECK(source IN ('local','url','builtin')) NOT NULL`、`source_ref TEXT`、`enabled INTEGER DEFAULT 1`、`manifest_json TEXT NOT NULL`、`permissions_json TEXT`、`installed_at INTEGER NOT NULL`、`updated_at INTEGER NOT NULL`

#### Scenario: 插件文件与元数据分离
- **WHEN** 安装插件时
- **THEN** 后端 MUST 解压 `.zip` 到 `{storageRoot}/plugins/<pluginId>/`
- **AND** 在 `plugin_registry` 表 INSERT 一行
- **AND** 如果 INSERT 失败，MUST 回滚并清理已解压目录

#### Scenario: 卸载插件
- **WHEN** 用户卸载插件
- **THEN** 后端 MUST 在事务中 DELETE 元数据行并 `fs.rm` 对应目录
- **AND** 如果目录不存在，静默跳过

### Requirement: MCP Servers Table
系统 SHALL 使用表 `mcp_servers` 存储已注册的 MCP Server 配置。

#### Scenario: 表结构
- **WHEN** 初始化 schema 时
- **THEN** 创建表 `mcp_servers`，至少包含列：`id TEXT PRIMARY KEY`、`name TEXT NOT NULL`、`transport TEXT CHECK(transport IN ('stdio','sse','http')) NOT NULL`、`command TEXT`、`args_json TEXT`、`env_json TEXT`、`url TEXT`、`auth_token TEXT`、`enabled INTEGER DEFAULT 1`、`created_at INTEGER NOT NULL`、`updated_at INTEGER NOT NULL`
- **AND** `auth_token` 列遵循加密规范

### Requirement: Agent Profiles Table
系统 SHALL 使用表 `agent_profiles` 存储 Agent 编排配置。

#### Scenario: 表结构
- **WHEN** 初始化 schema 时
- **THEN** 创建表 `agent_profiles`，至少包含列：`id TEXT PRIMARY KEY`、`name TEXT NOT NULL`、`description TEXT`、`system_prompt TEXT`、`tools_json TEXT`、`channel_config_id TEXT`、`is_builtin INTEGER DEFAULT 0`、`created_at INTEGER NOT NULL`、`updated_at INTEGER NOT NULL`

### Requirement: Recent Projects Table
系统 SHALL 使用表 `recent_projects` 存储最近打开的项目记录。

#### Scenario: 表结构
- **WHEN** 初始化 schema 时
- **THEN** 创建表 `recent_projects`，至少包含列：`project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE`、`last_opened_at INTEGER NOT NULL`、`pinned INTEGER DEFAULT 0`
- **AND** 在 `last_opened_at DESC` 上创建索引

#### Scenario: 更新最近打开时间
- **WHEN** 用户打开项目
- **THEN** 后端 MUST UPSERT `recent_projects`，将 `last_opened_at` 设为当前时间戳

### Requirement: Generic Key-Value Config Table
系统 SHALL 提供通用键值配置表 `kv_configs` 存储零散/扩展型配置项。

#### Scenario: 表结构
- **WHEN** 初始化 schema 时
- **THEN** 创建表 `kv_configs(namespace TEXT NOT NULL, key TEXT NOT NULL, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(namespace, key))`

#### Scenario: 典型使用场景
- **WHEN** 需要存储以下配置
- **THEN** 使用 `kv_configs` 表，按 namespace 划分：
  - `storage` / `rootPath` — 存储根目录
  - `channel` / `default.<kind>` — 各类渠道默认 ID（作为 `channel_configs.is_default` 的冗余读取入口）
  - `cache` / `thumbnailMaxSize` — 缓存相关阈值
  - `media.defaults` / `<kind>.<param>` — 媒体生成默认参数
  - `feature` / `<flagName>` — 特性开关

#### Scenario: 禁止滥用
- **WHEN** 新增配置项超过 3 个字段或被多张业务表引用
- **THEN** MUST 升级为专用表而非塞入 `kv_configs`
- **AND** Code review SHALL 拒绝违反此规则的 PR

### Requirement: Config Repository Interfaces
系统 SHALL 为每个配置域暴露独立的 Repository 接口。

#### Scenario: 接口清单
- **WHEN** 业务层需要读写配置
- **THEN** MUST 通过以下接口之一：`IChannelConfigRepository`、`IPromptTemplateRepository`、`IVisualStylePresetRepository`、`IPluginRegistryRepository`、`IMCPServerRepository`、`IAgentProfileRepository`、`IRecentProjectRepository`、`IKvConfigRepository`
- **AND** 接口定义 `list`、`getById`、`upsert`、`delete` 等方法，返回纯数据对象
- **AND** 接口位于 `electron/service/storage/repositories/interfaces.ts`

#### Scenario: 事务跨 Repository
- **WHEN** 一个操作需要同时修改多个配置域（如设置默认 LLM 同时更新 `kv_configs`）
- **THEN** Controller MUST 在单个 `BaseDB` 事务中调用多个 Repository 方法

### Requirement: Config IPC Namespace
系统 SHALL 通过 `config:*` IPC 命名空间暴露所有配置读写能力。

#### Scenario: 通道清单
- **WHEN** 应用注册 IPC 时
- **THEN** MUST 注册：
  - `config:bootstrap` — 启动时批量获取全部配置
  - `config:channel.list`、`config:channel.upsert`、`config:channel.delete`、`config:channel.setDefault`
  - `config:prompt.list`、`config:prompt.upsert`、`config:prompt.reset`
  - `config:style.list`、`config:style.upsert`、`config:style.delete`
  - `config:plugin.list`、`config:plugin.install`、`config:plugin.setEnabled`、`config:plugin.uninstall`
  - `config:mcp.list`、`config:mcp.upsert`、`config:mcp.delete`
  - `config:agent.list`、`config:agent.upsert`、`config:agent.delete`
  - `config:kv.get`、`config:kv.set`、`config:kv.delete`、`config:kv.listNamespace`
  - `config:recent.list`、`config:recent.touch`、`config:recent.remove`
- **AND** 事件 `config:changed` 在任一写操作完成后广播到所有渲染进程

#### Scenario: 启动批量拉取
- **WHEN** 前端 `useConfigStore` 初始化时
- **THEN** MUST 调用一次 `config:bootstrap`
- **AND** 主进程返回 `{channels, prompts, styles, plugins, mcp, agents, kv, recent}` 快照

#### Scenario: 变更广播
- **WHEN** 任一配置写 IPC 完成
- **THEN** 主进程 MUST 通过 `config:changed` 事件广播 `{domain, action, payload}` 描述
- **AND** 前端 `useConfigStore` 监听事件并增量更新本地快照

### Requirement: No Direct Filesystem Or localStorage Access For Config
系统 SHALL 禁止前端在 Electron 模式下直接读写配置类文件或 localStorage。

#### Scenario: Electron 模式
- **WHEN** 应用运行在 Electron 环境
- **THEN** 前端 MUST 只通过 `komaAPI.config.*` 访问配置
- **AND** `frontend/src/constants/storageKeys.ts` MUST 只包含纯 UI 客户端态键（如 `app-language`）

#### Scenario: Web 开发模式
- **WHEN** 应用运行在纯浏览器（无 Electron）
- **THEN** `komaAPI.config` MUST 回落到内存 Mock 实现
- **AND** 刷新后配置丢失，仅用于前端 UI 调试
- **AND** MUST NOT 写入 localStorage

### Requirement: No Legacy Data Migration
系统 SHALL 不读取、不迁移、不转换任何旧的 JSON / localStorage 配置数据。

#### Scenario: 全新启动即空配置
- **WHEN** 用户从旧版本升级到本变更版本
- **THEN** 新的 SQLite 配置表 MUST 只包含默认 seed 数据（内置 Prompt 模板、内置视觉风格预设）
- **AND** 后端 MUST NOT 读取 `settings.json`、`recent-projects.json`、`model-presets/`、任何 `koma_*` localStorage 键
- **AND** 后端 MUST NOT 提供"导入旧配置"命令

#### Scenario: 旧文件保留但不使用
- **WHEN** 旧 `settings.json` 等文件仍存在于磁盘
- **THEN** 系统 MUST NOT 删除这些文件
- **AND** MUST NOT 在应用启动日志中读取或解析其内容

### Requirement: Config Schema Versioning
系统 SHALL 将配置表纳入统一的 `schema_version` 版本管理。

#### Scenario: Schema 升级
- **WHEN** 应用版本引入新的配置表或列
- **THEN** `CURRENT_SCHEMA_VERSION` MUST 提升
- **AND** 升级脚本 MUST 在事务中 `CREATE TABLE IF NOT EXISTS` + 必要的 `ALTER TABLE` + seed 默认数据
- **AND** MUST NOT DROP 任何已有表或列

#### Scenario: 种子幂等
- **WHEN** 升级脚本重复执行 seed 操作
- **THEN** MUST 只对不存在的行 INSERT
- **AND** MUST NOT 覆盖 `user_modified_at IS NOT NULL` 的行

### Requirement: Encrypted Field Policy
系统 SHALL 统一敏感字段的加密存储规范。

#### Scenario: 加密范围
- **WHEN** 表包含敏感列（`api_key`、`auth_token` 等）
- **THEN** 列值在入库前 MUST 使用 AES-256-GCM 加密，密钥派生自 machineId
- **AND** 加密后字符串 MUST 以 `encrypted:` 前缀标识
- **AND** Repository 读取后 MUST 解密并返回明文

#### Scenario: 解密失败
- **WHEN** 由于 machineId 变更等原因解密失败
- **THEN** Repository MUST 返回空字符串并记录警告日志
- **AND** MUST NOT 抛出异常中断启动
- **AND** 前端 UI 应在对应字段提示"请重新录入"
