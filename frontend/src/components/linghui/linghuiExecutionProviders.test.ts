import { beforeEach, describe, expect, it, vi } from 'vitest';

const getProjectITVProviderMock = vi.fn();
const getProjectTTIProviderMock = vi.fn();
const loadSettingsMock = vi.fn();
const resolveConfiguredChannelModelMock = vi.fn();
const buildVideoCapabilityRequestMock = vi.fn();
const compileWorkflowVideoDomainRequestMock = vi.fn();
const getPromptProtocolMock = vi.fn();
const mapVideoRequestToProviderRequestMock = vi.fn();
const resolveITVTransportSupportMock = vi.fn();
const resolveVideoProtocolCompilationLimitMock = vi.fn();

vi.mock('../../providers', () => ({
  getProjectITVProvider: (...args: unknown[]) => getProjectITVProviderMock(...args),
  getProjectLLMProvider: vi.fn(),
  getProjectTTIProvider: (...args: unknown[]) => getProjectTTIProviderMock(...args),
  getProjectTTSProvider: vi.fn(),
}));

vi.mock('../../providers/channel/resolver', () => ({
  resolveConfiguredChannelModel: (...args: unknown[]) => resolveConfiguredChannelModelMock(...args),
}));

vi.mock('../../providers/polling', () => ({
  DEFAULT_POLLING_CONFIG: {
    interval: 0,
    maxDuration: 100,
    initialDelay: 0,
  },
}));

vi.mock('../../store/settings/core', () => ({
  loadSettings: (...args: unknown[]) => loadSettingsMock(...args),
}));

vi.mock('../../services/promptCompilation/videoRequestCompiler', () => ({
  buildVideoCapabilityRequest: (...args: unknown[]) => buildVideoCapabilityRequestMock(...args),
  compileWorkflowVideoDomainRequest: (...args: unknown[]) => compileWorkflowVideoDomainRequestMock(...args),
  getPromptProtocol: (...args: unknown[]) => getPromptProtocolMock(...args),
  mapVideoRequestToProviderRequest: (...args: unknown[]) => mapVideoRequestToProviderRequestMock(...args),
  resolveITVTransportSupport: (...args: unknown[]) => resolveITVTransportSupportMock(...args),
  resolveVideoProtocolCompilationLimit: (...args: unknown[]) => resolveVideoProtocolCompilationLimitMock(...args),
}));

describe('linghuiExecutionProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    loadSettingsMock.mockResolvedValue({
      channelConfigs: [],
      mediaDefaults: {},
      promptTemplates: {},
    });

    resolveConfiguredChannelModelMock.mockImplementation((settings, category, selectionKey, capability) => {
      if (category === 'tti') {
        if (capability === 'image.image-to-image') {
          return {
            channelConfig: { id: 'channel-image' },
            model: {
              id: 'model-image-ref',
              capabilities: ['image.image-to-image'],
            },
          };
        }
        return {
          channelConfig: { id: 'channel-image' },
          model: {
            id: 'model-image',
            capabilities: ['image.text-to-image', 'image.image-to-image'],
          },
        };
      }

      return {
        channelConfig: { id: 'channel-vidu' },
        model: {
          id: 'model-vidu-q3-pro',
          capabilities: ['video.text-to-video'],
        },
      };
    });

    buildVideoCapabilityRequestMock.mockImplementation(({ capability, prompt, options }) => ({
      capability,
      prompt,
      options,
    }));

    compileWorkflowVideoDomainRequestMock.mockImplementation(({ request }) => ({
      request,
      compiledPrompt: request.prompt,
      unresolvedMentions: [],
      compilationDebug: undefined,
    }));

    getPromptProtocolMock.mockReturnValue(undefined);
    mapVideoRequestToProviderRequestMock.mockImplementation(async ({ request }) => request);
    resolveITVTransportSupportMock.mockReturnValue({});
    resolveVideoProtocolCompilationLimitMock.mockReturnValue(0);
  });

  it('轮询异步视频任务时保留 provider 上下文', async () => {
    const validateContexts: unknown[] = [];

    const provider = {
      config: { provider: 'vidu' },
      validate(this: { config?: unknown }) {
        validateContexts.push(this);
        return Boolean(this?.config);
      },
      start: vi.fn(async () => ({
        mode: 'async' as const,
        taskId: 'task-vidu-1',
      })),
      getTaskSnapshot: vi.fn(async function (this: { validate: () => boolean }, taskId: string) {
        if (!this.validate()) {
          throw new Error('provider context lost');
        }

        return {
          state: 'succeeded' as const,
          progress: 100,
          output: {
            source: `https://cdn.example.com/${taskId}.mp4`,
          },
        };
      }),
    };

    getProjectITVProviderMock.mockResolvedValue(provider);

    const { generateVideoWithProvider } = await import('./linghuiExecutionProviders');

    const result = await generateVideoWithProvider({
      capability: 'video.text-to-video',
      prompt: '一只橘猫伸懒腰然后慢慢起床',
      itvSelection: 'channel-vidu::model-vidu-q3-pro',
    });

    expect(provider.start).toHaveBeenCalledTimes(1);
    expect(provider.getTaskSnapshot).toHaveBeenCalledWith('task-vidu-1', {
      capability: 'video.text-to-video',
    });
    expect(validateContexts.at(-1)).toBe(provider);
    expect(result.source).toBe('https://cdn.example.com/task-vidu-1.mp4');
  });

  it('多角度图片请求会附带专用 requestType 和编译后的角度提示词', async () => {
    const provider = {
      type: 'openai-compatible-tti',
      config: { provider: 'openai-compatible-tti' },
      supportsMultiAngle: true,
      validate: () => true,
      start: vi.fn(async () => ({
        mode: 'immediate' as const,
        output: {
          url: 'https://cdn.example.com/multi-angle.png',
        },
      })),
    };

    getProjectTTIProviderMock.mockResolvedValue(provider);

    const { generateImageWithProvider } = await import('./linghuiExecutionProviders');

    const result = await generateImageWithProvider({
      prompt: '角色设定图，保持服装一致',
      referenceSources: ['https://cdn.example.com/source.png'],
      ttiSelection: 'channel-image::model-image',
      multiAngle: {
        endpointPath: '/v1/images/multi-angle',
        promptProtocol: 'sks-camera-v1',
        azimuth: 45,
        elevation: 30,
        distance: 1,
        sourceReferenceIndex: 0,
      },
      placeholderTitle: '多角度测试',
    });

    expect(getProjectTTIProviderMock).toHaveBeenCalledWith('channel-image::model-image', 'image.image-to-image');
    expect(provider.start).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '<sks> front-right quarter view elevated shot medium shot',
      requestType: 'multi-angle',
      multiAngle: expect.objectContaining({
        endpointPath: '/v1/images/multi-angle',
        anglePrompt: '<sks> front-right quarter view elevated shot medium shot',
        originalPrompt: '',
      }),
    }));
    expect(result.source).toBe('https://cdn.example.com/multi-angle.png');
  });

  it('多角度图片请求会回退到通用图生图 provider，而不是复用原提示词', async () => {
    const provider = {
      type: 'gemini-native-tti',
      config: { provider: 'gemini-native-tti' },
      validate: () => true,
      start: vi.fn(async () => ({
        mode: 'immediate' as const,
        output: {
          url: 'https://cdn.example.com/multi-angle-fallback.png',
        },
      })),
    };

    getProjectTTIProviderMock.mockResolvedValue(provider);

    const { generateImageWithProvider } = await import('./linghuiExecutionProviders');

    const result = await generateImageWithProvider({
      prompt: '这段原始提示词不应该继续传给下游 provider',
      referenceSources: ['https://cdn.example.com/source.png'],
      ttiSelection: 'channel-image::model-image',
      multiAngle: {
        endpointPath: '/v1/images/multi-angle',
        promptProtocol: 'sks-camera-v1',
        azimuth: 45,
        elevation: 30,
        distance: 1,
        sourceReferenceIndex: 0,
      },
      placeholderTitle: '多角度回退测试',
    });

    expect(getProjectTTIProviderMock).toHaveBeenCalledWith('channel-image::model-image', 'image.image-to-image');
    expect(provider.start).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '<sks> front-right quarter view elevated shot medium shot',
      requestType: 'multi-angle',
      references: [
        expect.objectContaining({
          transport: 'remote-url',
          value: 'https://cdn.example.com/source.png',
        }),
      ],
      multiAngle: expect.objectContaining({
        endpointPath: '/v1/images/multi-angle',
        anglePrompt: '<sks> front-right quarter view elevated shot medium shot',
        compiledPrompt: '<sks> front-right quarter view elevated shot medium shot',
        originalPrompt: '',
      }),
    }));
    expect(result.source).toBe('https://cdn.example.com/multi-angle-fallback.png');
  });
});
