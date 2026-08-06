/**
 * 文字片段 → PNG 透明叠加层（快速拼接导出的硬字幕方案）。
 *
 * 为什么不用 ffmpeg subtitles/drawtext 滤镜：捆绑与系统 ffmpeg 不保证带
 * libass/freetype（实测系统 Homebrew 构建就没有）。改为渲染进程用 canvas
 * 画文字（系统字体原生支持中文）→ 全幅透明 PNG → ffmpeg overlay 按时间
 * 区间叠加，能力要求降到最低（overlay 滤镜无处不在）。
 *
 * 布局纯函数与 DOM 渲染分离，前者可单测。
 */
import { MediaType, type Clip } from '../../types/editor';

export interface TextOverlaySpec {
  imagePath: string;
  startSec: number;
  endSec: number;
}

export interface TextBlockLayout {
  /** 文本块左上角与尺寸（导出像素坐标） */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 每行文本及其在块内的相对位置 */
  lines: Array<{ text: string; offsetY: number }>;
  fontSizePx: number;
  paddingX: number;
  paddingY: number;
}

/** 布局参数：相对时间轴画布的字号如何映射到导出分辨率 */
export interface TextLayoutOptions {
  /** 导出宽度 / 时间轴画布宽度 的缩放比 */
  scale: number;
  exportWidth: number;
  exportHeight: number;
}

const LINE_HEIGHT_RATIO = 1.25;
const BLOCK_PADDING_X_RATIO = 0.6;  // 相对字号
const BLOCK_PADDING_Y_RATIO = 0.4;
const EDGE_MARGIN_RATIO = 0.06;     // 距画布边的最小边距（相对高度）

/** 文本测量函数签名（DOM 环境用 canvas measureText，测试注入桩） */
export type MeasureTextFn = (text: string, fontSizePx: number, fontFamily: string) => number;

/**
 * 计算文字片段在导出画面中的块布局（纯函数）。
 * textPosition 上/中/下 + textAlign 左/中/右，参考播放器的字幕定位语义。
 */
export function layoutTextBlock(
  clip: Clip,
  options: TextLayoutOptions,
  measure: MeasureTextFn,
): TextBlockLayout {
  const { scale, exportWidth, exportHeight } = options;
  const fontSizePx = Math.max(8, (clip.fontSize ?? 48) * scale);
  const fontFamily = String(clip.fontFamily || 'Arial');
  const lines = String(clip.text || '').trim().split(/\r?\n/).filter(line => line.trim());

  const lineHeight = fontSizePx * LINE_HEIGHT_RATIO;
  const paddingX = fontSizePx * BLOCK_PADDING_X_RATIO;
  const paddingY = fontSizePx * BLOCK_PADDING_Y_RATIO;
  const textWidths = lines.map(line => measure(line, fontSizePx, fontFamily));
  const blockWidth = Math.max(...textWidths, fontSizePx) + paddingX * 2;
  const blockHeight = lines.length * lineHeight + paddingY * 2;
  const margin = exportHeight * EDGE_MARGIN_RATIO;

  let x: number;
  if (clip.textAlign === 'left') {
    x = margin;
  } else if (clip.textAlign === 'right') {
    x = exportWidth - blockWidth - margin;
  } else {
    x = (exportWidth - blockWidth) / 2;
  }

  let y: number;
  if (clip.textPosition === 'top') {
    y = margin;
  } else if (clip.textPosition === 'center') {
    y = (exportHeight - blockHeight) / 2;
  } else {
    // bottom（默认）
    y = exportHeight - blockHeight - margin;
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.ceil(blockWidth),
    height: Math.ceil(blockHeight),
    lines: lines.map((text, index) => ({ text, offsetY: paddingY + index * lineHeight })),
    fontSizePx,
    paddingX,
    paddingY,
  };
}

/** DOM 环境：把文字片段渲染成全幅透明 PNG 的 dataURL；非 DOM/无 2d 上下文返回 null */
export function renderTextClipToPngDataUrl(
  clip: Clip,
  exportWidth: number,
  exportHeight: number,
  canvasWidth: number,
): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = exportWidth;
  canvas.height = exportHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const scale = exportWidth / Math.max(1, canvasWidth);
  const layout = layoutTextBlock(clip, { scale, exportWidth, exportHeight }, (text, fontSizePx, fontFamily) => {
    ctx.font = `${fontSizePx}px ${fontFamily}`;
    return ctx.measureText(text).width;
  });

  const fontFamily = String(clip.fontFamily || 'Arial');
  ctx.font = `${layout.fontSizePx}px ${fontFamily}`;
  ctx.textBaseline = 'top';

  // 背景盒（可选）
  const background = String(clip.backgroundColor || '').trim();
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(layout.x, layout.y, layout.width, layout.height);
  }

  ctx.fillStyle = String(clip.fontColor || '#ffffff');
  for (const line of layout.lines) {
    ctx.font = `${layout.fontSizePx}px ${fontFamily}`;
    const lineWidth = ctx.measureText(line.text).width;
    let lineX = layout.x + layout.paddingX;
    if (clip.textAlign === 'right') {
      lineX = layout.x + layout.width - layout.paddingX - lineWidth;
    } else if (!clip.textAlign || clip.textAlign === 'center') {
      lineX = layout.x + (layout.width - lineWidth) / 2;
    }
    ctx.fillText(line.text, lineX, layout.y + line.offsetY);
  }

  return canvas.toDataURL('image/png');
}

/**
 * 渲染全部文字片段为 PNG 文件并返回叠加层规格。
 * writePng 由调用方注入（Electron 下写临时目录），返回文件绝对路径。
 */
export async function buildTextOverlaySpecs(
  clips: Clip[],
  exportWidth: number,
  exportHeight: number,
  canvasWidth: number,
  writePng: (filename: string, base64: string) => Promise<string>,
): Promise<TextOverlaySpec[]> {
  const specs: TextOverlaySpec[] = [];
  const textClips = clips
    .filter(clip => clip.type === MediaType.TEXT && String(clip.text || '').trim())
    .sort((a, b) => a.start - b.start);

  for (let index = 0; index < textClips.length; index += 1) {
    const clip = textClips[index];
    const dataUrl = renderTextClipToPngDataUrl(clip, exportWidth, exportHeight, canvasWidth);
    if (!dataUrl) continue;
    const base64 = dataUrl.split(',')[1] || '';
    if (!base64) continue;
    const imagePath = await writePng(`subtitle-${index + 1}.png`, base64);
    specs.push({
      imagePath,
      startSec: Math.max(0, clip.start),
      endSec: Math.max(clip.start, clip.start + clip.duration),
    });
  }
  return specs;
}
