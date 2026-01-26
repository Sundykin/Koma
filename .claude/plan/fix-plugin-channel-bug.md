# 修复插件生图/生视频渠道不生效的 Bug

## 问题描述
角色场景页面和 AI 分镜中，即使设置了插件生图渠道为默认，实际调用时仍使用其他渠道。

## 根因分析
`getActiveTTIConfig` 和 `getActiveITVConfig` 函数只从 `settings.ttiConfigs` 和 `settings.itvConfigs` 中查找配置，完全没有考虑插件注册的渠道配置（存储在 `settings.channelConfigs` 中）。

## 修复方案（方案 B：完整版）

### 1. 类型定义修改

**文件**: `frontend/src/types.ts`

```typescript
// 扩展 TTIProviderType 和 ITVProviderType 支持插件动态类型
export type TTIProviderType =
  | 'comfyui' | 'nano-banana' | 'gemini-3-pro'
  | (string & { __ttiPlugin?: never });

export type ITVProviderType =
  | 'runway' | 'kling' | 'pika' | 'sora2' | 'comfyui-animatediff'
  | (string & { __itvPlugin?: never });

// 新增解析后的配置类型
export type ResolvedTTIConfig =
  | (TTIModelConfig & { source: 'builtin' })
  | (TTIModelConfig & { source: 'channel'; channelConfig: ChannelConfig });

export type ResolvedITVConfig =
  | (ITVModelConfig & { source: 'builtin' })
  | (ITVModelConfig & { source: 'channel'; channelConfig: ChannelConfig });
```

### 2. 配置解析层修改

**文件**: `frontend/src/store/settings/mediaConfig.ts`

修改 `getActiveTTIConfig` 和 `getActiveITVConfig`：
1. 查询 `channelConfigs` 中的插件渠道
2. 优先级：项目指定 ID > 插件默认渠道 > 内置默认 > 第一个启用渠道
3. 返回 `ResolvedTTIConfig` / `ResolvedITVConfig` 联合类型

### 3. Provider 创建层修改

**文件**: `frontend/src/providers/index.ts`

修改 `getProjectTTIProvider` 和 `getProjectITVProvider`：
1. 根据 `config.source` 分流处理
2. `builtin` 走原有 `createTTIProvider` / `createITVProvider`
3. `channel` 走 `createProviderInstance`，注入 `sandboxedFetch` 上下文

### 4. 前端 Hook（可选增强）

**文件**: `frontend/src/hooks/useActiveConfig.ts`（新增）

提供 React Hook 让 UI 组件感知当前激活的配置：
```typescript
export function useActiveConfig(type: 'tti' | 'itv', configId?: string) {
  // 返回 { config, loading }
}
```

## 实施步骤

### Step 1: 修改类型定义
- [ ] 扩展 `TTIProviderType` 和 `ITVProviderType`
- [ ] 新增 `ResolvedTTIConfig` 和 `ResolvedITVConfig`

### Step 2: 修改配置解析
- [ ] 添加辅助函数 `getEnabledChannelConfigs`
- [ ] 添加转换函数 `resolveBuiltinTTIConfig` / `resolveChannelTTIConfig`
- [ ] 修改 `getActiveTTIConfig` 返回 `ResolvedTTIConfig`
- [ ] 修改 `getActiveITVConfig` 返回 `ResolvedITVConfig`

### Step 3: 修改 Provider 创建
- [ ] 添加 `createChannelProviderContext` 函数
- [ ] 添加 `createChannelProvider` 函数
- [ ] 修改 `getProjectTTIProvider` 分流处理
- [ ] 修改 `getProjectITVProvider` 分流处理

### Step 4: 验证测试
- [ ] 插件渠道设为默认，验证生成使用插件 Provider
- [ ] 内置渠道设为默认，验证生成使用内置 Provider
- [ ] 项目指定特定渠道 ID，验证使用指定渠道
- [ ] 插件禁用时，验证回退到内置默认

## 影响范围

所有使用 `getProjectTTIProvider` 和 `getProjectITVProvider` 的地方都会自动受益：
1. 角色定妆照生成 - `characterAssetWorkflow.ts`
2. 角色预览视频生成 - `characterAssetWorkflow.ts`
3. 场景图片生成 - `scenePropAssetWorkflow.ts`
4. 道具图片生成 - `scenePropAssetWorkflow.ts`
5. 道具预览视频生成 - `scenePropAssetWorkflow.ts`
6. 分镜图片生成 - `ShotGenerationService.ts`
7. 分镜视频生成 - `shotRenderWorkflow.ts`

## 风险评估

1. **类型兼容性**：使用联合类型扩展，保持向后兼容
2. **插件沙箱**：通过 `createChannelProviderContext` 正确注入 `sandboxedFetch`
3. **回退机制**：插件禁用时自动回退到内置默认
