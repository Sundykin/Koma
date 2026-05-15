import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '../../../../types';

const getProjectITVProviderMock = vi.fn();
const getProjectLLMProviderMock = vi.fn();
const getProjectTTIProviderMock = vi.fn();
const getProjectTTSProviderMock = vi.fn();
const loadSettingsMock = vi.fn();
const resolveConfiguredChannelModelMock = vi.fn();
const buildLLMConfigFromContextMock = vi.fn();
const listCapabilityFallbackCandidatesMock = vi.fn();
const buildVideoCapabilityRequestMock = vi.fn();
const compileWorkflowVideoDomainRequestMock = vi.fn();
const getPromptProtocolMock = vi.fn();
const mapVideoRequestToProviderRequestMock = vi.fn();
const resolveITVTransportSupportMock = vi.fn();
const resolveVideoProtocolCompilationLimitMock = vi.fn();
const ensureRemoteUrlForImageSourcesMock = vi.fn();
const persistMediaAssetMock = vi.fn();
const createSessionMock = vi.fn();
const disposeSessionMock = vi.fn();
const sendMessageStreamMock = vi.fn();
const cancelStreamMock = vi.fn();
const streamChunkListeners: Array<(event: unknown, data: any) => void> = [];
const streamToolListeners: Array<(event: unknown, data: any) => void> = [];
const streamDoneListeners: Array<(event: unknown, data: any) => void> = [];
const streamErrorListeners: Array<(event: unknown, data: any) => void> = [];

vi.mock('../../../../providers', () => ({
  getProjectITVProvider: (...args: unknown[]) => getProjectITVProviderMock(...args),
  getProjectLLMProvider: (...args: unknown[]) => getProjectLLMProviderMock(...args),
  getProjectTTIProvider: (...args: unknown[]) => getProjectTTIProviderMock(...args),
  getProjectTTSProvider: (...args: unknown[]) => getProjectTTSProviderMock(...args),
}));

vi.mock('../../../../providers/channel/resolver', () => ({
  resolveConfiguredChannelModel: (...args: unknown[]) => resolveConfiguredChannelModelMock(...args),
  buildLLMConfigFromContext: (...args: unknown[]) => buildLLMConfigFromContextMock(...args),
  listCapabilityFallbackCandidates: (...args: unknown[]) => listCapabilityFallbackCandidatesMock(...args),
}));

vi.mock('../../../../providers/polling', () => ({
  DEFAULT_POLLING_CONFIG: {
    interval: 0,
    maxDuration: 100,
    initialDelay: 0,
  },
}));

vi.mock('../../../../store/settings/core', () => ({
  loadSettings: (...args: unknown[]) => loadSettingsMock(...args),
}));

vi.mock('../../../../chat/ipc', () => ({
  createSession: (...args: unknown[]) => createSessionMock(...args),
  disposeSession: (...args: unknown[]) => disposeSessionMock(...args),
  sendMessageStream: (...args: unknown[]) => sendMessageStreamMock(...args),
  cancelStream: (...args: unknown[]) => cancelStreamMock(...args),
  createUserInput: (content: unknown) => ({ role: 'user', content }),
  onStreamChunk: (callback: (event: unknown, data: any) => void) => {
    streamChunkListeners.push(callback);
    return () => {
      const index = streamChunkListeners.indexOf(callback);
      if (index >= 0) streamChunkListeners.splice(index, 1);
    };
  },
  onStreamTool: (callback: (event: unknown, data: any) => void) => {
    streamToolListeners.push(callback);
    return () => {
      const index = streamToolListeners.indexOf(callback);
      if (index >= 0) streamToolListeners.splice(index, 1);
    };
  },
  onStreamDone: (callback: (event: unknown, data: any) => void) => {
    streamDoneListeners.push(callback);
    return () => {
      const index = streamDoneListeners.indexOf(callback);
      if (index >= 0) streamDoneListeners.splice(index, 1);
    };
  },
  onStreamError: (callback: (event: unknown, data: any) => void) => {
    streamErrorListeners.push(callback);
    return () => {
      const index = streamErrorListeners.indexOf(callback);
      if (index >= 0) streamErrorListeners.splice(index, 1);
    };
  },
}));

vi.mock('../../../../services/promptCompilation/videoRequestCompiler', () => ({
  buildVideoCapabilityRequest: (...args: unknown[]) => buildVideoCapabilityRequestMock(...args),
  compileWorkflowVideoDomainRequest: (...args: unknown[]) => compileWorkflowVideoDomainRequestMock(...args),
  getPromptProtocol: (...args: unknown[]) => getPromptProtocolMock(...args),
  mapVideoRequestToProviderRequest: (...args: unknown[]) => mapVideoRequestToProviderRequestMock(...args),
  resolveITVTransportSupport: (...args: unknown[]) => resolveITVTransportSupportMock(...args),
  resolveVideoProtocolCompilationLimit: (...args: unknown[]) => resolveVideoProtocolCompilationLimitMock(...args),
}));

vi.mock('../../../../services/mediaRemoteUrlService', () => ({
  ensureRemoteUrlForImageSources: (...args: unknown[]) => ensureRemoteUrlForImageSourcesMock(...args),
}));

vi.mock('../../../../services/mediaPersistenceService', () => ({
  persistMediaAsset: (...args: unknown[]) => persistMediaAssetMock(...args),
}));

describe('linghuiExecutionProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamChunkListeners.length = 0;
    streamToolListeners.length = 0;
    streamDoneListeners.length = 0;
    streamErrorListeners.length = 0;

    loadSettingsMock.mockResolvedValue({
      channelConfigs: [],
      mediaDefaults: {},
      promptTemplates: {},
    });

    resolveConfiguredChannelModelMock.mockImplementation((settings, category, selectionKey, capability) => {
      if (category === 'llm') {
        return {
          channelConfig: { id: 'channel-llm' },
          definition: { runtimeProviderType: 'openai-compatible' },
          model: {
            id: 'model-llm',
            capabilities: ['llm.chat'],
          },
        };
      }

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
    ensureRemoteUrlForImageSourcesMock.mockImplementation(async ({ sources }) => sources);
    persistMediaAssetMock.mockImplementation(async ({ kind, source, mimeType, provider, channelId, modelId, capability, metadata }) => ({
      kind,
      localPath: source,
      remoteUrl: /^https?:\/\//i.test(String(source ?? '')) ? source : undefined,
      mimeType,
      provider,
      channelId,
      modelId,
      capability,
      metadata,
      createdAt: 1,
    }));
    buildLLMConfigFromContextMock.mockReturnValue({
      profileId: 'channel-llm',
      provider: 'openai-compatible',
      modelName: 'gpt-4.1',
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.com/v1',
    });
    listCapabilityFallbackCandidatesMock.mockImplementation((settings, category, capability) => {
      if (category === 'tti') {
        const modelId = capability === 'image.image-to-image' ? 'model-image-ref' : 'model-image';
        const capabilities = capability === 'image.image-to-image'
          ? ['image.image-to-image']
          : ['image.text-to-image', 'image.image-to-image'];
        return [
          {
            selection: { channelId: 'channel-image', modelId },
            selectionKey: `channel-image::${modelId}`,
            channelId: 'channel-image',
            modelId,
            channelLabel: 'Image Channel',
            modelLabel: modelId,
            providerType: 'openai-compatible-tti',
            capabilities,
          },
        ];
      }

      if (category === 'itv') {
        return [
          {
            selection: { channelId: 'channel-vidu', modelId: 'model-vidu-q3-pro' },
            selectionKey: 'channel-vidu::model-vidu-q3-pro',
            channelId: 'channel-vidu',
            modelId: 'model-vidu-q3-pro',
            channelLabel: 'Vidu',
            modelLabel: 'Vidu Q3 Pro',
            providerType: 'vidu',
            capabilities: ['video.text-to-video', 'video.image-to-video'],
          },
        ];
      }

      return [];
    });
    createSessionMock.mockResolvedValue({ id: 'agent-session-1' });
    disposeSessionMock.mockResolvedValue(true);
    cancelStreamMock.mockResolvedValue(true);
  });

  it('音频生成优先使用节点显式选择的 voiceId', async () => {
    const provider = {
      config: { provider: 'edge-tts', defaultVoice: 'zh-CN-YunxiNeural' },
      validate: () => true,
      listVoices: vi.fn(async () => [
        { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', language: 'zh-CN', gender: 'female', provider: 'edge-tts' },
      ]),
      start: vi.fn(async () => ({
        mode: 'immediate' as const,
        output: {
          path: '/tmp/audio.mp3',
          duration: 4,
          format: 'mp3',
        },
      })),
    };

    getProjectTTSProviderMock.mockResolvedValue(provider);

    const { generateAudioWithProvider } = await import('../state/linghuiExecutionProviders');

    const result = await generateAudioWithProvider({
      text: '你好，欢迎来到灵绘',
      ttsSelection: 'tts-main::edge-tts',
      voiceId: 'zh-CN-XiaoxiaoNeural',
    });

    expect(provider.start).toHaveBeenCalledWith(expect.objectContaining({
      text: '你好，欢迎来到灵绘',
      voiceId: 'zh-CN-XiaoxiaoNeural',
    }));
    expect(provider.listVoices).not.toHaveBeenCalled();
    expect(result.metadata).toEqual(expect.objectContaining({
      voiceId: 'zh-CN-XiaoxiaoNeural',
      format: 'mp3',
    }));
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

    const { generateVideoWithProvider } = await import('../state/linghuiExecutionProviders');

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

  it('视频生成会按候选 ITV 渠道时长规格归一 duration', async () => {
    const provider = {
      config: { provider: 'koma-suihe-itv' },
      validate: () => true,
      start: vi.fn(async () => ({
        mode: 'immediate' as const,
        output: {
          source: 'https://cdn.example.com/jimeng.mp4',
          durationSec: 15,
        },
      })),
    };

    getProjectITVProviderMock.mockResolvedValue(provider);
    listCapabilityFallbackCandidatesMock.mockReturnValue([
      {
        selection: { channelId: 'jimeng-channel', modelId: 'seedance-2.0' },
        selectionKey: 'jimeng-channel::seedance-2.0',
        channelId: 'jimeng-channel',
        modelId: 'seedance-2.0',
        channelLabel: 'Koma 官方即梦',
        modelLabel: 'Seedance 2.0',
        providerType: 'koma-suihe-itv',
        capabilities: ['video.text-to-video'],
      },
    ]);
    resolveConfiguredChannelModelMock.mockReturnValue({
      channelConfig: { id: 'jimeng-channel', providerType: 'koma-suihe-itv' },
      model: { id: 'seedance-2.0', capabilities: ['video.text-to-video'] },
    });

    const { generateVideoWithProvider } = await import('../state/linghuiExecutionProviders');

    await generateVideoWithProvider({
      capability: 'video.text-to-video',
      prompt: '即梦范围时长归一',
      duration: 20,
      itvSelection: 'jimeng-channel::seedance-2.0',
    });

    expect(buildVideoCapabilityRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        duration: 15,
      }),
    }));
    expect(provider.start).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        duration: 15,
      }),
    }));
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

    const { generateImageWithProvider } = await import('../state/linghuiExecutionProviders');

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

    expect(getProjectTTIProviderMock).toHaveBeenCalledWith(
      'channel-image::model-image-ref',
      'image.image-to-image',
      expect.objectContaining({
        channelConfigs: [],
        mediaDefaults: {},
        promptTemplates: {},
      }),
    );
    expect(provider.start).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '角色设定图，保持服装一致\n<sks> front-right quarter view elevated shot medium shot',
      requestType: 'multi-angle',
      multiAngle: expect.objectContaining({
        endpointPath: '/v1/images/multi-angle',
        anglePrompt: '<sks> front-right quarter view elevated shot medium shot',
        originalPrompt: '角色设定图，保持服装一致',
      }),
    }));
    expect(result.source).toBe('https://cdn.example.com/multi-angle.png');
  });

  it('grok 图片索引协议会合并归一化显式和静默参考，并在 provider references 中去重', async () => {
    const provider = {
      type: 'grok2api-imagine-tti',
      config: { provider: 'grok2api-imagine-tti', promptProtocol: 'grok-image-index' },
      validate: () => true,
      start: vi.fn(async () => ({
        mode: 'immediate' as const,
        output: {
          url: 'https://cdn.example.com/grok-image.png',
        },
      })),
    };

    getProjectTTIProviderMock.mockResolvedValue(provider);
    getPromptProtocolMock.mockReturnValue('grok-image-index');
    ensureRemoteUrlForImageSourcesMock.mockResolvedValue([
      'https://cdn.example.com/shared.png',
      'https://cdn.example.com/shared.png',
    ]);

    const { generateImageWithProvider } = await import('../state/linghuiExecutionProviders');

    const result = await generateImageWithProvider({
      prompt: '沿用 @ref_shared 的构图',
      referenceSources: ['/tmp/shared.png'],
      silentReferenceSources: ['/tmp/shared.png'],
      promptReferences: [
        {
          id: 'shared',
          nodeId: 'node-image-1',
          kind: 'image',
          name: '共享图',
          source: '/tmp/shared.png',
        },
      ],
      ttiSelection: 'channel-image::model-image',
      placeholderTitle: 'grok refs',
    });

    expect(ensureRemoteUrlForImageSourcesMock).toHaveBeenCalledTimes(1);
    expect(ensureRemoteUrlForImageSourcesMock).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'linghui',
      policy: 'best-effort',
      sources: ['/tmp/shared.png', '/tmp/shared.png'],
    }));
    expect(provider.start).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '沿用 @Image 1 的构图',
      references: [
        expect.objectContaining({
          transport: 'remote-url',
          value: 'https://cdn.example.com/shared.png',
        }),
      ],
    }));
    expect(result.source).toBe('https://cdn.example.com/grok-image.png');
  });

  it('grok 图片索引协议遇到已落盘 remoteUrl 的灵绘图片时直接复用远程地址', async () => {
    const provider = {
      type: 'grok2api-imagine-tti',
      config: { provider: 'grok2api-imagine-tti', promptProtocol: 'grok-image-index' },
      validate: () => true,
      start: vi.fn(async () => ({
        mode: 'immediate' as const,
        output: {
          url: 'https://cdn.example.com/grok-image.png',
        },
      })),
    };
    const storedSource = {
      kind: 'image' as const,
      localPath: '/tmp/generated.png',
      remoteUrl: 'https://cdn.example.com/generated.png',
      mimeType: 'image/png',
      createdAt: 1,
    };

    getProjectTTIProviderMock.mockResolvedValue(provider);
    getPromptProtocolMock.mockReturnValue('grok-image-index');
    ensureRemoteUrlForImageSourcesMock.mockImplementation(async ({ sources }) => sources);

    const { generateImageWithProvider } = await import('../state/linghuiExecutionProviders');

    await generateImageWithProvider({
      prompt: '沿用 @ref_generated 的构图',
      referenceSources: [storedSource],
      silentReferenceSources: [storedSource],
      promptReferences: [
        {
          id: 'generated',
          nodeId: 'node-image-1',
          kind: 'image',
          name: '已生成图',
          source: storedSource,
        },
      ],
      ttiSelection: 'channel-image::model-image',
      placeholderTitle: 'grok refs',
    });

    expect(ensureRemoteUrlForImageSourcesMock).toHaveBeenCalledWith(expect.objectContaining({
      sources: [storedSource, storedSource],
    }));
    expect(provider.start).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '沿用 @Image 1 的构图',
      references: [
        expect.objectContaining({
          transport: 'remote-url',
          value: 'https://cdn.example.com/generated.png',
        }),
      ],
    }));
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

    const { generateImageWithProvider } = await import('../state/linghuiExecutionProviders');

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

    expect(getProjectTTIProviderMock).toHaveBeenCalledWith(
      'channel-image::model-image-ref',
      'image.image-to-image',
      expect.objectContaining({
        channelConfigs: [],
        mediaDefaults: {},
        promptTemplates: {},
      }),
    );
    expect(provider.start).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '这段原始提示词不应该继续传给下游 provider\n<sks> front-right quarter view elevated shot medium shot',
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
        compiledPrompt: '这段原始提示词不应该继续传给下游 provider\n<sks> front-right quarter view elevated shot medium shot',
        originalPrompt: '这段原始提示词不应该继续传给下游 provider',
      }),
    }));
    expect(result.source).toBe('https://cdn.example.com/multi-angle-fallback.png');
  });

  it('generateImagesWithProvider 会展开 provider 返回的 batchImages', async () => {
    const provider = {
      type: 'openai-compatible-tti',
      config: { provider: 'openai-compatible-tti' },
      validate: () => true,
      start: vi.fn(async () => ({
        mode: 'immediate' as const,
        output: {
          url: 'https://cdn.example.com/batch-1.png',
          path: 'https://cdn.example.com/batch-1.png',
          metadata: {
            batchImages: [
              { path: 'https://cdn.example.com/batch-1.png', url: 'https://cdn.example.com/batch-1.png' },
              { path: 'https://cdn.example.com/batch-2.png', url: 'https://cdn.example.com/batch-2.png' },
            ],
          },
        },
      })),
    };

    getProjectTTIProviderMock.mockResolvedValue(provider);

    const { generateImagesWithProvider } = await import('../state/linghuiExecutionProviders');

    const result = await generateImagesWithProvider({
      prompt: '批量图片生成',
      ttiSelection: 'channel-image::model-image',
      count: 2,
      placeholderTitle: 'batch test',
    });

    expect(provider.start).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '批量图片生成',
      count: 2,
    }));
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(expect.objectContaining({ source: 'https://cdn.example.com/batch-1.png' }));
    expect(result[1]).toEqual(expect.objectContaining({ source: 'https://cdn.example.com/batch-2.png' }));
  });

  it('传入 settingsSnapshot 时会复用该快照解析图片 provider，而不再读取全局 settings', async () => {
    const provider = {
      type: 'openai-compatible-tti',
      config: { provider: 'openai-compatible-tti' },
      validate: () => true,
      start: vi.fn(async () => ({
        mode: 'immediate' as const,
        output: {
          url: 'https://cdn.example.com/snapshot-image.png',
        },
      })),
    };
    const settingsSnapshot: AppSettings = {
      channelConfigs: [
        {
          id: 'channel-image',
          name: 'Snapshot TTI',
          category: 'tti',
          providerType: 'openai-compatible-tti',
          providerConfig: {},
          defaultModelId: 'model-image',
          models: [
            {
              id: 'model-image',
              label: 'Snapshot Image',
              capabilities: ['image.text-to-image', 'image.image-to-image'],
            },
          ],
          enabled: true,
          source: 'builtin',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      mediaDefaults: {},
      promptTemplates: {},
    };

    getProjectTTIProviderMock.mockResolvedValue(provider);
    loadSettingsMock.mockImplementation(async () => {
      throw new Error('loadSettings should not be called when snapshot is provided');
    });

    const { generateImageWithProvider } = await import('../state/linghuiExecutionProviders');

    const result = await generateImageWithProvider({
      prompt: '快照驱动的图片生成',
      ttiSelection: 'channel-image::model-image',
      settingsSnapshot,
      placeholderTitle: 'snapshot test',
    });

    expect(loadSettingsMock).not.toHaveBeenCalled();
    expect(resolveConfiguredChannelModelMock).toHaveBeenNthCalledWith(
      1,
      settingsSnapshot,
      'tti',
      'channel-image::model-image',
    );
    expect(resolveConfiguredChannelModelMock).toHaveBeenNthCalledWith(
      2,
      settingsSnapshot,
      'tti',
      'channel-image::model-image',
      'image.text-to-image',
    );
    expect(getProjectTTIProviderMock).toHaveBeenCalledWith(
      'channel-image::model-image',
      'image.text-to-image',
      settingsSnapshot,
    );
    expect(result.source).toBe('https://cdn.example.com/snapshot-image.png');
  });

  it('图片生成的 Provider 失败时只在同渠道内重试，不再静默降级到备选渠道', async () => {
    // 与视频策略对齐：用户选了 tti-primary 就只用 tti-primary，
    // 失败时同 provider 内指数退避重试 N 次（默认 2 次 → 共 3 次尝试），
    // 重试用尽就抛原始错误，不会悄悄切到 tti-backup。
    const primaryProvider = {
      type: 'openai-compatible-tti',
      config: { provider: 'openai-compatible-tti' },
      validate: () => true,
      start: vi.fn(async () => {
        throw new Error('primary start failed');
      }),
    };
    const backupProvider = {
      type: 'gemini-native-tti',
      config: { provider: 'gemini-native-tti' },
      validate: () => true,
      start: vi.fn(async () => ({
        mode: 'immediate' as const,
        output: {
          url: 'https://cdn.example.com/fallback-image.png',
          metadata: { seed: 7 },
        },
      })),
    };

    listCapabilityFallbackCandidatesMock.mockReturnValue([
      {
        selection: { channelId: 'tti-primary', modelId: 'model-a' },
        selectionKey: 'tti-primary::model-a',
        channelId: 'tti-primary',
        modelId: 'model-a',
        channelLabel: 'Primary TTI',
        modelLabel: 'Model A',
        providerType: 'openai-compatible-tti',
        capabilities: ['image.text-to-image'],
      },
      {
        selection: { channelId: 'tti-backup', modelId: 'model-b' },
        selectionKey: 'tti-backup::model-b',
        channelId: 'tti-backup',
        modelId: 'model-b',
        channelLabel: 'Backup TTI',
        modelLabel: 'Model B',
        providerType: 'gemini-native-tti',
        capabilities: ['image.text-to-image'],
      },
    ]);
    getProjectTTIProviderMock.mockImplementation(async (selectionKey: string) => (
      selectionKey === 'tti-primary::model-a' ? primaryProvider : backupProvider
    ));

    const { generateImageWithProvider } = await import('../state/linghuiExecutionProviders');

    await expect(
      generateImageWithProvider({
        prompt: '给我一张秋日街景插画',
        ttiSelection: 'tti-primary::model-a',
        placeholderTitle: '秋日街景',
      }),
    ).rejects.toThrow(/primary start failed/);

    // primary 被同渠道重试 N 次（默认 2 次重试 → 共 3 次尝试），backup 永远不会被碰
    expect(primaryProvider.start.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(backupProvider.start).not.toHaveBeenCalled();
  }, 30_000);

  it('视频 Provider 失败时只在所选 Provider 上重试，不跨渠道降级', async () => {
    // 视频渠道降级零容忍：即使候选列表里有其它 Provider（Backup ITV），
    // 实际执行也只用首位（用户选定的 Primary ITV），失败后在同一 Provider 内
    // 重试 2 次，全部失败后抛出该 Provider 的错误 —— **不会**切换到 Backup ITV。
    let primaryStartCallCount = 0;
    const primaryProvider = {
      config: { provider: 'vidu' },
      validate: () => true,
      start: vi.fn(async () => {
        primaryStartCallCount += 1;
        throw new Error('任务轮询超时');
      }),
      getTaskSnapshot: vi.fn(),
    };
    const backupProvider = {
      config: { provider: 'runway' },
      validate: () => true,
      start: vi.fn(async () => {
        throw new Error('backup 不应该被调用');
      }),
    };

    listCapabilityFallbackCandidatesMock.mockReturnValue([
      {
        selection: { channelId: 'itv-primary', modelId: 'vidu-pro' },
        selectionKey: 'itv-primary::vidu-pro',
        channelId: 'itv-primary',
        modelId: 'vidu-pro',
        channelLabel: 'Primary ITV',
        modelLabel: 'Vidu Pro',
        providerType: 'vidu',
        capabilities: ['video.text-to-video'],
      },
      {
        selection: { channelId: 'itv-backup', modelId: 'runway-pro' },
        selectionKey: 'itv-backup::runway-pro',
        channelId: 'itv-backup',
        modelId: 'runway-pro',
        channelLabel: 'Backup ITV',
        modelLabel: 'Runway Pro',
        providerType: 'runway',
        capabilities: ['video.text-to-video'],
      },
    ]);
    getProjectITVProviderMock.mockImplementation(async (selectionKey: string) => (
      selectionKey === 'itv-primary::vidu-pro' ? primaryProvider : backupProvider
    ));

    const { generateVideoWithProvider } = await import('../state/linghuiExecutionProviders');

    // 关键调用 + 计时器并行：fake timers 推动 waitForRetry 的 setTimeout，避免真等 4.5s
    vi.useFakeTimers();
    try {
      // 提前 .catch 兜住 rejection，避免 vitest 把推时间过程中的 reject
      // 当作 unhandled error 报错（推时间 → reject 触发 → assert 还没挂上）
      const pending = generateVideoWithProvider({
        capability: 'video.text-to-video',
        prompt: '一只海鸥掠过日落海面',
        itvSelection: 'itv-primary::vidu-pro',
      }).catch((err: unknown) => err);
      // 推时间到所有 backoff 结束（最多 1500 + 3000 = 4500ms，加一点 buffer）
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await pending;
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toMatch(/视频执行失败（已重试 2 次）：任务轮询超时/);
    } finally {
      vi.useRealTimers();
    }

    // Primary 被调用 3 次（首次 + 2 次重试）；Backup 永远不调
    expect(primaryStartCallCount).toBe(3);
    expect(backupProvider.start).not.toHaveBeenCalled();
  });

  it('Agent 执行会映射 chat session 并收集 reasoning 与工具轨迹', async () => {
    sendMessageStreamMock.mockImplementation(async (sessionId: string) => {
      streamChunkListeners.forEach(listener => listener({}, {
        sessionId,
        delta: '中间回答',
        reasoning: '先识别图片内容',
        seq: 0,
      }));
      streamToolListeners.forEach(listener => listener({}, {
        sessionId,
        toolCall: {
          id: 'tool-call-1',
          name: 'web_search',
          arguments: { q: '橘猫' },
        },
      }));
      streamToolListeners.forEach(listener => listener({}, {
        sessionId,
        toolCall: {
          id: 'tool-call-1',
          name: '',
          arguments: {},
        },
        result: { ok: true, answer: 'cat' },
      }));
      streamDoneListeners.forEach(listener => listener({}, {
        sessionId,
        finishReason: 'stop',
        message: { content: '最终答案' },
      }));
      return { accepted: true };
    });

    const { runAgentWithProvider } = await import('../state/linghuiExecutionProviders');

    const result = await runAgentWithProvider({
      prompt: '分析这张图',
      systemPrompt: '请输出简洁结论',
      llmSelection: 'channel-llm::model-llm',
      enabledTools: ['web_search'],
      maxIterations: 3,
      imageSources: ['data:image/png;base64,Y2F0'],
      inputTextCount: 1,
    });

    expect(createSessionMock).toHaveBeenCalledWith(expect.objectContaining({
      systemPrompt: '请输出简洁结论',
      enabledTools: ['web_search'],
      llmProfileId: 'channel-llm',
      modelProvider: 'openai',
      modelName: 'gpt-4.1',
      baseUrl: 'https://api.example.com/v1',
      agentMode: 'single',
    }));
    expect(sendMessageStreamMock).toHaveBeenCalledWith('agent-session-1', {
      role: 'user',
      content: [
        { type: 'text', text: '分析这张图' },
        { type: 'image', imageUrl: 'data:image/png;base64,Y2F0', mimeType: 'image/png' },
      ],
    });
    expect(result).toEqual({
      text: '最终答案',
      metadata: expect.objectContaining({
        mode: 'agent',
        llmSelection: 'channel-llm::model-llm',
        enabledTools: ['web_search'],
        observedToolRounds: 1,
        reasoning: '先识别图片内容',
        inputImageCount: 1,
        inputTextCount: 1,
        toolTrace: [
          {
            kind: 'tool-call',
            toolCallId: 'tool-call-1',
            name: 'web_search',
            arguments: { q: '橘猫' },
          },
          {
            kind: 'tool-result',
            toolCallId: 'tool-call-1',
            name: 'web_search',
            result: { ok: true, answer: 'cat' },
            error: undefined,
          },
        ],
      }),
    });
    expect(disposeSessionMock).toHaveBeenCalledWith('agent-session-1');
  });

  it('Agent 执行超过最大迭代数时会主动取消会话', async () => {
    sendMessageStreamMock.mockImplementation(async (sessionId: string) => {
      streamToolListeners.forEach(listener => listener({}, {
        sessionId,
        toolCall: {
          id: 'tool-call-1',
          name: 'web_search',
          arguments: { q: '第一次' },
        },
      }));
      streamToolListeners.forEach(listener => listener({}, {
        sessionId,
        toolCall: {
          id: 'tool-call-2',
          name: 'web_search',
          arguments: { q: '第二次' },
        },
      }));
      return { accepted: true };
    });

    const { runAgentWithProvider } = await import('../state/linghuiExecutionProviders');

    await expect(runAgentWithProvider({
      prompt: '请继续搜索直到找到答案',
      llmSelection: 'channel-llm::model-llm',
      enabledTools: ['web_search'],
      maxIterations: 1,
    })).rejects.toThrow('Agent 节点超过最大迭代上限（1）');

    expect(cancelStreamMock).toHaveBeenCalledWith('agent-session-1');
    expect(disposeSessionMock).toHaveBeenCalledWith('agent-session-1');
  });
});
