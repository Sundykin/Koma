import { describe, expect, it } from 'vitest';
import {
  LINGHUI_CANVAS_CREATE_MENU_CATALOG,
  resolveLinghuiQuickCreateCatalog,
} from '../state/linghuiCanvasQuickCreateCatalog';

describe('resolveLinghuiQuickCreateCatalog', () => {
  it('returns the full catalog when quick create is opened from a blank pane', () => {
    const catalog = resolveLinghuiQuickCreateCatalog();

    expect(catalog).toBe(LINGHUI_CANVAS_CREATE_MENU_CATALOG);
    expect(catalog.some(item => item.id === 'asset-image-reference')).toBe(true);
    expect(catalog.some(item => item.id === 'generator-video-image')).toBe(true);
    expect(catalog.some(item => item.id === 'generator-agent')).toBe(true);
  });

  it('recommends LibTV-style video downstream presets for image outputs', () => {
    const catalog = resolveLinghuiQuickCreateCatalog('image');

    expect(catalog.slice(0, 3).map(item => item.label)).toEqual([
      '图生视频',
      '全能参考',
      '首尾帧视频',
    ]);
    expect(catalog[0]).toEqual(expect.objectContaining({
      type: 'linghui/video',
      initialProperties: { videoCapability: 'video.image-to-video' },
      targetSlotName: '参考',
      targetSlotType: 'image',
    }));
  });

  it('recommends text-driven downstream generators and stores create presets', () => {
    const catalog = resolveLinghuiQuickCreateCatalog('text');
    const textToVideo = catalog.find(item => item.id === 'text-to-video');
    const textToAudio = catalog.find(item => item.id === 'text-to-audio');

    expect(textToVideo).toEqual(expect.objectContaining({
      label: '文生视频',
      nodeLabel: '文生视频',
      initialProperties: { videoCapability: 'video.text-to-video' },
      targetSlotName: '文本',
      targetSlotType: 'text',
    }));
    expect(textToAudio).toEqual(expect.objectContaining({
      label: '音频生成器',
      targetSlotType: 'text',
    }));
  });

  it('filters incompatible downstream nodes for audio outputs', () => {
    const catalog = resolveLinghuiQuickCreateCatalog('audio');

    expect(catalog.every(item => item.targetSlotType === 'audio')).toBe(true);
    expect(catalog.some(item => item.type === 'linghui/image')).toBe(false);
    expect(catalog.some(item => item.label === '视频生成器')).toBe(true);
  });

  it('forces 图片参考 preset into import mode so it never renders as a generator', () => {
    const imageReference = LINGHUI_CANVAS_CREATE_MENU_CATALOG.find(item => item.id === 'asset-image-reference');
    expect(imageReference).toEqual(expect.objectContaining({
      type: 'linghui/image',
      label: '图片参考',
      initialProperties: expect.objectContaining({ mode: 'import' }),
    }));
  });

  it('exposes LibTV-style blank-canvas creation presets', () => {
    expect(LINGHUI_CANVAS_CREATE_MENU_CATALOG.map(item => item.label)).toEqual(expect.arrayContaining([
      '图片参考',
      '视频参考',
      '音频参考',
      '文本生成器',
      '文生视频',
      '图生视频',
      '全能参考',
      '首尾帧视频',
      '脚本生成器',
      '进入全景预览',
    ]));

    expect(LINGHUI_CANVAS_CREATE_MENU_CATALOG.find(item => item.id === 'generator-video-start-end')).toEqual(expect.objectContaining({
      type: 'linghui/video',
      nodeLabel: '首尾帧视频',
      initialProperties: { videoCapability: 'video.start-end-to-video' },
    }));
  });
});
