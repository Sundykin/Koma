import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComfyUITTIProvider } from './ComfyUITTIProvider';
import type { TTIModelConfig } from '../../types';

vi.mock('../../utils/safeFetch', () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from '../../utils/safeFetch';

const DATA_URL_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const BASE = 'https://comfy.example.com';

function createConfig(overrides: Partial<TTIModelConfig> = {}): TTIModelConfig {
  return {
    id: 'c1',
    name: 'comfyui',
    provider: 'comfyui-tti',
    baseUrl: BASE,
    apiKey: 'k',
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    modelName: 'krea2 参考风格生图',
    ...overrides,
  } as TTIModelConfig;
}

function mockUpload(name = 'ref.png') {
  (safeFetch as any).mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ name, subfolder: '', type: 'input' }),
  });
}

function mockAccepted(promptId = 'prompt-1') {
  (safeFetch as any).mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ prompt_id: promptId, number: 1, node_errors: {} }),
  });
}

function submittedWorkflow(index: number): Record<string, any> {
  return JSON.parse((safeFetch as any).mock.calls[index][1].body).prompt;
}

describe('ComfyUITTIProvider', () => {
  beforeEach(() => {
    (safeFetch as any).mockReset();
  });

  it('krea2 文生图：无参考图时摘除 LoadImage 与 TextGenerate.image 连线', async () => {
    mockAccepted();
    const provider = new ComfyUITTIProvider(createConfig());

    const result = await provider.start({
      prompt: '一位公司白领',
      references: [],
      options: { aspectRatio: '16:9', imageSize: '2K' } as any,
    });

    expect((safeFetch as any).mock.calls[0][0]).toBe(`${BASE}/prompt`);
    const wf = submittedWorkflow(0);
    expect(wf['14'].inputs.value).toBe('一位公司白领');
    expect(wf['6'].inputs.aspect_ratio).toBe('16:9 (Widescreen)');
    expect(wf['13']).toBeUndefined();
    expect(wf['19:11'].inputs.image).toBeUndefined();
    expect(wf['7'].inputs.batch_size).toBe(1);
    expect(result).toEqual({ mode: 'async', taskId: 'prompt-1' });
  });

  it('krea2 图生图：上传参考图并写入 LoadImage，仅取第一张', async () => {
    mockUpload('ref-1.png');
    mockAccepted();
    const provider = new ComfyUITTIProvider(createConfig());

    await provider.start({
      prompt: '参考这张图风格',
      references: [
        { transport: 'data-url', value: DATA_URL_IMG, mimeType: 'image/png' },
        { transport: 'data-url', value: DATA_URL_IMG, mimeType: 'image/png' },
      ],
    });

    expect((safeFetch as any).mock.calls[0][0]).toBe(`${BASE}/upload/image`);
    const wf = submittedWorkflow(1);
    expect(wf['13'].inputs.image).toBe('ref-1.png');
    expect(wf['19:11'].inputs.image).toEqual(['13', 0]);
  });

  it('krea2 批量：batch_size 与 seed 落到 KSampler 与 SeedNode', async () => {
    mockAccepted();
    const provider = new ComfyUITTIProvider(createConfig());

    await provider.start({
      prompt: 'x',
      references: [],
      options: { seed: 123, imageSize: '4K' } as any,
      count: 3,
    });

    const wf = submittedWorkflow(0);
    expect(wf['7'].inputs.batch_size).toBe(3);
    expect(wf['1'].inputs.seed).toBe(123);
    expect(wf['21'].inputs.seed).toBe(123);
    expect(wf['6'].inputs.megapixels).toBe(2.0);
  });

  it('z-image：提示词与比例写入 CLIPTextEncode / EmptySD3LatentImage', async () => {
    mockAccepted();
    const provider = new ComfyUITTIProvider(createConfig({ modelName: 'Z-Image 文生图' }));

    await provider.start({
      prompt: '可爱的小狐狸',
      references: [],
      options: { aspectRatio: '9:16', seed: 42 } as any,
      count: 2,
    });

    const wf = submittedWorkflow(0);
    expect(wf['67'].inputs.text).toBe('可爱的小狐狸');
    expect(wf['68'].inputs.width).toBe(768);
    expect(wf['68'].inputs.height).toBe(1344);
    expect(wf['68'].inputs.batch_size).toBe(2);
    expect(wf['70'].inputs.seed).toBe(42);
  });

  it('z-image 拒绝参考图', async () => {
    const provider = new ComfyUITTIProvider(createConfig({ modelName: 'Z-Image 文生图' }));
    await expect(provider.start({
      prompt: 'x',
      references: [{ transport: 'data-url', value: DATA_URL_IMG, mimeType: 'image/png' }],
    })).rejects.toThrow('不支持参考图');
  });

  it('模型 defaults.workflowId 可覆盖工作流选择', async () => {
    mockAccepted();
    const provider = new ComfyUITTIProvider(createConfig({
      modelName: '自定义',
      modelDefaults: { workflowId: 'z-image' },
    } as any));

    await provider.start({ prompt: 'x', references: [] });
    const wf = submittedWorkflow(0);
    expect(wf['67']).toBeTruthy();
    expect(wf['14']).toBeUndefined();
  });

  it('任务完成：SaveImage 输出转 /view URL，多张合并 batchImages', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        'prompt-1': {
          status: { status_str: 'success', completed: true },
          outputs: {
            '22': { images: [
              { filename: 'a.png', subfolder: '', type: 'output' },
              { filename: 'b.png', subfolder: '', type: 'output' },
            ] },
          },
        },
      }),
    });
    const provider = new ComfyUITTIProvider(createConfig());

    const snap = await provider.getTaskSnapshot('prompt-1');

    expect((safeFetch as any).mock.calls[0][0]).toBe(`${BASE}/history/prompt-1`);
    expect(snap.state).toBe('succeeded');
    expect(snap.output?.url).toContain('/view?filename=a.png');
    expect(snap.output?.metadata?.batchImages).toHaveLength(2);
  });

  it('ComfyUI 校验失败时给出节点级错误', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({
        error: { type: 'prompt_outputs_failed_validation', message: 'Prompt outputs failed validation' },
        node_errors: { '13': { class_type: 'LoadImage', errors: [{ message: 'Value not in list', details: 'image' }] } },
      }),
    });
    const provider = new ComfyUITTIProvider(createConfig());

    await expect(provider.start({ prompt: 'x', references: [] }))
      .rejects.toThrow(/LoadImage/);
  });

  it('testConnection 探测 /system_stats', async () => {
    (safeFetch as any).mockResolvedValueOnce({ ok: true, status: 200 });
    const provider = new ComfyUITTIProvider(createConfig());
    await expect(provider.testConnection()).resolves.toBe(true);
    expect((safeFetch as any).mock.calls[0][0]).toBe(`${BASE}/system_stats`);
  });
});
