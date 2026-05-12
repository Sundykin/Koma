/**
 * 全景图 → 伪 3D 透视视角 抽取算法。
 *
 * 原理（Skybox AI 的 reframe 思路）：
 *   把一张 panorama 当作"环境光球"，给定虚拟相机的 yaw / pitch / fov，
 *   对输出图的每个像素反算其在球面上的方向，把方向投影到 panorama 的 (u,v)，
 *   采样原图像素并写到输出 canvas。
 *
 * 三种投影对应不同的 (u,v) 映射：
 *   - equirectangular-2to1 (2:1)：
 *       u = (yaw + π) / 2π
 *       v = (pitch + π/2) / π
 *   - ar720-band (21:9 环形带，pitch 只覆盖 ±54°)：
 *       u = (yaw + π) / 2π
 *       v 由 (pitch + θBand/2) / θBand 映射，超出范围用环境兜底色
 *   - flat-wide：不做球面采样，直接对齐 fov 居中 crop
 *
 * 性能：1024×1024 输出 = 100 万次采样，纯 JS ~200ms。
 * 用于"批量 6/8 视角"时按 requestAnimationFrame 排序避免阻塞。
 */

import type { LinghuiPanoramaProjectionMode } from '../../../types/linghui';

/** ar720-band 的实际有效 pitch 半角（弧度，54°） */
const AR720_BAND_HALF_PITCH = (54 * Math.PI) / 180;
/** ar720-band 带外兜底色（与 PanoramaViewer SCENE_BG_COLOR 对齐：深蓝灰） */
const AR720_BAND_FALLBACK_RGB: [number, number, number] = [26, 37, 48];

export interface ExtractPerspectiveOptions {
  /** 虚拟相机偏航角，弧度。0 = 正前方（panorama 中心），+ = 朝右 */
  yaw: number;
  /** 虚拟相机俯仰角，弧度。0 = 平视，+ = 朝上 */
  pitch: number;
  /** 视场角，度。建议 50-90 */
  fovDeg: number;
  /** 输出图宽度（像素） */
  width: number;
  /** 输出图高度（像素） */
  height: number;
  /** panorama 的投影模式，决定 (u,v) 映射公式 */
  projectionMode: LinghuiPanoramaProjectionMode;
}

export interface ExtractPerspectiveResult {
  /** 输出图的 ImageBitmap-friendly dataUrl（PNG） */
  dataUrl: string;
  /** 实际写入的尺寸 */
  width: number;
  height: number;
}

/**
 * 把 panorama URL 加载成 ImageData。
 * 兼容 http(s) / koma-local:// / data: / blob:。
 * koma-local URL 经过 fileSystemPort 转换成可访问 URL 在调用方完成；这里只处理浏览器侧。
 */
async function loadImageData(src: string): Promise<ImageData> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`加载全景图失败: ${src}`));
    image.src = src;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('无法获取 2D canvas context');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * 把球面方向 (dx, dy, dz)（单位向量）映射成 panorama 上的归一化 (u, v) ∈ [0,1]。
 * 不同 projectionMode 用不同公式；带外（pitch 越界）返回 null，调用方写兜底色。
 */
function directionToUV(
  dx: number,
  dy: number,
  dz: number,
  mode: LinghuiPanoramaProjectionMode,
): { u: number; v: number } | null {
  // 球面坐标：yaw 绕 +Y，pitch 朝上为正
  // dx = sin(yaw) * cos(pitch)
  // dy = sin(pitch)
  // dz = -cos(yaw) * cos(pitch)   （右手系，panorama 中心朝 -Z）
  const yawSph = Math.atan2(dx, -dz); // [-π, π]
  const pitchSph = Math.asin(Math.max(-1, Math.min(1, dy))); // [-π/2, π/2]

  if (mode === 'flat-wide') {
    // 不应该走到这里：flat-wide 调用方直接 crop 处理
    return null;
  }

  const u = (yawSph + Math.PI) / (2 * Math.PI);

  if (mode === 'equirectangular-2to1') {
    const v = (pitchSph + Math.PI / 2) / Math.PI;
    return { u, v };
  }

  // ar720-band：pitch 限制在 ±54° 之间，越界返回 null（外部填兜底色）
  if (pitchSph < -AR720_BAND_HALF_PITCH || pitchSph > AR720_BAND_HALF_PITCH) {
    return null;
  }
  const v = (pitchSph + AR720_BAND_HALF_PITCH) / (2 * AR720_BAND_HALF_PITCH);
  return { u, v };
}

/**
 * 双线性插值采样 ImageData。
 * u/v 横向 wrap（panorama 左右接缝），纵向 clamp。
 */
function sampleBilinear(image: ImageData, u: number, v: number): [number, number, number] {
  const { width: W, height: H, data } = image;
  // wrap u, clamp v
  const uu = ((u % 1) + 1) % 1;
  const vv = Math.max(0, Math.min(1, v));
  const x = uu * (W - 1);
  const y = vv * (H - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = (x0 + 1) % W;
  const y1 = Math.min(H - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const idx = (px: number, py: number) => (py * W + px) * 4;
  const i00 = idx(x0, y0);
  const i10 = idx(x1, y0);
  const i01 = idx(x0, y1);
  const i11 = idx(x1, y1);
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  const r = data[i00] * w00 + data[i10] * w10 + data[i01] * w01 + data[i11] * w11;
  const g = data[i00 + 1] * w00 + data[i10 + 1] * w10 + data[i01 + 1] * w01 + data[i11 + 1] * w11;
  const b = data[i00 + 2] * w00 + data[i10 + 2] * w10 + data[i01 + 2] * w01 + data[i11 + 2] * w11;
  return [r, g, b];
}

/**
 * 主入口：从 panorama 图抽取一个虚拟相机视角的透视图。
 *
 * 算法：对每个输出像素 (px, py)：
 *   1. 反算它在相机空间的方向向量 (cx, cy, -1)（fov 决定缩放）
 *   2. 用 yaw/pitch 旋转矩阵把这个方向旋到世界空间
 *   3. directionToUV() 映射到 panorama (u,v)
 *   4. 双线性采样原图
 */
export async function extractPerspectiveView(
  panoramaSrc: string,
  options: ExtractPerspectiveOptions,
): Promise<ExtractPerspectiveResult> {
  const { yaw, pitch, fovDeg, width, height, projectionMode } = options;

  // flat-wide：不做球面，直接居中 crop
  if (projectionMode === 'flat-wide') {
    return extractFlatCrop(panoramaSrc, options);
  }

  const source = await loadImageData(panoramaSrc);

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('无法创建输出 canvas');
  const outImage = outCtx.createImageData(width, height);

  const fovRad = (fovDeg * Math.PI) / 180;
  const halfTan = Math.tan(fovRad / 2);
  // 像 OpenGL 投影：屏幕中心是相机正前，halfTan 决定屏幕半宽
  const aspect = width / height;

  // 旋转矩阵：先 pitch 绕 X，再 yaw 绕 Y
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  for (let py = 0; py < height; py++) {
    // y 屏幕坐标 → NDC，+1 顶 -1 底
    const ndcY = 1 - (2 * (py + 0.5)) / height;
    for (let px = 0; px < width; px++) {
      const ndcX = (2 * (px + 0.5)) / width - 1;
      // 相机空间方向（z = -1 = 朝前）
      const camX = ndcX * halfTan * aspect;
      const camY = ndcY * halfTan;
      const camZ = -1;
      // 归一化
      const camLen = Math.sqrt(camX * camX + camY * camY + camZ * camZ);
      const cnx = camX / camLen;
      const cny = camY / camLen;
      const cnz = camZ / camLen;
      // 先 pitch 绕 X：[y, z] → [y*cos - z*sin, y*sin + z*cos]
      const py1 = cny * cp - cnz * sp;
      const pz1 = cny * sp + cnz * cp;
      // 再 yaw 绕 Y：[x, z] → [x*cos + z*sin, -x*sin + z*cos]
      const wx = cnx * cy + pz1 * sy;
      const wy = py1;
      const wz = -cnx * sy + pz1 * cy;
      const uv = directionToUV(wx, wy, wz, projectionMode);
      const outIdx = (py * width + px) * 4;
      if (!uv) {
        outImage.data[outIdx] = AR720_BAND_FALLBACK_RGB[0];
        outImage.data[outIdx + 1] = AR720_BAND_FALLBACK_RGB[1];
        outImage.data[outIdx + 2] = AR720_BAND_FALLBACK_RGB[2];
        outImage.data[outIdx + 3] = 255;
        continue;
      }
      const [r, g, b] = sampleBilinear(source, uv.u, uv.v);
      outImage.data[outIdx] = r;
      outImage.data[outIdx + 1] = g;
      outImage.data[outIdx + 2] = b;
      outImage.data[outIdx + 3] = 255;
    }
  }

  outCtx.putImageData(outImage, 0, 0);
  return { dataUrl: out.toDataURL('image/png'), width, height };
}

/**
 * flat-wide：直接居中 crop 出窄视角的画面。
 * 用 yaw 控制水平偏移，pitch 控制垂直偏移，fov 控制 crop 比例。
 */
async function extractFlatCrop(
  panoramaSrc: string,
  options: ExtractPerspectiveOptions,
): Promise<ExtractPerspectiveResult> {
  const source = await loadImageData(panoramaSrc);
  const { width: outW, height: outH, yaw, pitch, fovDeg } = options;
  const fovRatio = fovDeg / 90; // 90° → 全宽，60° → 2/3 宽
  const cropW = Math.min(source.width, source.width * fovRatio);
  const cropH = cropW * (outH / outW);

  // yaw / pitch 用作位移（±1 对应整张图边界）
  const offsetX = (yaw / Math.PI) * (source.width - cropW) * 0.5;
  const offsetY = -(pitch / (Math.PI / 2)) * (source.height - cropH) * 0.5;
  const cropX = Math.max(0, Math.min(source.width - cropW, source.width * 0.5 - cropW * 0.5 + offsetX));
  const cropY = Math.max(0, Math.min(source.height - cropH, source.height * 0.5 - cropH * 0.5 + offsetY));

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('无法创建输出 canvas');
  // 把 source crop 区域画到输出 canvas（需要先把 source 重画到 src canvas）
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = source.width;
  srcCanvas.height = source.height;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) throw new Error('无法创建源 canvas');
  srcCtx.putImageData(source, 0, 0);
  outCtx.drawImage(srcCanvas, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
  return { dataUrl: out.toDataURL('image/png'), width: outW, height: outH };
}

/**
 * 6 视角预设：cube faces — 前 / 后 / 左 / 右 / 上 / 下，每张方形。
 * fov 90° 让 6 张图刚好拼成完整环境（cubemap 标准）。
 */
export const PANORAMA_PERSPECTIVE_SIX_FACES: Array<{
  id: string;
  label: string;
  yaw: number;
  pitch: number;
  fovDeg: number;
}> = [
  { id: 'face-front', label: '正前', yaw: 0, pitch: 0, fovDeg: 90 },
  { id: 'face-right', label: '正右', yaw: Math.PI / 2, pitch: 0, fovDeg: 90 },
  { id: 'face-back', label: '正后', yaw: Math.PI, pitch: 0, fovDeg: 90 },
  { id: 'face-left', label: '正左', yaw: -Math.PI / 2, pitch: 0, fovDeg: 90 },
  { id: 'face-up', label: '顶视', yaw: 0, pitch: Math.PI / 2, fovDeg: 90 },
  { id: 'face-down', label: '俯视', yaw: 0, pitch: -Math.PI / 2, fovDeg: 90 },
];

/**
 * 8 等分预设：水平 45° 一张，pitch=0，fov 60°（适合做"环绕镜头"参考）。
 */
export const PANORAMA_PERSPECTIVE_EIGHT_DIRECTIONS: Array<{
  id: string;
  label: string;
  yaw: number;
  pitch: number;
  fovDeg: number;
}> = Array.from({ length: 8 }, (_, i) => ({
  id: `octant-${i}`,
  label: `${i * 45}°`,
  yaw: (i * Math.PI) / 4,
  pitch: 0,
  fovDeg: 60,
}));
