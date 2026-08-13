import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SuiheITVProvider } from './SuiheITVProvider';
import type { ITVConfig } from '../../types';

vi.mock('../../utils/safeFetch', () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from '../../utils/safeFetch';

function createConfig(overrides: Partial<ITVConfig> = {}): ITVConfig {
  return {
    provider: 'koma-suihe-itv',
    name: 'koma-jimeng',
    baseUrl: 'https://komaapi.com',
    apiKey: 'k',
    modelName: 'seedance-2.0',
    ...overrides,
  } as ITVConfig;
}

/** 表单直传分支常见 202，JSON 分支常见 200；都以响应体里的 task_id 为准 */
function mockAccepted(body: Record<string, unknown> = { task_id: 'task-uuid' }, status = 202) {
  (safeFetch as any).mockResolvedValueOnce({
    ok: status < 300,
    status,
    text: async () => JSON.stringify(body),
  });
}

function lastCall() {
  const calls = (safeFetch as any).mock.calls;
  return calls[calls.length - 1];
}

function fieldValue(form: FormData, field: string): FormDataEntryValue | undefined {
  return Array.from(form.entries()).find(([key]) => key === field)?.[1];
}

const DATA_URL_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZF';
const DATA_URL_PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('SuiheITVProvider 走 multipart 直传（不再依赖图床）', () => {
  beforeEach(() => {
    (safeFetch as any).mockReset();
  });

  it('提交到 /v1/videos/generations，body 是 FormData 且不手写 Content-Type', async () => {
    mockAccepted();
    await new SuiheITVProvider(createConfig()).start({
      capability: 'video.text-to-video',
      prompt: '一只猫在草地上奔跑',
      options: { duration: 5, aspectRatio: '16:9' },
    } as any);

    const [url, init] = lastCall();
    expect(url).toBe('https://komaapi.com/v1/videos/generations');
    expect(init.body).toBeInstanceOf(FormData);
    // 手写 Content-Type 会盖掉 FormData 自己生成的 boundary，请求直接废掉
    const headerKeys = Object.keys(init.headers || {}).map((k: string) => k.toLowerCase());
    expect(headerKeys).not.toContain('content-type');

    const form = init.body as FormData;
    expect(fieldValue(form, 'model')).toBe('seedance-2.0');
    expect(fieldValue(form, 'prompt')).toBe('一只猫在草地上奔跑');
    expect(fieldValue(form, 'ratio')).toBe('16:9');
    expect(fieldValue(form, 'duration')).toBe('5');
    expect(fieldValue(form, 'video_resolution')).toBeTruthy();
    // creative_mode 一律省略：服务端按分辨率自动选档，且部分模型不接受该参数
    expect(fieldValue(form, 'creative_mode')).toBeUndefined();
  });

  it('公网 URL 素材作为字符串字段直接透传，不下载也不上传', async () => {
    mockAccepted();
    await new SuiheITVProvider(createConfig()).start({
      capability: 'video.reference-to-video',
      prompt: 'p',
      referenceImages: [{ transport: 'remote-url', value: 'https://cdn.example.com/a.png' }],
      options: { duration: 5 },
    } as any);

    const form = lastCall()[1].body as FormData;
    expect(fieldValue(form, 'image_file')).toBe('https://cdn.example.com/a.png');
    expect(fieldValue(form, 'function_mode')).toBe('omni_reference');
    // 只发了创建任务这一次请求——没有额外的图床上传往返
    expect((safeFetch as any).mock.calls).toHaveLength(1);
  });

  it('本地 data-url 素材作为文件字段直传', async () => {
    mockAccepted();
    await new SuiheITVProvider(createConfig()).start({
      capability: 'video.reference-to-video',
      prompt: 'p',
      referenceImages: [{ transport: 'data-url', value: DATA_URL_PNG }],
      options: { duration: 5 },
    } as any);

    const value = fieldValue(lastCall()[1].body as FormData, 'image_file');
    expect(value).toBeInstanceOf(Blob);
    expect((value as Blob).type).toBe('image/png');
  });

  it('多个素材按 image_file / image_file_2 … 递增命名', async () => {
    mockAccepted();
    await new SuiheITVProvider(createConfig()).start({
      capability: 'video.reference-to-video',
      prompt: 'p',
      referenceImages: [
        { transport: 'remote-url', value: 'https://cdn.example.com/1.png' },
        { transport: 'remote-url', value: 'https://cdn.example.com/2.png' },
        { transport: 'remote-url', value: 'https://cdn.example.com/3.png' },
      ],
      options: { duration: 5 },
    } as any);

    const form = lastCall()[1].body as FormData;
    expect(fieldValue(form, 'image_file')).toBe('https://cdn.example.com/1.png');
    expect(fieldValue(form, 'image_file_2')).toBe('https://cdn.example.com/2.png');
    expect(fieldValue(form, 'image_file_3')).toBe('https://cdn.example.com/3.png');
  });

  it('音色参考走 audio_file 字段，本地音频直传不经图床', async () => {
    mockAccepted();
    await new SuiheITVProvider(createConfig()).start({
      capability: 'video.reference-to-video',
      prompt: 'p',
      referenceImages: [{ transport: 'remote-url', value: 'https://cdn.example.com/a.png' }],
      metadata: {
        komaVoiceReferences: [{ transport: 'data-url', value: DATA_URL_WAV, mimeType: 'audio/wav' }],
      },
      options: { duration: 5 },
    } as any);

    const form = lastCall()[1].body as FormData;
    expect(fieldValue(form, 'audio_file')).toBeInstanceOf(Blob);
    expect(fieldValue(form, 'function_mode')).toBe('omni_reference');
  });

  it('参考音频不能单独使用：没有图片/视频参考时丢弃', async () => {
    mockAccepted();
    await new SuiheITVProvider(createConfig()).start({
      capability: 'video.reference-to-video',
      prompt: 'p',
      metadata: { komaVoiceReferences: [{ transport: 'data-url', value: DATA_URL_WAV }] },
      options: { duration: 5 },
    } as any);

    expect(fieldValue(lastCall()[1].body as FormData, 'audio_file')).toBeUndefined();
  });

  it('komaJimengAssets 的分类素材与运行时参考合并进同一组字段', async () => {
    mockAccepted();
    await new SuiheITVProvider(createConfig()).start({
      capability: 'video.reference-to-video',
      prompt: 'p',
      metadata: {
        komaJimengAssets: { image_urls: ['https://cdn.example.com/base.png'] },
        komaVideoReferences: [{ transport: 'remote-url', value: 'https://cdn.example.com/prev.mp4' }],
      },
      options: { duration: 5 },
    } as any);

    const form = lastCall()[1].body as FormData;
    expect(fieldValue(form, 'image_file')).toBe('https://cdn.example.com/base.png');
    expect(fieldValue(form, 'video_file')).toBe('https://cdn.example.com/prev.mp4');
  });

  it('seedance-1.5-pro 不支持全能参考，改走首尾帧字段', async () => {
    mockAccepted();
    await new SuiheITVProvider(createConfig({ modelName: 'seedance-1.5-pro' })).start({
      capability: 'video.reference-to-video',
      prompt: 'p',
      referenceImages: [{ transport: 'remote-url', value: 'https://cdn.example.com/a.png' }],
      options: { duration: 5 },
    } as any);

    const form = lastCall()[1].body as FormData;
    expect(fieldValue(form, 'first_frame')).toBe('https://cdn.example.com/a.png');
    expect(fieldValue(form, 'image_file')).toBeUndefined();
  });

  it('首尾帧模式送 first_frame / end_frame', async () => {
    mockAccepted();
    await new SuiheITVProvider(createConfig()).start({
      capability: 'video.start-end-to-video',
      prompt: 'p',
      startFrame: { transport: 'remote-url', value: 'https://cdn.example.com/s.png' },
      endFrame: { transport: 'remote-url', value: 'https://cdn.example.com/e.png' },
      options: { duration: 5 },
    } as any);

    const form = lastCall()[1].body as FormData;
    expect(fieldValue(form, 'first_frame')).toBe('https://cdn.example.com/s.png');
    expect(fieldValue(form, 'end_frame')).toBe('https://cdn.example.com/e.png');
    expect(fieldValue(form, 'function_mode')).toBe('first_last_frames');
  });
});

describe('SuiheITVProvider 受理与轮询', () => {
  beforeEach(() => {
    (safeFetch as any).mockReset();
  });

  it('202 受理也算成功，并优先取 task_id（id 可能是 cgt- 前缀，不能当路径参数）', async () => {
    mockAccepted({ id: 'cgt-abc', task_id: 'real-uuid' }, 202);
    const result = await new SuiheITVProvider(createConfig()).start({
      capability: 'video.text-to-video',
      prompt: 'p',
      options: { duration: 5 },
    } as any);
    expect(result).toEqual({ mode: 'async', taskId: 'real-uuid' });
  });

  it('轮询走 /v1/tasks/{task_id}，成片从 result_urls 读', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', result_urls: ['https://cdn.example.com/out.mp4'] }),
    });
    const snapshot = await new SuiheITVProvider(createConfig()).getTaskSnapshot('real-uuid');

    expect(lastCall()[0]).toBe('https://komaapi.com/v1/tasks/real-uuid');
    expect(snapshot.state).toBe('succeeded');
    expect(snapshot.output?.source).toBe('https://cdn.example.com/out.mp4');
  });

  it('终态但没有成片地址按失败处理', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success' }),
    });
    expect((await new SuiheITVProvider(createConfig()).getTaskSnapshot('t')).state).toBe('failed');
  });
});
