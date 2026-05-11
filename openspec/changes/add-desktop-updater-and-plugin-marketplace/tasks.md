# Tasks: 桌面客户端更新机制与插件 Marketplace 通道

## Phase 0: 一次性配置（实施开始前完成）

- [ ] 0.1 生成 ed25519 keypair（本地受控机器执行）
- [ ] 0.2 私钥 base64 配置到 GitHub Secrets `KOMA_UPDATE_SIGN_KEY`（`Sundykin/KomaBuild` 仓 + `Koma` 仓都要）
- [ ] 0.3 公钥 base64 待写入 `electron/service/release-signing/publicKey.ts`（Phase 2.1 写入）
- [ ] 0.4 确认 `GH_TOKEN` PAT 含 `contents:write`，可推 `Sundykin/KomaBuild` 的 main 分支

## Phase 1: 构建与配置

- [ ] 1.1 `cmd/builder.json` publish 改为 `{ provider: 'github', owner: 'Sundykin', repo: 'KomaBuild', releaseType: 'release' }`
- [ ] 1.2 `cmd/builder-mac.json` publish 同上
- [ ] 1.3 `cmd/builder-mac-arm64.json` publish 同上
- [ ] 1.4 `cmd/builder-linux.json` publish 同上，且 target 从 `["deb"]` 改为 `["AppImage"]`
- [ ] 1.5 `cmd/builder.json` NSIS 段显式 `"perMachine": false`
- [ ] 1.6 `package.json` 增加 `electron-updater` 依赖（与 ee-core / electron 39 版本对齐，预期 ^6.x）
- [ ] 1.7 `npm install` 验证依赖可拉取

## Phase 2: 共享安全模块（main 进程）

- [ ] 2.1 新建 `electron/service/release-signing/publicKey.ts`：导出 base64 公钥常量 `KOMA_PUBLIC_KEY_B64`
- [ ] 2.2 新建 `electron/service/release-signing/manifestVerifier.ts`：
  - `verifyEd25519(payloadBytes, sigBase64): boolean`（Node `crypto.verify('ed25519', ...)`）
  - `verifyAppManifest(manifest, sig, prevInstalledVersion): VerifyResult`
  - `verifyPluginRegistry(registry): VerifyResult`
  - `verifyPluginManifest(manifest, prevInstalledVersion): VerifyResult`
  - VerifyResult 含 ok/reason 字段

## Phase 3: 主程序 updater 通道（main 进程）

- [ ] 3.1 `electron/service/paths.ts` 新增 helper `getUpdaterCacheDir()` → `~/.koma/updater-cache/`
- [ ] 3.2 新建 `electron/service/updater/types.ts`：`UpdaterState` / `UpdateManifest` / `PlatformInfo` 类型
- [ ] 3.3 新建 `electron/service/updater/store.ts`：通过 SqliteAppSettingsKvRepository 读写 `updater-*` 键
- [ ] 3.4 新建 `electron/service/updater/feedResolver.ts`：`resolveFeedURL(): Promise<string>` 当前直返 GitHub
- [ ] 3.5 新建 `electron/service/updater/longTaskGuard.ts`：
  - 维护 `LONG_TASK_TYPES` 常量
  - `isLongTaskRunning()` 查 TaskService.list
  - `subscribe(cb)` 订阅 TaskService.addListener，30s 防抖
- [ ] 3.6 新建 `electron/service/updater/changelog.ts`：根据 manifest.notes + i18n 渲染
- [ ] 3.7 新建 `electron/service/updater/platformStrategy.ts`：
  - `detectPlatform(): PlatformInfo`
  - `WindowsNsisStrategy / WindowsPortableStrategy / MacDmgGuidedStrategy / LinuxAppImageStrategy`
- [ ] 3.8 新建 `electron/service/updater/UpdaterService.ts`：
  - 状态机 (`idle / checking / update-available / update-available-silent / downloading / downloaded / ready-to-install / installing / no-update / download-failed`)
  - 集成 electron-updater，监听其事件
  - 调 manifestVerifier 做验签 + 单调递增 + 30 天 manifest 过期检查
  - 广播 `updater:state-changed`
  - `checkNow / download / installOnQuit / installNow / openManualDownload / dismiss / setAutoCheck / setChannel` 方法
- [ ] 3.9 新建 `electron/service/updater/index.ts`：导出 `initUpdater(taskService): UpdaterService`
- [ ] 3.10 新建 `electron/controller/updater.ts`：IPC controller，挂载 9 个 invoke handler

## Phase 4: 插件 marketplace 通道（main 进程）

- [ ] 4.1 `electron/service/paths.ts` 新增 helper `getMarketplaceCacheDir()` → `~/.koma/marketplace-cache/`
- [ ] 4.2 新建 `electron/service/marketplace/types.ts`：`MarketplaceState / PluginRegistry / PluginListItem / PluginUpdateItem`
- [ ] 4.3 新建 `electron/service/marketplace/store.ts`：读写 `marketplace-*` 键
- [ ] 4.4 新建 `electron/service/marketplace/registryClient.ts`：
  - `fetchRegistry(etag?): Promise<{ registry, etag, notModified }>`
  - 默认 URL `https://raw.githubusercontent.com/Sundykin/KomaBuild/main/plugin-registry.json`
  - 用 manifestVerifier.verifyPluginRegistry
- [ ] 4.5 新建 `electron/service/marketplace/pluginInstaller.ts`：
  - `install(item): Promise<void>` 下载 → SHA512 校验 → 解压到临时目录 → 验签 manifest → 兼容性检查 → 备份原目录 `.bak` → 替换 → pluginRuntime.reload → 成功删除 `.bak` / 失败回滚
- [ ] 4.6 新建 `electron/service/marketplace/PluginMarketplaceService.ts`：
  - `installing: Set<pluginId>` 守门
  - `list / checkUpdates / installOrUpdate / uninstall / getState / setAutoCheck`
  - 广播 `marketplace:state-changed` / `marketplace:plugin-installed`
- [ ] 4.7 新建 `electron/service/marketplace/index.ts`：导出 `initMarketplace(pluginRuntime): PluginMarketplaceService`
- [ ] 4.8 新建 `electron/controller/marketplace.ts`：IPC controller，挂载 6 个 invoke handler

## Phase 5: 插件 manifest 扩展

- [ ] 5.1 `electron/service/plugin/types.ts` 在 `PluginManifest` 加可选字段：`signature?: string`，`engine` 加 `maxAppVersion?: string`、`apiVersion?: string`
- [ ] 5.2 `packages/plugin-sdk/src/plugin.ts` 同步类型
- [ ] 5.3 `electron/service/plugin/compatibility.ts`：
  - `validatePluginCompatibility` 增加 `maxAppVersion` 上限校验
  - 增加 `apiVersion` 与主程序声明的 `SUPPORTED_API_VERSIONS = ['v1']` 匹配
  - 增加可选 `signature` 校验（marketplace 路径调 strictMode=true 时必须有签名，本地手动安装 strictMode=false 时仅 warn）
- [ ] 5.4 主程序声明 `SUPPORTED_API_VERSIONS` 常量（放在 `electron/service/plugin/constants.ts`）

## Phase 6: preload / lifecycle 接线

- [ ] 6.1 `electron/preload/bridge.ts` 在 `ALLOWED_INVOKE_CHANNELS` 追加：
  - `controller/updater/{check-now,get-state,download,install-on-quit,install-now,open-manual-download,dismiss,set-auto-check,set-channel}`
  - `controller/marketplace/{list,check-updates,install-or-update,uninstall,get-state,set-auto-check}`
- [ ] 6.2 `electron/preload/bridge.ts` 在 `window.electronAPI` 增加 `updater` namespace（9 方法 + `onStateChange(cb)` 订阅）
- [ ] 6.3 `electron/preload/bridge.ts` 增加 `marketplace` namespace（6 方法 + `onStateChange(cb)` + `onPluginInstalled(cb)`）
- [ ] 6.4 `electron/preload/index.ts` 在 preload() 中按 TaskService 模式调 `initUpdater()` / `initMarketplace()`
- [ ] 6.5 `electron/preload/lifecycle.ts` `electronAppReady()` 中启动 updater 的"启动后 60s 静默检测"定时器
- [ ] 6.6 `electron/preload/lifecycle.ts` `electronAppReady()` 中启动 marketplace 的"启动后注册表预拉"

## Phase 7: 前端

- [ ] 7.1 新建 `frontend/src/services/updaterClient.ts`：薄封装 `window.electronAPI.updater.*`
- [ ] 7.2 新建 `frontend/src/services/marketplaceClient.ts`：薄封装 `window.electronAPI.marketplace.*`
- [ ] 7.3 新建 `frontend/src/store/updater/updaterStore.ts`（Zustand）：订阅 onStateChange
- [ ] 7.4 新建 `frontend/src/store/marketplace/marketplaceStore.ts`：订阅 onStateChange + onPluginInstalled
- [ ] 7.5 新建 `frontend/src/hooks/useUpdater.ts`
- [ ] 7.6 新建 `frontend/src/hooks/useMarketplace.ts`
- [ ] 7.7 新建 `frontend/src/components/settings/AboutSettings.tsx`：版本号、构建时间、自动检查开关、Beta channel 开关、检查更新按钮、当前 feed 源指示
- [ ] 7.8 新建 `frontend/src/components/settings/PluginMarketSettings.tsx`：插件市场卡片列表 + 刷新注册表 + 安装/升级状态
- [ ] 7.9 改 `frontend/src/components/settings/SettingsPage.tsx`：注册"关于" + "插件市场"两个子项
- [ ] 7.10 新建 `frontend/src/components/common/UpdateBanner.tsx`：非阻塞顶部条幅（"立即下载 / 下次启动安装 / 暂不更新"）
- [ ] 7.11 新建 `frontend/src/components/common/UpdateDialog.tsx`：critical 更新模态 + 7 分钟倒计时；mac 分支含 Gatekeeper 文案
- [ ] 7.12 在主布局挂载 `UpdateBanner`，仅在 `update-available / downloaded / download-failed` 态显示且非 silent
- [ ] 7.13 设置入口红点：基于 updaterStore.state 派生

## Phase 8: 签名脚本与 CI

- [ ] 8.1 新建 `scripts/sign-update-manifest.cjs`：
  - 输入：GitHub Release tag、私钥（env `KOMA_UPDATE_SIGN_KEY`）、release assets 目录
  - 算每个产物 SHA512，组装 `koma-update-manifest.json`，ed25519 sign → 输出 `.json` + `.sig`
- [ ] 8.2 新建 `scripts/sign-plugin-manifest.cjs`：输入 plugin zip → 解出 manifest.json → 签名 → 写回 zip
- [ ] 8.3 新建 `scripts/update-plugin-registry.cjs`：
  - 拉 `Sundykin/KomaBuild` main 上的 `plugin-registry.json`
  - 加/更新对应插件条目（含新 zip 的 SHA512 / downloadUrl）
  - ed25519 重签整个 registry → 写回 → git commit & push
- [ ] 8.4 改 `.github/workflows/release.yml`：
  - 新增 `build-linux` job
  - 三个 build job 改用 `electron-builder --publish always`（依赖 `GH_TOKEN`）
  - 新增 `sign-manifest` job 依赖三个 build job
  - 改造原 `release` job 为 `publish-release`（draft → published）
- [ ] 8.5 新建 `.github/workflows/release-plugin.yml`：
  - 触发 `push: tags: plugin-*-*`
  - jobs: `build-plugin` → `sign-plugin-manifest` → `update-registry`
- [ ] 8.6 `plugin-registry.json` 初版（commit 到 `Sundykin/KomaBuild` main，由人工或脚本生成；初始为空 plugins 数组 + ed25519 签名）

## Phase 9: 验证

- [ ] 9.1 本地构造测试 release：临时 keypair + http-server，触发更新流程
- [ ] 9.2 长任务静音：发起 `shot-generation`，触发 checkNow，应进 `update-available-silent`；任务完成 + 30s 后应升级为可见
- [ ] 9.3 签名失败拒绝：换私钥重签 manifest，客户端应拒绝并保持 idle
- [ ] 9.4 降级拒绝：构造 version 低于 lastInstalledVersion 的 manifest，应拒绝
- [ ] 9.5 网络降级：DNS 改 127.0.0.1，应优雅 `download-failed` + 给手动下载链接按钮
- [ ] 9.6 mac 引导：mac 上触发更新，dmg 下载到 cache，验签后 Finder 弹窗 + 旧版继续运行
- [ ] 9.7 真实流程：tag v1.0.1 → Actions 跑完 → KomaBuild 有完整产物 + manifest + sig → 旧版 v1.0.0 应能检测到
- [ ] 9.8 插件 marketplace 全套场景：list / install / update / uninstall / 签名失败 / 不兼容（maxAppVersion）/ 防降级 / 升级失败回滚

## Phase 10: 文档

- [ ] 10.1 `CHANGELOG.md` 加 v1.0.1 条目
- [ ] 10.2 README 增加"自动更新"段落（含国内网络注意事项 + 关闭自动检查方法）
- [ ] 10.3 `Sundykin/KomaBuild` README 增加"如何发布主程序版本" + "如何发布插件版本"
- [ ] 10.4 内部文档：私钥保管、密钥轮换流程
