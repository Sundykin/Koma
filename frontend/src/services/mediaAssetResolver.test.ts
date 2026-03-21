import { describe, it, expect } from 'vitest';
import { resolveProviderAssetInput } from './mediaAssetResolver';

describe('mediaAssetResolver.resolveProviderAssetInput', () => {
  it('prefers remoteUrl when provided on StoredMediaAsset', async () => {
    const result = await resolveProviderAssetInput({
      kind: 'image',
      localPath: '/local/file.png',
      remoteUrl: 'https://cdn.example.com/x.png',
      mimeType: 'image/png',
      createdAt: 1,
    });

    expect(result).toEqual({
      transport: 'remote-url',
      value: 'https://cdn.example.com/x.png',
      mimeType: 'image/png',
    });
  });
});

