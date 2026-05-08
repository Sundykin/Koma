/**
 * Director3D 场景模型与默认值。
 *
 * 整套 schema 在 types/linghui.ts，这里只放默认值、克隆与简单 prompt 编译。
 *
 * 坐标约定：
 *   X = 画面左右 / 世界左右
 *   Y = 高度（地面 = 0，1 单位 ≈ 1 米）
 *   Z = 前后深度
 *
 * 默认人物身高 1.75，相机高 1.55，距离演员 ~3 米。
 */
import type {
  LinghuiDirector3DActor,
  LinghuiDirector3DActorPose,
  LinghuiDirector3DBackground,
  LinghuiDirector3DCamera,
  LinghuiDirector3DScene,
} from '../../../types/linghui';
import { DIRECTOR3D_ACTOR_COLOR_TOKENS } from './director3dColors';

const ACTOR_DEFAULT_COLORS = DIRECTOR3D_ACTOR_COLOR_TOKENS;

export const DIRECTOR3D_POSE_OPTIONS: Array<{ value: LinghuiDirector3DActorPose; label: string }> = [
  { value: 'idle', label: '站立' },
  { value: 'walk', label: '走路' },
  { value: 'run', label: '跑' },
  { value: 'sit', label: '坐' },
  { value: 'wave', label: '挥手' },
  { value: 'point', label: '指向' },
];

export function defaultDirector3DCamera(): LinghuiDirector3DCamera {
  return {
    position: [0, 1.55, 4.5],
    target: [0, 1.6, 0],
    fov: 35,
    roll: 0,
    aspectRatio: '16:9',
  };
}

export function defaultDirector3DBackground(): LinghuiDirector3DBackground {
  return {
    mode: 'none',
    color: 'var(--token-bg-app)',
    yawOffset: 0,
  };
}

export function createDirector3DActor(overrides: Partial<LinghuiDirector3DActor> = {}): LinghuiDirector3DActor {
  const id = overrides.id ?? `actor_${Math.random().toString(36).slice(2, 10)}`;
  const indexHint = (() => {
    const m = id.match(/(\d+)/);
    return m ? Number(m[1]) % ACTOR_DEFAULT_COLORS.length : 0;
  })();
  return {
    id,
    label: overrides.label ?? `角色${indexHint + 1}`,
    type: 'mannequin',
    position: overrides.position ?? [0, 0, 0],
    rotationY: overrides.rotationY ?? 0,
    scale: overrides.scale ?? 1,
    color: overrides.color ?? ACTOR_DEFAULT_COLORS[indexHint] ?? ACTOR_DEFAULT_COLORS[0],
    posePreset: overrides.posePreset ?? 'idle',
  };
}

export function createDefaultDirector3DScene(): LinghuiDirector3DScene {
  return {
    version: 1,
    background: defaultDirector3DBackground(),
    camera: defaultDirector3DCamera(),
    actors: [
      createDirector3DActor({
        id: 'actor_1',
        label: '角色A',
        position: [0.6, 0, 0],
        color: ACTOR_DEFAULT_COLORS[0],
      }),
      createDirector3DActor({
        id: 'actor_2',
        label: '角色B',
        position: [-0.6, 0, 0],
        color: ACTOR_DEFAULT_COLORS[1],
      }),
    ],
    render: {
      mode: 'lineart',
      showGrid: true,
      showCameraFrame: false,
      transparentBackground: false,
    },
  };
}

/**
 * 把 scene 编译成给 AI 的可读 prompt fragment。
 *
 * 用于：
 *  1. 节点输出 metadata.directorPrompt
 *  2. 下游图片节点拿来贴在 user prompt 末尾，让模型理解构图意图
 */
export function compileDirector3DPromptFragment(scene: LinghuiDirector3DScene): string {
  const fovDeg = Math.round(scene.camera.fov);
  const camPos = scene.camera.position.map(v => v.toFixed(1)).join(', ');
  const camTarget = scene.camera.target.map(v => v.toFixed(1)).join(', ');
  const lines: string[] = [
    `Camera setup: position (${camPos}), looking at (${camTarget}), FOV ${fovDeg} degrees, aspect ${scene.camera.aspectRatio}.`,
  ];

  if (scene.actors.length > 0) {
    const actorLines = scene.actors.map((actor) => {
      const pos = actor.position.map(v => v.toFixed(1)).join(', ');
      const facing = Math.round((actor.rotationY * 180) / Math.PI);
      const pose = actor.posePreset;
      return `  - ${actor.label} at (${pos}), facing ${facing}deg, pose ${pose}`;
    });
    lines.push('Actor blocking:');
    lines.push(...actorLines);
  }

  if (scene.background.mode === 'panorama') {
    lines.push('Background: panoramic environment plate, treat as wraparound background.');
  } else if (scene.background.mode === 'image-plane') {
    lines.push('Background: a single wide background plate placed behind the actors.');
  } else if (scene.background.mode === 'color') {
    lines.push('Background: clean studio colour, no scenery.');
  }

  lines.push('Use the attached line drawing as composition and pose reference. Keep camera angle, actor positions, body orientation and foreground/background depth consistent with the reference.');

  return lines.join('\n');
}
