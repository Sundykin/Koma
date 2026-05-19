/**
 * 全景图 → 透视视角 离屏抽取。
 *
 * 实现策略：复用 PanoramaViewer 的「相机 lookAt 公式 + sphere/cylinder/flat 几何」
 * （都通过 panoramaSceneBuilder 工厂），在独立的 WebGLRenderer 里离屏渲一帧，再
 * 把像素读出来。优势：
 *   - 抽取出的画面与 viewer 里 yaw/pitch/fov 一致的实时画面**像素级一致**，
 *     不存在两套手算 (u,v) 公式 drift 导致的"看到的是 +Z 截出来是 -Z" 反向问题。
 *   - 批量 6/8 视角共享同一个离屏 renderer，只换 lookAt 不重建 GL context，
 *     节省 WebGL 上下文配额（Chrome 16 个上限）。
 *
 * flat-wide 模式不走球面，直接 2D crop（保留旧 extractFlatCrop 的行为）。
 */
import * as THREE from 'three';
import type { LinghuiPanoramaProjectionMode } from '../../../types/linghui';
import { safeFetch } from '../../../utils/safeFetch';
import type { PanoramaViewerMode } from './panoramaProjection';
import { resolvePanoramaViewerMode } from './panoramaProjection';
import {
  applyPanoramaCameraLookAt, buildPanoramaMesh, disposePanoramaMesh,
} from './panoramaSceneBuilder';
import { SCENE_BG_COLOR } from './panoramaViewerConstants';

export interface PanoramaSnapshotView {
  /** 偏航角，弧度。0=正前（+Z），+ 朝右 */
  yaw: number;
  /** 俯仰角，弧度。0=平视，+ 朝上 */
  pitch: number;
  /** 视场角，度 */
  fovDeg: number;
  /** 输出宽度 */
  width: number;
  /** 输出高度 */
  height: number;
}

export interface PanoramaSnapshotOptions extends PanoramaSnapshotView {
  /** panorama 图源。支持 http(s) / data: / blob: / koma-local:// */
  sourceUrl: string;
  /** 提示词侧的投影模式 */
  projectionMode: LinghuiPanoramaProjectionMode;
  /** 几何模式。缺省按 projectionMode + 图源实际比例推断（与 viewer 一致） */
  viewerMode?: PanoramaViewerMode;
}

export interface PanoramaSnapshotResult {
  dataUrl: string;
  width: number;
  height: number;
}

async function resolveLoadableUrl(src: string): Promise<{ url: string; revoke?: () => void }> {
  if (/^(data:|blob:|koma-local:)/.test(src)) return { url: src };
  if (/^https?:\/\//i.test(src)) {
    const res = await safeFetch(src);
    if (!res.ok) throw new Error(`加载全景图失败：HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  }
  return { url: src };
}

async function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`加载全景图失败: ${url}`));
    img.src = url;
  });
}

async function loadPanoramaTexture(src: string): Promise<{ texture: THREE.Texture; revoke?: () => void }> {
  const { url, revoke } = await resolveLoadableUrl(src);
  const texture = await new Promise<THREE.Texture>((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(url, resolve, undefined, () => reject(new Error('纹理加载失败')));
  });
  // 与 usePanoramaTexture 完全一致的纹理参数
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return { texture, revoke };
}

function resolveViewerMode(options: PanoramaSnapshotOptions, imageAspect?: number): PanoramaViewerMode {
  if (options.viewerMode) return options.viewerMode;
  return resolvePanoramaViewerMode({
    projectionMode: options.projectionMode,
    ratioString: imageAspect != null ? `${Math.round(imageAspect * 1000)}:1000` : undefined,
  });
}

/**
 * flat-wide 模式：不走球面渲染，直接对源图做 2D 居中 crop（保留旧 extractFlatCrop 的行为）。
 */
async function snapshotFlatCrop(options: PanoramaSnapshotOptions): Promise<PanoramaSnapshotResult> {
  const { sourceUrl, yaw, pitch, fovDeg, width: outW, height: outH } = options;
  const { url, revoke } = await resolveLoadableUrl(sourceUrl);
  try {
    const img = await loadHtmlImage(url);
    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;
    if (!srcW || !srcH) throw new Error('无法读取全景图尺寸');

    const fovRatio = fovDeg / 90;
    const cropW = Math.min(srcW, srcW * fovRatio);
    const cropH = cropW * (outH / outW);
    const offsetX = (yaw / Math.PI) * (srcW - cropW) * 0.5;
    const offsetY = -(pitch / (Math.PI / 2)) * (srcH - cropH) * 0.5;
    const cropX = Math.max(0, Math.min(srcW - cropW, srcW * 0.5 - cropW * 0.5 + offsetX));
    const cropY = Math.max(0, Math.min(srcH - cropH, srcH * 0.5 - cropH * 0.5 + offsetY));

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('无法创建输出 canvas');
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
    return { dataUrl: out.toDataURL('image/png'), width: outW, height: outH };
  } finally {
    revoke?.();
  }
}

/**
 * 单张视角离屏抽取。
 */
export async function snapshotPanoramaPerspective(
  options: PanoramaSnapshotOptions,
): Promise<PanoramaSnapshotResult> {
  if (options.projectionMode === 'flat-wide') {
    return snapshotFlatCrop(options);
  }

  const loaded = await loadPanoramaTexture(options.sourceUrl);
  const imageAspect = (() => {
    const img = loaded.texture.image as { width?: number; height?: number } | undefined;
    if (img && img.width && img.height) return img.width / img.height;
    return undefined;
  })();
  const viewerMode = resolveViewerMode(options, imageAspect);

  const canvas = document.createElement('canvas');
  canvas.width = options.width;
  canvas.height = options.height;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(1);
  renderer.setSize(options.width, options.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE_BG_COLOR);
  const mesh = buildPanoramaMesh(viewerMode, loaded.texture);
  scene.add(mesh);

  const camera = new THREE.PerspectiveCamera(
    options.fovDeg,
    options.width / options.height,
    0.1,
    1000,
  );
  applyPanoramaCameraLookAt(camera, options.yaw, options.pitch);
  camera.updateProjectionMatrix();

  try {
    renderer.render(scene, camera);
    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: options.width,
      height: options.height,
    };
  } finally {
    scene.remove(mesh);
    disposePanoramaMesh(mesh);
    loaded.texture.dispose();
    loaded.revoke?.();
    renderer.dispose();
  }
}

/**
 * 批量视角抽取。共享单个 WebGLRenderer + 单次纹理加载，按需切相机 + 重渲。
 * 一次性循环全部 view，每张完成后通过 onProgress 回调；调用方可以增量写入 UI。
 */
export async function snapshotPanoramaPerspectives(
  sourceUrl: string,
  projectionMode: LinghuiPanoramaProjectionMode,
  views: PanoramaSnapshotView[],
  options?: { viewerMode?: PanoramaViewerMode; onProgress?: (index: number, result: PanoramaSnapshotResult) => void },
): Promise<PanoramaSnapshotResult[]> {
  if (views.length === 0) return [];

  if (projectionMode === 'flat-wide') {
    const results: PanoramaSnapshotResult[] = [];
    for (let i = 0; i < views.length; i += 1) {
      const r = await snapshotFlatCrop({ sourceUrl, projectionMode, ...views[i] });
      results.push(r);
      options?.onProgress?.(i, r);
    }
    return results;
  }

  const loaded = await loadPanoramaTexture(sourceUrl);
  const imageAspect = (() => {
    const img = loaded.texture.image as { width?: number; height?: number } | undefined;
    if (img && img.width && img.height) return img.width / img.height;
    return undefined;
  })();
  const viewerMode = options?.viewerMode ?? resolveViewerMode(
    { sourceUrl, projectionMode, ...views[0] },
    imageAspect,
  );

  // 用最大尺寸建一次 canvas/renderer；每张前 setSize 到目标尺寸再渲染。
  const maxW = views.reduce((m, v) => Math.max(m, v.width), 0);
  const maxH = views.reduce((m, v) => Math.max(m, v.height), 0);
  const canvas = document.createElement('canvas');
  canvas.width = maxW;
  canvas.height = maxH;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE_BG_COLOR);
  const mesh = buildPanoramaMesh(viewerMode, loaded.texture);
  scene.add(mesh);

  try {
    const results: PanoramaSnapshotResult[] = [];
    for (let i = 0; i < views.length; i += 1) {
      const view = views[i];
      renderer.setSize(view.width, view.height, false);
      const camera = new THREE.PerspectiveCamera(view.fovDeg, view.width / view.height, 0.1, 1000);
      applyPanoramaCameraLookAt(camera, view.yaw, view.pitch);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);

      // canvas.toDataURL 在每次 setSize 后只会输出当前尺寸的内容
      const dataUrl = canvas.toDataURL('image/png');
      const result = { dataUrl, width: view.width, height: view.height };
      results.push(result);
      options?.onProgress?.(i, result);
    }
    return results;
  } finally {
    scene.remove(mesh);
    disposePanoramaMesh(mesh);
    loaded.texture.dispose();
    loaded.revoke?.();
    renderer.dispose();
  }
}
