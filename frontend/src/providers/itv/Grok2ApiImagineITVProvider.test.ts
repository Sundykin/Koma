import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Grok2ApiImagineITVProvider } from './Grok2ApiImagineITVProvider';

vi.mock('../../utils/safeFetch', () => {
  return {
    safeFetch: vi.fn(),
  };

  it('uses /content endpoint when completed task has no video url', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 'completed', progress: 100 }),
    });

    const p = new Grok2ApiImagineITVProvider({
      id: 'i1',
      name: 'grok2v',
      provider: 'grok2api-imagine-itv' as any,
      baseUrl: 'http://127.0.0.1:8000',
      apiKey: 'k',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelName: 'grok-imagine-video',
    } as any);

    const snapshot = await p.getTaskSnapshot('task-1');

    expect(snapshot).toEqual({
      state: 'succeeded',
      progress: 100,
      output: { source: 'http://127.0.0.1:8000/v1/videos/task-1/content', taskId: 'task-1' },
    });
  });

});

import { safeFetch } from '../../utils/safeFetch';

describe('Grok2ApiImagineITVProvider', () => {
  beforeEach(() => {
    (safeFetch as any).mockReset();
  });

  it('calls /v1/videos with new-api-compatible JSON payload and includes images array', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'task-1', status: 'queued' }),
    });

    const p = new Grok2ApiImagineITVProvider({
      id: 'i1',
      name: 'grok2v',
      provider: 'grok2api-imagine-itv' as any,
      baseUrl: 'http://127.0.0.1:8000',
      apiKey: 'k',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelName: 'grok-imagine-video',
      defaultDuration: 5,
      defaultResolution: '720p',
    } as any);

    const res = await p.start({
      capability: 'video.image-to-video',
      prompt: 'p',
      primaryImage: { transport: 'remote-url', value: 'https://img.example.com/1.jpg' },
      additionalReferences: [
        { transport: 'remote-url', value: 'https://img.example.com/2.jpg' },
      ],
      options: { duration: 5, aspectRatio: '16:9', resolution: '720p' },
    } as any);

    expect((safeFetch as any).mock.calls[0][0]).toContain('/v1/videos');
    const init = (safeFetch as any).mock.calls[0][1];
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('grok-imagine-video');
    expect(body.prompt).toBe('p');
    expect(body.size).toBe('1280x720');
    expect(body.seconds).toBe('5');
    expect(body.quality).toBeUndefined();
    expect(body.input_reference).toBeUndefined();
    expect(body.image_reference).toBeUndefined();
    expect(body.images).toEqual([
      'https://img.example.com/1.jpg',
      'https://img.example.com/2.jpg',
    ]);
    expect(res).toEqual({ mode: 'async', taskId: 'task-1' });
  });

  it('passes reference-to-video referenceImages through images array and caps at 7', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'task-ref-cap' }),
    });

    const p = new Grok2ApiImagineITVProvider({
      id: 'i1',
      name: 'grok2v',
      provider: 'grok2api-imagine-itv' as any,
      baseUrl: 'http://127.0.0.1:8000',
      apiKey: 'k',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelName: 'grok-imagine-video',
      defaultDuration: 5,
      defaultResolution: '720p',
    } as any);

    const refs = Array.from({ length: 9 }, (_, i) => ({
      transport: 'remote-url' as const,
      value: `https://img.example.com/ref-${i}.jpg`,
    }));

    await p.start({
      capability: 'video.reference-to-video',
      prompt: 'p',
      referenceImages: refs,
      options: { duration: 5, aspectRatio: '9:16' },
    } as any);

    const body = JSON.parse((safeFetch as any).mock.calls[0][1].body as string);
    expect(body.images).toHaveLength(7);
    expect(body.images[0]).toBe('https://img.example.com/ref-0.jpg');
    expect(body.images[6]).toBe('https://img.example.com/ref-6.jpg');
    expect(body.input_reference).toBeUndefined();
    expect(body.image_reference).toBeUndefined();
  });



  it('supports text-to-video without image references', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'task-text' }),
    });

    const p = new Grok2ApiImagineITVProvider({
      id: 'i1',
      name: 'grok2v',
      provider: 'grok2api-imagine-itv' as any,
      baseUrl: 'http://127.0.0.1:8000',
      apiKey: 'k',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelName: 'grok-imagine-video',
      defaultDuration: 5,
      defaultResolution: '720p',
    } as any);

    const res = await p.start({
      capability: 'video.text-to-video',
      prompt: 'A calico cat playing a piano on stage',
      options: { duration: 5, aspectRatio: '9:16', resolution: '720p' },
    } as any);

    const body = JSON.parse((safeFetch as any).mock.calls[0][1].body as string);
    expect(body.model).toBe('grok-imagine-video');
    expect(body.prompt).toBe('A calico cat playing a piano on stage');
    expect(body.size).toBe('720x1280');
    expect(body.seconds).toBe('5');
    expect(body.quality).toBeUndefined();
    expect(body.input_reference).toBeUndefined();
    expect(body.images).toBeUndefined();
    expect(res).toEqual({ mode: 'async', taskId: 'task-text' });
  });

  it('extracts immediate video url but avoids preview images', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        preview_image: 'http://x/y/preview_image.jpg',
        video_url: 'http://x/y/out.mp4',
      }),
    });

    const p = new Grok2ApiImagineITVProvider({
      id: 'i1',
      name: 'grok2v',
      provider: 'grok2api-imagine-itv' as any,
      baseUrl: 'http://127.0.0.1:8000',
      apiKey: 'k',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelName: 'grok-imagine-video',
    } as any);

    const res = await p.start({
      capability: 'video.image-to-video',
      prompt: 'p',
      primaryImage: { transport: 'remote-url', value: 'https://img.example.com/1.jpg' },
      additionalReferences: [],
      options: {},
    } as any);

    expect((res as any).output.source).toBe('http://x/y/out.mp4');
  });

  it('prefers request aspectRatio over channel defaultResolution and clamps duration', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'task-portrait' }),
    });

    const p = new Grok2ApiImagineITVProvider({
      id: 'i1',
      name: 'grok2v',
      provider: 'grok2api-imagine-itv' as any,
      baseUrl: 'http://127.0.0.1:8000',
      apiKey: 'k',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelName: 'grok-imagine-video',
      defaultDuration: 10,
      defaultResolution: '720p',
    } as any);

    await p.start({
      capability: 'video.reference-to-video',
      prompt: 'p',
      referenceImages: [{ transport: 'remote-url', value: 'https://img.example.com/1.jpg' }],
      options: { duration: 4, aspectRatio: '9:16' },
    } as any);

    const body = JSON.parse((safeFetch as any).mock.calls[0][1].body as string);
    expect(body.seconds).toBe('5');
    expect(body.size).toBe('720x1280');
    expect(body.quality).toBeUndefined();
  });

  it('keeps built-in Grok model name unchanged', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'task-original-model' }),
    });

    const p = new Grok2ApiImagineITVProvider({
      id: 'i1',
      name: 'grok2v',
      provider: 'grok2api-imagine-itv' as any,
      baseUrl: 'http://127.0.0.1:8000',
      apiKey: 'k',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelName: 'grok-imagine-video',
    } as any);

    await p.start({
      capability: 'video.image-to-video',
      prompt: 'p',
      primaryImage: { transport: 'remote-url', value: 'https://img.example.com/1.jpg' },
      additionalReferences: [],
      options: { duration: 5 },
    } as any);

    const body = JSON.parse((safeFetch as any).mock.calls[0][1].body as string);
    expect(body.model).toBe('grok-imagine-video');
  });

  it('polls /v1/videos/{taskId} and extracts completed video url', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 'completed', progress: 100, video_url: '/files/video?id=1' }),
    });

    const p = new Grok2ApiImagineITVProvider({
      id: 'i1',
      name: 'grok2v',
      provider: 'grok2api-imagine-itv' as any,
      baseUrl: 'http://127.0.0.1:8000',
      apiKey: 'k',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelName: 'grok-imagine-video',
    } as any);

    const snapshot = await p.getTaskSnapshot('task-1');

    expect((safeFetch as any).mock.calls[0][0]).toBe('http://127.0.0.1:8000/v1/videos/task-1');
    expect(snapshot).toEqual({
      state: 'succeeded',
      progress: 100,
      output: { source: 'http://127.0.0.1:8000/files/video?id=1' },
    });
  });

  it('uses /content endpoint when completed task has no video url', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 'completed', progress: 100 }),
    });

    const p = new Grok2ApiImagineITVProvider({
      id: 'i1',
      name: 'grok2v',
      provider: 'grok2api-imagine-itv' as any,
      baseUrl: 'http://127.0.0.1:8000',
      apiKey: 'k',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelName: 'grok-imagine-video',
    } as any);

    const snapshot = await p.getTaskSnapshot('task-1');

    expect(snapshot).toEqual({
      state: 'succeeded',
      progress: 100,
      output: { source: 'http://127.0.0.1:8000/v1/videos/task-1/content', taskId: 'task-1' },
    });
  });

});
