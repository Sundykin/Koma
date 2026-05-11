# Spec Delta: electron-integration

## ADDED Requirements

### Requirement: Updater 与 Marketplace IPC 桥
系统 SHALL 在 preload bridge 暴露 `window.electronAPI.updater` 与 `window.electronAPI.marketplace` 两个独立命名空间，所有 IPC 通道纳入 ALLOWED_INVOKE_CHANNELS 白名单。

#### Scenario: updater 通道注册
- **WHEN** preload 加载
- **THEN** `ALLOWED_INVOKE_CHANNELS` 包含 9 条 `controller/updater/*` 通道
- **AND** `window.electronAPI.updater` 暴露 9 个方法 + `onStateChange(cb)` 订阅

#### Scenario: marketplace 通道注册
- **WHEN** preload 加载
- **THEN** `ALLOWED_INVOKE_CHANNELS` 包含 6 条 `controller/marketplace/*` 通道
- **AND** `window.electronAPI.marketplace` 暴露 6 个方法 + `onStateChange(cb)` + `onPluginInstalled(cb)` 订阅

### Requirement: Updater 与 Marketplace 生命周期挂载
系统 SHALL 在 ee-core Lifecycle 的 `electronAppReady` 钩子中初始化 UpdaterService 与 PluginMarketplaceService，并在 `beforeClose` 中正确释放。

#### Scenario: 启动初始化
- **WHEN** Electron app 完成 ready，进入 `electronAppReady` 回调
- **THEN** 调 `initUpdater(taskService)` 实例化 UpdaterService
- **AND** 调 `initMarketplace(pluginRuntime)` 实例化 PluginMarketplaceService
- **AND** 注册各自的 IPC handler
- **AND** UpdaterService 启动"启动后 60s 静默检测"定时器

#### Scenario: 关闭释放
- **WHEN** Lifecycle 的 `beforeClose` 触发
- **THEN** 停止所有定时器
- **AND** 取消正在进行的下载（保留临时文件给下次启动续传）
- **AND** 不强制中断正在进行的插件安装事务（让其完成或自然回滚）

### Requirement: Updater 与 Marketplace 持久化命名空间
系统 SHALL 使用 SQLite `app_settings_kv` 表存储更新与插件市场的配置，键名严格按命名空间前缀。

#### Scenario: KV 键命名
- **WHEN** updater 或 marketplace service 读写偏好
- **THEN** updater 使用前缀 `updater-`（如 `updater-config`、`updater-last-installed-version`）
- **AND** marketplace 使用前缀 `marketplace-`（如 `marketplace-config`、`marketplace-plugin-versions-cache`）
- **AND** 两个命名空间互不读写对方键

### Requirement: 更新缓存目录
系统 SHALL 提供独立的 updater 和 marketplace 缓存目录 helper，位于业务存储根下，与 Electron 框架数据隔离。

#### Scenario: 目录 helper
- **WHEN** 代码需要更新下载缓存路径
- **THEN** 调用 `getUpdaterCacheDir()` 返回 `~/.koma/updater-cache/`
- **AND** 调用 `getMarketplaceCacheDir()` 返回 `~/.koma/marketplace-cache/`

#### Scenario: 启动清理过期缓存
- **WHEN** UpdaterService 或 PluginMarketplaceService 初始化
- **THEN** 清理对应缓存目录中超过 7 天未访问的文件

## MODIFIED Requirements

### Requirement: 插件 Manifest 字段扩展
插件 manifest 系统 SHALL 支持 `signature`、`engine.maxAppVersion`、`engine.apiVersion` 三个新字段，并在兼容性校验中实现对应规则。

#### Scenario: signature 字段
- **WHEN** 插件来自 marketplace（strictMode=true）安装路径
- **THEN** manifest.signature 必须存在且通过 ed25519 验签
- **AND** 验签使用与主程序更新通道相同的公钥

#### Scenario: 本地手动安装的 signature 处理
- **WHEN** 插件通过本地 ZIP 拖入安装（strictMode=false）
- **AND** manifest.signature 不存在或验签失败
- **THEN** 系统不拒绝加载
- **AND** 在日志和插件管理面板显示"未签名插件"警告

#### Scenario: maxAppVersion 上限校验
- **WHEN** 插件 manifest.engine.maxAppVersion 存在
- **AND** 当前主程序版本 > maxAppVersion
- **THEN** 兼容性校验失败
- **AND** 插件不被激活
- **AND** 插件管理面板显示"需要主程序 ≤ {maxAppVersion}"

#### Scenario: apiVersion 校验
- **WHEN** 插件 manifest.engine.apiVersion 不在主程序 `SUPPORTED_API_VERSIONS` 列表中
- **THEN** 兼容性校验失败
- **AND** 插件不被激活
- **AND** 插件管理面板显示"API 版本不兼容（需要 {apiVersion}）"

#### Scenario: 旧插件兼容
- **WHEN** 插件 manifest 不包含新增三个字段（旧版本）
- **THEN** 三个字段视为可选，按现有行为加载
- **AND** signature 缺失按"未签名"处理（仅警告）
- **AND** maxAppVersion 缺失视为无上限
- **AND** apiVersion 缺失视为 'v1'（当前默认）
