import { describe, it, expect, vi, beforeEach } from 'vitest';

const safeFetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
  return new Response(JSON.stringify({ task_id: 't1' }), { status: 200 });
});

vi.mock('../../utils/safeFetch', () => {
  return {
    safeFetch: (url: string, init?: RequestInit) => safeFetchMock(url, init),
  };
});

import { CustomITVProvider } from './CustomITVProvider';

describe('CustomITVProvider', () => {
  beforeEach(() => {
    safeFetchMock.mockClear();
  });

  it('does not include base64 fields when primaryImage is a remote URL', async () => {
    const provider = new CustomITVProvider({
      provider: 'custom',
      apiKey: 'k',
      baseUrl: 'https://example.com',
    } as any);

    await provider.start({
      capability: 'video.image-to-video',
      prompt: 'p',
      primaryImage: { transport: 'remote-url', value: 'https://cdn.example.com/a.jpg' },
      additionalReferences: [],
      options: {},
    } as any);

    expect(safeFetchMock).toHaveBeenCalled();
    const init = safeFetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);

    expect(body.image_url).toBe('https://cdn.example.com/a.jpg');
    expect(body.image_base64).toBeUndefined();
    expect(body.image_mime).toBeUndefined();
  });

  it('maps reference-to-video request into primary + additional reference images', async () => {
    const provider = new CustomITVProvider({
      provider: 'custom',
      apiKey: 'k',
      baseUrl: 'https://example.com',
    } as any);

    await provider.start({
      capability: 'video.reference-to-video',
      prompt: 'p',
      referenceImages: [
        { transport: 'remote-url', value: 'https://cdn.example.com/r1.jpg' },
        { transport: 'remote-url', value: 'https://cdn.example.com/r2.jpg' },
        { transport: 'remote-url', value: 'https://cdn.example.com/r3.jpg' },
      ],
      options: {},
    } as any);

    const init = safeFetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.image_url).toBe('https://cdn.example.com/r1.jpg');
    expect(body.additional_reference_images).toEqual([
      'https://cdn.example.com/r2.jpg',
      'https://cdn.example.com/r3.jpg',
    ]);
  });

  it('maps start-end-to-video request into start frame + end frame', async () => {
    const provider = new CustomITVProvider({
      provider: 'custom',
      apiKey: 'k',
      baseUrl: 'https://example.com',
    } as any);

    await provider.start({
      capability: 'video.start-end-to-video',
      prompt: 'p',
      startFrame: { transport: 'remote-url', value: 'https://cdn.example.com/start.jpg' },
      endFrame: { transport: 'remote-url', value: 'https://cdn.example.com/end.jpg' },
      options: {},
    } as any);

    const init = safeFetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.image_url).toBe('https://cdn.example.com/start.jpg');
    expect(body.additional_reference_images).toEqual([
      'https://cdn.example.com/end.jpg',
    ]);
  });

  it('keeps text-to-video request without image fields', async () => {
    const provider = new CustomITVProvider({
      provider: 'custom',
      apiKey: 'k',
      baseUrl: 'https://example.com',
    } as any);

    await provider.start({
      capability: 'video.text-to-video',
      prompt: 'p',
      options: {},
    } as any);

    const init = safeFetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.image_url).toBeUndefined();
    expect(body.additional_reference_images).toBeUndefined();
  });
});
