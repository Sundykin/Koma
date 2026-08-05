import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SuiheDirectITVProvider } from './SuiheDirectITVProvider';
import type { ITVConfig } from '../../types';

vi.mock('../../utils/safeFetch', () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from '../../utils/safeFetch';

const DATA_URL_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function createConfig(overrides: Partial<ITVConfig> = {}): ITVConfig {
  return {
    provider: 'suihe-itv',
    name: 'suihe',
    baseUrl: 'https://api.suihemedia.cloud',
    apiKey: 'sk-k',
    modelName: 'seedance 2.0',
    ...overrides,
  } as ITVConfig;
}

function mockAcceptResponse(body: Record<string, unknown> = { task_id: 'uuid-1', id: 'uuid-1' }, status = 202) {
  (safeFetch as any).mockResolvedValueOnce({
    ok: true,
    status,
    text: async () => JSON.stringify(body),
  });
}

function lastForm(index = 0): FormData {
  return (safeFetch as any).mock.calls[index][1].body as FormData;
}

describe('SuiheDirectITVProvider', () => {
  beforeEach(() => {
    (safeFetch as any).mockReset();
  });

  it('submits text-to-video without any file fields', async () => {
    mockAcceptResponse();
    const provider = new SuiheDirectITVProvider(createConfig());

    const result = await provider.start({
      capability: 'video.text-to-video',
      prompt: '一只猫在草地奔跑',
      options: { duration: 8, aspectRatio: '16:9' } as any,
    } as any);

    expect((safeFetch as any).mock.calls[0][0]).toBe('https://api.suihemedia.cloud/v1/videos/generations');
    const form = lastForm();
    expect(form.get('prompt')).toBe('一只猫在草地奔跑');
    expect(form.get('model')).toBe('seedance 2.0');
    expect(form.get('ratio')).toBe('16:9');
    expect(form.get('duration')).toBe('8');
    expect(form.get('video_resolution')).toBe('720p');
    expect(form.get('watermark')).toBe('false');
    expect(form.get('creative_mode')).toBeNull();
    expect(form.get('first_frame')).toBeNull();
    expect(form.get('image_file')).toBeNull();
    expect(result).toEqual({ mode: 'async', taskId: 'uuid-1' });
  });

  it('image-to-video uploads first_frame and additional references as image_file_N', async () => {
    mockAcceptResponse();
    const provider = new SuiheDirectITVProvider(createConfig());

    await provider.start({
      capability: 'video.image-to-video',
      prompt: '动起来',
      primaryImage: { transport: 'data-url', value: DATA_URL_IMG, mimeType: 'image/png' },
      additionalReferences: [
        { transport: 'data-url', value: DATA_URL_IMG, mimeType: 'image/png' },
        { transport: 'data-url', value: DATA_URL_IMG, mimeType: 'image/png' },
      ],
    } as any);

    const form = lastForm();
    expect(form.get('first_frame')).toBeTruthy();
    expect(form.get('image_file')).toBeTruthy();
    expect(form.get('image_file_2')).toBeTruthy();
    expect(form.get('image_file_3')).toBeNull();
  });

  it('start-end-to-video uploads first_frame and end_frame', async () => {
    mockAcceptResponse();
    const provider = new SuiheDirectITVProvider(createConfig());

    await provider.start({
      capability: 'video.start-end-to-video',
      prompt: '过渡',
      startFrame: { transport: 'data-url', value: DATA_URL_IMG, mimeType: 'image/png' },
      endFrame: { transport: 'data-url', value: DATA_URL_IMG, mimeType: 'image/png' },
    } as any);

    const form = lastForm();
    expect(form.get('first_frame')).toBeTruthy();
    expect(form.get('end_frame')).toBeTruthy();
    expect(form.get('image_file')).toBeNull();
  });

  it('reference-to-video uploads referenceImages as image_file_N (omni)', async () => {
    mockAcceptResponse();
    const provider = new SuiheDirectITVProvider(createConfig());

    await provider.start({
      capability: 'video.reference-to-video',
      prompt: '参考生成',
      referenceImages: [
        { transport: 'data-url', value: DATA_URL_IMG, mimeType: 'image/png' },
        { transport: 'data-url', value: DATA_URL_IMG, mimeType: 'image/png' },
      ],
    } as any);

    const form = lastForm();
    expect(form.get('image_file')).toBeTruthy();
    expect(form.get('image_file_2')).toBeTruthy();
    expect(form.get('first_frame')).toBeNull();
  });

  it('prefers task_id over cgt- prefixed id from accept response', async () => {
    mockAcceptResponse({ id: 'cgt-abc123', task_id: 'uuid-real' }, 200);
    const provider = new SuiheDirectITVProvider(createConfig());

    const result = await provider.start({
      capability: 'video.text-to-video',
      prompt: 'x',
    } as any);

    expect(result).toEqual({ mode: 'async', taskId: 'uuid-real' });
  });

  it('clamps duration to model defaults range', async () => {
    mockAcceptResponse();
    const provider = new SuiheDirectITVProvider(createConfig({
      modelDefaults: { durationMin: 4, durationMax: 10 },
    } as any));

    await provider.start({
      capability: 'video.text-to-video',
      prompt: 'x',
      options: { duration: 30 } as any,
    } as any);

    expect(lastForm().get('duration')).toBe('10');
  });

  it('normalizes pixel resolution to tier', async () => {
    mockAcceptResponse();
    const provider = new SuiheDirectITVProvider(createConfig({ defaultResolution: '1920x1080' } as any));

    await provider.start({ capability: 'video.text-to-video', prompt: 'x' } as any);

    expect(lastForm().get('video_resolution')).toBe('1080p');
  });

  it('rejects unsupported capability', async () => {
    const provider = new SuiheDirectITVProvider(createConfig());
    await expect(provider.start({ capability: 'video.character-extraction', prompt: 'x' } as any))
      .rejects.toThrow('不支持');
  });

  describe('getTaskSnapshot', () => {
    it('maps success with result_urls to succeeded output', async () => {
      (safeFetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success', result_urls: ['https://cdn.example.com/v.mp4'] }),
      });
      const provider = new SuiheDirectITVProvider(createConfig());

      const snap = await provider.getTaskSnapshot('uuid-1');

      expect((safeFetch as any).mock.calls[0][0]).toBe('https://api.suihemedia.cloud/v1/tasks/uuid-1');
      expect(snap.state).toBe('succeeded');
      expect(snap.output?.source).toBe('https://cdn.example.com/v.mp4');
    });

    it('maps running state with progress', async () => {
      (safeFetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'generating', progress_pct: 60 }),
      });
      const provider = new SuiheDirectITVProvider(createConfig());

      const snap = await provider.getTaskSnapshot('uuid-1');
      expect(snap.state).toBe('running');
      expect(snap.progress).toBe(60);
    });

    it('maps failed with fail_reason', async () => {
      (safeFetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'failed', fail_reason: '余额不足' }),
      });
      const provider = new SuiheDirectITVProvider(createConfig());

      const snap = await provider.getTaskSnapshot('uuid-1');
      expect(snap.state).toBe('failed');
      expect(snap.error).toBe('余额不足');
    });

    it('returns failed when succeeded without result_urls', async () => {
      (safeFetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success' }),
      });
      const provider = new SuiheDirectITVProvider(createConfig());

      const snap = await provider.getTaskSnapshot('uuid-1');
      expect(snap.state).toBe('failed');
    });
  });
});

describe('voice references (音色参考)', () => {
  beforeEach(() => {
    (safeFetch as any).mockReset();
  });

  it('uploads metadata.komaVoiceReferences to audio_file_N fields', async () => {
    mockAcceptResponse();
    const provider = new SuiheDirectITVProvider(createConfig());

    await provider.start({
      capability: 'video.text-to-video',
      prompt: '宁卓的台词使用 <音频 1> 的音色',
      metadata: {
        komaVoiceReferences: [
          { transport: 'data-url', value: 'data:audio/wav;base64,UklGRiQAAABXQVZF', mimeType: 'audio/wav' },
          { transport: 'data-url', value: 'data:audio/wav;base64,UklGRiQAAABXQVZF', mimeType: 'audio/wav' },
        ],
      },
    } as any);

    const form = lastForm();
    expect(form.get('audio_file')).toBeTruthy();
    expect(form.get('audio_file_2')).toBeTruthy();
    expect(form.get('audio_file_3')).toBeNull();
  });
});
