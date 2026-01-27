# @koma/plugin-sdk

Koma 插件开发 SDK，提供类型定义和全局变量声明。

## 安装

```bash
npm install @koma/plugin-sdk
```

## 使用

```typescript
import type {
  PluginAPI,
  PluginManifest,
  ProviderDefinition,
  TTIProvider,
  ITVProvider,
} from '@koma/plugin-sdk';

// 使用全局变量（类型安全）
const React = window.React;
const { Button, Form } = window.antd;
const { SaveOutlined } = window['@ant-design/icons'];
```

## 类型导出

### 插件 API
- `PluginAPI` - 插件 API 接口
- `PluginManifest` - 插件清单
- `PluginExports` - 插件导出接口
- `InstalledPlugin` - 已安装插件

### Provider
- `ProviderDefinition` - Provider 定义
- `ProviderContext` - Provider 上下文
- `ChannelKind` - 渠道类型 ('tti' | 'itv' | 'tts')
- `PollingConfig` - 轮询配置

### TTI Provider
- `TTIProvider` - 文生图 Provider 接口
- `TTIOptions` - 生成选项
- `ImageResult` - 图像结果

### ITV Provider
- `ITVProvider` - 图生视频 Provider 接口
- `ITVOptions` - 生成选项
- `VideoResult` - 视频结果
- `ProgressInfo` - 进度信息

## 全局变量

SDK 声明了以下全局变量（由宿主应用注入）：

```typescript
window.React        // React 库
window.antd         // Ant Design 组件库
window['@ant-design/icons']  // Ant Design 图标库
```

## 配置持久化

使用 `channels.getProviderConfig` / `channels.updateProviderConfig` 管理配置：

```typescript
// 读取配置
const config = await api.channels.getProviderConfig('my-provider');

// 保存配置
await api.channels.updateProviderConfig('my-provider', newConfig);
```

## License

MIT
