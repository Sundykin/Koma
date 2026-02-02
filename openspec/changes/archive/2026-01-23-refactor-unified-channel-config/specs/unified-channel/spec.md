# Spec: Unified Channel Configuration

## Overview

统一渠道配置规范，将原有的分类型渠道配置（tti/itv/character/remix）合并为按服务商聚合的配置模式。

---

## ADDED Requirements

### Requirement: Unified Channel Config Structure

渠道配置应按服务商聚合，一个服务商账号对应一份配置，包含该账号支持的所有能力接口。

#### Scenario: 创建包含多能力的渠道配置

**Given** 用户需要配置一个 toapis.com 账号
**When** 用户在 ITV 配置管理器中添加自定义渠道
**Then** 用户可以在一份配置中同时定义图生视频、角色提取、视频混音接口
**And** 系统根据配置中定义的接口推断渠道能力

#### Scenario: 仅配置部分能力

**Given** 用户只需要文生图功能
**When** 用户在 TTI 配置管理器中添加自定义渠道
**Then** 用户只需填写 TTI 相关接口配置
**And** 其他能力（ITV/角色提取/混音）留空
**And** 系统仅将该渠道识别为 TTI 能力

---

### Requirement: Character Extract Endpoint Support

统一渠道配置应支持角色提取接口定义。

#### Scenario: 配置角色提取接口

**Given** 渠道支持从视频中提取角色
**When** 用户勾选"角色提取"能力
**Then** 显示角色提取接口配置区域
**And** 用户可配置生成接口（发起提取）
**And** 用户可配置查询接口（查询进度，获取角色 ID）

#### Scenario: 使用角色提取能力

**Given** 已配置角色提取接口的渠道
**When** 调用 `extractCharacter()` 方法
**Then** 使用配置的生成接口发起请求
**And** 返回任务 ID

**Given** 已获取角色提取任务 ID
**When** 调用 `checkCharacterProgress()` 方法
**Then** 使用配置的查询接口获取进度
**And** 任务完成时返回提取的角色 ID 列表

---

### Requirement: Remix Endpoint Support

统一渠道配置应支持视频混音接口定义。

#### Scenario: 配置视频混音接口

**Given** 渠道支持视频混音
**When** 用户勾选"视频混音"能力
**Then** 显示混音接口配置区域
**And** 用户可配置生成接口（发起混音，需传入原视频 ID）
**And** 用户可配置查询接口（可复用 ITV 查询接口或独立配置）

---

### Requirement: Capability-based UI Display

UI 应根据渠道能力动态显示选项。

#### Scenario: TTI 配置管理器显示自定义渠道

**Given** 存在配置了 TTI 能力的自定义渠道
**When** 用户打开 TTI 配置管理器
**Then** 自定义渠道卡片显示在内置渠道卡片之后
**And** 卡片带有"自定义"标签

#### Scenario: ITV 配置管理器显示角色提取选项

**Given** 自定义渠道配置了 character-extract 能力
**When** 用户在项目中选择该渠道
**Then** 角色详情面板显示"提取角色"按钮
**And** 按钮调用该渠道的 extractCharacter 接口

---

## MODIFIED Requirements

### Requirement: Settings Page Width (Modified)

原需求：设置页面最大宽度 900px
修改为：设置页面最大宽度 1200px，大屏可扩展至 1400px

#### Scenario: 大屏设置页面

**Given** 用户在 1920px 宽度的屏幕上
**When** 打开设置页面
**Then** 内容区域宽度为 1200px
**And** 两侧留有边距

#### Scenario: 超大屏设置页面

**Given** 用户在 2560px 宽度的屏幕上
**When** 打开设置页面
**Then** 内容区域宽度为 1400px

---

### Requirement: Custom Channel Management Location (Modified)

原需求：自定义渠道在独立 Tab 中管理
修改为：自定义渠道整合到具体的配置管理器（TTI/ITV）中

#### Scenario: 添加自定义 TTI 渠道

**Given** 用户在 TTI 配置管理器中
**When** 点击"添加配置"
**And** 服务商选择"自定义渠道"
**Then** 展开自定义渠道配置表单
**And** 表单包含 TTI 接口配置项

#### Scenario: 添加自定义 ITV 渠道

**Given** 用户在 ITV 配置管理器中
**When** 点击"添加配置"
**And** 服务商选择"自定义渠道"
**Then** 展开自定义渠道配置表单
**And** 表单包含能力勾选框（ITV/角色提取/混音）
**And** 根据勾选显示对应接口配置

---

## REMOVED Requirements

### Requirement: Separate Channel Type (Removed)

移除 `ChannelConfig.type` 字段。不再按类型分离渠道，改为按能力聚合。

---

## Data Types

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
interface QueryEndpointConfig {
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
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

// 接口对
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
  auth: AuthConfig;

  tti?: EndpointPair;
  itv?: EndpointPair;
  characterExtract?: EndpointPair;
  remix?: EndpointPair;

  polling: PollingConfig;

  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

// 能力类型
type ChannelCapability = 'tti' | 'itv' | 'character-extract' | 'remix';
```
