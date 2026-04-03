import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeFetchMock = vi.fn();

vi.mock('../../utils/safeFetch', () => ({
  safeFetch: (url: string, init?: RequestInit) => safeFetchMock(url, init),
}));

import { SeedanceProvider } from './SeedanceProvider';

describe('SeedanceProvider', () => {
  beforeEach(() => {
    safeFetchMock.mockReset();
  });

  it('submits text-to-video requests to /v1/videos/generations', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'task-seedance-text' }), { status: 200 }));

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    const result = await provider.start({
      capability: 'video.text-to-video',
      prompt: 'a fox runs through snow',
      options: { duration: 11, aspectRatio: '16:9', resolution: '720p' },
    } as any);

    expect(result).toEqual({ mode: 'async', taskId: 'task-seedance-text' });
    expect(safeFetchMock.mock.calls[0][0]).toBe('https://toapis.example.com/v1/videos/generations');
    const body = JSON.parse((safeFetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('seedance-2.0');
    expect(body.aspect_ratio).toBe('16:9');
    expect(body.metadata).toEqual({ resolution: '720p' });
    expect(body.image_with_roles).toBeUndefined();
  });

  it('maps single image-to-video requests to first_frame mode', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'task-seedance-image' }), { status: 200 }));

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    await provider.start({
      capability: 'video.image-to-video',
      prompt: 'make the still image breathe',
      primaryImage: { transport: 'remote-url', value: 'https://cdn.example.com/primary.png' },
      options: { duration: 5, aspectRatio: 'adaptive', resolution: '480p' },
    } as any);

    const body = JSON.parse((safeFetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.image_with_roles).toEqual([
      { url: 'https://cdn.example.com/primary.png', role: 'first_frame' },
    ]);
    expect(body.metadata).toEqual({ resolution: '480p' });
  });

  it('maps multi-reference image-to-video requests to reference_image mode', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'task-seedance-reference' }), { status: 200 }));

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    await provider.start({
      capability: 'video.image-to-video',
      prompt: 'keep the same subject while changing camera motion',
      primaryImage: { transport: 'remote-url', value: 'https://cdn.example.com/primary.png' },
      additionalReferences: [
        { transport: 'remote-url', value: 'https://cdn.example.com/ref-1.png' },
      ],
      options: { duration: 5, aspectRatio: '9:16', resolution: '1280x720' },
    } as any);

    const body = JSON.parse((safeFetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.image_with_roles).toEqual([
      { url: 'https://cdn.example.com/primary.png', role: 'reference_image' },
      { url: 'https://cdn.example.com/ref-1.png', role: 'reference_image' },
    ]);
    expect(body.metadata).toEqual({ resolution: '720p' });
  });

  it('declares data-url transport support so host can defer uploads to seedance', async () => {
    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    expect(provider.assetTransports).toEqual({
      primaryImage: ['remote-url', 'data-url'],
      additionalReferences: ['remote-url', 'data-url'],
      referenceImages: ['remote-url', 'data-url'],
      startFrame: ['remote-url', 'data-url'],
      endFrame: ['remote-url', 'data-url'],
    });
  });

  it('uploads data-url reference images through /v1/uploads/images before generation', async () => {
    safeFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: {
          id: 'upload-a',
          url: 'https://toapis.example.com/uploads/ref-a.webp',
          mime_type: 'image/webp',
          size: 12,
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: {
          id: 'upload-b',
          url: 'https://toapis.example.com/uploads/ref-b.webp',
          mime_type: 'image/webp',
          size: 13,
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'task-seedance-uploaded-reference' }), { status: 200 }));

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    await provider.start({
      capability: 'video.reference-to-video',
      prompt: '保持人物一致性并生成自然动作',
      referenceImages: [
        { transport: 'data-url', value: 'data:image/png;base64,AA==' },
        { transport: 'data-url', value: 'data:image/png;base64,BB==' },
      ],
      options: { duration: 5, aspectRatio: '16:9', resolution: '720p' },
    } as any);

    expect(safeFetchMock.mock.calls[0][0]).toBe('https://toapis.example.com/v1/uploads/images');
    expect((safeFetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST');
    expect((safeFetchMock.mock.calls[0][1] as RequestInit).headers).toEqual({
      Authorization: 'Bearer secret',
    });
    expect((safeFetchMock.mock.calls[0][1] as RequestInit).body).toBeInstanceOf(FormData);

    expect(safeFetchMock.mock.calls[1][0]).toBe('https://toapis.example.com/v1/uploads/images');
    expect((safeFetchMock.mock.calls[1][1] as RequestInit).body).toBeInstanceOf(FormData);

    expect(safeFetchMock.mock.calls[2][0]).toBe('https://toapis.example.com/v1/videos/generations');
    const body = JSON.parse((safeFetchMock.mock.calls[2][1] as RequestInit).body as string);
    expect(body.image_with_roles).toEqual([
      { url: 'https://toapis.example.com/uploads/ref-a.webp', role: 'reference_image' },
      { url: 'https://toapis.example.com/uploads/ref-b.webp', role: 'reference_image' },
    ]);
  });

  it('maps reference-to-video requests to reference_image mode with remote URLs', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'task-seedance-reference' }), { status: 200 }));

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    await provider.start({
      capability: 'video.reference-to-video',
      prompt: '让角色参考图保持一致并产生自然动作',
      referenceImages: [
        { transport: 'remote-url', value: 'https://cdn.example.com/ref-a.png' },
        { transport: 'remote-url', value: 'https://cdn.example.com/ref-b.jpg' },
      ],
      options: { duration: 5, aspectRatio: '16:9', resolution: '720p' },
    } as any);

    const body = JSON.parse((safeFetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.image_with_roles).toEqual([
      { url: 'https://cdn.example.com/ref-a.png', role: 'reference_image' },
      { url: 'https://cdn.example.com/ref-b.jpg', role: 'reference_image' },
    ]);
  });

  it('maps start-end-to-video requests to first_frame and last_frame roles', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'task-seedance-start-end' }), { status: 200 }));

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0-fast',
    } as any);

    await provider.start({
      capability: 'video.start-end-to-video',
      prompt: 'turn dawn into night',
      startFrame: { transport: 'remote-url', value: 'https://cdn.example.com/start.png' },
      endFrame: { transport: 'remote-url', value: 'https://cdn.example.com/end.png' },
      options: { duration: 20, aspectRatio: '3:4', resolution: '1080p' },
    } as any);

    const body = JSON.parse((safeFetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.duration).toBe(12);
    expect(body.metadata).toEqual({ resolution: '720p' });
    expect(body.image_with_roles).toEqual([
      { url: 'https://cdn.example.com/start.png', role: 'first_frame' },
      { url: 'https://cdn.example.com/end.png', role: 'last_frame' },
    ]);
  });

  it('reads completed task snapshots from result.data[0].url', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'task-seedance-done',
      model: 'seedance-2.0',
      status: 'completed',
      progress: 100,
      completed_at: 1768380514,
      expires_at: 1768466914,
      result: {
        type: 'video',
        data: [
          {
            url: 'https://files.example.com/output.mp4',
            format: 'mp4',
          },
        ],
      },
    }), { status: 200 }));

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    const snapshot = await provider.getTaskSnapshot('task-seedance-done');

    expect(safeFetchMock.mock.calls[0][0]).toBe('https://toapis.example.com/v1/videos/generations/task-seedance-done');
    expect(snapshot.state).toBe('succeeded');
    expect(snapshot.output?.source).toBe('https://files.example.com/output.mp4');
    expect(snapshot.output?.metadata).toMatchObject({
      format: 'mp4',
      model: 'seedance-2.0',
    });
  });

  it('reads completed task snapshots from metadata.url when result data is absent', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'task-seedance-metadata-url',
      model: 'seedance-2.0',
      status: 'completed',
      progress: 100,
      completed_at: 1768380514,
      expires_at: 1768466914,
      metadata: {
        generate_audio: true,
        url: 'https://files.toapis.com/images/task-seedance-metadata-url/output.mp4',
      },
    }), { status: 200 }));

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    const snapshot = await provider.getTaskSnapshot('task-seedance-metadata-url');

    expect(snapshot.state).toBe('succeeded');
    expect(snapshot.output?.source).toBe('https://files.toapis.com/images/task-seedance-metadata-url/output.mp4');
    expect(snapshot.output?.metadata).toMatchObject({
      format: 'mp4',
      model: 'seedance-2.0',
    });
  });

  it('fails completed task snapshots only when no usable video url is returned', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'task-seedance-missing-url',
      model: 'seedance-2.0',
      status: 'completed',
      progress: 100,
      completed_at: 1768380514,
      expires_at: 1768466914,
      metadata: {
        generate_audio: true,
      },
      result: {
        type: 'video',
        data: [
          {
            format: 'mp4',
          },
        ],
      },
    }), { status: 200 }));

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    const snapshot = await provider.getTaskSnapshot('task-seedance-missing-url');

    expect(snapshot.state).toBe('failed');
    expect(snapshot.error).toBe('Seedance 任务已完成，但未返回可用视频 URL');
  });

  it('surfaces actionable model route errors from upstream', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      error: {
        code: 'model_not_found',
        message: '模型 seedance-2.0 未配置渠道能力（ChannelCapability），请联系管理员配置 SKU 路由',
        type: 'new_api_error',
      },
    }), { status: 503 }));

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'seedance-2.0',
    } as any);

    await expect(provider.start({
      capability: 'video.reference-to-video',
      prompt: '保持人物一致性并生成自然镜头运动',
      referenceImages: [
        { transport: 'remote-url', value: 'https://cdn.example.com/ref-a.png' },
      ],
      options: { duration: 5, aspectRatio: '16:9', resolution: '720p' },
    } as any)).rejects.toThrow(
      '当前 API Key/渠道未开通模型 seedance-2.0',
    );
  });

  it('surfaces invalid image_url errors from upstream', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      code: 'fail_to_fetch_task',
      message: '{"error":{"message":"invalid image_url","type":"BadRequest"}}',
      data: null,
    }), { status: 400 }));

    const provider = new SeedanceProvider({
      provider: 'seedance',
      baseUrl: 'https://toapis.example.com',
      apiKey: 'secret',
      modelName: 'doubao-seedance-2-0',
    } as any);

    await expect(provider.start({
      capability: 'video.reference-to-video',
      prompt: '保持人物一致性并生成自然镜头运动',
      referenceImages: [
        { transport: 'remote-url', value: 'https://cdn.example.com/ref-a.png' },
      ],
      options: { duration: 5, aspectRatio: '16:9', resolution: '720p' },
    } as any)).rejects.toThrow(
      '上游无法读取参考图 URL（invalid image_url）',
    );
  });
});
