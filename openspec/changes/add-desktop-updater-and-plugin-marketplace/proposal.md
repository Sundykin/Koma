# Change: 桌面客户端更新机制与插件 Marketplace 通道

## Why

Koma Studio 已通过 `.github/workflows/release.yml` 把构建产物发布到独立仓 `Sundykin/KomaBuild`，但**客户端完全没有更新机制**：

- `cmd/builder*.json` 的 `publish` 字段 URL 为空
- 主进程没有任何 `electron-updater` / `autoUpdater` 代码
- 用户拿到新版只能手动重新下载安装

同时，插件体系 (`electron/service/plugin/`、`packages/plugin-sdk`) 已有完整的 manifest / 兼容性校验 / 加载机制，但缺少 marketplace 通道：

- `PluginManifest` 无 `signature` / `maxAppVersion` / `apiVersion` 字段
- 没有"检查插件更新 / 安装新插件"的服务端注册表与客户端逻辑
- 第三方安装路径无完整性保护

本提案一次性落地主程序更新通道 + 插件 marketplace 通道（双通道并行），共用同一对 ed25519 签名密钥，但状态机、UI、KV 命名空间、生命周期完全隔离。

## What Changes

### 主程序更新通道（desktop-updater capability，新增）
- 引入 `electron-updater`，主程序走 GitHub Releases（`Sundykin/KomaBuild`）
- 平台策略：Windows NSIS 自动更新 / Windows portable 提示手动 / macOS dmg 引导式（未签名期）/ Linux 由 deb 切换为 AppImage
- ed25519 签名 manifest（`koma-update-manifest.json` + `.sig`）+ 单调递增防降级 + 30 天 manifest 过期保护
- 启动后 60s 静默检测、手动检查、关键更新强制（带 7 分钟保存倒计时）
- **长任务运行中**（`tti / itv / tts / shot-generation / llm:complete` 等）严禁弹任何更新 UI
- 失败兜底：人话错误 + 「重试 / 稍后再试 / 打开下载页」三动作 + 旧版本必须可启动

### 插件 marketplace 通道（plugin-marketplace capability，新增）
- 注册表 `plugin-registry.json` 托管在 `Sundykin/KomaBuild` main 分支 raw URL，整体用同一公钥签名
- 客户端：拉注册表 → 验签 → 列出可用插件 → 用户点击安装/升级 → 下载 zip → 验签 → 替换目录 → reload
- 插件升级失败回滚 `.bak` → 原目录，保证旧版本继续运行
- 与主程序通道隔离：独立 service、独立 IPC、独立 KV、独立状态机；只共用 `security/manifestVerifier` 与 `publicKey`
- 本期 marketplace 仅放官方/审核插件（同一对密钥签名）；社区开放上架为后续话题

### 插件兼容性扩展（plugin-management capability，修改）
- `PluginManifest` 增加 `signature` 字段（可选；marketplace 安装强校验，本地手动安装仅警告）
- `engine.maxAppVersion` 新增（防止主程序破坏性升级后老插件继续加载）
- `engine.apiVersion` 新增（与主程序声明的支持列表匹配）
- `electron/service/plugin/compatibility.ts` 加上述三项校验

### 构建与 CI（修改）
- `cmd/builder.json` / `builder-mac.json` / `builder-mac-arm64.json` / `builder-linux.json` 的 `publish` 改为 `github` provider 指向 `Sundykin/KomaBuild`
- `cmd/builder-linux.json` target 从 `deb` 改为 `AppImage`
- `cmd/builder.json` NSIS 段显式 `perMachine: false`
- `.github/workflows/release.yml` 增加 build-linux job、sign-manifest job、publish-release（draft → published）
- 新增 `.github/workflows/release-plugin.yml`：plugin tag 触发 → 打 zip → 签 manifest → 更新 registry → commit 回 main

## Impact

- **新增 specs**: `desktop-updater`、`plugin-marketplace`
- **修改 specs**: `electron-integration`（preload bridge 新增 namespaces；lifecycle 新增挂载点）
- **新增代码**:
  - `electron/service/updater/` 全套（8 文件）
  - `electron/service/marketplace/` 全套（6 文件）
  - `electron/service/release-signing/` 共享模块（`manifestVerifier.ts` / `publicKey.ts`）
  - `electron/controller/updater.ts` / `marketplace.ts`
  - 前端 `services/updaterClient.ts` / `marketplaceClient.ts` / `store/{updater,marketplace}/` / `hooks/use{Updater,Marketplace}.ts` / `components/settings/{AboutSettings,PluginMarketSettings}.tsx` / `components/common/Update{Banner,Dialog}.tsx`
  - `scripts/sign-update-manifest.cjs` / `sign-plugin-manifest.cjs` / `update-plugin-registry.cjs`
- **修改代码**:
  - `electron/preload/bridge.ts`：白名单 + bridge 暴露 `window.electronAPI.updater` / `.marketplace`
  - `electron/preload/lifecycle.ts`：`electronAppReady` 中初始化两个 service
  - `electron/preload/index.ts`：preload() 内注册
  - `electron/service/paths.ts`：新增 `getUpdaterCacheDir()` / `getMarketplaceCacheDir()`
  - `electron/service/plugin/types.ts`：`PluginManifest` 加 `signature` / `engine.maxAppVersion` / `engine.apiVersion`
  - `electron/service/plugin/compatibility.ts`：三项新校验
  - `packages/plugin-sdk/src/plugin.ts`：同步类型
  - 四个 `cmd/builder*.json`：publish + Linux target + NSIS perMachine
  - `frontend/src/components/settings/SettingsPage.tsx`：注册 About + 插件市场 子项
  - `.github/workflows/release.yml`
  - 新增 `.github/workflows/release-plugin.yml`
- **新增配置仓内容**（在 `Sundykin/KomaBuild` 而不是 Koma 仓）:
  - `plugin-registry.json` 初版
- **一次性运维**:
  - 生成 ed25519 keypair；私钥配 Secrets `KOMA_UPDATE_SIGN_KEY`；公钥写入 `publicKey.ts`
  - 已有 `GH_TOKEN`（cross-repo PAT）需扩权可推 main 分支以更新 registry

## Non-goals

- 灰度分流（按用户 ID hash 派发不同版本）
- 主程序版本回滚（插件可回滚到 `.bak`）
- portable 自动更新（只提示官网下载）
- deb / rpm 自动更新（Linux 只发 AppImage）
- 第三方插件开放上架（marketplace 仅放官方/审核插件）
- 国内 OSS / R2 镜像（用户决定本期不做，但 `feedResolver` 保留抽象点）
- 热更新前端代码
- macOS 真·后台更新（需 Apple Developer Program，独立排期；本期走"引导下载 + 验签 + 手动拖"）
