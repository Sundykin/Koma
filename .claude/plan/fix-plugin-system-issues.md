# 插件系统问题修复计划

## 问题概述

1. **渠道列表为空**: 插件安装后未触发 `onActivate`，需要重启才能看到新渠道
2. **runtime 有 node_modules**: `installFromFolder` 复制整目录导致污染
3. **安装速度变慢**: validate + install 双解压，大目录无差别处理

## 修复方案

### Phase 1: 前端 - 安装后立即初始化

#### 1.1 导出 initializePlugin 函数

**文件**: `frontend/src/services/plugin/PluginInitializer.ts`

```diff
-async function initializePlugin(plugin: InstalledPlugin): Promise<boolean> {
+export async function initializePlugin(plugin: InstalledPlugin): Promise<boolean> {
```

#### 1.2 安装成功后调用初始化

**文件**: `frontend/src/components/plugins/PluginImporter.tsx`

```typescript
import { initializePlugin } from '../../services/plugin/PluginInitializer';

// handleConfirmInstall 中：
if (installResult.success) {
  registerPlugin(manifest, installResult.rootPath);

  // 立即初始化
  const installedPlugin = usePluginStore.getState().getPlugin(manifest.id);
  if (installedPlugin) {
    const initSuccess = await initializePlugin(installedPlugin);
    if (initSuccess) {
      message.success(`插件 "${manifest.name}" 安装并就绪`);
    } else {
      message.warning(`插件 "${manifest.name}" 安装成功，但初始化失败`);
    }
  }
  onImportSuccess?.(manifest.id);
}
```

### Phase 2: 后端 - allowlist 过滤

#### 2.1 添加 allowlist 机制

**文件**: `electron/src/service/plugin.ts`

```typescript
const DEFAULT_ALLOWLIST = new Set([
  'manifest.json',
  'README.md',
  'dist',
  'assets',
  'public',
  'data',
]);

function buildAllowlist(manifest: PluginManifest): Set<string> {
  const entries = [
    manifest.entry?.frontend,
    manifest.entry?.backend,
    manifest.entry?.logic,
    manifest.entry?.ui,
  ].filter(Boolean) as string[];

  // 从入口路径提取顶级目录
  const topLevels = entries.map(p => p.replace(/\\/g, '/').split('/')[0]);
  return new Set([...DEFAULT_ALLOWLIST, ...topLevels]);
}
```

#### 2.2 修改 installFromFolder

```typescript
async installFromFolder(folderPath: string, manifest: PluginManifest) {
  const pluginDir = path.join(this.pluginsDir, manifest.id);
  const allowlist = buildAllowlist(manifest);

  // 只复制 allowlist 中的文件/目录
  await fs.mkdir(pluginDir, { recursive: true });
  const entries = await fs.readdir(folderPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!allowlist.has(entry.name)) continue;

    const srcPath = path.join(folderPath, entry.name);
    const destPath = path.join(pluginDir, entry.name);

    if (entry.isDirectory()) {
      await this.copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }

  await fs.mkdir(path.join(pluginDir, 'data'), { recursive: true });
  return { success: true, rootPath: pluginDir };
}
```

### Phase 3: 后端 - 复用解压结果（可选优化）

#### 3.1 staging 缓存机制

```typescript
private stagingCache = new Map<string, { path: string; createdAt: number }>();

async validate(zipPath: string, opts?: { keepExtracted?: boolean }) {
  const stagingPath = path.join(this.stagingDir, `temp-${Date.now()}`);
  // ... 解压和验证逻辑

  if (opts?.keepExtracted) {
    const stagingId = crypto.randomUUID();
    this.stagingCache.set(stagingId, { path: stagingPath, createdAt: Date.now() });
    return { ...result, stagingId };
  }

  await this.cleanup(stagingPath);
  return result;
}

async install(zipPath: string, manifest: PluginManifest, opts?: { stagingId?: string }) {
  const stagingPath = opts?.stagingId
    ? this.stagingCache.get(opts.stagingId)?.path
    : null;

  // 如果有 stagingPath，直接使用；否则重新解压
  // ...
}
```

## 文件修改清单

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `frontend/src/services/plugin/PluginInitializer.ts` | 修改 | 导出 `initializePlugin` |
| `frontend/src/components/plugins/PluginImporter.tsx` | 修改 | 安装后调用初始化 |
| `electron/src/service/plugin.ts` | 修改 | allowlist 过滤 + 可选 staging 复用 |

## 测试验证步骤

1. **安装即用测试**
   - 安装插件后，不重启，切换到 TTI 设置页
   - 预期：能看到新安装的插件渠道

2. **node_modules 排除测试**
   - 从包含 node_modules 的目录安装插件
   - 预期：`plugins-runtime/<id>` 中不包含 node_modules

3. **回归测试**
   - zip 安装流程正常
   - 开发模式文件夹安装正常
   - 插件卸载正常

## Session IDs

- **Codex**: `019bffc4-cebd-7b50-b234-34f65b3a4c56`
- **Gemini**: `28e67ee4-5efd-40e3-a986-3dc60db9c931`
