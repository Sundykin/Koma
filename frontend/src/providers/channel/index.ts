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

import type { ChannelConfig, ChannelValidationResult, UnifiedChannelConfig, EndpointPair } from './types';
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

/**
 * 统一渠道配置模板（新版）
 */
export const UNIFIED_CHANNEL_TEMPLATES: Record<string, Partial<UnifiedChannelConfig>> = {
  // toapis.com 全能模板
  'toapis-full': {
    name: 'toapis.com',
    description: '支持文生图、图生视频、角色提取、视频混音',
    baseUrl: 'https://toapis.com',
    auth: {
      type: 'bearer',
      keyValue: '',
    },
    tti: {
      generate: {
        url: '{{baseUrl}}/v1/images/generations',
        method: 'POST',
        bodyTemplate: JSON.stringify({
          model: 'gemini-3-pro-image-preview',
          prompt: '{{prompt}}',
          n: 1,
          size: '1024x1024',
        }),
        responseMapping: { taskId: '$.id' },
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
    },
    itv: {
      generate: {
        url: '{{baseUrl}}/v1/videos/generations',
        method: 'POST',
        bodyTemplate: JSON.stringify({
          model: 'sora-2',
          prompt: '{{prompt}}',
          duration: '{{duration}}',
          aspect_ratio: '{{aspectRatio}}',
          image_urls: ['{{imageUrl}}'],
        }),
        responseMapping: { taskId: '$.id' },
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
    },
    characterExtract: {
      generate: {
        url: '{{baseUrl}}/v1/videos/generations',
        method: 'POST',
        bodyTemplate: JSON.stringify({
          model: 'sora-2',
          timestamps: '{{timestamps}}',
          from_task: '{{fromTask}}',
        }),
        responseMapping: { taskId: '$.id' },
      },
      query: {
        url: '{{baseUrl}}/v1/characters_tasks/{{taskId}}',
        method: 'GET',
        responseMapping: {
          status: '$.status',
          progress: '$.progress',
          error: '$.error.message',
          extra: { characters: '$.result.data.characters' },
        },
        statusMapping: {
          pending: ['queued'],
          processing: ['in_progress'],
          completed: ['completed'],
          failed: ['failed'],
        },
      },
    },
    remix: {
      generate: {
        url: '{{baseUrl}}/v1/videos/{{videoId}}/remix',
        method: 'POST',
        bodyTemplate: JSON.stringify({
          model: 'sora-2',
          prompt: '{{prompt}}',
          duration: '{{duration}}',
          aspect_ratio: '{{aspectRatio}}',
        }),
        responseMapping: { taskId: '$.id' },
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
    },
    polling: {
      interval: 5000,
      maxDuration: 600000,
      initialDelay: 3000,
    },
  },
};

/**
 * 将旧版 ChannelConfig 迁移为 UnifiedChannelConfig
 */
export function migrateChannelConfigs(
  oldConfigs: ChannelConfig[]
): UnifiedChannelConfig[] {
  // 按 baseUrl + apiKey 分组
  const groups = new Map<string, ChannelConfig[]>();
  for (const config of oldConfigs) {
    const key = `${config.baseUrl}|${config.auth.keyValue}`;
    const arr = groups.get(key) || [];
    arr.push(config);
    groups.set(key, arr);
  }

  const result: UnifiedChannelConfig[] = [];
  for (const [, configs] of groups) {
    const first = configs[0];
    const unified: UnifiedChannelConfig = {
      id: `unified_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name: first.name.replace(/\s*(TTI|ITV|角色|混音).*$/i, '').trim() || first.name,
      description: first.description,
      baseUrl: first.baseUrl,
      auth: first.auth,
      polling: first.polling,
      enabled: first.enabled,
      createdAt: first.createdAt,
      updatedAt: Date.now(),
    };

    for (const config of configs) {
      const pair: EndpointPair = {
        generate: config.generate,
        query: config.query,
      };

      switch (config.type) {
        case 'tti':
          unified.tti = pair;
          break;
        case 'itv':
          unified.itv = pair;
          break;
        case 'character':
          unified.characterExtract = pair;
          break;
        case 'remix':
          unified.remix = pair;
          break;
      }
    }

    result.push(unified);
  }

  return result;
}

/**
 * 验证统一渠道配置
 */
export function validateUnifiedChannelConfig(config: UnifiedChannelConfig): ChannelValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.id) errors.push('缺少 id');
  if (!config.name) errors.push('缺少名称');
  if (!config.baseUrl) errors.push('缺少 baseUrl');
  if (!config.auth) errors.push('缺少鉴权配置');
  if (!config.polling) errors.push('缺少轮询配置');

  // 至少有一个能力
  if (!config.tti && !config.itv && !config.characterExtract && !config.remix) {
    errors.push('至少需要配置一个能力（tti/itv/characterExtract/remix）');
  }

  // 验证每个能力的接口配置
  const validatePair = (name: string, pair?: EndpointPair) => {
    if (!pair) return;
    if (!pair.generate?.url) errors.push(`${name}.generate 缺少 url`);
    if (!pair.generate?.responseMapping?.taskId) errors.push(`${name}.generate 缺少 taskId 映射`);
    if (!pair.query?.url) errors.push(`${name}.query 缺少 url`);
    if (!pair.query?.responseMapping?.status) errors.push(`${name}.query 缺少 status 映射`);
    if (!pair.query?.statusMapping) warnings.push(`${name}.query 缺少 statusMapping，将使用默认映射`);
  };

  validatePair('tti', config.tti);
  validatePair('itv', config.itv);
  validatePair('characterExtract', config.characterExtract);
  validatePair('remix', config.remix);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
