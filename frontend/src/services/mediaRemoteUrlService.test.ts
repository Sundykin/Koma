import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./imageHostingService', () => {
  return {
    uploadBytesToImageHostingWithRetry: vi.fn(),
  };
});

describe('mediaRemoteUrlService.ensureRemoteUrlForImageAsset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads data-url bytes and fills remoteUrl (best-effort success)', async () => {
    const { uploadBytesToImageHostingWithRetry } = await import('./imageHostingService');
    (uploadBytesToImageHostingWithRetry as any).mockResolvedValue({
      success: true,
      url: 'https://cdn.example.com/out.png',
    });

    const { ensureRemoteUrlForImageAsset } = await import('./mediaRemoteUrlService');

    const asset = await ensureRemoteUrlForImageAsset({
      projectId: 'p1',
      policy: 'best-effort',
      asset: {
        kind: 'image',
        localPath: 'data:image/png;base64,AA==',
        createdAt: 1,
      },
    });

    expect(asset.remoteUrl).toBe('https://cdn.example.com/out.png');
  });

  it('throws when upload fails and policy is required', async () => {
    const { uploadBytesToImageHostingWithRetry } = await import('./imageHostingService');
    (uploadBytesToImageHostingWithRetry as any).mockResolvedValue({
      success: false,
      error: 'nope',
    });

    const { ensureRemoteUrlForImageAsset } = await import('./mediaRemoteUrlService');

    await expect(
      ensureRemoteUrlForImageAsset({
        projectId: 'p1',
        policy: 'required',
        asset: {
          kind: 'image',
          localPath: 'data:image/png;base64,AA==',
          createdAt: 1,
        },
      })
    ).rejects.toThrow('nope');
  });

  it('uploads multiple image sources sequentially with unique filenames', async () => {
    const { uploadBytesToImageHostingWithRetry } = await import('./imageHostingService');
    const uploadMock = uploadBytesToImageHostingWithRetry as any;
    uploadMock
      .mockResolvedValueOnce({ success: true, url: 'https://cdn.example.com/1.png' })
      .mockResolvedValueOnce({ success: true, url: 'https://cdn.example.com/2.png' });

    const { ensureRemoteUrlForImageSources } = await import('./mediaRemoteUrlService');

    const result = await ensureRemoteUrlForImageSources({
      projectId: 'p1',
      policy: 'required',
      sources: [
        'data:image/jpeg;base64,AA==',
        'data:image/jpeg;base64,BB==',
      ],
    });

    expect(result).toEqual([
      'https://cdn.example.com/1.png',
      'https://cdn.example.com/2.png',
    ]);
    expect(uploadMock.mock.calls[0][1]).toEqual({ filename: 'image-1.png' });
    expect(uploadMock.mock.calls[1][1]).toEqual({ filename: 'image-2.png' });
  });
});
