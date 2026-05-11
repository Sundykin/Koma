# 自动更新机制 — 运维配置指引

> 适用于 Koma Studio 客户端首次启用自动更新。预计耗时 10 分钟。

## 项目实际拓扑

```
 ┌─────────────────────┐                    ┌──────────────────────┐
 │ Sundykin/Koma       │  ssh clone (deploy │ Sundykin/KomaBuild   │
 │ (private 源码仓)     │ ◀──────────────────┤ (public 发布仓 +     │
 │                     │     key)            │  build.yml 流水线)    │
 │ 包含本指引 + 代码    │                    │                      │
 └─────────────────────┘                    │  push tag / 手动触发  │
                                            │       ↓               │
                                            │  release（用户拉的）   │
                                            └──────────────────────┘
```

发包流程：你进 `KomaBuild` 的 Actions 页面，手动跑 `Build & Release` workflow，填 `version = v1.0.1`，`source_ref = main`（或某个 tag）。流水线 SSH clone 源码、打三平台包、签 manifest、发 release。

源码仓里 `.github/workflows/release.yml` 是 fallback（仅手动触发），平时不用。

---

## 配置清单

### A. 私钥备份（最重要，丢了无法发新版本）

私钥已经生成在你本机：

```
~/.koma-release-key/private.pem
~/.koma-release-key/public.pem
```

**立即把 private.pem 备份到 1Password / Bitwarden / iCloud Keychain**。
公钥已硬编码进 `electron/service/release-signing/publicKey.ts`，不需备份。

私钥的 base64 形式（要粘到 GitHub Secret 的值）：

```bash
base64 -i ~/.koma-release-key/private.pem
```

输出形如：

```
LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1DNENBUUF3QlFZREsyVndCQ0lFSUdZd0hjSnM4QXkvZU1EWWNjd3JrcGJEZGh6Y3dlditIQnlzM1FmdDVHWnYKLS0tLS1FTkQgUFJJVkFURSBLRVktLS0tLQo=
```

---

### B. KomaBuild 仓的 Secrets

打开：https://github.com/Sundykin/KomaBuild/settings/secrets/actions

应该已经有：
- `SOURCE_REPO_DEPLOY_KEY` — SSH deploy key，让 build.yml 能 clone Koma 私有仓（已存在）

**新增一个**：

| Secret 名 | 值 |
|---|---|
| `KOMA_UPDATE_SIGN_KEY` | 上一步 `base64` 输出的那一整段字符串 |

---

### C. 替换 KomaBuild 仓的 build.yml

源码仓的 `docs/release/KomaBuild-build.yml` 是新版本。把它整段拷贝去覆盖：

```
https://github.com/Sundykin/KomaBuild/blob/main/.github/workflows/build.yml
```

新版本的关键差异：
- 删 `push: tags: v*` 触发，只保留 `workflow_dispatch`（手动触发，防误发）
- 新增 `build-linux` job（出 AppImage）
- `release` job 多一步：跑源码仓 `scripts/sign-update-manifest.cjs` 生成 `koma-update-manifest.json` + `.sig`
- release 由 `draft: true` 改为 `draft: false`（不发 published 的话 electron-updater 客户端拉不到）

---

### D. 源码仓的 Secrets

打开：https://github.com/Sundykin/Koma/settings/secrets/actions

**当前不需要新增任何 secret**。源码仓的 `release.yml` 仅作 fallback，配置在那个 workflow 里内嵌；只有真触发它时才需要 `KOMA_UPDATE_SIGN_KEY`（届时再加）。

---

## 第一次发布

1. 在源码仓本地把当前 `electron-updater` + 极简化更新机制的改动 commit + push 到 main：

   ```bash
   cd /Users/mjy/WorkSpace/Koma
   git add -A
   git commit -m "feat(updater): minimal client auto-update with ed25519-signed manifest"
   git push origin main
   ```

2. 去 KomaBuild 的 Actions 页面：
   https://github.com/Sundykin/KomaBuild/actions/workflows/build.yml

3. 点 **Run workflow**，填：
   - **Version tag**: `v1.0.1`
   - **Source branch or tag**: `main`

4. 等 15–25 分钟跑完（4 个 build job 并行 + 1 个 release job）。

5. 验证：去 https://github.com/Sundykin/KomaBuild/releases/tag/v1.0.1，应该能看到这些文件：

   ```
   Koma Studio-win-1.0.1-x64-setup.exe         ← NSIS
   Koma Studio-win-1.0.1-x64-portable.exe      ← portable
   Koma Studio-mac-1.0.1-x64.dmg
   Koma Studio-mac-1.0.1-arm64.dmg
   Koma Studio-linux-1.0.1-x64.AppImage
   latest.yml / latest-mac.yml / latest-linux.yml   ← electron-updater 用
   *.blockmap                                       ← 差量更新
   koma-update-manifest.json                        ← 新加，自动更新用
   koma-update-manifest.sig                         ← 新加，ed25519 签名
   ```

   如果有最后两个文件，说明签名链路通了。

---

## 测试更新

发完 v1.0.1 后，把本地 `package.json` 的 `version` 临时改成 `1.0.0`，跑 `npm run dev`：

- 启动后等 60s，标题栏应出现「**更新到 v1.0.1**」
- 点一下 → 状态变 「**更新中… 47%**」
- 完成后 → 「**重启以更新**」
- 再点 → 应用退出并启动安装程序

如果失败，看日志：`~/.koma/logs/koma.log`，搜 `[updater]` 行。

---

## 常见问题

| 现象 | 原因 | 修 |
|---|---|---|
| Action `Sign update manifest` 报 `KOMA_UPDATE_SIGN_KEY is required` | KomaBuild 仓没配 secret | 按 B 节配置 |
| Action `Clone private source` 报 `Permission denied (publickey)` | SSH deploy key 失效 | 检查 `SOURCE_REPO_DEPLOY_KEY` |
| release 出来了但客户端检测不到 | release 还是 draft 状态 | 确认 build.yml 里 `draft: false` |
| 客户端报 `manifest verify rejected: signature-invalid` | 私钥换过但公钥没同步 | 重新生成 keypair，把公钥写入 `publicKey.ts` 并 push；旧客户端需重装 |
| 用户长任务跑着时点了"重启以更新" | 被静默拦截 | 这是设计行为；下次启动会自动安装 |

---

## 后续：替换密钥（年度建议）

ed25519 密钥**没有过期概念**，但建议每 12 个月轮换一次，操作：

```bash
# 1. 生成新 keypair
mkdir -p ~/.koma-release-key-2027
cd ~/.koma-release-key-2027
node -e "
const c=require('crypto');
const k=c.generateKeyPairSync('ed25519');
require('fs').writeFileSync('private.pem', k.privateKey.export({type:'pkcs8',format:'pem'}));
require('fs').writeFileSync('public.pem', k.publicKey.export({type:'spki',format:'pem'}));
"

# 2. 公钥 base64
base64 -i public.pem

# 3. 改 electron/service/release-signing/publicKey.ts 的 KOMA_PUBLIC_KEY_PEM_B64

# 4. 私钥 base64
base64 -i private.pem

# 5. 更新 KomaBuild 的 KOMA_UPDATE_SIGN_KEY secret

# 6. 备份新 private.pem 到 1Password

# 7. 发新版本（v1.X.Y）—— 老客户端用旧公钥验签新 manifest 会失败，
#    所以发完新版后旧客户端的"自动更新"会断；用户得手动下载新版重装一次。
#    密钥轮换**必然伴随一次手动升级**，请在 changelog 里说明。
```

