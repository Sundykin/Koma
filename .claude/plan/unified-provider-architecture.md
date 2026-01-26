# 统一 Provider 架构重构计划

> 基于多模型协作规划（Codex + Gemini + Claude）
> 方案 2: 完全统一架构
> **状态：✅ 已完成**

---

## 需求总览

1. **删除所有兼容代码** - 移除 TTI/ITV/TTS 的 switch-case fallback
2. **ProviderManager 统一入口** - 作为唯一 Provider 创建入口，强制 kind 参数
3. **TTS 纳入 Registry** - 新增 ttsRegistry，与 TTI/ITV 架构一致
4. **插件规范化** - 插件 API 显式传 kind，防止未来添加不兼容实现
5. **架构防回退** - TypeScript 类型约束阻止 kindless 调用

---

## Phase 1: 核心基础设施 (后端)

### 1.1 扩展 Registry 类型

**文件**: `frontend/src/providers/registry.ts`

```typescript
// 扩展 ChannelKind
export type ChannelKind = 'tti' | 'itv' | 'tts';

// 扩展 ChannelCapability
export type ChannelCapability = 'tti' | 'itv' | 'tts' | 'character-extract' | 'remix';

// 新增 ttsRegistry
export const ttsRegistry = new ProviderRegistryImpl<any>();

// 更新 getRegistry
export function getRegistry(kind: ChannelKind): IProviderRegistry<any> {
  switch (kind) {
    case 'tti': return ttiRegistry;
    case 'itv': return itvRegistry;
    case 'tts': return ttsRegistry;
  }
}
```

### 1.2 创建 ProviderManager

**文件**: `frontend/src/providers/manager.ts` (新建)

```typescript
export class ProviderManager {
  constructor(
    private readonly registries: Record<ChannelKind, IProviderRegistry<any>>
  ) {}

  register<T>(def: ProviderDefinition<T>): void {
    this.registries[def.kind].register(def);
  }

  unregister(kind: ChannelKind, type: string): void {
    this.registries[kind].unregister(type);
  }

  create<K extends ChannelKind>(
    kind: K,
    type: string,
    config: Record<string, any>,
    ctx: ProviderContext
  ): ProviderKindMap[K] {
    const def = this.registries[kind].get(type);
    if (!def) {
      throw new Error(`Provider "${type}" not found in ${kind} registry`);
    }
    return def.factory(config, ctx);
  }

  list(kind: ChannelKind): ProviderDefinition<any>[] {
    return this.registries[kind].list();
  }
}

// 单例
export const providerManager = new ProviderManager({
  tti: ttiRegistry,
  itv: itvRegistry,
  tts: ttsRegistry,
});
```

### 1.3 类型安全映射

```typescript
export type ProviderKindMap = {
  tti: TTIProvider;
  itv: ITVProvider;
  tts: TTSProvider;
};
```

---

## Phase 2: Provider 迁移

### 2.1 TTS Provider 注册

**文件**: `frontend/src/providers/tts/index.ts`

```typescript
import { ttsRegistry, type ProviderDefinition } from '../registry';

// 定义 configSchema
const edgeTTSSchema = {
  properties: {
    defaultVoice: { title: '默认音色', type: 'string' },
    defaultSpeed: { title: '语速', type: 'number', default: 1.0 }
  }
};

const openAITTSSchema = {
  properties: {
    apiKey: { title: 'API Key', type: 'string', format: 'password', required: true },
    baseUrl: { title: 'API URL', type: 'string', default: 'https://api.openai.com/v1' },
    model: { title: '模型', type: 'string', enum: ['tts-1', 'tts-1-hd'], default: 'tts-1' }
  }
};

// 内置 Provider 定义
const builtinTTSProviders: ProviderDefinition<TTSProvider>[] = [
  { type: 'edge-tts', kind: 'tts', name: 'Edge TTS (免费)', configSchema: edgeTTSSchema, factory: cfg => new EdgeTTSProvider(cfg) },
  { type: 'openai-tts', kind: 'tts', name: 'OpenAI TTS', configSchema: openAITTSSchema, factory: cfg => new OpenAITTSProvider(cfg) },
  { type: 'fish-audio', kind: 'tts', name: 'Fish Audio', configSchema: fishAudioSchema, factory: cfg => new FishAudioProvider(cfg) },
  { type: 'gpt-sovits', kind: 'tts', name: 'GPT-SoVITS (本地)', configSchema: gptSovitsSchema, factory: cfg => new GPTSoVITSProvider(cfg) },
];

// 注册
function registerBuiltinTTSProviders() {
  builtinTTSProviders.forEach(def => ttsRegistry.register(def));
}

registerBuiltinTTSProviders();

// 删除旧的 createTTSProvider switch-case
```

### 2.2 TTI/ITV 删除兼容代码

**文件**: `frontend/src/providers/tti/index.ts`

```typescript
// 删除 switch-case fallback
export function createTTIProvider(config: TTIModelConfig): TTIProvider {
  const def = ttiRegistry.get(config.provider);
  if (!def) {
    throw new Error(`Unknown TTI provider: ${config.provider}`);
  }
  return def.factory(config, { sandboxedFetch: fetch });
}
```

**文件**: `frontend/src/providers/itv/index.ts`

```typescript
// 同样删除 switch-case fallback
export function createITVProvider(config: ITVConfig): ITVProvider {
  const def = itvRegistry.get(config.provider);
  if (!def) {
    throw new Error(`Unknown ITV provider: ${config.provider}`);
  }
  return def.factory(config, { sandboxedFetch: fetch });
}
```

### 2.3 删除 registry.ts 兼容代码

```typescript
// 删除 createProviderInstance 中的 kindless fallback
export function createProviderInstance<T>(
  kind: ChannelKind,  // 强制必填
  type: string,
  config: Record<string, any>,
  ctx?: Partial<ProviderContext>
): T {
  const registry = getRegistry(kind);
  const def = registry.get(type);
  // ... 无 fallback
}
```

---

## Phase 3: 插件 API 调整

### 3.1 PluginAPI 显式 kind

**文件**: `frontend/src/services/plugin/PluginAPI.ts`

```typescript
channels: {
  async registerProvider(def: ProviderDefinition<any>) {
    // kind 已经是必填字段，无需额外处理
    // 移除任何 kind 推断逻辑

    if (!def.kind) {
      throw new Error('Provider definition must include explicit kind');
    }

    def.pluginId = pluginId;
    providerManager.register(def);
    // ...
  },

  async testProvider(kind: ChannelKind, type: string, config: Record<string, any>) {
    // 显式传入 kind
    const provider = providerManager.create(kind, type, config, ctx);
    return provider.testConnection();
  }
}
```

---

## Phase 4: 类型定义更新

### 4.1 TTSProviderType 扩展

**文件**: `frontend/src/types.ts`

```typescript
// 支持插件动态类型
export type TTSProviderType =
  | 'edge-tts'
  | 'openai-tts'
  | 'fish-audio'
  | 'gpt-sovits'
  | 'doubao-tts'
  | (string & {});

// TTSModelConfig 支持任意配置
export interface TTSModelConfig extends MediaProviderConfig {
  provider: TTSProviderType;
  defaultVoice?: string;
  defaultSpeed?: number;
  [key: string]: any;  // 插件配置扩展
}
```

---

## Phase 5: UI 适配

### 5.1 TTSConfigManager 重构

**文件**: `frontend/src/components/settings/TTSConfigManager.tsx`

- 从 `listProviders('tts')` 获取可用 Provider
- 基于 `configSchema` 动态渲染表单
- 保持"测试连接"和"设为默认"功能

```tsx
const availableProviders = listProviders('tts');

const renderDynamicFields = (providerId: string) => {
  const provider = availableProviders.find(p => p.type === providerId);
  if (!provider?.configSchema) return null;

  return Object.entries(provider.configSchema.properties).map(([key, field]) => (
    <Form.Item key={key} name={key} label={field.title}>
      {/* 根据 field.type 渲染对应控件 */}
    </Form.Item>
  ));
};
```

---

## Phase 6: 清理废弃导出

### 6.1 providers/index.ts

```typescript
// 删除废弃导出
// export { createTTSProvider } from './tts';  // 删除

// 新增统一导出
export { providerManager } from './manager';
export { listProviders, getRegistry } from './registry';
```

---

## 文件修改清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `providers/registry.ts` | 修改 | 扩展 ChannelKind, 新增 ttsRegistry, 删除 fallback |
| `providers/manager.ts` | 新建 | ProviderManager 实现 |
| `providers/tti/index.ts` | 修改 | 删除 switch-case, 保留 Registry 注册 |
| `providers/itv/index.ts` | 修改 | 删除 switch-case, 保留 Registry 注册 |
| `providers/tts/index.ts` | 修改 | 删除 switch-case, 新增 Registry 注册 + configSchema |
| `providers/index.ts` | 修改 | 清理废弃导出, 新增 providerManager |
| `services/plugin/PluginAPI.ts` | 修改 | 强制 kind 参数 |
| `types.ts` | 修改 | TTSProviderType 扩展 |
| `components/settings/TTSConfigManager.tsx` | 修改 | 动态表单渲染 |

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 插件未提供 kind 导致运行时错误 | 注册时校验并抛出明确错误 |
| 旧配置字段不兼容 | configSchema 匹配现有字段结构 |
| 遗漏调用点 | TypeScript 编译错误自动暴露 |

---

## 验收标准

1. ✅ 所有 switch-case 兼容代码已删除
2. ✅ TTS 通过 ttsRegistry 管理
3. ✅ ProviderManager 是唯一创建入口
4. ✅ 插件必须显式指定 kind
5. ✅ UI 配置功能正常（测试连接、设为默认）
6. ✅ TypeScript 编译通过，无 kindless 调用
