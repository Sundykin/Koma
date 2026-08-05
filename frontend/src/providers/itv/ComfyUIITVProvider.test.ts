import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComfyUIITVProvider, normalizeComfyBaseUrl } from './ComfyUIITVProvider';
import type { ITVConfig } from '../../types';

vi.mock('../../utils/safeFetch', () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from '../../utils/safeFetch';

const DATA_URL_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const BASE = 'https://comfy.example.com';

function createConfig(overrides: Partial<ITVConfig> = {}): ITVConfig {
  return {
    provider: 'comfyui-itv',
    name: 'comfyui',
    baseUrl: BASE,
    modelName: 'MiniMax H3 参考生视频',
    ...overrides,
  } as ITVConfig;
}

function mockUpload(name = 'koma-ref.png', subfolder = '') {
  (safeFetch as any).mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ name, subfolder, type: 'input' }),
  });
}

function mockPromptAccepted(promptId = 'prompt-1') {
  (safeFetch as any).mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ prompt_id: promptId, number: 1, node_errors: {} }),
  });
}

/** 取第 index 次请求提交的工作流 JSON */
function submittedWorkflow(index: number): Record<string, any> {
  return JSON.parse((safeFetch as any).mock.calls[index][1].body).prompt;
}

describe('normalizeComfyBaseUrl', () => {
  it('strips the canvas hash and trailing slash', () => {
    expect(normalizeComfyBaseUrl('https://x-8188.container.x-gpu.com/#e3f2b845-8f2c'))
      .toBe('https://x-8188.container.x-gpu.com');
    expect(normalizeComfyBaseUrl('https://comfy.example.com/')).toBe('https://comfy.example.com');
    expect(normalizeComfyBaseUrl('  https://comfy.example.com/base/  ')).toBe('https://comfy.example.com/base');
    expect(normalizeComfyBaseUrl('')).toBe('');
  });
});

describe('ComfyUIITVProvider', () => {
  beforeEach(() => {
    (safeFetch as any).mockReset();
  });

  it('submits a text-to-video prompt without uploading references', async () => {
    mockPromptAccepted();
    const provider = new ComfyUIITVProvider(createConfig());

    const result = await provider.start({
      capability: 'video.text-to-video',
      prompt: '一只猫在草地奔跑',
      options: { duration: 8, aspectRatio: '16:9' } as any,
    } as any);

    expect((safeFetch as any).mock.calls).toHaveLength(1);
    expect((safeFetch as any).mock.calls[0][0]).toBe(`${BASE}/prompt`);
    const workflow = submittedWorkflow(0);
    expect(workflow['138'].inputs.value).toBe('一只猫在草地奔跑');
    expect(workflow['132'].inputs.value).toBe(8);
    expect(workflow['115'].inputs.aspect_ratio).toBe('16:9 (Widescreen)');
    expect(Object.keys(workflow['136'].inputs).filter(k => k.startsWith('ref_images.'))).toEqual([]);
    expect(result).toEqual({ mode: 'async', taskId: 'prompt-1' });
  });

  it('uploads reference images and wires the returned filenames into LoadImage nodes', async () => {
    mockUpload('koma-1.png');
    mockUpload('koma-2.png', 'sub');
    mockPromptAccepted('prompt-2');
    const provider = new ComfyUIITVProvider(createConfig());

    await provider.start({
      capability: 'video.reference-to-video',
      prompt: '参考生成',
      referenceImages: [
        { transport: 'data-url', value: DATA_URL_IMG, mimeType: 'image/png' },
        { transport: 'data-url', value: DATA_URL_IMG, mimeType: 'image/png' },
      ],
    } as any);

    expect((safeFetch as any).mock.calls[0][0]).toBe(`${BASE}/upload/image`);
    expect((safeFetch as any).mock.calls[0][1].body).toBeInstanceOf(FormData);
    expect(((safeFetch as any).mock.calls[0][1].body as FormData).get('image')).toBeTruthy();

    const workflow = submittedWorkflow(2);
    expect(workflow['137'].inputs.image).toBe('koma-1.png');
    // 带 subfolder 时 LoadImage 取值需要拼成 subfolder/name
    expect(workflow['139'].inputs.image).toBe('sub/koma-2.png');
    expect(Object.keys(workflow['136'].inputs).filter(k => k.startsWith('ref_images.'))).toHaveLength(2);
  });

  it('uploads and wires more references than the template has slots', async () => {
    for (let i = 0; i < 4; i += 1) mockUpload(`koma-${i}.png`);
    mockPromptAccepted();
    const provider = new ComfyUIITVProvider(createConfig());
    const ref = { transport: 'data-url', value: DATA_URL_IMG, mimeType: 'image/png' };

    await provider.start({
      capability: 'video.reference-to-video',
      prompt: '四图参考',
      referenceImages: [ref, ref, ref, ref],
    } as any);

    // 4 次上传 + 1 次提交
    expect((safeFetch as any).mock.calls).toHaveLength(5);
    const workflow = submittedWorkflow(4);
    expect(workflow['137'].inputs.image).toBe('koma-0.png');
    expect(workflow['139'].inputs.image).toBe('koma-1.png');
    expect(workflow['koma_ref_2'].inputs.image).toBe('koma-2.png');
    expect(workflow['koma_ref_3'].inputs.image).toBe('koma-3.png');
    expect(workflow['136'].inputs['ref_images.ref_image_3']).toEqual(['koma_ref_3', 0]);
  });

  it('maps image-to-video primary image plus extra references into reference slots', async () => {
    mockUpload('primary.png');
    mockUpload('extra.png');
    mockPromptAccepted();
    const provider = new ComfyUIITVProvider(createConfig());

    await provider.start({
      capability: 'video.image-to-video',
      prompt: '动起来',
      primaryImage: { transport: 'data-url', value: DATA_URL_IMG, mimeType: 'image/png' },
      additionalReferences: [{ transport: 'data-url', value: DATA_URL_IMG, mimeType: 'image/png' }],
    } as any);

    const workflow = submittedWorkflow(2);
    expect(workflow['137'].inputs.image).toBe('primary.png');
    expect(workflow['139'].inputs.image).toBe('extra.png');
  });

  it('sends no Authorization header by default', async () => {
    mockPromptAccepted();
    const provider = new ComfyUIITVProvider(createConfig({ profileId: 'ch-1', apiKey: 'sk-x' }));

    await provider.start({ capability: 'video.text-to-video', prompt: 'x' } as any);

    const headers = (safeFetch as any).mock.calls[0][1].headers;
    expect(headers.Authorization).toBeUndefined();
    expect(headers['x-koma-channel-id']).toBeUndefined();
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('uses channel auth proxy when defaults.authMode is bearer', async () => {
    mockPromptAccepted();
    const provider = new ComfyUIITVProvider(createConfig({
      profileId: 'ch-1',
      modelDefaults: { authMode: 'bearer' },
    } as any));

    await provider.start({ capability: 'video.text-to-video', prompt: 'x' } as any);

    expect((safeFetch as any).mock.calls[0][1].headers['x-koma-channel-id']).toBe('ch-1');
  });

  it('uses a custom workflow from model defaults', async () => {
    mockPromptAccepted();
    const custom = {
      '1': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
      '2': { class_type: 'SaveVideo', inputs: { video: ['1', 0] } },
    };
    const provider = new ComfyUIITVProvider(createConfig({
      modelDefaults: { workflowJson: JSON.stringify(custom) },
    } as any));

    await provider.start({ capability: 'video.text-to-video', prompt: '自定义' } as any);

    const workflow = submittedWorkflow(0);
    expect(Object.keys(workflow).sort()).toEqual(['1', '2']);
    expect(workflow['1'].inputs.text).toBe('自定义');
  });

  it('throws a readable error when the custom workflow JSON is invalid', async () => {
    const provider = new ComfyUIITVProvider(createConfig({
      modelDefaults: { workflowJson: '{ not json' },
    } as any));

    await expect(provider.start({ capability: 'video.text-to-video', prompt: 'x' } as any))
      .rejects.toThrow('不是合法 JSON');
  });

  it('surfaces ComfyUI node validation errors', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({
        error: { type: 'prompt_outputs_failed_validation', message: 'Prompt outputs failed validation' },
        node_errors: {
          '137': { class_type: 'LoadImage', errors: [{ message: 'Value not in list', details: 'image: xxx.png' }] },
        },
      }),
    });
    const provider = new ComfyUIITVProvider(createConfig());

    await expect(provider.start({ capability: 'video.text-to-video', prompt: 'x' } as any))
      .rejects.toThrow(/节点 137\(LoadImage\).*Value not in list/);
  });

  it('rejects unsupported capabilities', async () => {
    const provider = new ComfyUIITVProvider(createConfig());
    await expect(provider.start({ capability: 'video.start-end-to-video', prompt: 'x' } as any))
      .rejects.toThrow('不支持');
  });

  describe('getTaskSnapshot', () => {
    it('returns the /view URL when the task completed', async () => {
      (safeFetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          'prompt-1': {
            status: { status_str: 'success', completed: true },
            // ComfyUI 核心 SaveVideo 把成片挂在 images 下
            outputs: { '92': { images: [{ filename: 'MiniMax_H3_00001.mp4', subfolder: 'video', type: 'output' }] } },
          },
        }),
      });
      const provider = new ComfyUIITVProvider(createConfig());

      const snap = await provider.getTaskSnapshot('prompt-1');

      expect((safeFetch as any).mock.calls[0][0]).toBe(`${BASE}/history/prompt-1`);
      expect(snap.state).toBe('succeeded');
      expect(snap.output?.source).toBe(
        `${BASE}/view?filename=MiniMax_H3_00001.mp4&subfolder=video&type=output`,
      );
    });

    it('prefers video files over preview images', async () => {
      (safeFetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          'p': {
            status: { completed: true },
            outputs: {
              '90': { images: [{ filename: 'preview.png', subfolder: '', type: 'output' }] },
              '92': { images: [{ filename: 'out.mp4', subfolder: '', type: 'output' }] },
            },
          },
        }),
      });
      const provider = new ComfyUIITVProvider(createConfig());

      const snap = await provider.getTaskSnapshot('p');
      expect(snap.output?.source).toContain('filename=out.mp4');
    });

    it('reports failure with the ComfyUI exception message', async () => {
      (safeFetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          'p': {
            status: {
              status_str: 'error',
              completed: false,
              messages: [['execution_error', { exception_type: 'OOM', exception_message: 'CUDA out of memory' }]],
            },
          },
        }),
      });
      const provider = new ComfyUIITVProvider(createConfig());

      const snap = await provider.getTaskSnapshot('p');
      expect(snap.state).toBe('failed');
      expect(snap.error).toContain('CUDA out of memory');
    });

    it('distinguishes an interrupted task from a real execution error', async () => {
      // 真实中断任务的 history 形态：status_str=error，但只有 execution_interrupted
      (safeFetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          'p': {
            status: {
              status_str: 'error',
              completed: false,
              messages: [['execution_start', {}], ['execution_cached', {}], ['execution_interrupted', {}]],
            },
            outputs: {},
          },
        }),
      });
      const provider = new ComfyUIITVProvider(createConfig());

      const snap = await provider.getTaskSnapshot('p');
      expect(snap.state).toBe('failed');
      expect(snap.error).toContain('已被中断');
    });

    it('falls back to the queue to tell pending from running', async () => {
      (safeFetch as any)
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ queue_running: [[0, 'p']], queue_pending: [] }),
        });
      const provider = new ComfyUIITVProvider(createConfig());

      const snap = await provider.getTaskSnapshot('p');
      expect((safeFetch as any).mock.calls[1][0]).toBe(`${BASE}/queue`);
      expect(snap.state).toBe('running');
    });

    it('stays running when history is temporarily unavailable', async () => {
      (safeFetch as any).mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) });
      const provider = new ComfyUIITVProvider(createConfig());

      const snap = await provider.getTaskSnapshot('p');
      expect(snap.state).toBe('running');
    });

    it('fails when a completed task has no video output', async () => {
      (safeFetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ 'p': { status: { completed: true }, outputs: {} } }),
      });
      const provider = new ComfyUIITVProvider(createConfig());

      const snap = await provider.getTaskSnapshot('p');
      expect(snap.state).toBe('failed');
      expect(snap.error).toContain('未返回视频文件');
    });
  });

  describe('testConnection', () => {
    it('probes /system_stats', async () => {
      (safeFetch as any).mockResolvedValueOnce({ ok: true, status: 200 });
      const provider = new ComfyUIITVProvider(createConfig());

      await expect(provider.testConnection()).resolves.toBe(true);
      expect((safeFetch as any).mock.calls[0][0]).toBe(`${BASE}/system_stats`);
    });

    it('returns false when unreachable or unconfigured', async () => {
      (safeFetch as any).mockRejectedValueOnce(new Error('offline'));
      await expect(new ComfyUIITVProvider(createConfig()).testConnection()).resolves.toBe(false);
      await expect(new ComfyUIITVProvider(createConfig({ baseUrl: '' })).testConnection()).resolves.toBe(false);
    });
  });

  it('cancels by deleting from the queue then interrupting', async () => {
    (safeFetch as any)
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const provider = new ComfyUIITVProvider(createConfig());

    await provider.cancelTask('p');

    expect((safeFetch as any).mock.calls[0][0]).toBe(`${BASE}/queue`);
    expect(JSON.parse((safeFetch as any).mock.calls[0][1].body)).toEqual({ delete: ['p'] });
    expect((safeFetch as any).mock.calls[1][0]).toBe(`${BASE}/interrupt`);
  });
});

describe('voice references (音色参考)', () => {
  beforeEach(() => {
    (safeFetch as any).mockReset();
  });

  it('uploads audio references and wires them to ref_audios.ref_audio_N with LoadAudio nodes', async () => {
    mockUpload('ref.png');                          // 参考图
    (safeFetch as any).mockResolvedValueOnce({      // 音色音频（/upload/audio）
      ok: true, status: 200,
      text: async () => JSON.stringify({ name: 'voice.wav', subfolder: '', type: 'input' }),
    });
    mockPromptAccepted();
    const comfy = new ComfyUIITVProvider(createConfig());

    await comfy.start({
      capability: 'video.reference-to-video',
      prompt: '宁卓的台词使用 <音频 1> 的音色',
      referenceImages: [{ transport: 'data-url', value: DATA_URL_IMG, mimeType: 'image/png' }],
      metadata: {
        komaVoiceReferences: [
          { characterId: 'char_1', characterName: '宁卓', transport: 'data-url', value: 'data:audio/wav;base64,UklGRiQAAABXQVZF', mimeType: 'audio/wav' },
        ],
      },
    } as any);

    // 上传顺序：参考图(/upload/image) → 音频(/upload/audio) → 提交(/prompt)
    expect((safeFetch as any).mock.calls[1][0]).toContain('/upload/audio');
    const workflow = JSON.parse((safeFetch as any).mock.calls[2][1].body).prompt;
    expect(workflow['136'].inputs['ref_audios.ref_audio_0']).toEqual(['koma_audio_0', 0]);
    expect(workflow['koma_audio_0'].class_type).toBe('LoadAudio');
    expect(workflow['koma_audio_0'].inputs.audio).toBe('voice.wav');
  });

  it('falls back to /upload/image when /upload/audio is unavailable', async () => {
    (safeFetch as any).mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' }); // /upload/audio 404
    mockUpload('voice.wav');  // /upload/image fallback
    mockPromptAccepted();
    const comfy = new ComfyUIITVProvider(createConfig());

    await comfy.start({
      capability: 'video.text-to-video',
      prompt: 'x',
      metadata: {
        komaVoiceReferences: [
          { transport: 'data-url', value: 'data:audio/wav;base64,UklGRiQAAABXQVZF', mimeType: 'audio/wav' },
        ],
      },
    } as any);

    expect((safeFetch as any).mock.calls[1][0]).toContain('/upload/image');
    const workflow = JSON.parse((safeFetch as any).mock.calls[2][1].body).prompt;
    expect(workflow['136'].inputs['ref_audios.ref_audio_0']).toEqual(['koma_audio_0', 0]);
  });
});
