import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeFetchMock = vi.fn();

vi.mock('../../utils/safeFetch', () => {
  return {
    safeFetch: (url: string, init?: RequestInit) => safeFetchMock(url, init),
  };
});

import { KlingProvider } from './KlingProvider';

describe('KlingProvider', () => {
  beforeEach(() => {
    safeFetchMock.mockReset();
  });

  it('routes text-to-video requests to /kling/v1/videos/text2video', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      code: 0,
      data: { task_id: 'task-text' },
    }), { status: 200 }));

    const provider = new KlingProvider({
      provider: 'kling',
      baseUrl: 'https://kling-proxy.example.com',
      apiKey: 'secret',
      modelName: 'kling-v1-6',
    } as any);

    const result = await provider.start({
      capability: 'video.text-to-video',
      prompt: 'a fox running in snow',
      options: {
        duration: 10,
        aspectRatio: '9:16',
        motionStrength: 0.6,
        negativePrompt: 'blur',
      },
    } as any);

    expect(result).toEqual({ mode: 'async', taskId: 'task-text' });
    expect(safeFetchMock.mock.calls[0][0]).toBe('https://kling-proxy.example.com/kling/v1/videos/text2video');

    const body = JSON.parse((safeFetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      model_name: 'kling-v1-6',
      prompt: 'a fox running in snow',
      negative_prompt: 'blur',
      cfg_scale: 0.6,
      duration: '10',
      aspect_ratio: '9:16',
    });
  });

  it('routes image-to-video requests to /kling/v1/videos/image2video with image_tail', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      code: 0,
      data: { task_id: 'task-image' },
    }), { status: 200 }));

    const provider = new KlingProvider({
      provider: 'kling',
      baseUrl: 'https://kling-proxy.example.com',
      apiKey: 'secret',
      modelName: 'kling-v1-5',
    } as any);

    await provider.start({
      capability: 'video.image-to-video',
      prompt: 'make the still image move',
      primaryImage: { transport: 'remote-url', value: 'https://cdn.example.com/primary.png' },
      additionalReferences: [
        { transport: 'remote-url', value: 'https://cdn.example.com/tail.png' },
        { transport: 'remote-url', value: 'https://cdn.example.com/ignored.png' },
      ],
      options: { duration: 5 },
    } as any);

    expect(safeFetchMock.mock.calls[0][0]).toBe('https://kling-proxy.example.com/kling/v1/videos/image2video');

    const body = JSON.parse((safeFetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.image).toBe('https://cdn.example.com/primary.png');
    expect(body.image_tail).toBe('https://cdn.example.com/tail.png');
    expect(body.model_name).toBe('kling-v1-5');
  });

  it('strips the data URL prefix before sending Base64 images to Kling', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      code: 0,
      data: { task_id: 'task-base64' },
    }), { status: 200 }));

    const provider = new KlingProvider({
      provider: 'kling',
      baseUrl: 'https://kling-proxy.example.com',
      apiKey: 'secret',
      modelName: 'kling-v1-5',
    } as any);

    await provider.start({
      capability: 'video.image-to-video',
      prompt: 'make the still image move',
      primaryImage: { transport: 'data-url', value: 'data:image/png;base64,AAAA BBBB' },
      additionalReferences: [
        { transport: 'data-url', value: 'data:image/png;base64,CCCC' },
      ],
      options: { duration: 5 },
    } as any);

    const body = JSON.parse((safeFetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.image).toBe('AAAABBBB');
    expect(body.image_tail).toBe('CCCC');
  });

  it('routes reference-to-video requests to /kling/v1/videos/multi-image2video', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      code: 0,
      data: { task_id: 'task-ref' },
    }), { status: 200 }));

    const provider = new KlingProvider({
      provider: 'kling',
      baseUrl: 'https://kling-proxy.example.com',
      apiKey: 'secret',
      modelName: 'kling-v1-6',
    } as any);

    await provider.start({
      capability: 'video.reference-to-video',
      prompt: 'blend all references into a single motion shot',
      referenceImages: [
        { transport: 'remote-url', value: 'https://cdn.example.com/1.png' },
        { transport: 'data-url', value: 'data:image/png;base64,AAAA' },
      ],
      options: { duration: 5 },
    } as any);

    expect(safeFetchMock.mock.calls[0][0]).toBe('https://kling-proxy.example.com/kling/v1/videos/multi-image2video');

    const body = JSON.parse((safeFetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.image_list).toEqual([
      { image: 'https://cdn.example.com/1.png' },
      { image: 'AAAA' },
    ]);
    expect(body.model_name).toBe('kling-v1-6');
  });

  it('routes start-end-to-video through the documented image2video endpoint', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      code: 0,
      data: { task_id: 'task-start-end' },
    }), { status: 200 }));

    const provider = new KlingProvider({
      provider: 'kling',
      baseUrl: 'https://kling-proxy.example.com',
      apiKey: 'secret',
      modelName: 'kling-v1-5',
    } as any);

    await provider.start({
      capability: 'video.start-end-to-video',
      prompt: 'turn dawn into night',
      startFrame: { transport: 'remote-url', value: 'https://cdn.example.com/start.png' },
      endFrame: { transport: 'remote-url', value: 'https://cdn.example.com/end.png' },
      options: { duration: 5 },
    } as any);

    const body = JSON.parse((safeFetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.image).toBe('https://cdn.example.com/start.png');
    expect(body.image_tail).toBe('https://cdn.example.com/end.png');
    expect(body.duration).toBe('5');
  });

  it('queries text-to-video tasks via /kling/v1/images/text2video/{taskId}', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      code: 0,
      data: {
        task_id: 'task-123',
        task_status: 'succeed',
        task_result: {
          videos: [
            {
              id: 'video-1',
              url: 'https://cdn.example.com/output.mp4',
              duration: '5',
            },
          ],
        },
      },
    }), { status: 200 }));

    const provider = new KlingProvider({
      provider: 'kling',
      baseUrl: 'https://kling-proxy.example.com',
      apiKey: 'secret',
      modelName: 'kling-v1',
    } as any);

    const snapshot = await provider.getTaskSnapshot('task-123', {
      capability: 'video.text-to-video',
    });

    expect(safeFetchMock.mock.calls[0][0]).toBe('https://kling-proxy.example.com/kling/v1/images/text2video/task-123');
    expect(snapshot.state).toBe('succeeded');
    expect(snapshot.output).toMatchObject({
      source: 'https://cdn.example.com/output.mp4',
      taskId: 'task-123',
      durationSec: 5,
    });
  });

  it('fails fast when tail-frame generation requests 10 seconds', async () => {
    const provider = new KlingProvider({
      provider: 'kling',
      baseUrl: 'https://kling-proxy.example.com',
      apiKey: 'secret',
      modelName: 'kling-v1-5',
    } as any);

    await expect(provider.start({
      capability: 'video.start-end-to-video',
      prompt: 'turn dawn into night',
      startFrame: { transport: 'remote-url', value: 'https://cdn.example.com/start.png' },
      endFrame: { transport: 'remote-url', value: 'https://cdn.example.com/end.png' },
      options: { duration: 10 },
    } as any)).rejects.toThrow('Kling 尾帧控制仅支持 5s 视频时长');

    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it('rejects undocumented Kling model aliases before submitting', async () => {
    const provider = new KlingProvider({
      provider: 'kling',
      baseUrl: 'https://kling-proxy.example.com',
      apiKey: 'secret',
      modelName: 'kling-video-v3',
    } as any);

    await expect(provider.start({
      capability: 'video.image-to-video',
      prompt: 'make the still image move',
      primaryImage: { transport: 'remote-url', value: 'https://cdn.example.com/primary.png' },
      options: { duration: 10 },
    } as any)).rejects.toThrow('Kling 模型名称无效，仅支持 kling-v1、kling-v1-5、kling-v1-6');

    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it('surfaces gateway timeouts separately from Kling task timeouts', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response('<html>gateway timeout</html>', {
      status: 504,
      statusText: 'Gateway Timeout',
    }));

    const provider = new KlingProvider({
      provider: 'kling',
      baseUrl: 'https://kling-proxy.example.com',
      apiKey: 'secret',
      modelName: 'kling-v1-6',
    } as any);

    await expect(provider.start({
      capability: 'video.image-to-video',
      prompt: 'make the still image move',
      primaryImage: { transport: 'remote-url', value: 'https://cdn.example.com/primary.png' },
      options: { duration: 10 },
    } as any)).rejects.toThrow('Kling 生成失败: 网关超时或代理服务异常，请稍后重试');
  });
});
