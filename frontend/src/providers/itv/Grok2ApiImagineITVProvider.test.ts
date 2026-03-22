import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Grok2ApiImagineITVProvider } from './Grok2ApiImagineITVProvider';

vi.mock('../../utils/safeFetch', () => {
  return {
    safeFetch: vi.fn(),
  };
});

import { safeFetch } from '../../utils/safeFetch';

describe('Grok2ApiImagineITVProvider', () => {
  beforeEach(() => {
    (safeFetch as any).mockReset();
  });

  it('calls /v1/chat/completions and includes primary image first', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: 'video https://cdn.example.com/v.mp4' } }],
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
      modelName: 'grok-imagine-1.0-video',
      defaultDuration: 3,
      defaultResolution: '1280x720',
    } as any);

    const res = await p.start({
      prompt: 'p',
      primaryImage: { transport: 'remote-url', value: 'https://img.example.com/1.jpg' },
      additionalReferences: [
        { transport: 'remote-url', value: 'https://img.example.com/2.jpg' },
      ],
      options: { duration: 5, resolution: '1920x1080' },
    } as any);

    expect((safeFetch as any).mock.calls[0][0]).toContain('/v1/chat/completions');
    const init = (safeFetch as any).mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.messages[0].content[0].image_url.url).toBe('https://img.example.com/1.jpg');
    // grok2api expects discrete video_length: 6 / 10 / 15
    expect(body.video_config.video_length).toBe(6);
    // Koma UI uses WxH; grok2api wants that in aspect_ratio + a small enum resolution_name
    expect(body.video_config.aspect_ratio).toBe('1920x1080');
    expect(body.video_config.resolution_name).toBe('720p');
    expect(res.mode).toBe('immediate');
    expect((res as any).output.source).toBe('https://cdn.example.com/v.mp4');
  });

  it('does not accidentally pick preview_image.jpg with encoded tail', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: 'preview http://x/y/preview_image.jpg%22%3E video http://x/y/out.mp4' } }],
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
      modelName: 'grok-imagine-1.0-video',
    } as any);

    const res = await p.start({
      prompt: 'p',
      primaryImage: { transport: 'remote-url', value: 'https://img.example.com/1.jpg' },
      additionalReferences: [],
      options: {},
    } as any);

    expect((res as any).output.source).toBe('http://x/y/out.mp4');
  });
});
