# Design: 桌面客户端更新机制与插件 Marketplace 通道

## 1. 决策动机与权衡

### 1.1 为什么不用社区/自研方案

| 选项 | 否决理由 |
|---|---|
| 自研增量更新 | 重复造轮子；electron-updater 已处理 Squirrel.Mac/NSIS/AppImage 三套协议、blockmap 差量、SHA512 校验 |
| GitHub provider | ✅ 采用。产物已在 `Sundykin/KomaBuild`，零额外服务端 |
| Generic provider | 否决：需自维护 latest.yml 上传流程，GitHub provider 由 electron-builder 自动产 yml |
| ee-core 内置 updater | 不存在；ee-core 4 没有官方 updater 模块 |

### 1.2 为什么主程序与插件共用密钥但通道隔离

- 共用密钥：本期 marketplace 只放**官方/审核插件**，运维成本最低；社区开放后再做"每个发布者一对密钥 + 注册公钥"的扩展
- 通道隔离：
  - 主程序更新影响整机；插件更新只影响单个目录
  - 主程序更新需要重启；插件更新热加载
  - 状态机、UI、KV、生命周期完全独立，避免一个出问题阻塞另一个
- **唯一共享**：`electron/service/release-signing/{manifestVerifier,publicKey}.ts`

### 1.3 为什么本期不做国内镜像

- 用户决定（投入产出比；GitHub 在大部分国内网络仍可用）
- 但 `feedResolver.resolveFeedURL(): Promise<string>` 接口保留抽象点，未来加镜像只改此函数

### 1.4 为什么 macOS 不走 Squirrel.Mac

- 当前 `cmd/builder-mac*.json` 的 `hardenedRuntime: false`，无 codesign 配置
- Squirrel.Mac 强制要求 Developer ID 签名 + 公证，否则 `autoUpdater` 直接报错
- 过渡方案：下载 dmg → ed25519 验签 → `shell.openPath()` 弹 Finder → 用户手动拖
- 后续补签名后只需替换 `platformStrategy.macStrategy()`

---

## 2. 模块边界

```
┌─────────────────────────────────────────────────────────────┐
│  Renderer (React)                                            │
│  ┌──────────────────┐  ┌────────────────────┐               │
│  │ useUpdater       │  │ useMarketplace     │               │
│  │ updaterStore     │  │ marketplaceStore   │               │
│  │ UpdateBanner     │  │ PluginMarketSet... │               │
│  │ UpdateDialog     │  │                    │               │
│  │ AboutSettings    │  │                    │               │
│  └────────┬─────────┘  └─────────┬──────────┘               │
└───────────│──────────────────────│─────────────────────────┘
            │ window.electronAPI.* │
            │  (preload bridge)    │
┌───────────▼──────────────────────▼─────────────────────────┐
│  Main (Electron)                                            │
│  ┌──────────────────┐  ┌────────────────────┐               │
│  │ UpdaterService   │  │ PluginMarketplace  │               │
│  │  + electron-     │  │  Service           │               │
│  │    updater       │  │  + registryClient  │               │
│  │  + longTaskGuard │  │  + pluginInstaller │               │
│  │  + platform      │  │                    │               │
│  │    Strategy      │  │                    │               │
│  └────────┬─────────┘  └─────────┬──────────┘               │
│           │                       │                          │
│           └─────────┬─────────────┘                          │
│                     │ 共用                                    │
│           ┌─────────▼─────────┐                              │
│           │ security/         │                              │
│           │  manifestVerifier │                              │
│           │  publicKey        │                              │
│           └───────────────────┘                              │
│                                                              │
│  依赖：TaskService (长任务感知) / pluginRuntime (插件热加载) │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. UpdaterService 状态机

```
idle
  │
  ├─ checkNow() / 启动 60s 定时
  ▼
checking
  │
  ├─ manifest 拉取失败 ──────────────► download-failed (短路)
  ├─ 验签失败 ─────────────────────► idle (静默拒绝，log)
  ├─ 单调递增检查失败 ─────────────► idle (静默拒绝，log)
  ├─ 已是最新 ─────────────────────► no-update ──► idle
  ▼
update-available
  │ (longTaskGuard.isLongTaskRunning() === true 时直接进 silent)
  ▼
update-available-silent  ──(任务结束 + 30s 空闲)──► update-available
  │
  │ user confirm download / autoDownload=true
  ▼
downloading
  │
  ├─ 失败 (重试 3 次) ─────────────► download-failed ─► (用户重试) ─► downloading
  ▼
downloaded
  │
  ├─ critical=true ─► 显式 7 分钟倒计时模态
  ├─ 用户 dismiss ─► dismissed-until 写入 KV
  ▼
ready-to-install
  │
  │ user install / quitAndInstall
  ▼
installing → process exits → 由 OS installer 接管
```

### 3.1 长任务静音判定

`longTaskGuard.ts` 使用现有 `TaskService`：

```ts
const LONG_TASK_TYPES = new Set([
  'tti', 'itv', 'tts',
  'shot-generation',
  'prompt-generation:image', 'prompt-generation:video',
  'llm:complete',
  'script-analysis', 'shot-analysis', 'entity-extraction',
  'episode-split', 'shot-prompt', 'asset-match',
]);

isLongTaskRunning(): boolean {
  return taskService.list({ status: 'running' })
    .some(t => LONG_TASK_TYPES.has(t.type));
}

onTaskUpdate(cb) {
  // 订阅 TaskService.addListener，命中 LONG_TASK_TYPES 的 status 变化触发 cb
}
```

UpdaterService：
- 任何弹 UI 前查 `isLongTaskRunning()`，命中 → silent
- 监听 task 完成事件；若 silent + 当前无长任务 + 30s 空闲 → 升级为可见

---

## 4. 签名 / 验签流程

### 4.1 主程序

| 工件 | 签名方 | 文件 |
|---|---|---|
| `koma-update-manifest.json` | ed25519 (`KOMA_UPDATE_SIGN_KEY`) | `koma-update-manifest.sig` (base64 raw sig) |
| 各平台安装包 | 由 electron-builder 算 SHA512，写入 manifest | （SHA512 字段在 manifest 内） |
| 公钥 | 硬编码到 `electron/service/release-signing/publicKey.ts` | 编译期不可变 |

**校验顺序**（`manifestVerifier.verifyAppManifest()`）：
1. ed25519 verify manifest.json + manifest.sig → 失败拒绝
2. `manifest.version > store.lastInstalledVersion` → 否则拒绝（防降级）
3. `Date.now() - manifest.releasedAt < 30 * 86400_000` → 否则拒绝（防重放陈旧 manifest）
4. 交给 electron-updater 走 SHA512 校验下载产物（双层独立）

### 4.2 插件

| 工件 | 签名方 | 位置 |
|---|---|---|
| `plugin-registry.json` | 同一 ed25519 私钥 | 注册表内 `signature` 字段 |
| 插件 zip 内的 `manifest.json` | 同一 ed25519 私钥 | manifest 内 `signature` 字段 |

**校验顺序**（`manifestVerifier.verifyPluginRegistry()` / `verifyPluginManifest()`）：
1. registry signature verify → 失败拒绝
2. `Date.now() - registry.updatedAt < 7 * 86400_000` → 否则拒绝（注册表过期保护）
3. 用户选定 plugin → 下载 zip → 校验 SHA512 与 registry 条目一致
4. 解压后读 manifest.json → 用同一公钥 verify manifest.signature
5. 校验 engine.{minAppVersion, maxAppVersion, apiVersion} 兼容
6. `manifest.version > store['marketplace-plugin-versions-cache'][pluginId]` → 否则拒绝

---

## 5. 平台策略 (`platformStrategy.ts`)

```ts
interface PlatformStrategy {
  canAutoUpdate: boolean;
  download(manifest, platformInfo): Promise<DownloadedArtifact>;
  install(artifact): Promise<void>;  // canAutoUpdate=false 时调 openManualGuide()
  openManualGuide(): Promise<void>;
}

strategies = {
  'win-nsis':      WindowsNsisStrategy,       // canAutoUpdate=true, 走 electron-updater
  'win-portable':  WindowsPortableStrategy,   // canAutoUpdate=false, 直接 openManualGuide
  'mac-dmg':       MacDmgGuidedStrategy,      // canAutoUpdate=false（过渡）, 下载 + 验签 + shell.openPath
  'linux-appimage':LinuxAppImageStrategy,     // canAutoUpdate=true, 走 electron-updater AppImage 原地替换
};
```

平台检测在 service 启动时一次性完成（`process.platform + process.arch + process.env.APPIMAGE` + 安装目录形态判定 portable vs nsis）。

---

## 6. 持久化 (KV in `app_settings_kv`)

### updater 命名空间

| Key | 类型 | 用途 |
|---|---|---|
| `updater-config` | `{ autoCheck: bool, channel: 'stable'\|'beta' }` | 用户设置 |
| `updater-last-installed-version` | string (semver) | 单调递增锚点（启动时与 `app.getVersion()` 取 max 并回写） |
| `updater-last-check-at` | ISO 时间戳 | 节流 |
| `updater-dismissed-until` | ISO 时间戳 | "7 天后再提醒" |
| `updater-pending-version` | string | 已下载未安装版本 |

### marketplace 命名空间

| Key | 类型 | 用途 |
|---|---|---|
| `marketplace-config` | `{ autoCheck: bool, registryUrl?: string }` | 用户设置 |
| `marketplace-last-check-at` | ISO 时间戳 | 节流 |
| `marketplace-registry-etag` | string | HTTP 条件请求 |
| `marketplace-plugin-versions-cache` | `Record<pluginId, lastInstalledVersion>` | 单调递增锚点 |

---

## 7. IPC 通道

### updater
```
controller/updater/check-now           → Promise<UpdaterState>
controller/updater/get-state           → Promise<UpdaterState>
controller/updater/download            → Promise<void>
controller/updater/install-on-quit     → Promise<void>
controller/updater/install-now         → Promise<void>   仅在 ready-to-install + 非长任务允许
controller/updater/open-manual-download→ Promise<void>
controller/updater/dismiss             → Promise<void>
controller/updater/set-auto-check      → Promise<void>
controller/updater/set-channel         → Promise<void>
```

### marketplace
```
controller/marketplace/list                → Promise<PluginListItem[]>
controller/marketplace/check-updates       → Promise<PluginUpdateItem[]>
controller/marketplace/install-or-update   → Promise<void>      { pluginId, version }
controller/marketplace/uninstall           → Promise<void>      { pluginId }
controller/marketplace/get-state           → Promise<MarketplaceState>
controller/marketplace/set-auto-check      → Promise<void>
```

### 主→渲染广播
- `updater:state-changed` — 载荷 `UpdaterState`
- `marketplace:state-changed` — 载荷 `MarketplaceState`
- `marketplace:plugin-installed` — 载荷 `{ pluginId, version }`，前端用于刷新插件列表

广播实现仿照 `electron/service/tasks/ipc.ts:36-56` 的 `broadcastTaskUpdated()`。

---

## 8. UX 决策

| 场景 | 行为 | 理由 |
|---|---|---|
| 启动后 60s 静默检查 | 红点 + 角标，不弹 modal | 创作工具启动即弹 = 噪音 |
| 长任务运行中 | 全 UI 静音 | 跑了 40 分钟的视频被升级弹窗打断 = 不可饶恕 |
| 关键更新 critical=true | 非阻塞条幅 → 7 分钟倒计时 → 阻塞模态 | 给用户保存窗口 |
| 失败 | 人话错误 + 重试/稍后/手动下载页 | 国内网络下失败是常态，必须有手动兜底 |
| changelog | 渲染 manifest.notes，"已知问题"段独立 | 创作者关心"会不会让我现在的工作流坏掉" |
| 自动检查开关 | `设置 → 关于`，默认开 | 完全允许关会让安全更新无法触达，所以仅"关闭后改为启动时一次轻量提示" |

### 红线（实现层硬约束）

1. UpdaterService 任何弹 UI 前必查 `longTaskGuard.isLongTaskRunning()`
2. 安装前检查 dirty project（订阅 `project:dirty-state` 或类似事件），否则禁用"立即安装"
3. 任何阶段失败都不删除当前可执行文件；安装包写入 `~/.koma/updater-cache/`，与运行中 app 完全隔离
4. 插件升级失败：先备份 `<pluginDir>.bak`，新版安装并 reload 成功才删除；失败回滚保证 pluginRuntime 仍以旧版运行
5. PluginMarketplaceService 升级期间禁止同一插件并发操作（后端 `installing: Set<pluginId>` 守门）

---

## 9. 构建产物与发布

### 9.1 builder 配置

四个文件统一 publish：

```jsonc
"publish": [{ "provider": "github", "owner": "Sundykin", "repo": "KomaBuild", "releaseType": "release" }]
```

`cmd/builder-linux.json`：target `deb` → `AppImage`

`cmd/builder.json` NSIS 段：显式 `"perMachine": false`

### 9.2 发布流水线 (`release.yml`)

```
push tag v*
  ├─ build-windows (electron-builder --publish always)
  ├─ build-macos   (同上，跑 build-m + build-m-arm64)
  ├─ build-linux   (新增，跑 build-l 产 AppImage)
  │
  └─(全部完成)
       │
       ├─ sign-manifest (新增)
       │    下载 release assets → 跑 scripts/sign-update-manifest.cjs
       │    用 KOMA_UPDATE_SIGN_KEY 签 koma-update-manifest.json
       │    上传 .json + .sig 回 release
       │
       └─ publish-release (改造原 release job)
            draft → published
```

### 9.3 插件发布流水线 (`release-plugin.yml`，新增)

```
push tag plugin-{id}-{ver}
  ├─ build-plugin
  │    打 zip → 上传到 Sundykin/KomaBuild 的 release plugin-{id}-{ver}
  │
  ├─ sign-plugin-manifest
  │    跑 scripts/sign-plugin-manifest.cjs
  │    用同一私钥签 manifest.json → 写回 zip → 重传
  │
  └─ update-registry
       跑 scripts/update-plugin-registry.cjs
       拉 plugin-registry.json → 加/更新条目 → 重签 registry → commit 回 main
```

### 9.4 Secrets

| 名 | 阻塞 | 用途 |
|---|---|---|
| `GH_TOKEN` | 必须 | 跨仓 PAT，含 contents:write，写 release + 推 main |
| `KOMA_UPDATE_SIGN_KEY` | 必须 | ed25519 私钥 (base64 PEM) |

公钥 base64 直接 commit 到 `electron/service/release-signing/publicKey.ts`，省去 secret。

---

## 10. 风险与备注

| 风险 | 缓解 |
|---|---|
| macOS Gatekeeper 提示"已损坏" | UpdateDialog 的 mac 分支文案教用户右键打开 / 系统设置允许；**禁止**自动 `xattr -d quarantine` |
| ffmpeg 差量失效 | 构建机固定为 GitHub Actions runner；若以后换 ffmpeg 版本会一次大下载，告知用户 |
| Apple Developer 申请 | 与本计划解耦，未来独立 PR 替换 `platformStrategy.MacDmgGuidedStrategy` 为 `MacSquirrelStrategy` |
| 跨仓 PAT 过期 | 文档记录到 README；建议设置 90 天提醒 |
| 第三方插件需求增加 | 现设计预留：注册表条目内可加 `publisherKeyId`，未来支持每发布者一对密钥 + 客户端公钥注册流程；本期不实现 |
| 主程序破坏性升级误装老插件 | `engine.maxAppVersion` 上限校验在 `compatibility.ts` 拦截 |

---

## 11. 验证策略（详见 tasks.md Phase 9）

- 本地构造测试 release：临时 keypair + http-server + 手写 manifest
- 长任务静音：发起 `shot-generation` 后触发检查，应进 silent
- 签名失败：换私钥重签，客户端应拒绝
- 降级：构造低版本 manifest，应拒绝
- 网络降级：DNS 改 127.0.0.1，应优雅失败 + 给手动下载链接
- mac 引导：mac 上触发更新，应下载到 cache + Finder 弹窗 + 旧版继续运行
- 真实小流程：tag v1.0.1 → 等 Actions → 旧版应能检测到
- 插件 marketplace：注册表加载 / 安装 / 升级 / 回滚 / 不兼容 / 防降级
