import type {
  LinghuiDirector3DActor,
  LinghuiDirector3DActorPose,
  LinghuiDirector3DCamera,
  LinghuiDirector3DScene,
} from '../../../types/linghui';
import { DIRECTOR3D_ACTOR_COLOR_TOKENS } from './director3dColors';
import { createDirector3DActor } from './director3dAssetLibrary';

const TWO_PI = Math.PI * 2;

export const ACTOR_DEFAULT_COLORS = DIRECTOR3D_ACTOR_COLOR_TOKENS;

export interface Director3DSceneTemplate {
  id: string;
  label: string;
  hint: string;
  build: () => LinghuiDirector3DScene;
}

export function templateActor(
  index: number,
  label: string,
  position: [number, number, number],
  rotationY: number,
  posePreset: LinghuiDirector3DActorPose = 'idle',
): LinghuiDirector3DActor {
  return createDirector3DActor({
    id: `actor_tpl_${index}`,
    label,
    position,
    rotationY,
    posePreset,
    color: ACTOR_DEFAULT_COLORS[index % ACTOR_DEFAULT_COLORS.length],
  });
}

/**
 * 围绕场景中心环绕一周，输出 N 个角度的相机参数（不改 viewport 当前视角）。
 *
 * @param baseCamera 现有相机，用于继承 FOV / 比例 / 仰角等"风格"
 * @param yawDegrees 要环绕到哪些方位（度，正前为 0，正右为 90）
 * @param radius 与 target 之间的水平距离；未提供则按 baseCamera 推断
 */
export function buildOrbitCameras(
  baseCamera: LinghuiDirector3DCamera,
  yawDegrees: number[],
  radius?: number,
): LinghuiDirector3DCamera[] {
  const target = baseCamera.target;
  const dx = baseCamera.position[0] - target[0];
  const dz = baseCamera.position[2] - target[2];
  const inferredRadius = Math.sqrt(dx * dx + dz * dz);
  const r = Math.max(0.8, radius ?? inferredRadius);
  const eyeHeight = baseCamera.position[1];

  return yawDegrees.map((deg) => {
    const yaw = (deg * Math.PI) / 180;
    const wrapped = ((yaw % TWO_PI) + TWO_PI) % TWO_PI;
    return {
      ...baseCamera,
      position: [
        target[0] + Math.sin(wrapped) * r,
        eyeHeight,
        target[2] + Math.cos(wrapped) * r,
      ],
      target,
    };
  });
}

/**
 * 三视图：正面（0°）、右侧面（90°）、背面（180°）。常用于角色设计参考。
 */
export const DIRECTOR3D_THREE_VIEW_DEGREES = [0, 90, 180];

/**
 * 九宫格：环绕 8 个方位 + 顶部俯视。常用于 360 环境/角色摆位审查。
 */
export const DIRECTOR3D_ORBIT_9_DEGREES = [0, 45, 90, 135, 180, 225, 270, 315];

/** 九宫格的"俯视一张"相机（额外加进九宫格的最后一格） */
export function buildTopDownCamera(baseCamera: LinghuiDirector3DCamera, height = 6): LinghuiDirector3DCamera {
  const target = baseCamera.target;
  return {
    ...baseCamera,
    position: [target[0], height, target[2] + 0.001],
    target: [target[0], 0, target[2]],
  };
}
