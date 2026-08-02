import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SuiheTTIProvider } from './SuiheTTIProvider';
import type { TTIModelConfig } from '../../types';

vi.mock('../../utils/safeFetch', () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from '../../utils/safeFetch';

const DATA_URL_REF = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function createConfig(overrides: Partial<TTIModelConfig> = {}): TTIModelConfig {
  return {
    id: 'c1',
    name: 'suihe',
    provider: 'suihe-tti',
    baseUrl: 'https://api.suihemedia.cloud',
    apiKey: 'sk-k',
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    modelName: 'seedream 5.0 lite',
    ...overrides,
  } as TTIModelConfig;
}

function mockAcceptResponse(taskId = '11111111-2222-3333-4444-555555555555') {
  (safeFetch as any).mockResolvedValueOnce({
    ok: true,
    status: 202,
    text: async () => JSON.stringify({ task_id: taskId, id: taskId, status: 'queued' }),
  });
}

function lastForm(index = 0): FormData {
  return (safeFetch as any).mock.calls[index][1].body as FormData;
}

describe('SuiheTTIProvider', () => {
  beforeEach(() => {
    (safeFetch as any).mockReset();
  });

  it('submits multipart text-to-image and returns async taskId', async () => {
    mockAcceptResponse();
    const provider = new SuiheTTIProvider(createConfig());

    const result = await provider.start({ prompt: '一只猫', references: [] });

    expect((safeFetch as any).mock.calls[0][0]).toBe('https://api.suihemedia.cloud/v1/images/generations');
    const form = lastForm();
    expect(form.get('prompt')).toBe('一只猫');
    expect(form.get('model')).toBe('seedream 5.0 lite');
    expect(form.get('watermark')).toBe('false');
    expect(form.get('n')).toBe('1');
    expect(form.get('resolution')).toBe('2k');
    expect(form.get('images')).toBeNull();
    // multipart：不能带 application/json
    const headers = (safeFetch as any).mock.calls[0][1].headers;
    expect(headers['Content-Type']).toBeUndefined();
    expect(headers.Authorization).toBe('Bearer sk-k');
    expect(result).toEqual({ mode: 'async', taskId: '11111111-2222-3333-4444-555555555555' });
  });

  it('maps aspectRatio and imageSize tier to ratio/resolution fields', async () => {
    mockAcceptResponse();
    const provider = new SuiheTTIProvider(createConfig());

    await provider.start({
      prompt: 'x',
      references: [],
      options: { aspectRatio: '16:9', imageSize: '4K' } as any,
    });

    const form = lastForm();
    expect(form.get('ratio')).toBe('16:9');
    expect(form.get('resolution')).toBe('4k');
    expect(form.get('size')).toBeNull();
  });

  it('sends size instead of resolution when defaultSize is WxH', async () => {
    mockAcceptResponse();
    const provider = new SuiheTTIProvider(createConfig({ defaultSize: '1024x1024' }));

    await provider.start({ prompt: 'x', references: [] });

    const form = lastForm();
    expect(form.get('size')).toBe('1024x1024');
    expect(form.get('resolution')).toBeNull();
  });

  it('uploads data-url references as images file fields', async () => {
    mockAcceptResponse();
    const provider = new SuiheTTIProvider(createConfig());

    await provider.start({
      prompt: '参考改图',
      references: [{ transport: 'data-url', value: DATA_URL_REF, mimeType: 'image/png' }],
    });

    const form = lastForm();
    const file = form.get('images') as File;
    expect(file).toBeTruthy();
    expect(file.type).toBe('image/png');
    expect(file.name).toBe('reference-1.png');
    // 仅受理一次请求，无额外下载
    expect((safeFetch as any).mock.calls).toHaveLength(1);
  });

  it('downloads remote-url references and uploads bytes via multipart', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([9, 8, 7]).buffer,
      headers: { get: () => 'image/png' },
    });
    mockAcceptResponse();
    const provider = new SuiheTTIProvider(createConfig());

    await provider.start({
      prompt: '参考改图',
      references: [{ transport: 'remote-url', value: 'https://cdn.example.com/ref.png' }],
    });

    expect((safeFetch as any).mock.calls[0][0]).toBe('https://cdn.example.com/ref.png');
    const form = lastForm(1);
    expect(form.get('images')).toBeTruthy();
  });

  it('throws Suihe error message on accept failure', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { code: 'InvalidParameter', message: 'model not supported' } }),
    });
    const provider = new SuiheTTIProvider(createConfig());

    await expect(provider.start({ prompt: 'x', references: [] }))
      .rejects.toThrow('model not supported');
  });

  it('throws when accept response has no task_id', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 202,
      text: async () => JSON.stringify({ status: 'queued' }),
    });
    const provider = new SuiheTTIProvider(createConfig());

    await expect(provider.start({ prompt: 'x', references: [] }))
      .rejects.toThrow('task_id');
  });

  describe('getTaskSnapshot', () => {
    it('maps success with result_urls to succeeded output', async () => {
      (safeFetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success', result_urls: ['https://cdn.example.com/a.png', 'https://cdn.example.com/b.png'] }),
      });
      const provider = new SuiheTTIProvider(createConfig());

      const snap = await provider.getTaskSnapshot('t1');

      expect((safeFetch as any).mock.calls[0][0]).toBe('https://api.suihemedia.cloud/v1/tasks/t1');
      expect(snap.state).toBe('succeeded');
      expect(snap.output?.url).toBe('https://cdn.example.com/a.png');
      expect(snap.output?.metadata?.batchImages).toHaveLength(2);
    });

    it('maps failed with fail_reason', async () => {
      (safeFetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'failed', fail_reason: '内容审核未通过' }),
      });
      const provider = new SuiheTTIProvider(createConfig());

      const snap = await provider.getTaskSnapshot('t1');
      expect(snap.state).toBe('failed');
      expect(snap.error).toBe('内容审核未通过');
    });

    it('maps in-progress states with progress', async () => {
      (safeFetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'generating', progress_pct: 45 }),
      });
      const provider = new SuiheTTIProvider(createConfig());

      const snap = await provider.getTaskSnapshot('t1');
      expect(snap.state).toBe('running');
      expect(snap.progress).toBe(45);
    });

    it('returns failed when task succeeds without result_urls', async () => {
      (safeFetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success' }),
      });
      const provider = new SuiheTTIProvider(createConfig());

      const snap = await provider.getTaskSnapshot('t1');
      expect(snap.state).toBe('failed');
      expect(snap.error).toContain('未返回图片地址');
    });
  });
});
