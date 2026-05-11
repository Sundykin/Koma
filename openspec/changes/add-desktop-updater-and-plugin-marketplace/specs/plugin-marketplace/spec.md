# Spec: plugin-marketplace

## ADDED Requirements

### Requirement: 插件注册表拉取与验签
系统 SHALL 从 `https://raw.githubusercontent.com/Sundykin/KomaBuild/main/plugin-registry.json` 拉取官方插件注册表，并用硬编码的 ed25519 公钥验签整个注册表内容。

#### Scenario: 注册表拉取与验签通过
- **WHEN** 用户进入"设置 → 插件市场"或应用启动后定时检测
- **THEN** registryClient 拉取最新 `plugin-registry.json`
- **AND** 用同一 ed25519 公钥 verify `signature` 字段
- **AND** 验证通过才使用其中的插件列表

#### Scenario: 注册表签名失败
- **WHEN** signature verify 失败
- **THEN** 拒绝该注册表
- **AND** UI 显示"插件注册表校验失败，已被忽略"
- **AND** 保留上一次成功的注册表缓存

#### Scenario: 注册表过期保护
- **WHEN** `Date.now() - registry.updatedAt > 7 * 86400_000`（7 天）
- **THEN** 拒绝该注册表
- **AND** UI 提示"注册表已过期，请联系维护者"

#### Scenario: 条件请求节省流量
- **WHEN** 客户端已缓存上次的 ETag
- **THEN** 拉取请求携带 `If-None-Match`
- **AND** 收到 304 时跳过签名校验，直接使用本地缓存

### Requirement: 插件安装与升级
系统 SHALL 允许用户从 marketplace 安装新插件或升级已有插件，全程包含签名校验、兼容性校验、防降级、失败回滚。

#### Scenario: 安装新插件
- **WHEN** 用户在 PluginMarketSettings 点击"安装"
- **THEN** PluginMarketplaceService 从 registry 条目的 downloadUrl 下载 zip
- **AND** 校验下载产物 SHA512 与 registry 条目一致
- **AND** 解压到临时目录后用 ed25519 公钥验签 manifest.signature
- **AND** 校验 `engine.minAppVersion / maxAppVersion / apiVersion` 与当前主程序兼容
- **AND** 通过后将插件目录移到 `pluginsDir/{pluginId}/`
- **AND** 调 `pluginRuntime.loadPlugin()` + `activatePlugin()`
- **AND** 成功后通过 `marketplace:plugin-installed` 广播

#### Scenario: 升级已安装插件
- **WHEN** 用户对已安装且 registry 标注有新版本的插件点击"升级"
- **THEN** 先将现有 `pluginsDir/{pluginId}/` 改名为 `pluginsDir/{pluginId}.bak/`
- **AND** 走与"安装新插件"相同的下载/验签/兼容性流程
- **AND** 成功后调 `pluginRuntime.reload()`
- **AND** reload 成功才删除 `.bak`
- **AND** 写入 `marketplace-plugin-versions-cache[pluginId] = newVersion`

#### Scenario: 升级失败回滚
- **WHEN** 升级过程中任何步骤失败（下载、验签、兼容性、reload 异常）
- **THEN** 删除新版临时目录
- **AND** 将 `.bak` 改名恢复为 `pluginsDir/{pluginId}/`
- **AND** pluginRuntime 仍以旧版正常运行
- **AND** UI 显示具体失败原因

#### Scenario: 插件防降级
- **WHEN** registry 条目的 version <= `marketplace-plugin-versions-cache[pluginId]`
- **THEN** 拒绝该版本
- **AND** UI 将该插件标为"已最新"（不显示降级选项）

#### Scenario: 不兼容插件提示
- **WHEN** 插件 manifest.engine.maxAppVersion 低于当前主程序版本
- **OR** engine.apiVersion 不在主程序 SUPPORTED_API_VERSIONS 列表中
- **THEN** UI 按钮变灰
- **AND** tooltip 显示具体不兼容原因（如"需要主程序 ≤ 0.9.0"）

### Requirement: 并发与状态广播
系统 SHALL 禁止同一插件并发安装/升级，并通过 `marketplace:state-changed` 事件向 renderer 同步状态。

#### Scenario: 并发守门
- **WHEN** 同一 pluginId 已在 installing 集合中
- **AND** 收到新的 installOrUpdate 请求
- **THEN** 拒绝并返回错误"该插件正在安装/升级中"

#### Scenario: 状态广播
- **WHEN** PluginMarketplaceService 任何状态变化（开始下载 / 验签完成 / 安装完成 / 失败）
- **THEN** 通过 `marketplace:state-changed` 广播到所有 renderer
- **AND** 广播载荷包含 `installing: pluginId[]`、`lastChecked`、`registryEtag`

### Requirement: 插件卸载
系统 SHALL 提供卸载已安装插件的能力，正确清理插件目录与运行时状态。

#### Scenario: 卸载插件
- **WHEN** 用户点击"卸载"
- **THEN** 先调 `pluginRuntime.deactivatePlugin()`
- **AND** 删除 `pluginsDir/{pluginId}/`
- **AND** 从 `marketplace-plugin-versions-cache` 移除 pluginId
- **AND** 广播 `marketplace:state-changed`

## MODIFIED Requirements

（plugin-management capability 的 manifest 字段扩展由 `electron-integration` delta 涵盖，因当前仓内未单独存在 plugin-management spec capability；如未来抽离请迁移至该 capability。）
