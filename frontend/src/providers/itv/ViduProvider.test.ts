import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeFetchMock = vi.fn();

vi.mock('../../utils/safeFetch', () => {
  return {
    safeFetch: (url: string, init?: RequestInit) => safeFetchMock(url, init),
  };
});

import { ViduProvider } from './ViduProvider';

describe('ViduProvider', () => {
  beforeEach(() => {
    safeFetchMock.mockReset();
  });

  it('routes text-to-video requests to /vidu/v2/text2video', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ task_id: 'task-text' }), { status: 200 }));

    const provider = new ViduProvider({
      provider: 'vidu',
      baseUrl: 'https://vidu-proxy.example.com',
      apiKey: 'secret',
      modelName: 'vidu-a',
    } as any);

    const result = await provider.start({
      capability: 'video.text-to-video',
      prompt: 'a fox running in snow',
      options: { duration: 5 },
    } as any);

    expect(result).toEqual({ mode: 'async', taskId: 'task-text' });
    expect(safeFetchMock.mock.calls[0][0]).toBe('https://vidu-proxy.example.com/vidu/v2/text2video');
    const body = JSON.parse((safeFetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('vidu-a');
    expect(body.images).toBeUndefined();
    expect((safeFetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
  });

  it('forwards trace headers and debug body when trace context is provided', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ task_id: 'task-trace' }), { status: 200 }));

    const provider = new ViduProvider({
      provider: 'vidu',
      baseUrl: 'https://vidu-proxy.example.com',
      apiKey: 'secret',
      modelName: 'vidu-a',
    } as any);

    await provider.start({
      capability: 'video.text-to-video',
      prompt: 'a fox running in snow',
      options: { duration: 5 },
      __komaTrace: {
        traceId: 'trace_vidu_123',
        source: 'linghui',
        operation: 'linghui.generate-video',
        debugBody: true,
      },
    } as any);

    expect((safeFetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      'x-koma-trace-id': 'trace_vidu_123',
      'x-koma-trace-source': 'linghui',
      'x-koma-trace-operation': 'linghui.generate-video',
      'x-koma-debug-body': '1',
    });
  });

  it('routes reference-to-video requests to /vidu/v2/reference2video with images array', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ task_id: 'task-ref' }), { status: 200 }));

    const provider = new ViduProvider({
      provider: 'vidu',
      baseUrl: 'https://vidu-proxy.example.com',
      apiKey: 'secret',
      modelName: 'vidu-b',
    } as any);

    await provider.start({
      capability: 'video.reference-to-video',
      prompt: 'blend all references into one continuous shot',
      referenceImages: [
        { transport: 'remote-url', value: 'https://cdn.example.com/1.png' },
        { transport: 'remote-url', value: 'https://cdn.example.com/2.png' },
      ],
      options: { duration: 5 },
    } as any);

    expect(safeFetchMock.mock.calls[0][0]).toBe('https://vidu-proxy.example.com/vidu/v2/reference2video');
    const body = JSON.parse((safeFetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.images).toEqual([
      'https://cdn.example.com/1.png',
      'https://cdn.example.com/2.png',
    ]);
  });

  it('routes start-end-to-video requests to /vidu/v2/start-end2video', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ task_id: 'task-se' }), { status: 200 }));

    const provider = new ViduProvider({
      provider: 'vidu',
      baseUrl: 'https://vidu-proxy.example.com',
      apiKey: 'secret',
      modelName: 'vidu-c',
    } as any);

    await provider.start({
      capability: 'video.start-end-to-video',
      prompt: 'turn dawn into night',
      startFrame: { transport: 'remote-url', value: 'https://cdn.example.com/start.png' },
      endFrame: { transport: 'remote-url', value: 'https://cdn.example.com/end.png' },
      options: { duration: 5 },
    } as any);

    expect(safeFetchMock.mock.calls[0][0]).toBe('https://vidu-proxy.example.com/vidu/v2/start-end2video');
    const body = JSON.parse((safeFetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.images).toEqual([
      'https://cdn.example.com/start.png',
      'https://cdn.example.com/end.png',
    ]);
  });

  it('normalizes resolution casing for doc-compatible enums', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ task_id: 'task-resolution' }), { status: 200 }));

    const provider = new ViduProvider({
      provider: 'vidu',
      baseUrl: 'https://vidu-proxy.example.com',
      apiKey: 'secret',
      modelName: 'vidu-e',
      defaultResolution: '1080P',
    } as any);

    await provider.start({
      capability: 'video.image-to-video',
      prompt: 'make the still image move',
      primaryImage: { transport: 'remote-url', value: 'https://cdn.example.com/primary.png' },
      options: { resolution: '720P' },
    } as any);

    const body = JSON.parse((safeFetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.resolution).toBe('720p');
  });

  it('fails fast when a documented Vidu model receives an unsupported duration', async () => {
    const provider = new ViduProvider({
      provider: 'vidu',
      baseUrl: 'https://vidu-proxy.example.com',
      apiKey: 'secret',
      modelName: 'vidu2.0',
    } as any);

    await expect(provider.start({
      capability: 'video.text-to-video',
      prompt: 'a city timelapse',
      options: { duration: 6, resolution: '720P' },
    } as any)).rejects.toThrow('Vidu 模型 vidu2.0 不支持 6s');

    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it('queries task snapshots via /vidu/v2/tasks/{task_id}/creations', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      state: 'succeeded',
      progress: 100,
      data: {
        creations: [
          { url: 'https://cdn.example.com/output.mp4' },
        ],
      },
    }), { status: 200 }));

    const provider = new ViduProvider({
      provider: 'vidu',
      baseUrl: 'https://vidu-proxy.example.com',
      apiKey: 'secret',
      modelName: 'vidu-d',
    } as any);

    const snapshot = await provider.getTaskSnapshot('task-123');

    expect(safeFetchMock.mock.calls[0][0]).toBe('https://vidu-proxy.example.com/vidu/v2/tasks/task-123/creations');
    expect(snapshot.state).toBe('succeeded');
    expect(snapshot.output?.source).toBe('https://cdn.example.com/output.mp4');
  });

  it('ignores runtime options.model and always uses resolved config modelName', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ task_id: 'task-fixed-model' }), { status: 200 }));

    const provider = new ViduProvider({
      provider: 'vidu',
      baseUrl: 'https://vidu-proxy.example.com',
      apiKey: 'secret',
      modelName: 'vidu-a',
    } as any);

    await provider.start({
      capability: 'video.text-to-video',
      prompt: 'a city timelapse',
      options: { model: 'vidu-z' },
    } as any);

    const body = JSON.parse((safeFetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('vidu-a');
  });

  it('retries once with compat payload when the gateway responds with 406', async () => {
    safeFetchMock
      .mockResolvedValueOnce(new Response('not acceptable', { status: 406 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ task_id: 'task-compat' }), { status: 200 }));

    const provider = new ViduProvider({
      provider: 'vidu',
      baseUrl: 'https://vidu-proxy.example.com',
      apiKey: 'secret',
      modelName: 'vidu-f',
    } as any);

    const result = await provider.start({
      capability: 'video.text-to-video',
      prompt: 'a city timelapse',
      options: { duration: 5, resolution: '720P' },
    } as any);

    expect(result).toEqual({ mode: 'async', taskId: 'task-compat' });
    expect(safeFetchMock).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse((safeFetchMock.mock.calls[0][1] as RequestInit).body as string);
    const secondBody = JSON.parse((safeFetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(firstBody.images).toBeUndefined();
    expect(secondBody.images).toEqual([]);
    expect(secondBody.resolution).toBe('720p');
  });
});
