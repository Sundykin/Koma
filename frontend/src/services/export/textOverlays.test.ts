import { describe, expect, it } from 'vitest';
import { layoutTextBlock } from './textOverlays';
import { MediaType, type Clip } from '../../types/editor';

function textClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 't1', assetId: '', trackId: 'tt',
    start: 0, duration: 2, offset: 0,
    name: '字幕', type: MediaType.TEXT, src: '',
    x: 0, y: 0, scale: 1, rotation: 0, opacity: 1,
    text: '你好世界',
    ...overrides,
  } as Clip;
}

// 测试桩：每字 0.9em 宽
const measure = (text: string, fontSizePx: number) => text.length * fontSizePx * 0.9;
const opts = { scale: 1, exportWidth: 1920, exportHeight: 1080 };

describe('layoutTextBlock', () => {
  it('底部居中（默认）：块在画面下方居中', () => {
    const layout = layoutTextBlock(textClip({ fontSize: 48 }), opts, measure);
    const margin = 1080 * 0.06;
    // 4 字 × 48 × 0.9 = 172.8 文本宽 + padding
    expect(layout.width).toBeGreaterThan(172);
    expect(Math.abs(layout.y + layout.height + margin - 1080)).toBeLessThanOrEqual(2);
    expect(Math.abs(layout.x + layout.width / 2 - 960)).toBeLessThanOrEqual(2);
  });

  it('顶部左对齐 / 中部右对齐', () => {
    const topLeft = layoutTextBlock(textClip({ textPosition: 'top', textAlign: 'left' }), opts, measure);
    expect(Math.abs(topLeft.y - 1080 * 0.06)).toBeLessThanOrEqual(2);
    expect(Math.abs(topLeft.x - 1080 * 0.06)).toBeLessThanOrEqual(2);

    const centerRight = layoutTextBlock(textClip({ textPosition: 'center', textAlign: 'right' }), opts, measure);
    expect(Math.abs(centerRight.y + centerRight.height / 2 - 540)).toBeLessThanOrEqual(2);
    expect(Math.abs(centerRight.x + centerRight.width - (1920 - 1080 * 0.06))).toBeLessThanOrEqual(2);
  });

  it('多行文本行高堆叠', () => {
    const layout = layoutTextBlock(textClip({ text: '第一行\n第二行', fontSize: 40 }), opts, measure);
    expect(layout.lines).toHaveLength(2);
    expect(layout.lines[1].offsetY - layout.lines[0].offsetY).toBeCloseTo(40 * 1.25, 0);
  });

  it('缩放比作用于字号', () => {
    const layout = layoutTextBlock(textClip({ fontSize: 40 }), { ...opts, scale: 2 }, measure);
    expect(layout.fontSizePx).toBe(80);
  });
});
