import { describe, expect, it } from 'vitest';
import { getSupportedReferenceKinds, supportsReferenceKind } from './referenceCapabilities';

describe('渠道参考素材能力', () => {
  it('全能参考渠道三类都支持', () => {
    for (const type of ['koma-suihe-itv', 'suihe-itv', 'comfyui-itv']) {
      expect(getSupportedReferenceKinds(type)).toEqual(['image', 'video', 'audio']);
      expect(supportsReferenceKind(type, 'video')).toBe(true);
      expect(supportsReferenceKind(type, 'audio')).toBe(true);
    }
  });

  it('只有图片参考位的渠道不谎报视频 / 音频能力', () => {
    for (const type of ['grok2api-imagine-itv', 'openai-video']) {
      expect(supportsReferenceKind(type, 'image')).toBe(true);
      expect(supportsReferenceKind(type, 'video')).toBe(false);
      expect(supportsReferenceKind(type, 'audio')).toBe(false);
    }
  });

  it('未登记渠道（插件等）按三类都支持处理', () => {
    expect(supportsReferenceKind('some-plugin-itv', 'video')).toBe(true);
    expect(supportsReferenceKind(undefined, 'video')).toBe(true);
  });
});
