import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SuiheITVProvider } from './SuiheITVProvider';
import type { ITVConfig } from '../../types';

vi.mock('../../utils/safeFetch', () => ({
  safeFetch: vi.fn(),
}));
vi.mock('../../services/imageHostingService', () => ({
  uploadBytesToImageHostingWithRetry: vi.fn(),
}));

import { safeFetch } from '../../utils/safeFetch';
import { uploadBytesToImageHostingWithRetry } from '../../services/imageHostingService';

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

function mockAccepted(taskId = 'task-1') {
  (safeFetch as any).mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ id: taskId }),
  });
}

describe('SuiheITVProvider voice references (音色参考)', () => {
  beforeEach(() => {
    (safeFetch as any).mockReset();
    (uploadBytesToImageHostingWithRetry as any).mockReset();
  });

  it('uploads data-url voice refs to hosting and merges into metadata.audio_urls with omni_reference', async () => {
    (uploadBytesToImageHostingWithRetry as any).mockResolvedValueOnce({
      success: true,
      url: 'https://cdn.example.com/voice.wav',
    });
    mockAccepted();
    const provider = new SuiheITVProvider(createConfig());

    await provider.start({
      capability: 'video.text-to-video',
      prompt: '宁卓的台词使用 @audio_file_1 的音色',
      metadata: {
        komaVoiceReferences: [
          { characterId: 'char_1', characterName: '宁卓', transport: 'data-url', value: 'data:audio/wav;base64,UklGRiQAAABXQVZF', mimeType: 'audio/wav' },
        ],
      },
    } as any);

    const body = JSON.parse((safeFetch as any).mock.calls[0][1].body);
    expect(uploadBytesToImageHostingWithRetry).toHaveBeenCalledTimes(1);
    expect(body.metadata.audio_urls).toEqual(['https://cdn.example.com/voice.wav']);
    expect(body.metadata.function_mode).toBe('omni_reference');
  });

  it('passes remote-url voice refs through without uploading', async () => {
    mockAccepted();
    const provider = new SuiheITVProvider(createConfig());

    await provider.start({
      capability: 'video.text-to-video',
      prompt: 'x',
      metadata: {
        komaVoiceReferences: [
          { transport: 'remote-url', value: 'https://cdn.example.com/v.wav' },
        ],
      },
    } as any);

    expect(uploadBytesToImageHostingWithRetry).not.toHaveBeenCalled();
    const body = JSON.parse((safeFetch as any).mock.calls[0][1].body);
    expect(body.metadata.audio_urls).toEqual(['https://cdn.example.com/v.wav']);
  });

  it('merges with komaJimengAssets.audio_urls without overwriting', async () => {
    mockAccepted();
    const provider = new SuiheITVProvider(createConfig());

    await provider.start({
      capability: 'video.text-to-video',
      prompt: 'x',
      metadata: {
        komaJimengAssets: { audio_urls: ['https://cdn.example.com/base.mp3'] },
        komaVoiceReferences: [
          { transport: 'remote-url', value: 'https://cdn.example.com/v.wav' },
        ],
      },
    } as any);

    const body = JSON.parse((safeFetch as any).mock.calls[0][1].body);
    expect(body.metadata.audio_urls).toEqual(['https://cdn.example.com/base.mp3', 'https://cdn.example.com/v.wav']);
  });
});
