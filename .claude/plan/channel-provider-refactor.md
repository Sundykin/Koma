# 渠道 Provider 系统重构实施计划

> 基于多模型协作规划（Codex + Gemini + Claude）
> 方案 A: 完全重构 - 删除模板引擎，插件改 Provider 类注入
> **状态：Phase 1-8 核心实施完成，待优化和评审**

---

## 需求总览

1. **删除自定义模板渠道配置** - 移除 templateEngine、jsonPathResolver、ConfigurableProvider
2. **插件 Provider 注入** - 插件通过实现 ITVProvider/TTIProvider 接口注册渠道
3. **统一同步/异步接口** - Promise + 轮询封装，调用方无需关注底层模式
4. **直接删除旧配置** - customChannels/unifiedChannels 数据不保留

---

## 核心架构设计

### 1. ProviderRegistry（注册表）

```typescript
// frontend/src/providers/registry.ts
export type ChannelKind = 'tti' | 'itv';

export interface ProviderContext {
  pluginId?: string;
  sandboxedFetch: typeof fetch;
  logger?: { info(...a: any[]): void; warn(...a: any[]): void; error(...a: any[]): void };
}

export interface ProviderDefinition<T> {
  type: string;              // 唯一标识，如 'vectorengine'
  kind: ChannelKind;         // 'tti' | 'itv'
  factory: (config: Record<string, any>, ctx: ProviderContext) => T;
  capabilities?: ChannelCapability[];
  pluginId?: string;         // 关联插件 ID
  configSchema?: Record<string, any>;  // JSON Schema for UI
  defaultConfig?: Record<string, any>;
  polling?: PollingConfig;
}

export interface ProviderRegistry<T> {
  register(def: ProviderDefinition<T>): void;
  unregister(type: string): void;
  unregisterByPlugin(pluginId: string): void;
  get(type: string): ProviderDefinition<T> | undefined;
  list(kind?: ChannelKind): ProviderDefinition<T>[];
  has(type: string): boolean;
}
```

### 2. 统一 Provider 接口

```typescript
// 轮询能力接口
export interface PollableProvider<TProgress extends ProgressInfo> {
  submitTask?(input: any): Promise<string>;
  checkProgress?(taskId: string): Promise<TProgress>;
  getResult?(progress: TProgress): Promise<unknown> | unknown;
  polling?: PollingConfig;
}

// TTI Provider
export interface TTIProvider extends PollableProvider<ProgressInfo> {
  generateImage(input: { prompt: string; options?: TTIOptions }): Promise<ImageResult>;
  validate(): boolean;
  testConnection(): Promise<boolean>;
}

// ITV Provider
export interface ITVProvider extends PollableProvider<ProgressInfo> {
  generateVideo(input: { imageUrl?: string; prompt: string; options?: ITVOptions }): Promise<VideoResult>;
  extractCharacter?(params: CharacterExtractionParams): Promise<CharacterProgressInfo>;
  remixVideo?(params: RemixOptions): Promise<ProgressInfo>;
  validate(): boolean;
  testConnection(): Promise<boolean>;
}
```

### 3. 轮询工具函数

```typescript
// frontend/src/providers/polling.ts
export interface PollTaskParams<TProgress extends ProgressInfo> {
  submit: () => Promise<string>;
  check: (taskId: string) => Promise<TProgress>;
  polling: PollingConfig;
  onProgress?: (progress: TProgress) => void;
  signal?: AbortSignal;
}

export async function pollTask<TProgress extends ProgressInfo>(
  params: PollTaskParams<TProgress>
): Promise<TProgress> {
  const { submit, check, polling, onProgress, signal } = params;
  const taskId = await submit();
  const startTime = Date.now();

  if (polling.initialDelay) {
    await delay(polling.initialDelay);
  }

  while (Date.now() - startTime < polling.maxDuration) {
    if (signal?.aborted) throw new Error('Task cancelled');

    const progress = await check(taskId);
    onProgress?.(progress);

    if (progress.status === 'completed' || progress.status === 'failed') {
      return progress;
    }

    await delay(polling.interval);
  }

  throw new Error('Task timeout');
}
```

### 4. PluginAPI.channels 新接口

```typescript
// frontend/src/services/plugin/PluginAPI.ts
export interface PluginChannelAPI {
  registerProvider(def: ProviderDefinition<any>): Promise<void>;
  unregisterProvider(type: string): Promise<void>;
  listProviders(kind?: ChannelKind): Promise<ProviderDefinition<any>[]>;
  testProvider(type: string, config: Record<string, any>): Promise<boolean>;
}
```

---

## 文件修改清单

### Phase 1: 删除模板系统

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/providers/channel/templateEngine.ts` | 删除 | 模板渲染不再需要 |
| `frontend/src/providers/channel/jsonPathResolver.ts` | 删除 | JSONPath 解析不再需要 |
| `frontend/src/providers/channel/ConfigurableProvider.ts` | 删除 | 依赖模板的 Provider |

### Phase 2: 新增核心模块

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/providers/registry.ts` | 新建 | ProviderRegistry 实现 |
| `frontend/src/providers/polling.ts` | 新建 | pollTask 工具函数 |

### Phase 3: 更新 Provider 接口

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/providers/tti/types.ts` | 修改 | 添加 PollableProvider 继承 |
| `frontend/src/providers/itv/types.ts` | 修改 | 添加 PollableProvider 继承 |
| `frontend/src/providers/tti/index.ts` | 修改 | 改为 Registry 驱动 |
| `frontend/src/providers/itv/index.ts` | 修改 | 改为 Registry 驱动 |
| `frontend/src/providers/index.ts` | 修改 | 整合 Registry |

### Phase 4: 更新渠道配置

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/providers/channel/types.ts` | 修改 | 简化配置结构，移除模板字段 |
| `frontend/src/providers/channel/index.ts` | 修改 | 移除模板导出和常量 |
| `frontend/src/store/settings/channelConfig.ts` | 修改 | 删除 customChannels/unifiedChannels CRUD |

### Phase 5: 更新插件系统

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/services/plugin/PluginAPI.ts` | 修改 | channels.registerProvider 新接口 |
| `frontend/src/services/plugin/PluginLoader.ts` | 修改 | 加载 provider 插件入口 |
| `frontend/src/types/plugin.ts` | 修改 | PluginChannelConfig 改为 Provider 注册结构 |

### Phase 6: 更新调用方

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/workflow/characterAssetWorkflow.ts` | 修改 | 移除手写轮询，改 Promise |
| `frontend/src/workflow/shotRenderWorkflow.ts` | 修改 | 统一 ITV 调用 |
| `frontend/src/services/ShotGenerationService.ts` | 修改 | TTI 生成统一 |
| `frontend/src/services/AssetGenerationService.ts` | 修改 | 资产生成统一 |

### Phase 7: 更新设置 UI

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/settings/TTIConfigManager.tsx` | 修改 | 移除模板配置 UI |
| `frontend/src/components/settings/ITVConfigManager.tsx` | 修改 | 移除模板配置 UI |

### Phase 8: 更新插件示例

| 文件 | 操作 | 说明 |
|------|------|------|
| `examples/plugins/vectorengine-provider/src/index.tsx` | 修改 | 改为 Provider 类注册 |
| `examples/plugins/vectorengine-provider/src/channelTemplate.ts` | 删除 | 模板配置不再需要 |

---

## 前端 UI 架构

### 组件层级

```
SettingsPage
├── ITVConfigManager
│   ├── ChannelList (内置 + 插件渠道列表)
│   │   └── ChannelCard (统一渠道卡片)
│   ├── ProviderSelectorModal (选择 Provider)
│   └── ChannelConfigHostModal (配置容器)
│       ├── PluginUIContainer (插件配置)
│       └── BuiltInConfigForm (内置配置)
└── TTIConfigManager (同上结构)
```

### 需删除的 UI 元素

- `renderEndpointForm` - 模板配置表单
- `handleSaveChannel` - 模板构造逻辑
- JSONPath 输入框
- Custom Channel Modal

### 新增组件

1. **ProviderSelectorModal** - 浏览可用 Provider
2. **ChannelConfigHostModal** - 配置容器（宿主提供 Shell，插件提供内容）
3. **ChannelCard** - 统一渠道卡片组件

---

## 验收标准

1. [x] templateEngine.ts, jsonPathResolver.ts, ConfigurableProvider.ts 已删除
2. [x] ProviderRegistry 正常工作，内置 Provider 已注册
3. [x] 插件可通过 registerProvider 注册自定义 Provider
4. [x] 所有 Provider 返回 Promise，调用方无需关注同步/异步
5. [x] 设置页面无模板配置 UI
6. [ ] 角色资产、AI 分镜等功能正常工作 (待测试)
7. [x] 插件示例 vectorengine-provider 改为 Provider 类实现

---

## 优化阶段修复项

| 问题 | 状态 | 说明 |
|------|------|------|
| polling.ts abort 监听器泄漏 | ✅ 已修复 | 使用 `{ once: true }` |
| 插件 Provider 安全性 | ✅ 已修复 | 强制检查 sandboxedFetch |
| 循环依赖 | ✅ 已修复 | PollingConfig 移至 polling.ts |
| registerProvider 回滚 | ✅ 已修复 | addChannelConfig 失败时回滚 |
| unregisterProvider 清理 | ✅ 已修复 | 添加 deleteChannelByProviderType |
| 类型兼容 | ✅ 已修复 | 添加 UnifiedChannelConfig 别名 |

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 现有配置失效 | 自定义渠道无法工作 | 直接删除，用户需重新安装插件 |
| 插件越权网络访问 | 绕过沙箱限制 | ProviderContext.sandboxedFetch 强制限制 |
| 内置 Provider 接口变更 | 编译失败 | 提供适配器/过渡期支持 |
| 轮询超时/取消边界 | 长任务挂起 | 统一 AbortSignal + 超时处理 |
