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

  it('passes media concat requests to the Electron FFmpeg bridge', async () => {
    const ffmpeg = {
      getCacheDir: vi.fn().mockResolvedValue('/tmp/koma-ffmpeg'),
      isAvailable: vi.fn().mockResolvedValue(true),
      concatMediaClips: vi.fn().mockResolvedValue('/tmp/final.mp4'),
    };
    (window as typeof window & { electronAPI?: unknown }).electronAPI = { ffmpeg };

    await expect(ffmpegManager.concatMediaClips({
      clips: [
        { kind: 'video', source: '/tmp/a.mp4', label: 'A' },
        { kind: 'audio', source: '/tmp/b.mp3', label: 'B' },
      ],
      outputPath: '/tmp/final.mp4',
      width: 1920,
      height: 1080,
      fps: 30,
      imageDurationSec: 3,
      onProgress: vi.fn(),
    })).resolves.toBe('/tmp/final.mp4');

    expect(ffmpeg.concatMediaClips).toHaveBeenCalledWith({
      clips: [
        { kind: 'video', source: '/tmp/a.mp4', label: 'A' },
        { kind: 'audio', source: '/tmp/b.mp3', label: 'B' },
      ],
      outputPath: '/tmp/final.mp4',
      width: 1920,
      height: 1080,
      fps: 30,
      imageDurationSec: 3,
    });
  });

  it('passes video trim requests to the Electron FFmpeg bridge', async () => {
    const ffmpeg = {
      getCacheDir: vi.fn().mockResolvedValue('/tmp/koma-ffmpeg'),
      isAvailable: vi.fn().mockResolvedValue(true),
      trimVideo: vi.fn().mockResolvedValue('/tmp/clip.mp4'),
    };
    (window as typeof window & { electronAPI?: unknown }).electronAPI = { ffmpeg };

    await expect(ffmpegManager.trimVideo({
      input: '/tmp/source.mp4',
      output: '/tmp/clip.mp4',
      startTime: 1.2,
      endTime: 4.5,
    })).resolves.toBe('/tmp/clip.mp4');

    expect(ffmpeg.trimVideo).toHaveBeenCalledWith({
      input: '/tmp/source.mp4',
      output: '/tmp/clip.mp4',
      startTime: 1.2,
      endTime: 4.5,
    });
  });

  it('passes video upscale requests to the Electron FFmpeg bridge', async () => {
    const ffmpeg = {
      getCacheDir: vi.fn().mockResolvedValue('/tmp/koma-ffmpeg'),
      isAvailable: vi.fn().mockResolvedValue(true),
      upscaleVideo: vi.fn().mockResolvedValue('/tmp/upscaled.mp4'),
    };
    (window as typeof window & { electronAPI?: unknown }).electronAPI = { ffmpeg };

    await expect(ffmpegManager.upscaleVideo({
      input: '/tmp/source.mp4',
      output: '/tmp/upscaled.mp4',
      factor: 2,
      sharpenAmount: 0.6,
    })).resolves.toBe('/tmp/upscaled.mp4');

    expect(ffmpeg.upscaleVideo).toHaveBeenCalledWith({
      input: '/tmp/source.mp4',
      output: '/tmp/upscaled.mp4',
      factor: 2,
      sharpenAmount: 0.6,
    });
  });
});
