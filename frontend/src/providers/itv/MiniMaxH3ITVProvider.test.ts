import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MiniMaxH3ITVProvider } from './MiniMaxH3ITVProvider';
import type { ITVRequest } from '../../types/media';

vi.mock('../../utils/safeFetch', () => ({ safeFetch: vi.fn() }));
vi.mock('../channel/auth', () => ({
  buildChannelAuthRequest: vi.fn(() => ({
    url: (base: string) => base,
    headers: { 'Content-Type': 'application/json' },
  })),
}));
vi.mock('../../services/imageHostingService', () => ({
  uploadBytesToImageHostingWithRetry: vi.fn(),
}));

import { safeFetch } from '../../utils/safeFetch';

function makeRequest(partial: Partial<ITVRequest<unknown, unknown>> = {}): ITVRequest<unknown, unknown> {
  return {
    capability: 'video.reference-to-video',
    prompt: '把上一镜视频延长 5 秒，角色继续往前走。',
    referenceImages: [{ transport: 'remote-url', value: 'https://cdn.example.com/char.png' }],
    metadata: {
      komaVideoReferences: [{ transport: 'remote-url', value: 'https://cdn.example.com/prev.mp4' }],
      komaVoiceReferences: [{ transport: 'remote-url', value: 'https://cdn.example.com/voice.mp3' }],
    },
    ...partial,
  } as ITVRequest<unknown, unknown>;
}

describe('MiniMaxH3ITVProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('把多模态参考组装成 H3 content[]（图/视频/音频分 role）', async () => {
    const provider = new MiniMaxH3ITVProvider({
      provider: 'minimax-h3-itv',
      apiKey: 'sk-test',
    });
    vi.mocked(safeFetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ task_id: 't1' }),
    } as never);

    const result = await provider.start(makeRequest());
    expect(result.mode).toBe('async');
    expect((result as { taskId: string }).taskId).toBe('t1');

    const [url, init] = vi.mocked(safeFetch).mock.calls[0];
    expect(String(url)).toContain('/v2/video_generation');
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe('MiniMax-H3');
    expect(body.duration).toBe(5);
    const roles = body.content.map((item: { type: string; role?: string }) => item.role || item.type);
    expect(roles).toEqual(expect.arrayContaining(['text', 'reference_image', 'reference_video', 'reference_audio']));
  });

  it('代理渠道（profileId）下 validate 通过，即使 apiKey 为空', () => {
    const proxy = new MiniMaxH3ITVProvider({
      provider: 'minimax-h3-itv',
      apiKey: '',
      profileId: 'chan-1',
    });
    expect(proxy.validate()).toBe(true);
  });

  it('明文 apiKey 渠道 validate 通过', () => {
    const plain = new MiniMaxH3ITVProvider({
      provider: 'minimax-h3-itv',
      apiKey: 'sk-test',
    });
    expect(plain.validate()).toBe(true);
  });

  it('useH3ContextIR 读模型 defaults 开关', () => {
    const on = new MiniMaxH3ITVProvider({
      provider: 'minimax-h3-itv',
      apiKey: 'sk',
      modelDefaults: { useH3ContextIR: true } as never,
    });
    const off = new MiniMaxH3ITVProvider({
      provider: 'minimax-h3-itv',
      apiKey: 'sk',
      modelDefaults: { useH3ContextIR: false } as never,
    });
    expect(on.useH3ContextIR).toBe(true);
    expect(off.useH3ContextIR).toBe(false);
  });

  it('上游 error 是对象时 getTaskSnapshot 返回可读错误而非 [object Object]', async () => {
    const provider = new MiniMaxH3ITVProvider({
      provider: 'minimax-h3-itv',
      apiKey: 'sk-test',
    });
    vi.mocked(safeFetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        task: {
          id: 't1',
          status: 'failed',
          error: { code: '2013', message: 'media url unreachable' },
        },
      }),
    } as never);

    const snap = await provider.getTaskSnapshot('t1');
    expect(snap.state).toBe('failed');
    expect(snap.error).toBe('[2013] media url unreachable');
    expect(snap.error).not.toContain('[object Object]');
  });

  it('H3-Context-IR 增强：创建任务→轮询→返回 content.prompt；失败静默返回 undefined', async () => {
    const provider = new MiniMaxH3ITVProvider({
      provider: 'minimax-h3-itv',
      apiKey: 'sk-test',
    });
    provider.pollIntervalMs = 10;
    // 第一次 create → task_id；之后轮询成功
    vi.mocked(safeFetch)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ task_id: 'ir-1' }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          task: { id: 'ir-1', status: 'succeeded', content: { prompt: 'enhanced prompt' } },
        }),
      } as never);

    const enhanced = await provider.enhancePromptWithContextIR(makeRequest(), 5, '16:9');
    expect(enhanced).toBe('enhanced prompt');
    const urls = vi.mocked(safeFetch).mock.calls.map(([u]) => String(u));
    expect(urls[0]).toContain('/v2/h3_context_ir');
    expect(urls[1]).toContain('/v2/query/video_generation/');
  });

  it('H3-Context-IR 创建失败时不抛错，返回 undefined', async () => {
    const provider = new MiniMaxH3ITVProvider({
      provider: 'minimax-h3-itv',
      apiKey: 'sk-test',
    });
    vi.mocked(safeFetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'invalid api key' } }),
    } as never);

    const enhanced = await provider.enhancePromptWithContextIR(makeRequest(), 5);
    expect(enhanced).toBeUndefined();
  });
});
