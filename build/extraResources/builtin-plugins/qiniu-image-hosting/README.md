# 七牛云图床插件（内置）

Koma Studio 内置图床插件，使用 [new-api](https://github.com/QuantumNous/new-api) 的 `/v1/uploads/image` 接口将图片上传到七牛云 Kodo，返回带时间戳防盗链签名的外链 URL。

## 特性

- ✅ **内置**：无需用户手动安装，首次启动自动激活
- ✅ **激活 Key 即 API Key**：复用 Koma 激活 Key（`sk-xxx`），不消耗额度
- ✅ **时间戳防盗链**：默认 3 天有效期
- ✅ **自动重试**：上传失败最多重试 3 次

## 配置项

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `enabled` | `true` | 是否启用 |
| `apiEndpoint` | `http://192.227.192.228:3000/v1/uploads/image` | new-api 上传接口地址 |
| `apiKey` | `sk-I5kyGgOb0ie9PGclXHYZEzkZrzoDIVXeXrkcgX7uWj8B584B` | API Key（激活 Key） |

## 目录结构

```
qiniu-image-hosting/
├── manifest.json          # 插件元信息
├── package.json           # 构建配置
├── src/
│   ├── backend.ts         # Electron 后端（Provider 注册 + 上传逻辑）
│   └── index.tsx          # 前端 UI（配置面板）+ Runtime
├── dist/
│   ├── backend.js         # 构建产物（esbuild CJS）
│   └── ui/main.js         # 构建产物（esbuild IIFE）
└── README.md
```

## 构建

```bash
cd packages/plugins/qiniu-image-hosting
npm run build
```

## 内置加载机制

`electron/service/plugin.ts` 的 `PluginService.init()` 在启动时会把本插件从 `packages/plugins/qiniu-image-hosting` 同步到用户数据目录 `plugins-runtime/com.koma.qiniu-image-hosting`，随后由前端 `PluginInitializer` 自动加载并激活。

用户通过 UI 修改的配置（`apiKey` 等）保存在 `provider-configs.json` 中，启动时覆盖不会影响用户自定义配置。
