import { beforeEach, describe, expect, it, vi } from 'vitest';

const getProjectITVProviderMock = vi.fn();
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
  getProjectTTIProvider: vi.fn(),
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

    resolveConfiguredChannelModelMock.mockReturnValue({
      channelConfig: { id: 'channel-vidu' },
      model: {
        id: 'model-vidu-q3-pro',
        capabilities: ['video.text-to-video'],
      },
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
    expect(provider.getTaskSnapshot).toHaveBeenCalledWith('task-vidu-1');
    expect(validateContexts.at(-1)).toBe(provider);
    expect(result.source).toBe('https://cdn.example.com/task-vidu-1.mp4');
  });
});
