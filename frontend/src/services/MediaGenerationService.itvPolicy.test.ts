import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../providers', () => {
  return {
    getProjectITVProvider: vi.fn(),
    getProjectTTIProvider: vi.fn(),
    getProjectTTSProvider: vi.fn(),
  };
});

vi.mock('./imageHostingService', () => {
  return {
    uploadBytesToImageHostingWithRetry: vi.fn(),
  };
});

vi.mock('./mediaPersistenceService', () => {
  return {
    persistMediaAsset: vi.fn(async () => ({
      kind: 'video',
      localPath: '/tmp/out.mp4',
      createdAt: 1,
    })),
  };
});

vi.mock('./mediaTaskBindingService', () => {
  return {
    bindOwnerRefMedia: vi.fn(async () => {}),
  };
});

describe('MediaGenerationService.generateVideo - ITV input policy matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('URL-only providers: required remoteUrl falls back to data-url when upload fails (commit 3f22932)', async () => {
    // 产品行为：图床上传失败时回退到 data-url 而非抛错（见
    // mapVideoRequestToProviderRequest.fallbackToSourceOnRequiredUploadFailure 默认 true）。
    // 让 url-only provider 也能继续工作（provider 自行处理 data-url；mock 中无校验）。
    const { getProjectITVProvider } = await import('../providers');
    const { uploadBytesToImageHostingWithRetry } = await import('./imageHostingService');

    (uploadBytesToImageHostingWithRetry as any).mockResolvedValue({ success: false, error: 'no hosting' });

    const start = vi.fn(async () => {
      return { mode: 'immediate', output: { source: 'https://cdn.example.com/out.mp4' } };
    });

    (getProjectITVProvider as any).mockResolvedValue({
      type: 'custom',
      config: { provider: 'custom', apiKey: 'k', baseUrl: 'https://x' },
      validate: () => true,
      testConnection: async () => true,
      start,
    });

    const { MediaGenerationService } = await import('./MediaGenerationService');
    const svc = new MediaGenerationService();

    const out = await svc.generateVideo({
      projectId: 'p1',
      ownerRef: { projectId: 'p1', ownerType: 'shot', ownerId: 's1', slot: 'video' },
      request: {
        capability: 'video.image-to-video',
        prompt: 'p',
        primaryImage: { transport: 'data-url', value: 'data:image/png;base64,AA==' },
        additionalReferences: [],
        options: {},
      } as any,
    });

    expect(start).toHaveBeenCalled();
    expect(out.kind).toBe('video');
  });

  it('data-url-capable providers: best-effort remoteUrl -> continues with data-url when upload fails', async () => {
    const { getProjectITVProvider } = await import('../providers');
    const { uploadBytesToImageHostingWithRetry } = await import('./imageHostingService');

    (uploadBytesToImageHostingWithRetry as any).mockResolvedValue({ success: false, error: 'no hosting' });

    const start = vi.fn(async () => {
      return { mode: 'immediate', output: { source: 'https://cdn.example.com/out.mp4' } };
    });

    (getProjectITVProvider as any).mockResolvedValue({
      type: 'custom',
      config: { provider: 'custom', apiKey: 'k', baseUrl: 'https://x' },
      validate: () => true,
      testConnection: async () => true,
      assetTransports: { primaryImage: ['remote-url', 'data-url'], additionalReferences: ['remote-url', 'data-url'] },
      start,
    });

    const { MediaGenerationService } = await import('./MediaGenerationService');
    const svc = new MediaGenerationService();

    const out = await svc.generateVideo({
      projectId: 'p1',
      ownerRef: { projectId: 'p1', ownerType: 'shot', ownerId: 's1', slot: 'video' },
      request: {
        capability: 'video.image-to-video',
        prompt: 'p',
        primaryImage: { transport: 'data-url', value: 'data:image/png;base64,AA==' },
        additionalReferences: [],
        options: {},
      } as any,
    });

    expect(start).toHaveBeenCalled();
    expect(out.kind).toBe('video');
  });

  it('text-to-video requests do not require a primary image', async () => {
    const { getProjectITVProvider } = await import('../providers');

    const start = vi.fn(async () => {
      return { mode: 'immediate', output: { source: 'https://cdn.example.com/out.mp4' } };
    });

    (getProjectITVProvider as any).mockResolvedValue({
      type: 'vidu',
      config: { provider: 'vidu', apiKey: 'k', baseUrl: 'https://x' },
      validate: () => true,
      testConnection: async () => true,
      start,
    });

    const { MediaGenerationService } = await import('./MediaGenerationService');
    const svc = new MediaGenerationService();

    const out = await svc.generateVideo({
      projectId: 'p1',
      ownerRef: { projectId: 'p1', ownerType: 'shot', ownerId: 's1', slot: 'video' },
      request: {
        capability: 'video.text-to-video',
        prompt: 'a cinematic sunrise over the ocean',
        options: { duration: 5 },
      } as any,
    });

    expect(start).toHaveBeenCalledWith(expect.objectContaining({
      capability: 'video.text-to-video',
      prompt: 'a cinematic sunrise over the ocean',
      options: { duration: 5 },
      __komaTrace: expect.objectContaining({
        traceId: expect.any(String),
        source: 'media-generation',
        operation: 'media.generate-video',
        debugBody: true,
      }),
    }));
    expect(out.kind).toBe('video');
  });

  it('recoverTask 优先使用任务记录的渠道模型与能力恢复 ITV 任务', async () => {
    const { getProjectITVProvider } = await import('../providers');

    const getTaskSnapshot = vi.fn(async () => ({
      state: 'succeeded',
      output: { source: 'https://cdn.example.com/recovered.mp4' },
    }));

    (getProjectITVProvider as any).mockResolvedValue({
      type: 'vidu',
      config: { provider: 'vidu', apiKey: 'k', baseUrl: 'https://x' },
      validate: () => true,
      testConnection: async () => true,
      getTaskSnapshot,
    });

    const { MediaGenerationService } = await import('./MediaGenerationService');
    const svc = new MediaGenerationService();

    const out = await svc.recoverTask({
      projectId: 'p1',
      task: {
        id: 'task-1',
        projectId: 'p1',
        type: 'itv',
        targetType: 'shot',
        targetId: 'shot-1',
        remoteTaskId: 'remote-1',
        channelId: 'vidu-main',
        modelId: 'vidu-model-a',
        capability: 'video.reference-to-video',
        ownerRef: { projectId: 'p1', ownerType: 'shot', ownerId: 'shot-1', slot: 'video' },
        status: 'processing',
        progress: 50,
        retryCount: 0,
        maxRetries: 3,
        createdAt: 1,
        updatedAt: 1,
      },
      itvSelection: 'runway-main::runway-model-a',
    });

    expect(getProjectITVProvider).toHaveBeenCalledWith(
      'vidu-main::vidu-model-a',
      'video.reference-to-video',
    );
    expect(getTaskSnapshot).toHaveBeenCalledWith('remote-1', {
      capability: 'video.reference-to-video',
    });
    expect(out?.kind).toBe('video');
  });
});
