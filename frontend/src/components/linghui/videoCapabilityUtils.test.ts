import { describe, expect, it } from 'vitest';
import {
  getVideoCapabilityInputError,
  listVideoCapabilities,
  resolveSupportedVideoCapability,
  resolveVideoCapabilitySources,
} from './videoCapabilityUtils';

describe('videoCapabilityUtils', () => {
  it('只返回视频能力并保留模型声明顺序', () => {
    expect(listVideoCapabilities([
      'llm.chat',
      'video.reference-to-video',
      'image.text-to-image',
      'video.start-end-to-video',
      'video.reference-to-video',
      'video.text-to-video',
    ])).toEqual([
      'video.reference-to-video',
      'video.start-end-to-video',
      'video.text-to-video',
    ]);
  });

  it('当前能力不受支持时回退到模型默认能力', () => {
    expect(resolveSupportedVideoCapability('video.start-end-to-video', [
      'video.text-to-video',
      'video.image-to-video',
    ])).toBe('video.text-to-video');
  });

  it('图生视频会把第一路视觉输入作为主图，其余作为补充参考', () => {
    expect(resolveVideoCapabilitySources('video.image-to-video', [
      '/tmp/1.png',
      '/tmp/2.png',
      '/tmp/2.png',
      '/tmp/3.png',
    ])).toEqual({
      visualSources: ['/tmp/1.png', '/tmp/2.png', '/tmp/3.png'],
      primaryImageSource: '/tmp/1.png',
      additionalReferenceSources: ['/tmp/2.png', '/tmp/3.png'],
      referenceImageSources: [],
    });
  });

  it('参考生视频会保留全部视觉输入作为参考集合', () => {
    expect(resolveVideoCapabilitySources('video.reference-to-video', [
      '/tmp/a.png',
      '/tmp/b.png',
    ])).toEqual({
      visualSources: ['/tmp/a.png', '/tmp/b.png'],
      additionalReferenceSources: [],
      referenceImageSources: ['/tmp/a.png', '/tmp/b.png'],
    });
  });

  it('首尾帧视频会分配首帧和尾帧并给出缺失提示', () => {
    const complete = resolveVideoCapabilitySources('video.start-end-to-video', [
      '/tmp/start.png',
      '/tmp/middle.png',
      '/tmp/end.png',
    ]);
    expect(complete.startFrameSource).toBe('/tmp/start.png');
    expect(complete.endFrameSource).toBe('/tmp/end.png');
    expect(getVideoCapabilityInputError('video.start-end-to-video', complete)).toBeUndefined();

    const incomplete = resolveVideoCapabilitySources('video.start-end-to-video', ['/tmp/only.png']);
    expect(getVideoCapabilityInputError('video.start-end-to-video', incomplete)).toBe('首尾帧视频需要同时提供首帧和尾帧');
  });

  it('文生视频不要求视觉输入', () => {
    const sources = resolveVideoCapabilitySources('video.text-to-video', []);
    expect(getVideoCapabilityInputError('video.text-to-video', sources)).toBeUndefined();
  });
});
