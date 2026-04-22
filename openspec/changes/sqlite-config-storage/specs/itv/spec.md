## ADDED Requirements

### Requirement: ITV Channel Config Persistence
系统 SHALL 将 ITV（图生视频）渠道配置持久化在 SQLite `channel_configs` 表（`kind='itv'`）中。

#### Scenario: 读取 ITV 渠道
- **WHEN** ITV 服务需要加载可用渠道配置时
- **THEN** MUST 通过 `IChannelConfigRepository.list('itv')` 读取
- **AND** MUST NOT 读取 `settings.json` 中的 `itvConfigs` 字段
- **AND** MUST NOT 读取任何 `localStorage` 键

#### Scenario: 默认 ITV 渠道
- **WHEN** 项目或分镜未指定 ITV 渠道时
- **THEN** MUST 使用 `channel_configs` 表中 `kind='itv' AND is_default=1` 的渠道
- **AND** 若无默认渠道，MUST 在 UI 提示用户先行配置

#### Scenario: ITV 渠道 CRUD
- **WHEN** 用户在设置页管理 ITV 渠道
- **THEN** 前端 MUST 调用 `config:channel.list('itv')` / `config:channel.upsert` / `config:channel.delete` / `config:channel.setDefault('itv', id)`
- **AND** 所有写操作由后端在事务中完成并广播 `config:changed`

#### Scenario: API Key 加密
- **WHEN** 存储 ITV 渠道的 `api_key`
- **THEN** Repository MUST 加密后存入 SQLite
- **AND** 读取时自动解密

### Requirement: Media Defaults In KV
系统 SHALL 将 ITV 相关的媒体默认参数（分辨率/时长/FPS 等）存储在 `kv_configs` 表的 `media.defaults` 命名空间中。

#### Scenario: 读取媒体默认值
- **WHEN** ITV 表单初始化时需要默认参数
- **THEN** MUST 通过 `config:kv.listNamespace('media.defaults')` 获取
- **AND** MUST NOT 硬编码在前端常量中（内置默认值可作为代码常量在 seed 阶段写入 kv_configs）

#### Scenario: 更新默认值
- **WHEN** 用户修改 ITV 默认参数
- **THEN** 前端 MUST 调用 `config:kv.set('media.defaults', 'itv.<param>', value)`
- **AND** 后端广播 `config:changed`
