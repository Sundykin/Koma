/**
 * 可扩展渠道框架 - 导出
 */
export * from './types';
export { ConfigurableProvider } from './ConfigurableProvider';
export {
  renderTemplate,
  renderUrl,
  buildBodyFromMappings,
  parseJsonTemplate,
  extractVariables,
} from './templateEngine';
export {
  extractValue,
  mapStatus,
  extractFields,
} from './jsonPathResolver';

import type { ChannelConfig, ChannelValidationResult } from './types';
import { ConfigurableProvider } from './ConfigurableProvider';

/**
 * 创建可配置 Provider
 */
export function createConfigurableProvider(config: ChannelConfig): ConfigurableProvider {
  return new ConfigurableProvider(config);
}

/**
 * 验证渠道配置
 */
export function validateChannelConfig(config: ChannelConfig): ChannelValidationResult {
  const provider = new ConfigurableProvider(config);
  return provider.validate();
}

/**
 * 预设渠道配置模板
 */
export const CHANNEL_TEMPLATES: Record<string, Partial<ChannelConfig>> = {
  // toapis.com 文生图模板
  'toapis-tti': {
    type: 'tti',
    baseUrl: 'https://toapis.com',
    auth: {
      type: 'bearer',
      keyValue: '',
    },
    generate: {
      url: '{{baseUrl}}/v1/images/generations',
      method: 'POST',
      bodyTemplate: JSON.stringify({
        model: '{{model}}',
        prompt: '{{prompt}}',
        n: 1,
        size: '{{aspectRatio}}',
      }),
      responseMapping: {
        taskId: '$.id',
      },
    },
    query: {
      url: '{{baseUrl}}/v1/images/generations/{{taskId}}',
      method: 'GET',
      responseMapping: {
        status: '$.status',
        progress: '$.progress',
        resultUrl: '$.result.data[0].url',
        error: '$.error.message',
      },
      statusMapping: {
        pending: ['queued'],
        processing: ['in_progress'],
        completed: ['completed'],
        failed: ['failed'],
      },
    },
    polling: {
      interval: 3000,
      maxDuration: 120000,
      initialDelay: 2000,
    },
  },

  // toapis.com 图生视频模板
  'toapis-itv': {
    type: 'itv',
    baseUrl: 'https://toapis.com',
    auth: {
      type: 'bearer',
      keyValue: '',
    },
    generate: {
      url: '{{baseUrl}}/v1/videos/generations',
      method: 'POST',
      bodyTemplate: JSON.stringify({
        model: '{{model}}',
        prompt: '{{prompt}}',
        duration: '{{duration}}',
        aspect_ratio: '{{aspectRatio}}',
        image_urls: '{{imageUrls}}',
      }),
      responseMapping: {
        taskId: '$.id',
      },
    },
    query: {
      url: '{{baseUrl}}/v1/videos/generations/{{taskId}}',
      method: 'GET',
      responseMapping: {
        status: '$.status',
        progress: '$.progress',
        resultUrl: '$.result.data[0].url',
        error: '$.error.message',
      },
      statusMapping: {
        pending: ['queued'],
        processing: ['in_progress'],
        completed: ['completed'],
        failed: ['failed'],
      },
    },
    polling: {
      interval: 10000,
      maxDuration: 600000,
      initialDelay: 5000,
    },
  },

  // toapis.com 角色提取模板
  'toapis-character': {
    type: 'character',
    baseUrl: 'https://toapis.com',
    auth: {
      type: 'bearer',
      keyValue: '',
    },
    generate: {
      url: '{{baseUrl}}/v1/videos/generations',
      method: 'POST',
      bodyTemplate: JSON.stringify({
        model: '{{model}}',
        timestamps: '{{timestamps}}',
        url: '{{videoUrl}}',
        from_task: '{{fromTask}}',
      }),
      responseMapping: {
        taskId: '$.id',
      },
    },
    query: {
      url: '{{baseUrl}}/v1/characters_tasks/{{taskId}}',
      method: 'GET',
      responseMapping: {
        status: '$.status',
        progress: '$.progress',
        error: '$.error.message',
        extra: {
          characters: '$.result.data.characters',
        },
      },
      statusMapping: {
        pending: ['queued'],
        processing: ['in_progress'],
        completed: ['completed'],
        failed: ['failed'],
      },
    },
    polling: {
      interval: 5000,
      maxDuration: 300000,
      initialDelay: 3000,
    },
  },
};
