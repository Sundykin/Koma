import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLinghuiImageAssetItemFromSource } from '../state/linghuiImageCollections';

describe('createLinghuiImageAssetItemFromSource', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('captures landscape image dimensions and aspect ratio for imported sources', async () => {
    class MockImage {
      naturalWidth = 1920;
      naturalHeight = 1080;
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;

      set src(_value: string) {
        this.onload?.();
      }
    }

    vi.stubGlobal('Image', MockImage);

    const item = await createLinghuiImageAssetItemFromSource({
      source: '/tmp/landscape.png',
      filenameHint: 'landscape.png',
    });

    expect(item.label).toBe('landscape');
    expect(item.width).toBe(1920);
    expect(item.height).toBe(1080);
    expect(item.aspectRatio).toBe('16:9');
  });
});
