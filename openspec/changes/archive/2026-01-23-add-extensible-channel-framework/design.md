## Context

当前项目使用硬编码的 Provider 模式实现各类媒体生成渠道（TTI/ITV/TTS）。每个渠道都需要单独编写 Provider 类，包含请求构建、响应解析、进度轮询等逻辑。这种方式在渠道数量较少时可行，但随着渠道增多，维护成本上升，且用户无法自行添加新渠道。

### 现有架构分析

```
providers/
├── tti/
│   ├── types.ts          # TTIProvider 接口定义
│   ├── NanoBananaProvider.ts
│   ├── ComfyUIProvider.ts
│   └── index.ts          # 工厂函数
├── itv/
│   ├── types.ts          # ITVProvider 接口定义
│   ├── Sora2Provider.ts
│   ├── RunwayProvider.ts
│   └── index.ts
```

**共性提取**：
1. 所有渠道都遵循「生成-轮询」异步模式
2. 请求都需要鉴权（Bearer Token 或 API Key）
3. 响应都包含 taskId、status、progress、result/error
4. 状态都是 queued → in_progress → completed/failed

## Goals / Non-Goals

### Goals
1. 实现新的 toapis.com 渠道（Gemini-3-Pro、Sora2 增强、角色提取、视频混音）
2. 设计可配置的渠道框架，支持用户通过 JSON 配置新增渠道
3. 统一异步任务管理模式
4. 保持与现有 Provider 架构的兼容性

### Non-Goals
1. 不重构现有的硬编码 Provider（保留作为内置渠道）
2. 不实现可视化的渠道配置编辑器（本期仅支持 JSON 配置）
3. 不支持 WebSocket 实时推送（仍使用轮询）

## Decisions

### 1. 渠道配置结构设计

```typescript
interface ChannelConfig {
  id: string;
  name: string;
  type: 'tti' | 'itv' | 'character' | 'remix';

  // 鉴权配置
  auth: {
    type: 'bearer' | 'header' | 'query';
    keyName?: string;  // header 名或 query 参数名
    keyValue: string;  // API Key 值
  };

  // 生成接口配置
  generate: {
    url: string;
    method: 'POST' | 'PUT';
    headers?: Record<string, string>;
    bodyTemplate: string;  // JSON 模板，支持 {{prompt}}, {{imageUrl}} 等占位符
    responseMapping: {
      taskId: string;  // JSONPath 表达式，如 "$.id" 或 "$.data.task_id"
    };
  };

  // 查询接口配置
  query: {
    url: string;  // 支持 {{taskId}} 占位符
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    responseMapping: {
      status: string;      // JSONPath
      progress: string;    // JSONPath
      resultUrl: string;   // JSONPath
      error: string;       // JSONPath
    };
    statusMapping: {
      pending: string[];   // 原始状态值列表
      processing: string[];
      completed: string[];
      failed: string[];
    };
  };

  // 轮询配置
  polling: {
    interval: number;      // 毫秒
    maxDuration: number;   // 最大等待时间
  };
}
```

### 2. 模板引擎选择

使用简单的字符串模板替换，支持以下占位符：
- `{{prompt}}` - 提示词
- `{{imageUrl}}` - 图片 URL
- `{{imageUrls}}` - 图片 URL 数组（JSON）
- `{{duration}}` - 时长
- `{{aspectRatio}}` - 宽高比
- `{{model}}` - 模型名称
- `{{taskId}}` - 任务 ID（用于查询接口）
- `{{videoId}}` - 视频 ID（用于混音接口）
- `{{timestamps}}` - 时间戳范围
- `{{characterUrl}}` - 角色任务 ID

### 3. JSONPath 解析

使用轻量级 JSONPath 实现（如 jsonpath-plus），支持：
- `$.id` - 根级字段
- `$.data.task_id` - 嵌套字段
- `$.result.data[0].url` - 数组访问

### 4. 架构分层

```
providers/
├── channel/
│   ├── types.ts              # ChannelConfig 类型定义
│   ├── ConfigurableProvider.ts  # 通用可配置 Provider
│   ├── templateEngine.ts     # 模板引擎
│   ├── jsonPathResolver.ts   # JSONPath 解析器
│   └── index.ts              # 工厂函数
├── tti/
│   ├── ...existing...
│   └── Gemini3ProProvider.ts # 新增
├── itv/
│   ├── ...existing...
│   └── Sora2Provider.ts      # 更新（增加混音、角色提取状态查询）
```

## Risks / Trade-offs

### Risk 1: 模板灵活性不足
- **风险**: 某些 API 可能需要复杂的请求体构建逻辑
- **缓解**: 保留硬编码 Provider 作为后备，复杂渠道仍可编写专用 Provider

### Risk 2: JSONPath 解析性能
- **风险**: 频繁的 JSONPath 解析可能影响性能
- **缓解**: 缓存编译后的 JSONPath 表达式

### Risk 3: 配置错误难以调试
- **风险**: 用户配置错误时难以定位问题
- **缓解**: 提供配置验证工具和详细的错误提示

## Migration Plan

1. **Phase 1**: 实现新渠道的硬编码 Provider（Gemini3Pro、Sora2 增强）
2. **Phase 2**: 提取共性，实现 ConfigurableProvider 基类
3. **Phase 3**: 将新渠道迁移到配置化实现
4. **Phase 4**: 提供用户自定义渠道配置入口

## Open Questions

1. 是否需要支持 OAuth 2.0 鉴权？（当前仅支持 API Key）
2. 是否需要支持请求签名（如 AWS Signature）？
3. 配置文件存储位置：全局设置 vs 项目级别？

---

## 使用文档

### 渠道配置说明

可扩展渠道框架允许用户通过 JSON 配置添加自定义的媒体生成渠道，无需编写代码。

#### 渠道类型

| 类型 | 说明 |
|------|------|
| `tti` | 文生图（Text-to-Image） |
| `itv` | 图生视频（Image-to-Video） |
| `character` | 角色提取 |
| `remix` | 视频混音 |
| `tts` | 语音合成（预留） |

#### 鉴权类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `bearer` | Bearer Token | `Authorization: Bearer xxx` |
| `header` | 自定义 Header | `X-API-Key: xxx` |
| `query` | URL 参数 | `?api_key=xxx` |
| `none` | 无鉴权 | - |

#### 模板变量

在 `bodyTemplate` 和 URL 中可使用以下变量：

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `{{baseUrl}}` | 基础 URL | `https://api.example.com` |
| `{{prompt}}` | 提示词 | `a beautiful sunset` |
| `{{imageUrl}}` | 图片 URL | `https://...` |
| `{{imageUrls}}` | 图片 URL 数组 | `["https://...", ...]` |
| `{{duration}}` | 视频时长（秒） | `10` |
| `{{aspectRatio}}` | 宽高比 | `16:9` |
| `{{model}}` | 模型名称 | `sora-2` |
| `{{taskId}}` | 任务 ID | `task_xxx` |
| `{{videoId}}` | 视频 ID | `video_xxx` |
| `{{timestamps}}` | 时间戳范围 | `1,3` |

#### JSONPath 表达式

用于从 API 响应中提取字段：

| 表达式 | 说明 |
|--------|------|
| `$.id` | 根级 id 字段 |
| `$.data.task_id` | 嵌套字段 |
| `$.result.data[0].url` | 数组第一个元素的 url |
| `$.error.message` | 错误信息 |

### 自定义渠道配置示例

#### 示例 1: toapis.com 文生图

```json
{
  "id": "custom-tti-toapis",
  "name": "toapis 文生图",
  "type": "tti",
  "description": "toapis.com Gemini-3-Pro 文生图服务",
  "baseUrl": "https://toapis.com",
  "auth": {
    "type": "bearer",
    "keyName": "Authorization",
    "keyValue": "YOUR_API_KEY"
  },
  "generate": {
    "url": "{{baseUrl}}/v1/images/generations",
    "method": "POST",
    "bodyTemplate": "{\"model\": \"gemini-3-pro-image-preview\", \"prompt\": \"{{prompt}}\", \"size\": \"1024x1024\", \"n\": 1}",
    "responseMapping": {
      "taskId": "$.id"
    }
  },
  "query": {
    "url": "{{baseUrl}}/v1/images/generations/{{taskId}}",
    "method": "GET",
    "responseMapping": {
      "status": "$.status",
      "progress": "$.progress",
      "resultUrl": "$.result.data[0].url",
      "error": "$.error.message"
    },
    "statusMapping": {
      "pending": ["queued"],
      "processing": ["in_progress"],
      "completed": ["completed"],
      "failed": ["failed"]
    }
  },
  "polling": {
    "interval": 3000,
    "maxDuration": 300000
  },
  "enabled": true
}
```

#### 示例 2: toapis.com 图生视频

```json
{
  "id": "custom-itv-toapis",
  "name": "toapis 图生视频",
  "type": "itv",
  "description": "toapis.com Sora2 图生视频服务",
  "baseUrl": "https://toapis.com",
  "auth": {
    "type": "bearer",
    "keyName": "Authorization",
    "keyValue": "YOUR_API_KEY"
  },
  "generate": {
    "url": "{{baseUrl}}/v1/videos/generations",
    "method": "POST",
    "bodyTemplate": "{\"model\": \"sora-2\", \"prompt\": \"{{prompt}}\", \"image_url\": \"{{imageUrl}}\", \"duration\": {{duration}}, \"aspect_ratio\": \"{{aspectRatio}}\"}",
    "responseMapping": {
      "taskId": "$.id"
    }
  },
  "query": {
    "url": "{{baseUrl}}/v1/videos/generations/{{taskId}}",
    "method": "GET",
    "responseMapping": {
      "status": "$.status",
      "progress": "$.progress",
      "resultUrl": "$.result.data[0].url",
      "error": "$.error.message"
    },
    "statusMapping": {
      "pending": ["queued"],
      "processing": ["in_progress"],
      "completed": ["completed"],
      "failed": ["failed"]
    }
  },
  "polling": {
    "interval": 5000,
    "maxDuration": 600000
  },
  "enabled": true
}
```

#### 示例 3: 角色提取

```json
{
  "id": "custom-character-toapis",
  "name": "toapis 角色提取",
  "type": "character",
  "description": "从视频中提取角色用于后续引用",
  "baseUrl": "https://toapis.com",
  "auth": {
    "type": "bearer",
    "keyName": "Authorization",
    "keyValue": "YOUR_API_KEY"
  },
  "generate": {
    "url": "{{baseUrl}}/v1/videos/generations",
    "method": "POST",
    "bodyTemplate": "{\"model\": \"sora-2\", \"from_task\": \"{{fromTask}}\", \"timestamps\": \"{{timestamps}}\"}",
    "responseMapping": {
      "taskId": "$.id"
    }
  },
  "query": {
    "url": "{{baseUrl}}/v1/characters_tasks/{{taskId}}",
    "method": "GET",
    "responseMapping": {
      "status": "$.status",
      "progress": "$.progress",
      "resultUrl": "$.result.data.characters[0].id",
      "error": "$.error.message",
      "extra": {
        "characters": "$.result.data.characters"
      }
    },
    "statusMapping": {
      "pending": ["queued"],
      "processing": ["in_progress"],
      "completed": ["completed"],
      "failed": ["failed"]
    }
  },
  "polling": {
    "interval": 3000,
    "maxDuration": 180000
  },
  "enabled": true
}
```

### 添加自定义渠道

1. 打开 **设置** 页面
2. 找到 **自定义渠道** 区域
3. 点击 **添加自定义渠道**
4. 选择 **表单模式** 逐项填写，或选择 **JSON 模式** 直接粘贴配置
5. 可选择 **应用模板** 快速填充预设配置
6. 点击 **保存**

### 测试渠道连接

添加渠道后，可点击渠道卡片上的 **测试连接** 按钮验证配置是否正确：

- **成功**: 鉴权配置正确，可以访问 API
- **失败**: 检查 API Key 和 URL 是否正确
