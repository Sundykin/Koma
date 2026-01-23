# Design: refactor-unified-channel-config

## Context

当前的可扩展渠道框架存在以下问题：

1. **配置分散**：自定义渠道单独配置，与内置渠道分离
2. **接口不完备**：一个渠道只能定义一对接口，但 Sora2 需要多对
3. **类型区分增加学习成本**：用户需要理解 tti/itv/character/remix 四种类型
4. **缺少角色绑定接口**：无法配置角色提取和查询
5. **设置页面过窄**：900px 限制影响操作

## Goals / Non-Goals

### Goals

1. 统一渠道配置模型：一个服务商 = 一份配置
2. 支持多接口定义：同一渠道可配置 TTI + ITV + 角色 + 混音
3. 将自定义渠道整合到具体的 TTI/ITV 配置管理器中
4. 提供能力标识机制，UI 根据能力动态展示选项
5. 扩大设置页面宽度

### Non-Goals

1. 不重构内置 Provider 实现（保持 Sora2Provider 等硬编码逻辑）
2. 不支持热加载（配置变更后需刷新）
3. 不实现 OAuth 等复杂鉴权

## Decisions

### 1. 新的渠道配置类型

```typescript
// 接口端点配置
interface EndpointConfig {
  url: string;
  method: 'POST' | 'PUT' | 'GET';
  headers?: Record<string, string>;
  bodyTemplate?: string;
  responseMapping: {
    taskId?: string;
    error?: string;
  };
}

// 查询端点配置
interface QueryEndpointConfig extends EndpointConfig {
  responseMapping: {
    status: string;
    progress?: string;
    resultUrl?: string;
    error?: string;
    extra?: Record<string, string>;
  };
  statusMapping: {
    pending: string[];
    processing: string[];
    completed: string[];
    failed: string[];
  };
}

// 接口对（生成+查询）
interface EndpointPair {
  generate: EndpointConfig;
  query: QueryEndpointConfig;
}

// 统一渠道配置
interface UnifiedChannelConfig {
  id: string;
  name: string;
  description?: string;
  baseUrl: string;

  // 鉴权配置
  auth: AuthConfig;

  // 能力与接口配置
  tti?: EndpointPair;                    // 文生图
  itv?: EndpointPair;                    // 图生视频
  characterExtract?: EndpointPair;       // 角色提取
  remix?: EndpointPair;                  // 视频混音

  // 轮询配置（全局）
  polling: PollingConfig;

  // 元数据
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

// 能力推断
type ChannelCapability = 'tti' | 'itv' | 'character-extract' | 'remix';

function getCapabilities(config: UnifiedChannelConfig): ChannelCapability[] {
  const caps: ChannelCapability[] = [];
  if (config.tti) caps.push('tti');
  if (config.itv) caps.push('itv');
  if (config.characterExtract) caps.push('character-extract');
  if (config.remix) caps.push('remix');
  return caps;
}
```

### 2. UI 整合策略

#### TTIConfigManager

```
服务商下拉框:
├── ComfyUI
├── 即梦
├── 千问图像
├── ...其他内置
└── [分隔线]
└── 自定义渠道 (advanced)
    └── 选择后展开完整配置表单
```

配置卡片列表：
```
[内置渠道卡片] [内置渠道卡片] [自定义渠道卡片*]
```

#### ITVConfigManager

```
服务商下拉框:
├── Runway
├── 可灵
├── Sora2 (内置)
├── ...其他内置
└── [分隔线]
└── 自定义渠道 (advanced)
    └── 展开表单后，根据勾选的能力显示相应接口配置
        ☑ 图生视频
        ☐ 角色提取  (仅 sora2 类渠道有意义)
        ☐ 视频混音  (仅 sora2 类渠道有意义)
```

### 3. 设置页面布局

```css
.settingsContainer {
  max-width: 1200px;  /* 原 900px */
  margin: 0 auto;
  padding: 24px;
}

/* 大屏优化 */
@media (min-width: 1400px) {
  .settingsContainer {
    max-width: 1400px;
  }
}
```

### 4. 数据迁移

旧数据结构：
```json
{
  "customChannels": [
    { "id": "c1", "type": "tti", "name": "toapis TTI", ... },
    { "id": "c2", "type": "itv", "name": "toapis ITV", ... }
  ]
}
```

新数据结构：
```json
{
  "unifiedChannels": [
    {
      "id": "uc1",
      "name": "toapis",
      "tti": { ... },
      "itv": { ... }
    }
  ]
}
```

迁移逻辑：
1. 按 `baseUrl + auth.keyValue` 分组旧配置
2. 合并同组配置的接口定义
3. 生成新 ID，保留原有接口配置

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        SettingsPage                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ LLM Config   │  │ TTI Config   │  │ ITV Config   │ ...    │
│  └──────────────┘  └──────┬───────┘  └──────┬───────┘        │
│                           │                  │                │
│         ┌─────────────────┴──────────────────┘                │
│         │                                                     │
│         ▼                                                     │
│  ┌─────────────────────────────────────────────────────┐     │
│  │              UnifiedChannelConfig[]                 │     │
│  │  ┌─────────────────┐  ┌─────────────────┐          │     │
│  │  │ 渠道A           │  │ 渠道B           │          │     │
│  │  │ - tti ✓        │  │ - itv ✓        │          │     │
│  │  │ - itv ✓        │  │ - character ✓  │          │     │
│  │  │ - character ✓  │  │ - remix ✓      │          │     │
│  │  │ - remix ✓      │  └─────────────────┘          │     │
│  │  └─────────────────┘                               │     │
│  └─────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

## Risks / Trade-offs

### Risk 1: 配置复杂度增加

- **风险**: 一次性配置多个接口可能让用户感到复杂
- **缓解**: 提供"能力勾选"，只展示选中能力的配置项

### Risk 2: 迁移失败

- **风险**: 旧数据迁移可能出错
- **缓解**: 保留原始数据备份，迁移失败时回退

### Risk 3: 内置渠道与自定义渠道混淆

- **风险**: 卡片混排可能让用户分不清哪些是内置
- **缓解**: 自定义渠道卡片添加 "自定义" 标签

## Open Questions

1. 是否需要支持渠道模板导入/导出？
2. 角色提取是否应该作为 ITV 的子能力而非独立能力？
