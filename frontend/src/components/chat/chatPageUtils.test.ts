import { describe, expect, it } from 'vitest';
import type { AppSettings } from '../../types';
import type { ModelCapability } from '../../providers/channel/types';
import {
  buildLLMConfigFromContext,
  resolveConfiguredChannelModel,
  serializeMediaSelection,
} from '../../providers/channel/resolver';
import {
  buildChatSessionConfig,
  CHAT_AUTH_ERROR_MESSAGE,
  formatChatErrorMessage,
  resolveInitialChatLLMSelection,
} from './chatPageUtils';

const KOMA_OFFICIAL_LLM_CHANNEL_ID = 'komaapi-default-llm';

function createSettings(options?: { officialEnabled?: boolean; officialModelCapabilities?: ModelCapability[] }): AppSettings {
  return {
    channelConfigs: [
      {
        id: 'legacy-openai',
        name: '旧 OpenAI',
        category: 'llm',
        providerType: 'openai',
        providerConfig: {
          baseUrl: 'https://api.openai.com/v1',
          hasApiKey: true,
        },
        defaultModelId: 'gpt-4o',
        models: [
          {
            id: 'gpt-4o',
            label: 'gpt-4o',
            providerModelName: 'gpt-4o',
            capabilities: ['llm.chat'],
          },
        ],
        enabled: true,
        source: 'builtin',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: KOMA_OFFICIAL_LLM_CHANNEL_ID,
        name: 'Koma官方',
        category: 'llm',
        providerType: 'openai',
        providerConfig: {
          baseUrl: 'https://komaapi.com/v1',
          hasApiKey: true,
        },
        defaultModelId: 'glm-5',
        models: [
          {
            id: 'glm-5',
            label: 'glm-5',
            providerModelName: 'glm-5',
            capabilities: options?.officialModelCapabilities ?? ['llm.chat'],
          },
        ],
        enabled: options?.officialEnabled ?? true,
        source: 'builtin',
        createdAt: 2,
        updatedAt: 2,
      },
    ],
    mediaDefaults: {
      llm: {
        channelId: 'legacy-openai',
        modelId: 'gpt-4o',
      },
    },
    promptTemplates: {},
  };
}

describe('chatPageUtils', () => {
  // 激活体系移除后：初始聊天模型只看设置里的默认 llm 选择，渠道全部由用户手动配置，
  // 不再有「官方渠道优先」这种隐式偏好。
  it('初始选择跟随设置里的默认 LLM，不再隐式优先官方渠道', () => {
    const settings = createSettings();
    const selection = resolveInitialChatLLMSelection(settings);

    expect(serializeMediaSelection(selection)).toBe('legacy-openai::gpt-4o');

    const context = resolveConfiguredChannelModel(settings, 'llm', selection, 'llm.chat');
    expect(context).toBeDefined();

    const sessionConfig = buildChatSessionConfig(buildLLMConfigFromContext(context!));
    expect(sessionConfig).toMatchObject({ modelName: 'gpt-4o' });
  });

  it('官方渠道即便存在且可用，也不会越过设置里的默认选择', () => {
    const selection = resolveInitialChatLLMSelection(createSettings());
    expect(serializeMediaSelection(selection)).not.toBe('komaapi-default-llm::glm-5');
  });

  it('鉴权错误显示友好提示且不保留 API Key', () => {
    const formatted = formatChatErrorMessage(
      new Error('401 Incorrect API key provided: sk-xxxx. You can find your API key at https://platform.openai.com/account/api-keys.'),
    );

    expect(formatted).toBe(CHAT_AUTH_ERROR_MESSAGE);
    expect(formatted).not.toContain('sk-xxxx');
  });

  it('非鉴权错误会脱敏常见 API Key 片段', () => {
    const formatted = formatChatErrorMessage(
      'provider failed with sk-abcdefghijklmnop xai-abcdefghi AIzaSyA1234567890abcdef and Bearer secret-token-123456',
    );

    expect(formatted).toContain('[REDACTED_API_KEY]');
    expect(formatted).not.toContain('sk-abcdefghijklmnop');
    expect(formatted).not.toContain('xai-abcdefghi');
    expect(formatted).not.toContain('AIzaSyA1234567890abcdef');
    expect(formatted).not.toContain('secret-token-123456');
  });
});
