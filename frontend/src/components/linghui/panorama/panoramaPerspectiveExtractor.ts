/**
 * 全景节点的视角预设：cube faces（6 张方形）与水平 8 等分。
 *
 * 真正的"全景 → 透视图"渲染在 `panoramaPerspectiveSnapshot.ts`，
 * 它复用 PanoramaViewer 的相机/几何工厂离屏渲一帧，不再走手算 (u,v)。
 *
 * 这里只保留预设角度，让批量"一键 6 视角 / 一键 8 等分"按钮和测试共用。
 */

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
