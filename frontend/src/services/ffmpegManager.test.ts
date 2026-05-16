import { afterEach, describe, expect, it, vi } from 'vitest';
import { ffmpegManager } from './ffmpegManager';

describe('ffmpegManager', () => {
  afterEach(() => {
    delete (window as typeof window & { electronAPI?: unknown }).electronAPI;
  });

  it('passes image upscale requests to the Electron FFmpeg bridge', async () => {
    const ffmpeg = {
      getCacheDir: vi.fn().mockResolvedValue('/tmp/koma-ffmpeg'),
      isAvailable: vi.fn().mockResolvedValue(true),
      upscaleImage: vi.fn().mockResolvedValue('/tmp/upscaled.png'),
    };
    (window as typeof window & { electronAPI?: unknown }).electronAPI = { ffmpeg };

    await expect(ffmpegManager.upscaleImage({
      input: '/tmp/source.png',
      output: '/tmp/upscaled.png',
      factor: 4,
      sharpenAmount: 0.8,
    })).resolves.toBe('/tmp/upscaled.png');

    expect(ffmpeg.upscaleImage).toHaveBeenCalledWith({
      input: '/tmp/source.png',
      output: '/tmp/upscaled.png',
      factor: 4,
      sharpenAmount: 0.8,
    });
  });

  it('rejects image upscale when the FFmpeg bridge is unavailable', async () => {
    await expect(ffmpegManager.upscaleImage({
      input: '/tmp/source.png',
      output: '/tmp/upscaled.png',
      factor: 2,
    })).rejects.toThrow('FFmpeg 不可用');
  });

  it('passes image crop requests to the Electron FFmpeg bridge', async () => {
    const ffmpeg = {
      getCacheDir: vi.fn().mockResolvedValue('/tmp/koma-ffmpeg'),
      isAvailable: vi.fn().mockResolvedValue(true),
      cropImage: vi.fn().mockResolvedValue('/tmp/cropped.png'),
    };
    (window as typeof window & { electronAPI?: unknown }).electronAPI = { ffmpeg };

    await expect(ffmpegManager.cropImage({
      input: '/tmp/source.png',
      output: '/tmp/cropped.png',
      aspectRatio: '9:16',
      sharpenAmount: 0.4,
    })).resolves.toBe('/tmp/cropped.png');

    expect(ffmpeg.cropImage).toHaveBeenCalledWith({
      input: '/tmp/source.png',
      output: '/tmp/cropped.png',
      aspectRatio: '9:16',
      sharpenAmount: 0.4,
    });
  });
});
