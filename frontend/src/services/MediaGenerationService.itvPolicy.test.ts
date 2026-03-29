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

  it('URL-only providers: required remoteUrl -> throws when upload fails', async () => {
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
      // No assetTransports => default URL-only behavior in host
      start,
    });

    const { MediaGenerationService } = await import('./MediaGenerationService');
    const svc = new MediaGenerationService();

    await expect(
      svc.generateVideo({
        projectId: 'p1',
        ownerRef: { projectId: 'p1', ownerType: 'shot', ownerId: 's1', slot: 'video' },
        request: {
          capability: 'video.image-to-video',
          prompt: 'p',
          primaryImage: { transport: 'data-url', value: 'data:image/png;base64,AA==' },
          additionalReferences: [],
          options: {},
        } as any,
      })
    ).rejects.toThrow('no hosting');

    expect(start).not.toHaveBeenCalled();
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

    expect(start).toHaveBeenCalledWith({
      capability: 'video.text-to-video',
      prompt: 'a cinematic sunrise over the ocean',
      options: { duration: 5 },
    });
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
    expect(getTaskSnapshot).toHaveBeenCalledWith('remote-1');
    expect(out?.kind).toBe('video');
  });
});
