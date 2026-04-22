## MODIFIED Requirements

### Requirement: Global Settings Storage
系统 SHALL 将全局配置统一存储在 SQLite 数据库中，存储根目录下仅保留纯资源目录。

#### Scenario: 全局存储结构
- **WHEN** 应用运行时
- **THEN** 在 `{storageRoot}/` 下维护：
```
{storageRoot}/
├── db/
│   └── koma.db            # 项目数据 + 所有配置数据（SQLite）
├── assets/                # 素材文件（图片/视频/音频）
├── cache/                 # 缓存（缩略图、波形等）
├── temp/                  # 临时文件
├── exports/               # 导出产物
├── plugins/               # 插件运行时目录（每个插件一个子目录）
│   └── {pluginId}/
└── logs/                  # 应用日志
    └── {date}.log
```
- **AND** MUST NOT 维护 `settings.json`、`recent-projects.json`、`model-presets/` 目录

#### Scenario: LLM 配置存储位置
- **WHEN** 存储 LLM 配置时
- **THEN** MUST 存入 SQLite `channel_configs` 表（`kind='llm'`）
- **AND** MUST NOT 写入 `settings.json`

#### Scenario: 敏感字段加密
- **WHEN** 存储 API Key 等敏感信息
- **THEN** 使用 AES-256-GCM 加密
- **AND** 密钥派生自机器唯一标识
- **AND** 加密字段值以 `encrypted:` 前缀存储在 SQLite 列中

### Requirement: AppSettings Structure
系统 SHALL 通过 SQLite 配置表暴露统一的应用设置结构，前端通过 `config:*` IPC 组装。

#### Scenario: 设置字段来源
- **WHEN** 前端加载应用设置时
- **THEN** MUST 通过 `config:bootstrap` 一次性获取：
  - `channels.llm`：`channel_configs` 表中 `kind='llm'` 的行
  - `channels.tti`：`channel_configs` 表中 `kind='tti'` 的行
  - `channels.itv`：`channel_configs` 表中 `kind='itv'` 的行
  - `channels.tts`：`channel_configs` 表中 `kind='tts'` 的行
  - `promptTemplates`：`prompt_templates` 表全部记录
  - `visualStyles`：`visual_style_presets` 表全部记录
  - `kv`：`kv_configs` 表按 namespace 分组
- **AND** MUST NOT 有任何"旧版单配置字段兼容"分支

## REMOVED Requirements

### Requirement: Storage Migration
**Reason**：明确不做任何旧数据迁移。本次变更版本直接采用 SQLite 配置存储，旧 JSON 文件不读取、不导入、不备份。
**Migration**：无；用户升级后重新录入配置，旧文件保留在磁盘上但不被应用使用。

### Requirement: Projects Index File
**Reason**：`recent-projects.json`、`projects-index.json` 等索引文件已统一由 SQLite `projects` 表和 `recent_projects` 表承担。
**Migration**：前端通过 `config:recent.list` IPC 获取最近项目，不再读取 JSON 文件。
