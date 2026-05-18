/**
 * 全景主图横向切分助手。
 *
 * 把一张已生成的全景图（环境带 / 真 2:1 球面 / 宽幅平面均可）按 N 等份横向切割，
 * 得到 N 个方向的细节图。与"重新调 provider 生成"相比：
 *  - 纯浏览器 canvas，无网络成本
 *  - 直接保证方向间的画面风格一致性
 *  - 对真 360° 球面（左右连续）做 wrap 处理：把切片中心定在 (i + 0.5) / N 处，
 *    并允许跨过左右边界，避免最东方的切片被边缘硬切
 *
 * 输出 PNG dataUrl + 元数据，由编辑器写入 properties.detailCrops。
 */
import { nanoid } from 'nanoid';
import type { LinghuiImageAssetItem, LinghuiPanoramaProjectionMode } from '../../../types/linghui';
import { safeFetch } from '../../../utils/safeFetch';

export type PanoramaDetailDirectionCount = 4 | 6 | 8 | 12;

export const PANORAMA_RING4_NODE_LABELS = ['全景截图-前方', '全景截图-左侧', '全景截图-后方', '全景截图-右侧'] as const;

export function getPanoramaRing12NodeLabel(index: number): string {
  const normalized = ((Math.round(index) % 12) + 12) % 12;
  return `全景截图-逆时针${(30 * normalized) % 360}°`;
}

export function getPanoramaScreenshotGroupName(count: number): string {
  return `全景截图组 (${Math.max(0, Math.round(count))} 张)`;
}

async function loadImageForCrop(url: string): Promise<HTMLImageElement> {
  let resolvedUrl = url;
  let blobUrl: string | null = null;

  if (/^https?:\/\//i.test(url)) {
    const res = await safeFetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    blobUrl = URL.createObjectURL(blob);
    resolvedUrl = blobUrl;
  }

  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);
      img.src = resolvedUrl;
    });
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
}

export function getPanoramaDetailDirectionLabel(count: PanoramaDetailDirectionCount, index: number): string {
  if (count === 4) return PANORAMA_RING4_NODE_LABELS[index] ?? `全景截图-${index + 1}`;
  if (count === 12) return getPanoramaRing12NodeLabel(index);
  if (count === 6) return ['N', '北东', '东南', '南', '南西', '北西'][index] ?? `方向 ${index + 1}`;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][index] ?? `方向 ${index + 1}`;
}

export interface PanoramaDetailCropOptions {
  sourceUrl: string;
  count: PanoramaDetailDirectionCount;
  /** 投影模式。equirectangular-2to1 / ar720-band 走 wrap-around；flat-wide 不允许 wrap */
  projectionMode?: LinghuiPanoramaProjectionMode;
  /** 输出最大宽度，超过则按比例缩小，避免 dataUrl 过大 */
  maxOutputWidth?: number;
}

export async function panoramaSplitDirections({
  sourceUrl,
  count,
  projectionMode = 'ar720-band',
  maxOutputWidth = 1024,
}: PanoramaDetailCropOptions): Promise<LinghuiImageAssetItem[]> {
  const trimmed = String(sourceUrl ?? '').trim();
  if (!trimmed) throw new Error('请先生成或导入一张全景图');

  const img = await loadImageForCrop(trimmed);
  if (!img.width || !img.height) throw new Error('无法读取全景图尺寸');

  const sliceWidth = img.width / count;
  const allowWrap = projectionMode !== 'flat-wide';

  const items: LinghuiImageAssetItem[] = [];
  for (let i = 0; i < count; i += 1) {
    // 把切片中心放在每个方向的几何中心：center = (i + 0.5) / N
    const center = (i + 0.5) * sliceWidth;
    const startX = center - sliceWidth / 2;
    const width = Math.max(1, Math.round(sliceWidth));

    const targetWidth = Math.min(maxOutputWidth, width);
    const targetHeight = Math.round((img.height * targetWidth) / width);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前浏览器不支持 canvas 2d 上下文');

    const drawRange = (sx: number, sw: number, dx: number, dw: number) => {
      ctx.drawImage(img, sx, 0, sw, img.height, dx, 0, dw, targetHeight);
    };

    if (startX >= 0 && startX + width <= img.width) {
      drawRange(startX, width, 0, targetWidth);
    } else if (!allowWrap) {
      // 平面板：硬截到边界内
      const clampedStart = Math.max(0, Math.min(img.width - width, startX));
      drawRange(clampedStart, width, 0, targetWidth);
    } else {
      // 环绕：跨边界时左右各 draw 一段
      const leftSx = (startX + img.width) % img.width;
      const leftSw = Math.min(img.width - leftSx, width);
      const leftDw = Math.round((leftSw / width) * targetWidth);
      drawRange(leftSx, leftSw, 0, leftDw);
      const rightSw = width - leftSw;
      if (rightSw > 0) {
        drawRange(0, rightSw, leftDw, targetWidth - leftDw);
      }
    }

    const dataUrl = canvas.toDataURL('image/png');
    items.push({
      id: `panorama-detail-${nanoid(6)}-${i + 1}`,
      source: dataUrl,
      label: getPanoramaDetailDirectionLabel(count, i),
      width: targetWidth,
      height: targetHeight,
      mimeType: 'image/png',
      aspectRatio: `${targetWidth}:${targetHeight}`,
    });
  }

  return items;
}
