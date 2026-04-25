import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeFetchMock = vi.fn();
vi.mock('../../utils/safeFetch', () => ({
  safeFetch: (url: string, init?: RequestInit) => safeFetchMock(url, init),
}));

import { NanoBananaProvider } from './NanoBananaProvider';

beforeEach(() => {
  safeFetchMock.mockReset();
});

describe('NanoBananaProvider · raw-authorization ChannelAuth', () => {
  it('profileId 存在 → header 带 x-koma-channel-id + x-koma-channel-raw-authorization:true', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      code: 200, msg: 'ok', data: { task_id: 't1' },
    }), { status: 200 }));

    const provider = new NanoBananaProvider({
      provider: 'nano-banana',
      profileId: 'ch-n',
      baseUrl: 'http://ai.hsxbk.top',
      modelName: 'nano-banana',
    } as any);

    await provider.start({ prompt: 'a sketch' } as any);
    const [url, init] = safeFetchMock.mock.calls[0];
    expect(url).toBe('http://ai.hsxbk.top/api/nano-banana');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-koma-channel-id']).toBe('ch-n');
    expect(headers['x-koma-channel-raw-authorization']).toBe('true');
    // 不应直接发 Authorization，由主进程注入裸 key
    expect(headers['Authorization']).toBeUndefined();
  });

  it('回退：无 profileId + apiKey → Authorization: <apiKey>（不加 Bearer）', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      code: 200, msg: 'ok', data: { task_id: 't2' },
    }), { status: 200 }));

    const provider = new NanoBananaProvider({
      provider: 'nano-banana',
      apiKey: 'nano-raw-key',
      modelName: 'nano-banana',
    } as any);

    await provider.start({ prompt: 'a sketch' } as any);
    const [, init] = safeFetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    // raw-authorization：直接裸 key，不加 Bearer
    expect(headers['Authorization']).toBe('nano-raw-key');
    expect(headers['x-koma-channel-id']).toBeUndefined();
  });

  it('validate: profileId || apiKey && modelName', () => {
    const make = (c: any) => new NanoBananaProvider(c).validate();
    expect(make({ provider: 'nano-banana', profileId: 'x', modelName: 'm' })).toBe(true);
    expect(make({ provider: 'nano-banana', apiKey: 'k', modelName: 'm' })).toBe(true);
    expect(make({ provider: 'nano-banana', profileId: 'x' })).toBe(false);
    expect(make({ provider: 'nano-banana' })).toBe(false);
  });

  it('401 channel_api_key_missing → 抛友好错误', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: { code: 'channel_api_key_missing', message: 'no key' } }),
      { status: 401 },
    ));
    const provider = new NanoBananaProvider({
      provider: 'nano-banana',
      profileId: 'ch-n',
      modelName: 'nano-banana',
    } as any);
    await expect(provider.start({ prompt: 'x' } as any))
      .rejects.toThrowError(/NanoBanana 请求失败/);
  });

  it('getTaskSnapshot: succeeded → output.path 有值', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      code: 200, msg: 'ok',
      data: {
        task_id: 't1',
        state: 'succeeded',
        data: { images: [{ url: 'https://cdn.example.com/img.png', file_name: 'img.png' }] },
      },
    }), { status: 200 }));

    const provider = new NanoBananaProvider({
      provider: 'nano-banana',
      profileId: 'ch-n',
      modelName: 'nano-banana',
    } as any);
    const snap = await provider.getTaskSnapshot('t1');
    expect(snap.state).toBe('succeeded');
    expect(snap.output?.path).toBe('https://cdn.example.com/img.png');
  });
});
