## ADDED Requirements

### Requirement: Prompt Template Persistence
系统 SHALL 将默认模板和用户自定义模板统一存储在 SQLite `prompt_templates` 表中。

#### Scenario: 读取模板
- **WHEN** 业务代码需要某个类型的模板时
- **THEN** MUST 通过 `IPromptTemplateRepository.getByType(type)` 读取
- **AND** MUST NOT 读取 `localStorage` 的 `koma_prompt_templates` 键
- **AND** MUST NOT 读取 `settings.json` 的 `promptTemplates` 字段

#### Scenario: 首次启动 seed
- **WHEN** 数据库首次创建或升级到引入 `prompt_templates` 表的 schema 版本时
- **THEN** 系统 MUST 将代码常量中定义的所有默认模板批量 INSERT
- **AND** 每行 `is_builtin=1`、`user_modified_at=NULL`

#### Scenario: 自定义模板
- **WHEN** 用户在设置页新增模板
- **THEN** 前端 MUST 调用 `config:prompt.upsert`
- **AND** 后端 INSERT 一行 `is_builtin=0`、设置 `user_modified_at=now()`

#### Scenario: 编辑内置模板
- **WHEN** 用户修改内置模板内容
- **THEN** 后端 MUST UPDATE 该行 `template`/`variables_json`
- **AND** 设置 `user_modified_at=now()`
- **AND** 保留 `is_builtin=1`

#### Scenario: 重置为默认
- **WHEN** 用户触发"重置为默认"
- **THEN** 后端 MUST 将模板内容还原为代码常量定义
- **AND** 清空 `user_modified_at`
- **AND** 应用后续升级 seed 可再次覆盖

### Requirement: Template Change Propagation
系统 SHALL 在模板变更时广播事件，使所有渲染进程同步。

#### Scenario: 模板更新广播
- **WHEN** `config:prompt.upsert` 或 `config:prompt.reset` 完成
- **THEN** 主进程 MUST 通过 `config:changed` 事件广播 `{domain: 'prompt', action, id}`
- **AND** 前端 `useConfigStore` MUST 更新本地模板快照
