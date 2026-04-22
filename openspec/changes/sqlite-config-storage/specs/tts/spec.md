## ADDED Requirements

### Requirement: TTS Channel Config Persistence
系统 SHALL 将 TTS 渠道配置持久化在 SQLite `channel_configs` 表（`kind='tts'`）中。

#### Scenario: 读取 TTS 渠道
- **WHEN** TTS 服务需要加载可用渠道配置时
- **THEN** MUST 通过 `IChannelConfigRepository.list('tts')` 读取
- **AND** MUST NOT 读取 `settings.json` 中的 `ttsConfigs` 字段
- **AND** MUST NOT 读取任何 `localStorage` 键

#### Scenario: 默认 TTS 渠道
- **WHEN** 项目未指定 TTS 渠道时
- **THEN** MUST 使用 `channel_configs` 表中 `kind='tts' AND is_default=1` 的渠道
- **AND** 若无默认渠道，MUST 在 UI 提示用户先行配置

#### Scenario: TTS 渠道 CRUD
- **WHEN** 用户在设置页管理 TTS 渠道
- **THEN** 前端 MUST 调用 `config:channel.list('tts')` / `config:channel.upsert` / `config:channel.delete` / `config:channel.setDefault('tts', id)`
- **AND** 所有写操作由后端在事务中完成并广播 `config:changed`

#### Scenario: API Key 加密
- **WHEN** 存储 TTS 渠道的 `api_key`
- **THEN** Repository MUST 加密后存入 SQLite
- **AND** 读取时自动解密
