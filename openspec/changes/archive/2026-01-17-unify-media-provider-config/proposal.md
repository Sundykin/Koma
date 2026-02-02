# Proposal: unify-media-provider-config

## Summary
统一 TTI（文生图）、ITV（图生视频）、TTS（语音合成）的多渠道配置管理，参考已实现的 LLM 多模型配置模式。支持无限添加配置、项目级切换、ComfyUI 工作流上传、内置厂商预设。

## Motivation
当前 TTI/ITV/TTS 配置是单一的，用户只能配置一个渠道。实际使用中：
- 用户可能同时使用 ComfyUI（本地免费）和 即梦/MidJourney（云端高质量）
- 不同项目风格可能需要不同的生成服务
- LLM 配置已支持多渠道管理，其他媒体生成服务应保持一致体验

## Goals
1. TTI/ITV/TTS 支持多配置管理（参考 LLMConfigManager）
2. 支持设置默认配置 + 项目级覆盖
3. ComfyUI 类型支持工作流 JSON 文件上传与管理
4. 内置常见厂商预设（即梦、通义万相、可灵、Runway 等）
5. 统一的 Provider 接口，项目调用时使用固定函数签名

## Non-Goals
- 不实现具体厂商的 API 调用逻辑（已有或后续单独实现）
- 不修改现有时间线编辑器

## Design Overview

### 数据结构
```typescript
// 通用媒体配置基类
interface MediaProviderConfig {
  id: string;
  name: string;                    // 用户自定义名称
  provider: string;                // 厂商类型
  apiKey?: string;                 // API 密钥（加密存储）
  baseUrl?: string;                // API 地址
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

// TTI 配置
interface TTIConfig extends MediaProviderConfig {
  provider: 'comfyui' | 'jimeng' | 'qwen-image' | 'midjourney' | 'dall-e' | 'flux';
  workflowJson?: string;           // ComfyUI 工作流 JSON（存储路径或内容）
  workflowMapping?: Record<string, string>; // 节点映射
  modelName?: string;              // 模型名称
  defaultSize?: string;            // 默认尺寸
  defaultSteps?: number;           // 默认步数
}

// ITV 配置
interface ITVConfig extends MediaProviderConfig {
  provider: 'runway' | 'kling' | 'pika' | 'minimax' | 'comfyui-animatediff';
  workflowJson?: string;           // ComfyUI 工作流
  defaultDuration?: number;        // 默认时长
  defaultResolution?: string;      // 默认分辨率
}

// TTS 配置
interface TTSConfig extends MediaProviderConfig {
  provider: 'edge-tts' | 'openai-tts' | 'fish-audio' | 'gpt-sovits' | 'doubao-tts';
  defaultVoice?: string;           // 默认音色
  defaultSpeed?: number;           // 默认语速
}
```

### UI 组件
- `TTIConfigManager` - 文生图配置管理（参考 LLMConfigManager）
- `ITVConfigManager` - 图生视频配置管理
- `TTSConfigManager` - 语音合成配置管理
- `WorkflowUploader` - ComfyUI 工作流上传与节点映射组件
- `ProjectMediaSelector` - 项目级媒体配置选择器

### 厂商预设
```typescript
// TTI 预设
const TTI_PRESETS = [
  { id: 'jimeng', name: '即梦 AI', baseUrl: 'https://api.jimeng.ai' },
  { id: 'qwen-image', name: '通义万相', baseUrl: 'https://dashscope.aliyuncs.com' },
  { id: 'midjourney', name: 'Midjourney', baseUrl: 'https://api.midjourney.com' },
  { id: 'flux', name: 'Flux (Replicate)', baseUrl: 'https://api.replicate.com' },
];

// ITV 预设
const ITV_PRESETS = [
  { id: 'runway', name: 'Runway Gen-3', baseUrl: 'https://api.runwayml.com' },
  { id: 'kling', name: '可灵 AI', baseUrl: 'https://api.klingai.com' },
  { id: 'minimax', name: 'MiniMax 海螺', baseUrl: 'https://api.minimax.chat' },
];

// TTS 预设
const TTS_PRESETS = [
  { id: 'edge-tts', name: 'Edge TTS (免费)', baseUrl: null },
  { id: 'openai-tts', name: 'OpenAI TTS', baseUrl: 'https://api.openai.com' },
  { id: 'doubao-tts', name: '豆包 TTS', baseUrl: 'https://openspeech.bytedance.com' },
  { id: 'fish-audio', name: 'Fish Audio', baseUrl: 'https://api.fish.audio' },
];
```

### 调用接口
项目中统一使用工厂函数获取当前配置的 Provider：
```typescript
// 获取当前项目的 TTI Provider
const ttiProvider = await getProjectTTIProvider(projectId);
const image = await ttiProvider.generate(prompt, options);

// 获取当前项目的 ITV Provider
const itvProvider = await getProjectITVProvider(projectId);
const video = await itvProvider.generate(imageUrl, motionPrompt, options);

// 获取当前项目的 TTS Provider
const ttsProvider = await getProjectTTSProvider(projectId);
const audio = await ttsProvider.synthesize(text, voiceId, options);
```

## Affected Specs
- `model-providers` - 扩展为通用媒体 Provider 管理
- `ui-components` - 新增配置管理组件
- `storage` - 新增配置存储结构
- `asset-generation` - 更新调用方式

## Risks
- 配置迁移：现有单配置需平滑迁移到多配置
- ComfyUI 工作流解析复杂度

## Alternatives Considered
1. 每种媒体类型单独实现配置管理 - 代码重复多
2. 使用统一的超级配置页面 - 太复杂，不利于维护
