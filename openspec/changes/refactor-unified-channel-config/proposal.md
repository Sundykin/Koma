# Proposal: refactor-unified-channel-config

## Summary

重构自定义渠道配置系统，将分散的渠道类型（tti/itv/character/remix）统一到具体的服务商配置中，而非独立配置。同时扩大全局设置页面宽度以改善操作体验。

## Problem Statement

### 当前问题

1. **自定义渠道与内置渠道分离**：用户需要在两个不同地方配置同类型服务
   - TTIConfigManager 配置内置文生图
   - CustomChannelManager 配置自定义文生图
   - 用户需要理解"这是内置渠道还是自定义渠道"

2. **渠道配置不完备**：
   - 当前 ChannelConfig 只定义了一个 generate + query 接口对
   - 但 Sora2 等渠道需要多个接口：视频生成、角色提取、角色查询、视频混音
   - 用户需要为同一个服务商分别配置 character 类型和 itv 类型渠道，增加学习成本

3. **缺少角色绑定接口配置**：
   - 当前 ChannelConfig 没有角色提取相关接口配置
   - Sora2 的角色提取需要两个接口：发起提取 + 查询进度

4. **全局设置页面过窄**：
   - `max-width: 900px` 导致配置表单过于拥挤
   - JSON 编辑器显示困难

## Proposed Solution

### 核心设计：一个服务商 = 一份完整配置

将渠道配置从"按功能类型分离"改为"按服务商聚合"：

```typescript
// 新的统一渠道配置
interface UnifiedChannelConfig {
  id: string;
  name: string;                    // 如 "我的 toapis 账号"
  description?: string;
  baseUrl: string;
  auth: AuthConfig;

  // 文生图接口（可选）
  tti?: EndpointPair;

  // 图生视频接口（可选���
  itv?: EndpointPair;

  // 角色提取接口（可选，仅 sora2 类渠道支持）
  characterExtract?: {
    generate: EndpointConfig;      // 发起提取
    query: QueryEndpointConfig;    // 查询进度
  };

  // 视频混音接口（可选，仅 sora2 类渠道支持）
  remix?: {
    generate: EndpointConfig;      // 发起混音
    query: QueryEndpointConfig;    // 复用 itv.query 或独立配置
  };

  // 轮询配置
  polling: PollingConfig;

  // 能力标识
  capabilities: ChannelCapability[];

  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

type ChannelCapability = 'tti' | 'itv' | 'character-extract' | 'remix';
```

### UI 整合方案

1. **移除独立的"自定义渠道"Tab**

2. **在 TTIConfigManager 中**：
   - 服务商下拉框增加"自定义渠道"选项
   - 选择自定义渠道时展开完整配置表单
   - 自定义渠道卡片显示在内置渠道卡片之后

3. **在 ITVConfigManager 中**：
   - 同样整合自定义渠道
   - 对于支持 character-extract 和 remix 的渠道（如 sora2），在配置表单中显示额外接口配置

4. **设置页面宽度**：
   - 移除 `max-width: 900px` 限制
   - 改为响应式布局，最大宽度 1200px

## Impact

### 改动范围

1. **类型系统**：
   - 新增 `UnifiedChannelConfig` 类型
   - 废弃 `ChannelConfig` 中的 `type` 字段

2. **存储层**：
   - `AppSettings.customChannels` 数据结构迁移

3. **UI 组件**：
   - `TTIConfigManager.tsx` - 集成自定义渠道
   - `ITVConfigManager.tsx` - 集成自定义渠道 + 角色/混音配置
   - `CustomChannelManager.tsx` - 废弃或转为内部组件
   - `SettingsPage.tsx` - 移除自定义渠道 Tab，调整宽度

4. **Provider 层**：
   - `ConfigurableProvider` 支持新的配置结构

## Migration

1. 检测旧的 `ChannelConfig` 数据
2. 根据 `type` 字段合并同 `baseUrl + apiKey` 的配置
3. 转换为新的 `UnifiedChannelConfig` 格式

## Status

- [x] Proposal created
- [ ] Design document created
- [ ] Tasks defined
- [ ] Approved
