# Proposal: add-official-media-providers

## Why
当前 TTI/ITV 配置支持多个第三方渠道（ComfyUI、Runway、可灵等），但这些渠道的 API 实现不稳定或不完整。为了提供更可靠的用户体验，需要接入我们自己的官方服务接口。

现有问题：
- Sora2Provider 是 OpenAI API 的占位实现，无法使用
- 其他第三方渠道 API 实现状态不一
- 用户需要自行配置各种 API Key，门槛较高

## What Changes

### 1. 新增 nano-banana 官方 TTI Provider
- 使用官方提供的文生图接口
- 支持异步任务模式：创建任务 → 轮询结果

### 2. 改造 sora2 为官方 ITV Provider
- 使用官方提供的图生视频接口
- 支持异步任务模式：创建任务 → 轮询结果
- 新增角色提取功能：从已生成视频中提取角色

### 3. 暂时隐藏第三方渠道
- TTI_PRESETS 仅保留 nano-banana
- ITV_PRESETS 仅保留 sora2
- 保留代码但 UI 不展示其他渠道

## Design Overview

### 基础配置
- **baseUrl**: `http://ai.hsxbk.top` (可配置)
- **认证方式**: API Key（Header: `Authorization: {apiKey}`）

### Nano-Banana TTI API
```typescript
// 创建图片生成任务
POST {baseUrl}/api/nano-banana
Headers: { Authorization: {apiKey}, Content-Type: application/json }
Request: {
  model: 'gemini-2.5-pro-image-preview' | 'gemini-3-pro-image-preview',
  prompt: string,
  image_urls?: string[],      // 参考图（图生图）
  aspect_ratio?: string,      // 1:1, 16:9, 9:16 等
  image_size?: '1K' | '2K' | '4K'  // 仅 gemini-3 支持
}
Response: { code: 200, data: { task_id: string } }

// 查询任务状态
GET {baseUrl}/api/nano-banana/task/{task_id}
Headers: { Authorization: {apiKey} }
Response: {
  code: 200,
  data: {
    task_id: string,
    state: 'pending' | 'running' | 'succeeded' | 'failed',
    data?: { images: [{ url: string }] }
  }
}
```

### Sora2 ITV API
```typescript
// 创建视频生成任务
POST {baseUrl}/v1/videos/generations
Headers: { Authorization: {apiKey}, Content-Type: application/json }
Request: {
  model: 'sora-2',
  prompt: string,
  aspect_ratio: '16:9' | '9:16' | '1:1',
  duration: number,           // 秒数
  image_urls: string[]        // 首帧图片
}
Response: { id: string, order_id: number, price: number }

// 查询任务状态
GET {baseUrl}/v1/videos/tasks/{taskId}
Headers: { Authorization: {apiKey} }
Response: {
  id: string,
  state: 'running' | 'succeeded' | 'failed',
  data?: { url: string },     // 视频 URL
  progress: number
}

// 角色提取（后续实现）
POST {baseUrl}/v1/characters
Headers: { Authorization: {apiKey}, Content-Type: application/json }
Request: {
  timestamps: string,         // 如 "3,6" 表示3-6秒
  from_task: string,          // 视频任务ID
  callback_url?: string
}
Response: { id: string }      // 角色ID，后续在 prompt 中用 @{id} 引用
```

## Affected Specs
- `model-providers` - 新增官方 Provider 实现

## Risks
- 隐藏第三方渠道可能影响已有配置的用户（迁移提示）
