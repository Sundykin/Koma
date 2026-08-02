import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SeedreamTTIProvider, resolveSeedreamSize } from './SeedreamTTIProvider';
import type { TTIModelConfig } from '../../types';

vi.mock('../../utils/safeFetch', () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from '../../utils/safeFetch';

const DATA_URL_REF = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function createConfig(overrides: Partial<TTIModelConfig> = {}): TTIModelConfig {
  return {
    id: 'c1',
    name: 'seedream',
    provider: 'doubao-seedream-tti',
    baseUrl: 'https://ark.cn-beijing.volces.com',
    apiKey: 'k',
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    modelName: 'doubao-seedream-5-0-pro-260628',
    ...overrides,
  } as TTIModelConfig;
}

function mockImageResponse(url = 'https://cdn.example.com/out.png') {
  (safeFetch as any).mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ data: [{ url }] }),
  });
}

/** 参考图下载响应（provider 会把 remote-url 下载后重编码为 base64 data-url） */
function mockReferenceDownload(bytes: Uint8Array = new Uint8Array([1, 2, 3, 4]), mimeType = 'image/png') {
  (safeFetch as any).mockResolvedValueOnce({
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? mimeType : null) },
  });
}

function lastRequestBody(index = 0) {
  const init = (safeFetch as any).mock.calls[index][1];
  return JSON.parse(init.body);
}

describe('resolveSeedreamSize', () => {
  it('defaults to 2K tier label', () => {
    expect(resolveSeedreamSize(undefined, undefined)).toBe('2K');
  });

  it('maps aspectRatio through the 1K table', () => {
    expect(resolveSeedreamSize({ imageSize: '1K', aspectRatio: '16:9' })).toBe('1280x720');
  });

  it('keeps 1K 21:9 above the Ark minimum pixel floor', () => {
    expect(resolveSeedreamSize({ imageSize: '1K', aspectRatio: '21:9' })).toBe('1568x672');
  });

  it('caps 4K to the 2K table', () => {
    expect(resolveSeedreamSize({ imageSize: '4K', aspectRatio: '16:9' })).toBe('2048x1152');
  });

  it('honors defaultSize tier', () => {
    expect(resolveSeedreamSize({ aspectRatio: '1:1' }, '1.5K')).toBe('1280x1280');
  });

  it('accepts explicit valid width/height', () => {
    expect(resolveSeedreamSize({ width: 2048, height: 1024 })).toBe('2048x1024');
  });

  it('falls back when explicit size violates Ark constraints', () => {
    // 100x100 = 10,000 px < 921,600 floor
    expect(resolveSeedreamSize({ width: 100, height: 100, aspectRatio: '1:1' })).toBe('2048x2048');
  });

  it('uses defaultSize WxH when valid', () => {
    expect(resolveSeedreamSize(undefined, '2048x1024')).toBe('2048x1024');
  });
});

describe('SeedreamTTIProvider', () => {
  beforeEach(() => {
    (safeFetch as any).mockReset();
  });

  it('sends text-to-image request with watermark disabled and no image field', async () => {
    mockImageResponse();
    const provider = new SeedreamTTIProvider(createConfig());

    const result = await provider.start({ prompt: '一只猫', references: [] });

    expect((safeFetch as any).mock.calls[0][0]).toBe('https://ark.cn-beijing.volces.com/api/v3/images/generations');
    const body = lastRequestBody();
    expect(body.model).toBe('doubao-seedream-5-0-pro-260628');
    expect(body.prompt).toBe('一只猫');
    expect(body.watermark).toBe(false);
    expect(body.response_format).toBe('url');
    expect(body.output_format).toBe('png');
    expect(body.size).toBe('2K');
    expect(body).not.toHaveProperty('image');
    expect(result.mode).toBe('immediate');
    expect((result as any).output.url).toBe('https://cdn.example.com/out.png');
  });

  it('downloads a remote-url reference and sends it as base64 data-url', async () => {
    mockReferenceDownload(new Uint8Array([1, 2, 3, 4]));
    mockImageResponse();
    const provider = new SeedreamTTIProvider(createConfig());

    await provider.start({
      prompt: '换成赛博朋克风',
      references: [{ transport: 'remote-url', value: 'https://cdn.example.com/ref.png' }],
    });

    // 第 1 次调用是下载参考图，第 2 次才是 generations
    expect((safeFetch as any).mock.calls[0][0]).toBe('https://cdn.example.com/ref.png');
    const body = lastRequestBody(1);
    expect(body.image).toBe(`data:image/png;base64,${Buffer.from([1, 2, 3, 4]).toString('base64')}`);
  });

  it('sends multiple references as an array and truncates to 10', async () => {
    for (let i = 0; i < 11; i += 1) {
      mockReferenceDownload();
    }
    mockImageResponse();
    const provider = new SeedreamTTIProvider(createConfig());
    const refs = Array.from({ length: 11 }, (_, i) => ({
      transport: 'remote-url' as const,
      value: `https://cdn.example.com/ref-${i}.png`,
    }));

    await provider.start({ prompt: '融合这些图', references: refs });

    const body = lastRequestBody(11);
    expect(Array.isArray(body.image)).toBe(true);
    expect(body.image).toHaveLength(10);
    expect(body.image[0].startsWith('data:image/png;base64,')).toBe(true);
  });

  it('sends data-url references directly without any extra download', async () => {
    mockImageResponse();
    const provider = new SeedreamTTIProvider(createConfig());

    await provider.start({
      prompt: '基于这张图改',
      references: [{ transport: 'data-url', value: DATA_URL_REF, mimeType: 'image/png' }],
    });

    // 只有 generations 一次请求，没有额外下载
    expect((safeFetch as any).mock.calls).toHaveLength(1);
    const body = lastRequestBody();
    expect(body.image.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('falls back to the original URL when the reference download fails', async () => {
    (safeFetch as any).mockRejectedValueOnce(new Error('network down'));
    mockImageResponse();
    const provider = new SeedreamTTIProvider(createConfig());

    await provider.start({
      prompt: '基于这张图改',
      references: [{ transport: 'remote-url', value: 'https://cdn.example.com/ref.png' }],
    });

    const body = lastRequestBody(1);
    expect(body.image).toBe('https://cdn.example.com/ref.png');
  });

  it('fans out count>1 into parallel requests and merges batch images', async () => {
    for (let i = 0; i < 3; i += 1) {
      mockImageResponse(`https://cdn.example.com/out-${i}.png`);
    }
    const provider = new SeedreamTTIProvider(createConfig());

    const result = await provider.start({ prompt: '一组图', references: [], count: 3 });

    expect((safeFetch as any).mock.calls).toHaveLength(3);
    expect(result.mode).toBe('immediate');
    const output = (result as any).output;
    expect(output.url).toBe('https://cdn.example.com/out-0.png');
    expect(output.metadata.batchImages).toHaveLength(3);
  });

  it('clamps count so references + generations stay within 15', async () => {
    const refs = Array.from({ length: 4 }, (_, i) => ({
      transport: 'remote-url' as const,
      value: `https://cdn.example.com/ref-${i}.png`,
    }));
    // 4 次参考图下载 + 11 次扇出（15 - 4）
    for (let i = 0; i < 4; i += 1) {
      mockReferenceDownload();
    }
    for (let i = 0; i < 11; i += 1) {
      mockImageResponse(`https://cdn.example.com/out-${i}.png`);
    }
    const provider = new SeedreamTTIProvider(createConfig());

    const result = await provider.start({ prompt: '多图', references: refs, count: 20 });

    expect((safeFetch as any).mock.calls).toHaveLength(15);
    expect((result as any).output.metadata.batchImages).toHaveLength(11);
  });

  it('throws Ark error code and message on HTTP failure', async () => {
    (safeFetch as any).mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { code: 'InvalidParameter', message: 'size is invalid' } }),
    });
    const provider = new SeedreamTTIProvider(createConfig());

    await expect(provider.start({ prompt: 'x', references: [] }))
      .rejects.toThrow('InvalidParameter');
    await expect(provider.start({ prompt: 'x', references: [] }))
      .rejects.toThrow('size is invalid');
  });

  it('throws a clear error on non-JSON responses', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '<html>gateway</html>',
    });
    const provider = new SeedreamTTIProvider(createConfig());

    await expect(provider.start({ prompt: 'x', references: [] }))
      .rejects.toThrow('非 JSON');
  });

  it('parses b64_json responses defensively', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ b64_json: 'QUJD' }] }),
    });
    const provider = new SeedreamTTIProvider(createConfig());

    const result = await provider.start({ prompt: 'x', references: [] });

    expect((result as any).output.url).toBe('data:image/png;base64,QUJD');
  });

  it('uses x-koma-channel-id header when profileId is present', async () => {
    mockImageResponse();
    const provider = new SeedreamTTIProvider(createConfig({ apiKey: undefined, profileId: 'ch-1' }));

    await provider.start({ prompt: 'x', references: [] });

    const headers = (safeFetch as any).mock.calls[0][1].headers;
    expect(headers['x-koma-channel-id']).toBe('ch-1');
    expect(headers.Authorization).toBeUndefined();
  });

  it('falls back to Authorization Bearer when only apiKey is present', async () => {
    mockImageResponse();
    const provider = new SeedreamTTIProvider(createConfig());

    await provider.start({ prompt: 'x', references: [] });

    const headers = (safeFetch as any).mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer k');
  });

  describe('testConnection', () => {
    it('returns false on 401/403 and true otherwise', async () => {
      const provider = new SeedreamTTIProvider(createConfig());

      (safeFetch as any).mockResolvedValueOnce({ ok: false, status: 401 });
      await expect(provider.testConnection()).resolves.toBe(false);

      (safeFetch as any).mockResolvedValueOnce({ ok: false, status: 403 });
      await expect(provider.testConnection()).resolves.toBe(false);

      (safeFetch as any).mockResolvedValueOnce({ ok: false, status: 404 });
      await expect(provider.testConnection()).resolves.toBe(true);

      (safeFetch as any).mockResolvedValueOnce({ ok: true, status: 200 });
      await expect(provider.testConnection()).resolves.toBe(true);

      expect((safeFetch as any).mock.calls[0][0]).toBe('https://ark.cn-beijing.volces.com/api/v3/models');
    });

    it('returns false when fetch throws', async () => {
      (safeFetch as any).mockRejectedValueOnce(new Error('network down'));
      const provider = new SeedreamTTIProvider(createConfig());
      await expect(provider.testConnection()).resolves.toBe(false);
    });
  });
});
