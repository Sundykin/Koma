/**
 * VectorEngine 渠道配置模板
 * API 文档: https://api.vectorengine.ai
 */

export interface VectorEngineConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  defaultOrientation: 'portrait' | 'landscape';
  defaultSize: 'small' | 'large';
  defaultDuration: number;
  watermark: boolean;
}

// 默认配置
export const DEFAULT_CONFIG: VectorEngineConfig = {
  apiKey: '',
  baseUrl: 'https://api.vectorengine.ai',
  defaultModel: 'sora-2-all',
  defaultOrientation: 'landscape',
  defaultSize: 'small',
  defaultDuration: 10,
  watermark: true,
};

// ITV (图生视频) 渠道模板
export const VECTORENGINE_ITV_TEMPLATE = {
  generate: {
    url: '{{baseUrl}}/v1/video/create',
    method: 'POST' as const,
    bodyTemplate: JSON.stringify({
      images: '{{imageUrls}}',
      model: '{{model}}',
      orientation: '{{orientation}}',
      prompt: '{{prompt}}',
      size: '{{size}}',
      duration: '{{duration}}',
      watermark: '{{watermark}}',
    }),
    responseMapping: {
      taskId: '$.id',
      error: '$.error',
    },
  },
  query: {
    url: '{{baseUrl}}/v1/video/query?id={{taskId}}',
    method: 'GET' as const,
    responseMapping: {
      status: '$.status',
      progress: '$.detail.pending_info.progress_pct',
      resultUrl: '$.video_url',
      error: '$.detail.failure_reason',
      extra: {
        width: '$.width',
        height: '$.height',
        thumbnailUrl: '$.thumbnail_url',
        enhancedPrompt: '$.enhanced_prompt',
      },
    },
    statusMapping: {
      pending: ['pending', 'queued'],
      processing: ['processing', 'in_progress'],
      completed: ['completed', 'succeeded'],
      failed: ['failed', 'error'],
    },
  },
};

// 角色提取渠道模板
export const VECTORENGINE_CHARACTER_TEMPLATE = {
  generate: {
    url: '{{baseUrl}}/sora/v1/characters',
    method: 'POST' as const,
    bodyTemplate: JSON.stringify({
      url: '{{videoUrl}}',
      timestamps: '{{timestamps}}',
      from_task: '{{fromTask}}',
    }),
    responseMapping: {
      taskId: '$.id',
      error: '$.error',
    },
  },
  query: {
    url: '{{baseUrl}}/sora/v1/characters/{{taskId}}',
    method: 'GET' as const,
    responseMapping: {
      status: '$.status',
      error: '$.error',
      extra: {
        characterId: '$.id',
        username: '$.username',
        permalink: '$.permalink',
        profilePictureUrl: '$.profile_picture_url',
      },
    },
    statusMapping: {
      pending: ['pending'],
      processing: ['processing'],
      completed: ['completed'],
      failed: ['failed'],
    },
  },
};

// 轮询配置
export const VECTORENGINE_POLLING = {
  interval: 5000,      // 5秒轮询
  maxDuration: 600000, // 最长等待10分钟
  initialDelay: 3000,  // 首次延迟3秒
};

// 构建完整的统一渠道配置
export function buildUnifiedChannelConfig(config: VectorEngineConfig) {
  return {
    id: `vectorengine_${Date.now()}`,
    name: 'VectorEngine (Sora-2)',
    description: 'VectorEngine.ai 视频生成服务 - 支持图生视频和角色提取',
    baseUrl: config.baseUrl,
    auth: {
      type: 'bearer' as const,
      keyValue: config.apiKey,
    },
    itv: VECTORENGINE_ITV_TEMPLATE,
    characterExtract: VECTORENGINE_CHARACTER_TEMPLATE,
    polling: VECTORENGINE_POLLING,
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// 模型选项
export const MODEL_OPTIONS = [
  { value: 'sora-2-all', label: 'Sora 2 All (推荐)' },
  { value: 'sora-2', label: 'Sora 2' },
];

// 方向选项
export const ORIENTATION_OPTIONS = [
  { value: 'landscape', label: '横屏 (16:9)' },
  { value: 'portrait', label: '竖屏 (9:16)' },
];

// 尺寸选项
export const SIZE_OPTIONS = [
  { value: 'small', label: '标准 (720p)' },
  { value: 'large', label: '高清 (1080p)' },
];

// 时长选项
export const DURATION_OPTIONS = [
  { value: 10, label: '10秒' },
  { value: 15, label: '15秒' },
  { value: 20, label: '20秒' },
];
