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
vi.mock('../../services/electronService', () => ({
  electronService: {
    isElectron: vi.fn(() => true),
    fs: {
      readFileAsBase64: vi.fn(),
      exists: vi.fn(async () => true),
      stat: vi.fn(async () => ({ isFile: () => true })),
      readdir: vi.fn(async () => []),
      mkdir: vi.fn(),
    },
  },
}));

import { safeFetch } from '../../utils/safeFetch';
import { electronService } from '../../services/electronService';

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

  it('图生视频 + 延长承接视频：切多模态，首帧降级 reference_image，视频真的传上去', async () => {
    const provider = new MiniMaxH3ITVProvider({
      provider: 'minimax-h3-itv',
      apiKey: 'sk-test',
    });
    vi.mocked(safeFetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ task_id: 'ext-1' }),
    } as never);

    await provider.start({
      capability: 'video.image-to-video',
      prompt: '将 <视频 1> 延长 5 秒',
      primaryImage: { transport: 'remote-url', value: 'https://cdn.example.com/first.png' },
      metadata: {
        komaVideoReferences: [{ transport: 'remote-url', value: 'https://cdn.example.com/prev.mp4' }],
      },
    } as never);

    const [, init] = vi.mocked(safeFetch).mock.calls.at(-1)!;
    const body = JSON.parse(String(init?.body));
    const roles = body.content.map((item: { type: string; role?: string }) => item.role || item.type);
    // 延长视频必须在 content 里；同时不能再出现 first_frame（上游规定互斥）
    expect(roles).toContain('reference_video');
    expect(roles).toContain('reference_image');
    expect(roles).not.toContain('first_frame');
  });

  it('图生视频 + 音色参考：音频不再被丢掉', async () => {
    const provider = new MiniMaxH3ITVProvider({
      provider: 'minimax-h3-itv',
      apiKey: 'sk-test',
    });
    vi.mocked(safeFetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ task_id: 'voice-1' }),
    } as never);

    await provider.start({
      capability: 'video.image-to-video',
      prompt: '角色说话',
      primaryImage: { transport: 'remote-url', value: 'https://cdn.example.com/first.png' },
      metadata: {
        komaVoiceReferences: [{ transport: 'remote-url', value: 'https://cdn.example.com/voice.mp3' }],
      },
    } as never);

    const [, init] = vi.mocked(safeFetch).mock.calls.at(-1)!;
    const body = JSON.parse(String(init?.body));
    const roles = body.content.map((item: { type: string; role?: string }) => item.role || item.type);
    expect(roles).toContain('reference_audio');
    expect(roles).not.toContain('first_frame');
  });

  it('没有视频/音频参考的图生视频仍走首帧模式', async () => {
    const provider = new MiniMaxH3ITVProvider({
      provider: 'minimax-h3-itv',
      apiKey: 'sk-test',
    });
    vi.mocked(safeFetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ task_id: 'i2v-1' }),
    } as never);

    await provider.start({
      capability: 'video.image-to-video',
      prompt: '普通图生视频',
      primaryImage: { transport: 'remote-url', value: 'https://cdn.example.com/first.png' },
    } as never);

    const [, init] = vi.mocked(safeFetch).mock.calls.at(-1)!;
    const body = JSON.parse(String(init?.body));
    const roles = body.content.map((item: { type: string; role?: string }) => item.role || item.type);
    expect(roles).toContain('first_frame');
    expect(roles).not.toContain('reference_image');
  });

  it('首尾帧 + 延长视频：首尾帧一起降级，不与 reference_* 混用', async () => {
    const provider = new MiniMaxH3ITVProvider({
      provider: 'minimax-h3-itv',
      apiKey: 'sk-test',
    });
    vi.mocked(safeFetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ task_id: 'se-1' }),
    } as never);

    await provider.start({
      capability: 'video.start-end-to-video',
      prompt: '首尾帧 + 延长',
      startFrame: { transport: 'remote-url', value: 'https://cdn.example.com/a.png' },
      endFrame: { transport: 'remote-url', value: 'https://cdn.example.com/b.png' },
      metadata: {
        komaVideoReferences: [{ transport: 'remote-url', value: 'https://cdn.example.com/prev.mp4' }],
      },
    } as never);

    const [, init] = vi.mocked(safeFetch).mock.calls.at(-1)!;
    const body = JSON.parse(String(init?.body));
    const roles = body.content.map((item: { type: string; role?: string }) => item.role || item.type);
    expect(roles).not.toContain('first_frame');
    expect(roles).not.toContain('last_frame');
    expect(roles.filter((r: string) => r === 'reference_image')).toHaveLength(2);
    expect(roles).toContain('reference_video');
  });

  it('文生视频的 ratio 不能是 adaptive（上游要求必填具体比例）', async () => {
    const provider = new MiniMaxH3ITVProvider({
      provider: 'minimax-h3-itv',
      apiKey: 'sk-test',
    });
    vi.mocked(safeFetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ task_id: 't2v-1' }),
    } as never);

    await provider.start({ capability: 'video.text-to-video', prompt: '纯文本' } as never);

    const [, init] = vi.mocked(safeFetch).mock.calls.at(-1)!;
    expect(JSON.parse(String(init?.body)).ratio).toBe('16:9');
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
    expect(snap.error).toContain('[2013] media url unreachable');
    expect(snap.error).not.toContain('[object Object]');
  });

  it('内容审核拦截（1026）翻成中文原因 + 处置建议，并指出是文本命中', async () => {
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
          error: { code: 1026, message: 'input new_sensitive, input text sensitive' },
        },
      }),
    } as never);

    const snap = await provider.getTaskSnapshot('t1');
    expect(snap.state).toBe('failed');
    expect(snap.error).toContain('内容审核未通过');
    expect(snap.error).toContain('提示词文本');
    // 原始码和原文保留，方便对着 MiniMax 文档查
    expect(snap.error).toContain('[1026] input new_sensitive, input text sensitive');
  });

  it('HTTP 200 + base_resp 报错时按上游原因抛错，而不是“响应缺少 task_id”', async () => {
    const provider = new MiniMaxH3ITVProvider({
      provider: 'minimax-h3-itv',
      apiKey: 'sk-test',
    });
    vi.mocked(safeFetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        base_resp: { status_code: 1026, status_msg: 'input new_sensitive, input text sensitive' },
      }),
    } as never);

    await expect(provider.start(makeRequest())).rejects.toThrow(/内容审核未通过/);
    await expect(provider.start(makeRequest())).rejects.not.toThrow(/缺少 task_id/);
  });

  it('轮询响应只在 base_resp 上带错误时也判失败', async () => {
    const provider = new MiniMaxH3ITVProvider({
      provider: 'minimax-h3-itv',
      apiKey: 'sk-test',
    });
    vi.mocked(safeFetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        base_resp: { status_code: 1008, status_msg: 'insufficient balance' },
      }),
    } as never);

    const snap = await provider.getTaskSnapshot('t1');
    expect(snap.state).toBe('failed');
    expect(snap.error).toContain('余额不足');
  });

  it('base_resp.status_code = 0 是成功，不影响正常出片', async () => {
    const provider = new MiniMaxH3ITVProvider({
      provider: 'minimax-h3-itv',
      apiKey: 'sk-test',
    });
    vi.mocked(safeFetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        task: { id: 't1', status: 'succeeded', content: { url: 'https://cdn.example.com/out.mp4' } },
        base_resp: { status_code: 0, status_msg: 'success' },
      }),
    } as never);

    const snap = await provider.getTaskSnapshot('t1');
    expect(snap.state).toBe('succeeded');
    expect((snap.output as { source?: string } | undefined)?.source).toBe('https://cdn.example.com/out.mp4');
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

describe('本地路径素材的归一化', () => {
  it('localPath 素材直接读字节转 data: URL，不经过图床', async () => {
    vi.mocked(electronService.isElectron).mockReturnValue(true);
    vi.mocked(electronService.fs.readFileAsBase64).mockResolvedValue('bW9jay1ieXRlcw==');

    const provider = new MiniMaxH3ITVProvider({
      provider: 'minimax-h3-itv',
      apiKey: 'sk-test',
    });
    vi.mocked(safeFetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ task_id: 't2' }),
    } as never);

    await provider.start({
      capability: 'video.image-to-video',
      prompt: '图生视频',
      primaryImage: { transport: 'remote-url', value: '/tmp/local-frame.png' } as never,
    } as never);

    // 本用例只有这一次调用（beforeEach 已 clearAllMocks），取最新一次
    const [, init] = vi.mocked(safeFetch).mock.calls.at(-1)!;
    const body = JSON.parse(String(init?.body));
    const imageItem = body.content.find((item: { role?: string }) => item.role === 'first_frame');
    expect(imageItem?.image_url?.url).toBe('data:image/png;base64,bW9jay1ieXRlcw==');
  });

  it('本地文件读取失败时素材被跳过，不阻断出片', async () => {
    vi.mocked(electronService.isElectron).mockReturnValue(true);
    vi.mocked(electronService.fs.readFileAsBase64).mockRejectedValue(new Error('no such file'));

    const provider = new MiniMaxH3ITVProvider({
      provider: 'minimax-h3-itv',
      apiKey: 'sk-test',
    });
    vi.mocked(safeFetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ task_id: 't3' }),
    } as never);

    const result = await provider.start({
      capability: 'video.text-to-video',
      prompt: '只有文本',
    } as never);
    expect(result.mode).toBe('async');
  });
});
