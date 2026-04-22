## ADDED Requirements

### Requirement: Channel Config Persistence
系统 SHALL 将 LLM/TTI/ITV/TTS 渠道配置持久化在 SQLite `channel_configs` 表中。

#### Scenario: 读取渠道配置
- **WHEN** Provider 解析器需要某类渠道配置时
- **THEN** MUST 通过 `IChannelConfigRepository.list(kind)` 读取
- **AND** MUST NOT 读取 `settings.json` 或 `localStorage`
- **AND** 返回数据中 `api_key` 等敏感字段 MUST 为解密后的明文

#### Scenario: 默认渠道选择
- **WHEN** 运行时需要当前媒体类别的默认渠道
- **THEN** MUST 查询 `channel_configs` 中 `kind=? AND is_default=1` 的行
- **AND** 若无默认渠道，MUST 回退到 `kv_configs(namespace='channel', key='default.<kind>')` 指针
- **AND** 均为空时 MUST 返回 `null` 并由上层提示用户配置

#### Scenario: 新增/更新渠道
- **WHEN** 用户在设置页保存渠道配置
- **THEN** 前端 MUST 调用 `config:channel.upsert`
- **AND** 后端 Controller MUST 在事务中 UPSERT 并广播 `config:changed`

#### Scenario: 设置默认渠道
- **WHEN** 用户将某渠道设为默认
- **THEN** 后端 MUST 在事务中：`UPDATE channel_configs SET is_default=0 WHERE kind=?`、`UPDATE channel_configs SET is_default=1 WHERE id=?`、同步 `kv_configs` 中的指针

### Requirement: Channel Config Removal From JSON Files
系统 SHALL 不再从 `settings.json` 或 localStorage 读取任何渠道配置。

#### Scenario: JSON 文件不被读取
- **WHEN** 应用初始化 Provider 系统时
- **THEN** MUST NOT 打开或读取 `settings.json`
- **AND** MUST NOT 读取 `koma_settings`、`koma_presets` 等 localStorage 键

#### Scenario: 全新启动无默认渠道
- **WHEN** 用户首次启动应用
- **THEN** `channel_configs` 表为空
- **AND** UI MUST 显示引导提示"请先配置渠道"
- **AND** MUST NOT 自动从任何旧数据填充
