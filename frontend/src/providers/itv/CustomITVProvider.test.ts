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
});
