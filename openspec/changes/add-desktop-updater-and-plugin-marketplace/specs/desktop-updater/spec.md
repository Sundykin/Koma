# Spec: desktop-updater

## ADDED Requirements

### Requirement: 主程序更新检查与状态机
系统 SHALL 在桌面客户端中提供完整的主程序自动更新机制，覆盖检测 / 下载 / 安装 / 失败兜底全流程，并维护一个明确的更新状态机。

#### Scenario: 启动后静默检测
- **WHEN** 应用启动满 60 秒
- **AND** 用户的 `updater-config.autoCheck` 为 true（默认）
- **THEN** UpdaterService 调用 `checkNow()` 检查更新
- **AND** 状态从 `idle` 进入 `checking`
- **AND** 检查结果通过 `updater:state-changed` 广播给所有 renderer

#### Scenario: 用户手动检查更新
- **WHEN** 用户在"设置 → 关于"点击"检查更新"按钮
- **THEN** 立即触发 `checkNow()`
- **AND** 即使没有新版本也显式给用户反馈（"当前已是最新"）

#### Scenario: 检测到可用更新
- **WHEN** `checking` 完成且 manifest.version > 当前版本
- **AND** 验签 / 单调递增 / manifest 时效 全部通过
- **THEN** 状态进入 `update-available`（或长任务运行中时进入 `update-available-silent`）

#### Scenario: 网络失败
- **WHEN** manifest 拉取失败连续 3 次
- **THEN** 状态进入 `download-failed`
- **AND** UI 给出"重试 / 稍后再试 / 打开下载页"三个动作
- **AND** 系统不删除任何现有可执行文件

### Requirement: 长任务运行中静音 UI
系统 SHALL 在检测到长任务（视频生成、批量分镜、LLM 流式、脚本分析等）运行中时，完全静音所有更新相关的可视化提示。

#### Scenario: 长任务运行中检测到新版本
- **WHEN** 用户当前有至少一个 status='running' 且 type 属于长任务集合的 task
- **AND** UpdaterService 检测到新版本
- **THEN** 状态进入 `update-available-silent`
- **AND** 不显示任何 banner / modal / toast
- **AND** 仅在"设置"入口显示红点

#### Scenario: 长任务结束后升级提示
- **WHEN** 当前状态为 `update-available-silent`
- **AND** 所有长任务结束且空闲超过 30 秒
- **THEN** 状态升级为 `update-available`
- **AND** 显示非阻塞 UpdateBanner

### Requirement: 关键更新强制升级
系统 SHALL 支持 manifest 标注 `critical=true` 的关键更新，提供 7 分钟保存倒计时后强制升级，但仍允许保存工程。

#### Scenario: 关键更新立即提示
- **WHEN** manifest.critical=true 且当前版本 < manifest.minVersion
- **THEN** 立即显示 UpdateDialog（即使在 silent 状态也升级为可见）
- **AND** 显示 7 分钟倒计时
- **AND** 在倒计时结束前用户可以"立即下载"或"稍后"
- **AND** 倒计时结束后变为阻塞模态，仅允许"立即下载"

### Requirement: 平台策略分发
系统 SHALL 根据运行时平台（win-nsis / win-portable / mac-dmg / linux-appimage）使用不同的下载与安装策略。

#### Scenario: Windows NSIS 自动更新
- **WHEN** 平台为 Windows 且安装方式为 NSIS
- **THEN** 使用 electron-updater 标准流程：download → quitAndInstall
- **AND** 安装包写入系统标准下载缓存
- **AND** 更新进程不需要 admin 权限（perMachine=false）

#### Scenario: Windows portable 提示手动
- **WHEN** 平台为 Windows portable
- **THEN** 不支持自动更新
- **AND** 检测到新版时仅显示"前往官网下载新版"提示 + 打开 GitHub release 链接

#### Scenario: macOS 引导下载（未签名期过渡方案）
- **WHEN** 平台为 macOS
- **THEN** 下载 dmg 到 `~/.koma/updater-cache/`
- **AND** 客户端用 ed25519 公钥校验 SHA512 与 manifest 一致
- **AND** 通过后 `shell.openPath()` 让 Finder 弹出 dmg
- **AND** 弹引导对话框教用户拖到 Applications
- **AND** 系统不自动执行 `xattr -d com.apple.quarantine`
- **AND** 旧版本继续运行直到用户手动重启

#### Scenario: Linux AppImage 原地替换
- **WHEN** 平台为 Linux 且二进制为 AppImage
- **THEN** 使用 electron-updater AppImage 原生支持
- **AND** 通过 APPIMAGE 环境变量定位当前可执行文件并原地替换

### Requirement: ed25519 签名验证
系统 SHALL 用硬编码的 ed25519 公钥验证 `koma-update-manifest.json`，并对版本号做单调递增检查和 manifest 时效检查。

#### Scenario: 签名验证通过
- **WHEN** UpdaterService 拉取到 manifest.json 和 manifest.sig
- **THEN** 用 `electron/service/release-signing/publicKey.ts` 中的公钥调用 `verifyEd25519(manifest, sig)`
- **AND** 验证通过才进入后续校验

#### Scenario: 签名验证失败
- **WHEN** verifyEd25519 返回 false
- **THEN** 拒绝该 manifest
- **AND** 状态回到 idle
- **AND** 写日志（不向用户显示具体技术原因，避免暴露）

#### Scenario: 防降级
- **WHEN** manifest.version <= `updater-last-installed-version` KV 值
- **THEN** 拒绝该 manifest
- **AND** 写日志说明"防降级拦截"

#### Scenario: 防重放陈旧 manifest
- **WHEN** `Date.now() - manifest.releasedAt > 30 * 86400_000`（30 天）
- **THEN** 拒绝该 manifest
- **AND** 写日志说明"manifest 已过期"

### Requirement: 下载失败兜底
系统 SHALL 在任何下载失败时保证旧版本仍可启动，并向用户提供清晰的恢复路径。

#### Scenario: 失败可重试
- **WHEN** 下载过程中网络中断
- **THEN** 在 download-failed 状态保留错误描述
- **AND** UI 给出「重试 / 稍后再试 / 打开下载页」三个动作
- **AND** 下次启动 app 时仍可正常运行旧版本

#### Scenario: 失败永不破坏旧版
- **WHEN** 任何阶段失败（manifest 验签 / SHA512 / 下载中断 / 写入磁盘）
- **THEN** 系统不删除当前正在运行的可执行文件
- **AND** 安装包仅写入 `~/.koma/updater-cache/`，与运行中 app 完全隔离

### Requirement: 用户偏好设置
系统 SHALL 提供"自动检查更新"开关与 channel 切换（stable / beta），偏好持久化到 SQLite。

#### Scenario: 关闭自动检查
- **WHEN** 用户在"设置 → 关于"关闭"自动检查更新"
- **THEN** `updater-config.autoCheck=false` 写入 app_settings_kv
- **AND** 启动 60s 检测不再触发
- **AND** 启动时仍做一次轻量提示（小红点）

#### Scenario: 切换 Beta channel
- **WHEN** 用户开启"接收 Beta 版本"
- **THEN** `updater-config.channel='beta'` 写入
- **AND** 后续 checkNow 拉取 manifest 时携带 channel 参数

#### Scenario: 暂不更新（7 天）
- **WHEN** 用户在 banner 点击"暂不更新（7 天后再提醒）"
- **THEN** `updater-dismissed-until = now + 7 * 86400s` 写入
- **AND** 在 dismissed-until 之前的检测保持 silent

### Requirement: 遥测最小化
系统 SHALL 在更新检查请求中只携带必要信息，绝不携带用户身份相关数据。

#### Scenario: 检查请求携带字段
- **WHEN** UpdaterService 向 feed 服务器发起检查请求
- **THEN** 仅携带 `appVersion / os / arch / channel`
- **AND** User-Agent 固定为 `Koma-Updater/${version}`
- **AND** 不携带机器 ID、用户名、项目路径、安装路径
