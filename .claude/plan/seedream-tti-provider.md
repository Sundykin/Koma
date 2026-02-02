# Seedream TTI Provider 插件实施计划

> 多模型协作规划：Codex 后端 + Gemini 前端
> 状态：✅ 已完成

---

## 需求总览

开发文生图插件，基于豆包 Seedream 4.0 API（doubao-seedream-4-0-250828）

- API 端点：POST https://api.vectorengine.ai/v1/images/generations
- 同步接口，直接返回图片 URL
- 支持文生图 + 图生图

---

## 文件结构

```
examples/plugins/seedream-tti-provider/
├── manifest.json         # 插件清单
├── package.json          # 构建配置
├── README.md             # 说明文档
├── src/
│   ├── backend.ts        # 后端入口（空壳）
│   └── index.tsx         # 前端入口（Provider 类 + 配置 UI）
└── dist/                 # 构建产物
    ├── main.js
    └── ui/main.js
```

---

## 核心设计

### 1. 配置结构

```typescript
interface SeedreamConfig {
  apiKey: string;
  baseUrl: string;       // 默认 https://api.vectorengine.ai
  defaultSize: string;   // '1K' | '2K' | '4K' | '1728x2304'
  watermark: boolean;    // 默认 true
}
```

### 2. Provider 类

```typescript
class SeedreamTTIProvider {
  type = 'seedream-tti';

  validate(): boolean
  testConnection(): Promise<boolean>
  generateImage(prompt: string, options?: TTIOptions): Promise<ImageResult>
}
```

### 3. API 调用映射

| 参数 | 来源 |
|------|------|
| model | 固定 'doubao-seedream-4-0-250828' |
| prompt | generateImage 参数 |
| image | options.imageUrls[0]（可选） |
| size | config.defaultSize 或 options.imageSize |
| watermark | config.watermark |
| sequential_image_generation | 固定 'disabled' |
| stream | 固定 false |
| response_format | 固定 'url' |

### 4. 尺寸解析

```typescript
const SIZE_PRESET_MAP = { '1K': 1024, '2K': 2048, '4K': 4096 };

function resolveSize(config, options) {
  if (options?.width && options?.height) return `${w}x${h}`;
  if (options?.imageSize) return options.imageSize;
  return config.defaultSize || '2K';
}
```

---

## 配置 UI

### 组件结构

```
SeedreamProvider
├── Title + Description
├── Card: 连接状态
│   ├── Statistic: 连接状态
│   ├── Statistic: 能力数量
│   └── Tags: [tti]
├── Alert: 错误信息（条件渲染）
└── Card: 服务配置
    ├── Form.Item: API Key (Input.Password)
    ├── Form.Item: Base URL (Input)
    ├── Divider: 默认参数
    ├── Form.Item: 默认尺寸 (Input + 预设提示)
    ├── Form.Item: 水印开关 (Switch)
    └── Space: [保存] [测试] [重置]
```

### 配置持久化

```typescript
// 加载
const files = await api.storage.listFiles('/');
if (files.includes('config.json')) {
  const data = await api.storage.readFile('/config.json');
  const config = JSON.parse(new TextDecoder().decode(data));
  form.setFieldsValue(config);
}

// 保存
const data = new TextEncoder().encode(JSON.stringify(values));
await api.storage.writeFile('/config.json', data.buffer);
```

---

## 插件注册

```typescript
async function onActivate(api: PluginAPI) {
  await api.channels.registerProvider({
    type: 'seedream-tti',
    kind: 'tti',
    name: 'Seedream TTI',
    description: 'Seedream 4.0 文生图服务',
    factory: (config, ctx) => new SeedreamTTIProvider(config, ctx),
    capabilities: ['tti'],
    defaultConfig: DEFAULT_CONFIG,
  });
}
```

---

## manifest.json

```json
{
  "id": "com.koma.seedream-tti-provider",
  "name": "Seedream TTI Service",
  "version": "1.0.0",
  "description": "Seedream 4.0 text-to-image provider",
  "category": "provider",
  "scopes": ["settings:read", "settings:write", "storage:limited", "network:external"],
  "entry": {
    "backend": "./dist/main.js",
    "frontend": "./dist/ui/main.js"
  },
  "providerMeta": {
    "channelType": "tti",
    "capabilities": ["tti"],
    "configPanel": true
  }
}
```

---

## 实施步骤

1. [ ] 创建 `examples/plugins/seedream-tti-provider/` 目录
2. [ ] 创建 manifest.json
3. [ ] 创建 package.json
4. [ ] 创建 src/backend.ts（空壳）
5. [ ] 创建 src/index.tsx（Provider 类 + UI）
6. [ ] 创建 README.md
7. [ ] 测试插件加载和配置保存
8. [ ] 测试文生图功能

---

## 风险与注意事项

1. **testConnection 可能产生费用** - 实际调用生成 API
2. **图生图需传 URL** - 本地图片需先上传或转 base64
3. **配置未同步问题** - 保存后需确保 Provider 实例使用最新配置
