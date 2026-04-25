import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAICompatibleTTIProvider } from './OpenAICompatibleTTIProvider';

vi.mock('../../utils/safeFetch', () => ({
  safeFetch: vi.fn(),
}));

import { safeFetch } from '../../utils/safeFetch';

describe('OpenAICompatibleTTIProvider', () => {
  beforeEach(() => {
    (safeFetch as any).mockReset();
  });

  it('uses configured multi-angle endpoint when requestType is multi-angle', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ url: 'https://cdn.example.com/multi-angle.png' }],
      }),
    });

    const provider = new OpenAICompatibleTTIProvider({
      id: 'c1',
      name: 'openai-compatible',
      provider: 'openai-compatible-tti' as any,
      baseUrl: 'https://api.example.com',
      apiKey: 'k',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelName: 'image-model',
    } as any);

    const result = await provider.start({
      prompt: '角色设定图\n<sks> front view eye-level shot medium shot',
      references: [{ transport: 'remote-url', value: 'https://cdn.example.com/source.png' }],
      requestType: 'multi-angle',
      multiAngle: {
        endpointPath: '/v1/images/multi-angle/generations',
        promptProtocol: 'sks-camera-v1',
        azimuth: 0,
        elevation: 0,
        distance: 1,
        sourceReferenceIndex: 0,
        originalPrompt: '角色设定图',
        anglePrompt: '<sks> front view eye-level shot medium shot',
        compiledPrompt: '角色设定图\n<sks> front view eye-level shot medium shot',
      },
    });

    expect((safeFetch as any).mock.calls[0][0]).toBe('https://api.example.com/v1/images/multi-angle/generations');
    const init = (safeFetch as any).mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.source_image).toBe('https://cdn.example.com/source.png');
    expect(body.camera.azimuth).toBe(0);
    expect(body.multi_angle.enabled).toBe(true);
    expect(result.mode).toBe('immediate');
    expect((result as any).output.url).toBe('https://cdn.example.com/multi-angle.png');
  });

  it('polls multi-angle async tasks using the multi-angle endpoint first', async () => {
    (safeFetch as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'task-multi-angle-1',
          status: 'queued',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'task-multi-angle-1',
          status: 'completed',
          progress: 100,
          data: [{ url: 'https://cdn.example.com/multi-angle-async.png' }],
        }),
      });

    const provider = new OpenAICompatibleTTIProvider({
      id: 'c1',
      name: 'openai-compatible',
      provider: 'openai-compatible-tti' as any,
      baseUrl: 'https://api.example.com',
      apiKey: 'k',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelName: 'image-model',
    } as any);

    const started = await provider.start({
      prompt: '<sks> back view high-angle shot wide shot',
      references: [{ transport: 'remote-url', value: 'https://cdn.example.com/source.png' }],
      requestType: 'multi-angle',
      multiAngle: {
        endpointPath: '/v1/images/multi-angle',
        promptProtocol: 'sks-camera-v1',
        azimuth: 180,
        elevation: 60,
        distance: 1.8,
        sourceReferenceIndex: 0,
        originalPrompt: '',
        anglePrompt: '<sks> back view high-angle shot wide shot',
        compiledPrompt: '<sks> back view high-angle shot wide shot',
      },
    });

    expect(started).toEqual({
      mode: 'async',
      taskId: 'task-multi-angle-1',
    });

    const snapshot = await provider.getTaskSnapshot('task-multi-angle-1');

    expect((safeFetch as any).mock.calls[1][0]).toBe('https://api.example.com/v1/images/multi-angle/task-multi-angle-1');
    expect(snapshot).toEqual({
      state: 'succeeded',
      progress: 100,
      output: {
        path: 'https://cdn.example.com/multi-angle-async.png',
        url: 'https://cdn.example.com/multi-angle-async.png',
      },
    });
  });

  it('sends OpenAI-compatible size as WxH instead of raw aspectRatio', async () => {
    (safeFetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ url: 'https://cdn.example.com/square.png' }] }),
    });

    const provider = new OpenAICompatibleTTIProvider({
      id: 'c1',
      name: 'openai-compatible',
      provider: 'openai-compatible-tti' as any,
      baseUrl: 'https://api.example.com',
      apiKey: 'k',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelName: 'image-model',
      defaultSize: '720x1280',
    } as any);

    await provider.start({ prompt: 'p', options: { aspectRatio: '1:1' } } as any);

    const body = JSON.parse((safeFetch as any).mock.calls[0][1].body);
    expect(body.size).toBe('1024x1024');
  });

});
