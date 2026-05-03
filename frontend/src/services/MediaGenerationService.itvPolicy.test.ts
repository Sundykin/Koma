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

  it('recoverTask 把任务记录的渠道模型与能力提交给主进程 handler', async () => {
    // recoverTask 现在走 submitTask → main 主进程 → 委托回 renderer 拿 snapshot。
    // 单测在 jsdom 里跑，主进程不存在；改为 mock 整套 tasks IPC，
    // 验证 submitTask 入参把 selection / channelId / modelId / capability 传对了。
    let submittedRecord: any = null;
    const submitSpy = vi.fn(async (input: any) => {
      submittedRecord = {
        id: 'task-mock-1',
        scope: input.scope,
        type: input.type,
        status: 'completed',
        progress: 100,
        targetKind: input.targetKind,
        targetId: input.targetId,
        payload: {
          ...input.initialPayload,
          input: input.input,
          output: { asset: { kind: 'video', localPath: '/tmp/recovered.mp4', createdAt: 1 } },
        },
        createdAt: 1,
        updatedAt: 1,
      };
      return submittedRecord;
    });
    const getRecord = vi.fn(async (id: string) => {
      if (submittedRecord?.id === id) return submittedRecord;
      return null;
    });
    let updateListener: any = null;
    (window as any).electronAPI = {
      tasks: {
        submit: submitSpy,
        get: getRecord,
        list: vi.fn(async () => []),
        upsert: vi.fn(async () => null),
        delete: vi.fn(async () => true),
        cancel: vi.fn(async () => true),
        removeByScope: vi.fn(async () => 0),
        removeByTarget: vi.fn(async () => 0),
        gc: vi.fn(async () => ({ purgedByAge: 0, purgedByLimit: 0 })),
        getRetention: vi.fn(async () => ({ retentionDays: 7, perScopeLimit: 200 })),
        setRetention: vi.fn(async () => ({ retentionDays: 7, perScopeLimit: 200 })),
        getWebContentsId: vi.fn(async () => 1),
        onUpdated: vi.fn((cb: any) => {
          updateListener = cb;
          // submit 已经是 completed；用 setTimeout 模拟 broadcast 触发 waitForTaskCompletion
          setTimeout(() => {
            if (updateListener && submittedRecord) {
              updateListener({}, { record: submittedRecord, kind: 'upsert' });
            }
          }, 0);
          return () => { updateListener = null; };
        }),
      },
    };

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

    expect(submitSpy).toHaveBeenCalledTimes(1);
    const submitArg = submitSpy.mock.calls[0][0];
    expect(submitArg.type).toBe('itv');
    expect(submitArg.scope).toBe('project:p1');
    expect(submitArg.input).toMatchObject({
      kind: 'video',
      remoteTaskId: 'remote-1',
      rendererHandlerType: 'itv',
      channelId: 'vidu-main',
      modelId: 'vidu-model-a',
      capability: 'video.reference-to-video',
      // selection 由 resolveTaskSelectionKey(task, ttiSelection) 派生：
      // task.channelId/modelId 拼出 'vidu-main::vidu-model-a' 优先于外部 itvSelection
      selection: 'vidu-main::vidu-model-a',
    });
    expect(out?.kind).toBe('video');

    delete (window as any).electronAPI;
  });
});
