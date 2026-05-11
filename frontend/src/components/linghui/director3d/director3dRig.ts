/**
 * 主角假人骨骼绑定（rig）+ 预置动作库。
 *
 * 设计取舍：
 *  - 不引入完整骨骼蒙皮（不 import GLTF / 不做 SkinnedMesh），保持 procedural 几何 + 多级 group 嵌套
 *  - 每个关节存局部旋转（弧度，Euler XYZ）；渲染时 Mannequin 组件直接挂在 group rotation 上
 *  - 关节角度可线性插值 → 关键帧之间做连续骨骼动画
 *  - posePreset 字符串仍保留作为入口（兼容老 scene），preset → rig 通过 RIG_PRESETS 查表
 *
 * 12 个关节：
 *  - spine (躯干前后 + 左右倾)
 *  - neck (头部俯仰 + 转向)
 *  - left/right shoulder (肩部 pitch + 外展)
 *  - left/right elbow (前臂弯曲，单轴 X)
 *  - left/right hip (大腿前后摆 + 外展)
 *  - left/right knee (小腿弯曲，单轴 X)
 */
import type { LinghuiDirector3DActorPose } from '../../../types/linghui';

export type Director3DJointRotation = [number, number, number];

/**
 * 骨骼姿态（rig）。所有字段都是欧拉角弧度，应用顺序 XYZ。
 * actor.rotationY 仍由 actor.rotationY 顶层旋转控制，rig 只描述局部关节。
 *
 * 注意：与 types/linghui.ts 的 LinghuiDirector3DRig 同构（同字段同形状）。
 * 拆成两个文件是因为 rig 这个文件还顺带定义预置库 + lerp helper，
 * 把数据 + 算法收敛在一处方便维护。
 */
export interface Director3DRig {
  spine: Director3DJointRotation;
  neck: Director3DJointRotation;
  leftShoulder: Director3DJointRotation;
  rightShoulder: Director3DJointRotation;
  leftElbow: Director3DJointRotation;
  rightElbow: Director3DJointRotation;
  leftHip: Director3DJointRotation;
  rightHip: Director3DJointRotation;
  leftKnee: Director3DJointRotation;
  rightKnee: Director3DJointRotation;
}

const ZERO: Director3DJointRotation = [0, 0, 0];

/**
 * 中立站立 rig：所有关节角度为 0，作为兜底。
 */
export const NEUTRAL_RIG: Director3DRig = {
  spine: ZERO,
  neck: ZERO,
  leftShoulder: ZERO,
  rightShoulder: ZERO,
  leftElbow: ZERO,
  rightElbow: ZERO,
  leftHip: ZERO,
  rightHip: ZERO,
  leftKnee: ZERO,
  rightKnee: ZERO,
};

/**
 * 12 个动作的关节角度预置。
 *
 * 命名规约：
 *  - 关节按 mannequin 自身坐标系（朝 +Z 看相机时，+X 是角色的左手侧）
 *  - shoulder.x 正 = 手臂向后摆，负 = 向前摆
 *  - shoulder.z 正 = 手臂外展（左肩往左外展 = +z；右肩往右外展 = -z）
 *  - elbow.x 始终非正（前臂只朝身前弯，0 ≈ 自然下垂略弯）
 *  - hip.x 正 = 大腿向前迈，负 = 向后；knee.x 非正
 *  - spine.x 正 = 后仰，负 = 前倾
 */
export const RIG_PRESETS: Record<LinghuiDirector3DActorPose, Director3DRig> = {
  idle: {
    ...NEUTRAL_RIG,
    leftShoulder: [0, 0, 0.06],
    rightShoulder: [0, 0, -0.06],
    leftElbow: [-0.15, 0, 0],
    rightElbow: [-0.15, 0, 0],
  },
  walk: {
    spine: [-0.05, 0, 0],
    neck: [0, 0, 0],
    leftShoulder: [-0.5, 0, 0.05],
    rightShoulder: [0.5, 0, -0.05],
    leftElbow: [-0.6, 0, 0],
    rightElbow: [-0.6, 0, 0],
    leftHip: [0.4, 0, 0],
    rightHip: [-0.4, 0, 0],
    leftKnee: [-0.4, 0, 0],
    rightKnee: [-0.1, 0, 0],
  },
  run: {
    spine: [-0.18, 0, 0],
    neck: [0.06, 0, 0],
    leftShoulder: [-1.1, 0, 0.08],
    rightShoulder: [1.0, 0, -0.08],
    leftElbow: [-1.6, 0, 0],
    rightElbow: [-1.6, 0, 0],
    leftHip: [0.8, 0, 0],
    rightHip: [-0.8, 0, 0],
    leftKnee: [-1.2, 0, 0],
    rightKnee: [-0.2, 0, 0],
  },
  sit: {
    spine: [0.02, 0, 0],
    neck: [0, 0, 0],
    leftShoulder: [0, 0, 0.06],
    rightShoulder: [0, 0, -0.06],
    leftElbow: [-0.4, 0, 0],
    rightElbow: [-0.4, 0, 0],
    leftHip: [-1.5, 0, 0.06],
    rightHip: [-1.5, 0, -0.06],
    leftKnee: [-1.5, 0, 0],
    rightKnee: [-1.5, 0, 0],
  },
  wave: {
    spine: [0, 0, 0.02],
    neck: [0, 0, 0],
    leftShoulder: [0, 0, 0.06],
    rightShoulder: [-2.4, 0, -0.5],
    leftElbow: [-0.15, 0, 0],
    rightElbow: [-1.2, 0, 0],
    leftHip: ZERO,
    rightHip: ZERO,
    leftKnee: ZERO,
    rightKnee: ZERO,
  },
  point: {
    spine: [-0.05, 0, 0],
    neck: [0, 0.2, 0],
    leftShoulder: [0, 0, 0.06],
    rightShoulder: [-1.4, 0.4, -0.05],
    leftElbow: [-0.15, 0, 0],
    rightElbow: [-0.05, 0, 0],
    leftHip: ZERO,
    rightHip: ZERO,
    leftKnee: ZERO,
    rightKnee: ZERO,
  },
};

/**
 * 扩展预置动作集（更丰富的电影语言）。
 * 这些键不在 LinghuiDirector3DActorPose 枚举中，作为新增 rig-only 预置；
 * 用户可在 UI 上挑选这些 rig 名字，setPose 时把 rig 写到 actor.rig，
 * posePreset 仍保留为 idle 以维持向后兼容。
 */
export const EXTENDED_RIG_PRESETS = {
  /** 端枪 / 持械瞄准：双手前伸到胸前 */
  aim: {
    spine: [-0.05, 0.05, 0],
    neck: [0, 0.05, 0],
    leftShoulder: [-1.2, 0, 0.05],
    rightShoulder: [-1.4, 0, -0.05],
    leftElbow: [-1.0, 0, 0],
    rightElbow: [-1.4, 0, 0],
    leftHip: [0.1, 0, 0.08],
    rightHip: [-0.1, 0, -0.08],
    leftKnee: [-0.15, 0, 0],
    rightKnee: [-0.05, 0, 0],
  },
  /** 右拳直拳出击 */
  punch: {
    spine: [0, 0.25, 0],
    neck: [0, 0, 0],
    leftShoulder: [-0.4, 0, 0.2],
    rightShoulder: [-1.55, 0, -0.05],
    leftElbow: [-1.4, 0, 0],
    rightElbow: [-0.1, 0, 0],
    leftHip: [0.1, 0, 0],
    rightHip: [-0.1, 0, 0],
    leftKnee: [-0.05, 0, 0],
    rightKnee: [-0.05, 0, 0],
  },
  /** 蹲下：膝盖深屈，躯干前倾 */
  crouch: {
    spine: [-0.35, 0, 0],
    neck: [0.15, 0, 0],
    leftShoulder: [-0.5, 0, 0.1],
    rightShoulder: [-0.5, 0, -0.1],
    leftElbow: [-1.1, 0, 0],
    rightElbow: [-1.1, 0, 0],
    leftHip: [-1.2, 0, 0.1],
    rightHip: [-1.2, 0, -0.1],
    leftKnee: [-1.6, 0, 0],
    rightKnee: [-1.6, 0, 0],
  },
  /** 双手举起欢呼 */
  cheer: {
    spine: [0.08, 0, 0],
    neck: [-0.15, 0, 0],
    leftShoulder: [-2.6, 0, 0.4],
    rightShoulder: [-2.6, 0, -0.4],
    leftElbow: [-0.5, 0, 0],
    rightElbow: [-0.5, 0, 0],
    leftHip: ZERO,
    rightHip: ZERO,
    leftKnee: ZERO,
    rightKnee: ZERO,
  },
  /** 趴地：躯干水平，四肢张开（俯姿匍匐） */
  prone: {
    spine: [-1.55, 0, 0],
    neck: [0.4, 0, 0],
    leftShoulder: [-1.5, 0, 0.4],
    rightShoulder: [-1.5, 0, -0.4],
    leftElbow: [-1.4, 0, 0],
    rightElbow: [-1.4, 0, 0],
    leftHip: [0, 0, 0.05],
    rightHip: [0, 0, -0.05],
    leftKnee: ZERO,
    rightKnee: ZERO,
  },
  /** 转身回头 */
  turnBack: {
    spine: [0, 0.4, 0],
    neck: [0, 0.6, 0],
    leftShoulder: [-0.2, 0, 0.06],
    rightShoulder: [0.2, 0, -0.06],
    leftElbow: [-0.3, 0, 0],
    rightElbow: [-0.3, 0, 0],
    leftHip: [0, 0.1, 0],
    rightHip: [0, -0.1, 0],
    leftKnee: [-0.05, 0, 0],
    rightKnee: [-0.05, 0, 0],
  },
} as const satisfies Record<string, Director3DRig>;

export type ExtendedRigKey = keyof typeof EXTENDED_RIG_PRESETS;

export type Director3DRigJointKey = keyof Director3DRig;

/**
 * 骨骼关节的中文标签与轴约束（用户在 inspector 拖 slider 时看到的友好名称）。
 * 顺序按"上→下、躯干→四肢"排，方便用户找到关节。
 */
export interface Director3DJointMeta {
  key: Director3DRigJointKey;
  label: string;
  /** 哪些轴有意义（其他轴保持 0，避免给用户三个滑块但实际只有一个有用） */
  axes: Array<{ axis: 0 | 1 | 2; name: string; hint: string }>;
}

export const DIRECTOR3D_JOINT_META: Director3DJointMeta[] = [
  {
    key: 'spine',
    label: '躯干',
    axes: [
      { axis: 0, name: '俯仰', hint: '正值后仰 / 负值前倾' },
      { axis: 1, name: '转身', hint: '左右转动腰部' },
      { axis: 2, name: '侧倾', hint: '左右倾斜' },
    ],
  },
  {
    key: 'neck',
    label: '头部',
    axes: [
      { axis: 0, name: '俯仰', hint: '正值仰头 / 负值低头' },
      { axis: 1, name: '左右转', hint: '正值向左 / 负值向右' },
      { axis: 2, name: '侧倾', hint: '歪头' },
    ],
  },
  {
    key: 'leftShoulder',
    label: '左肩',
    axes: [
      { axis: 0, name: '前后摆', hint: '负值前摆 / 正值后摆' },
      { axis: 1, name: '水平转', hint: '横向旋转' },
      { axis: 2, name: '外展', hint: '正值上抬外展' },
    ],
  },
  {
    key: 'rightShoulder',
    label: '右肩',
    axes: [
      { axis: 0, name: '前后摆', hint: '负值前摆 / 正值后摆' },
      { axis: 1, name: '水平转', hint: '横向旋转' },
      { axis: 2, name: '外展', hint: '负值上抬外展' },
    ],
  },
  {
    key: 'leftElbow',
    label: '左肘',
    axes: [
      { axis: 0, name: '弯曲', hint: '负值前臂内收' },
    ],
  },
  {
    key: 'rightElbow',
    label: '右肘',
    axes: [
      { axis: 0, name: '弯曲', hint: '负值前臂内收' },
    ],
  },
  {
    key: 'leftHip',
    label: '左髋',
    axes: [
      { axis: 0, name: '前后摆', hint: '正值前迈 / 负值后摆' },
      { axis: 1, name: '左右转', hint: '腿向内 / 外旋转' },
      { axis: 2, name: '外展', hint: '正值向外打开' },
    ],
  },
  {
    key: 'rightHip',
    label: '右髋',
    axes: [
      { axis: 0, name: '前后摆', hint: '正值前迈 / 负值后摆' },
      { axis: 1, name: '左右转', hint: '腿向内 / 外旋转' },
      { axis: 2, name: '外展', hint: '负值向外打开' },
    ],
  },
  {
    key: 'leftKnee',
    label: '左膝',
    axes: [
      { axis: 0, name: '弯曲', hint: '负值小腿后弯' },
    ],
  },
  {
    key: 'rightKnee',
    label: '右膝',
    axes: [
      { axis: 0, name: '弯曲', hint: '负值小腿后弯' },
    ],
  },
];

/**
 * 把当前 actor.rig（缺省时按 posePreset 补齐）+ 关节级 patch 合并成新的 rig。
 * 不在这里写到 actor.rig，调用方负责 setActor / updateNodeData。
 */
export function patchRigJoint(
  baseRig: Director3DRig,
  jointKey: Director3DRigJointKey,
  axis: 0 | 1 | 2,
  value: number,
): Director3DRig {
  const current = baseRig[jointKey];
  const next: Director3DJointRotation = [...current];
  next[axis] = value;
  return {
    ...baseRig,
    [jointKey]: next,
  };
}

/**
 * 所有可选的"预置动作"清单（UI 下拉用）。
 *  - 基础 6 个（与 LinghuiDirector3DActorPose 同名）来自 RIG_PRESETS
 *  - 扩展 6 个来自 EXTENDED_RIG_PRESETS
 */
export const DIRECTOR3D_RIG_PRESET_OPTIONS: Array<{
  key: string;
  label: string;
  rig: Director3DRig;
  /** 与传统 LinghuiDirector3DActorPose 同名时，对应的 pose 字符串 */
  posePreset?: LinghuiDirector3DActorPose;
}> = [
  { key: 'idle', label: '站立', rig: RIG_PRESETS.idle, posePreset: 'idle' },
  { key: 'walk', label: '步行', rig: RIG_PRESETS.walk, posePreset: 'walk' },
  { key: 'run', label: '奔跑', rig: RIG_PRESETS.run, posePreset: 'run' },
  { key: 'sit', label: '坐姿', rig: RIG_PRESETS.sit, posePreset: 'sit' },
  { key: 'wave', label: '挥手', rig: RIG_PRESETS.wave, posePreset: 'wave' },
  { key: 'point', label: '指向', rig: RIG_PRESETS.point, posePreset: 'point' },
  { key: 'aim', label: '瞄准', rig: EXTENDED_RIG_PRESETS.aim },
  { key: 'punch', label: '直拳', rig: EXTENDED_RIG_PRESETS.punch },
  { key: 'crouch', label: '蹲下', rig: EXTENDED_RIG_PRESETS.crouch },
  { key: 'cheer', label: '欢呼', rig: EXTENDED_RIG_PRESETS.cheer },
  { key: 'prone', label: '匍匐', rig: EXTENDED_RIG_PRESETS.prone },
  { key: 'turnBack', label: '回头', rig: EXTENDED_RIG_PRESETS.turnBack },
];

/**
 * 解析 actor.rig，若不存在则回退到 posePreset 对应预置。
 * 这样老数据（只有 posePreset 没有 rig）仍能正确渲染。
 */
export function resolveActorRig(
  rig: Director3DRig | undefined,
  posePreset: LinghuiDirector3DActorPose,
): Director3DRig {
  if (rig) return rig;
  return RIG_PRESETS[posePreset] ?? RIG_PRESETS.idle;
}

function lerpScalar(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpJoint(a: Director3DJointRotation, b: Director3DJointRotation, t: number): Director3DJointRotation {
  return [
    lerpScalar(a[0], b[0], t),
    lerpScalar(a[1], b[1], t),
    lerpScalar(a[2], b[2], t),
  ];
}

/**
 * rig 关节级线性插值。a/b 任意一个 undefined 时，按"中立站立"补齐再插值。
 * 用于 timeline 关键帧之间的连续骨骼动画。
 */
export function lerpRig(
  start: Director3DRig | undefined,
  end: Director3DRig | undefined,
  t: number,
): Director3DRig {
  const a = start ?? NEUTRAL_RIG;
  const b = end ?? NEUTRAL_RIG;
  if (t <= 0) return a;
  if (t >= 1) return b;
  return {
    spine: lerpJoint(a.spine, b.spine, t),
    neck: lerpJoint(a.neck, b.neck, t),
    leftShoulder: lerpJoint(a.leftShoulder, b.leftShoulder, t),
    rightShoulder: lerpJoint(a.rightShoulder, b.rightShoulder, t),
    leftElbow: lerpJoint(a.leftElbow, b.leftElbow, t),
    rightElbow: lerpJoint(a.rightElbow, b.rightElbow, t),
    leftHip: lerpJoint(a.leftHip, b.leftHip, t),
    rightHip: lerpJoint(a.rightHip, b.rightHip, t),
    leftKnee: lerpJoint(a.leftKnee, b.leftKnee, t),
    rightKnee: lerpJoint(a.rightKnee, b.rightKnee, t),
  };
}

/**
 * 给 LLM / video provider 看的姿态英文描述，用于 prompt 拼接。
 * 取关节最大角度做粗粒度判断，避免 prompt 太啰嗦。
 */
export function describeRigForPrompt(rig: Director3DRig): string {
  const fragments: string[] = [];
  const armRaiseLeft = -rig.leftShoulder[0];
  const armRaiseRight = -rig.rightShoulder[0];
  const kneeBendLeft = -rig.leftKnee[0];
  const kneeBendRight = -rig.rightKnee[0];
  const spineLean = -rig.spine[0];

  if (armRaiseRight > 2.0 || armRaiseLeft > 2.0) {
    fragments.push('arm raised overhead');
  } else if (armRaiseRight > 1.0 || armRaiseLeft > 1.0) {
    fragments.push('arm extended forward');
  }
  if (kneeBendLeft > 1.4 && kneeBendRight > 1.4) {
    fragments.push('crouched, knees deeply bent');
  } else if (kneeBendLeft > 0.8 || kneeBendRight > 0.8) {
    fragments.push('mid-stride, knee bent');
  }
  if (spineLean > 0.15) {
    fragments.push('leaning forward');
  } else if (spineLean < -0.15) {
    fragments.push('leaning back');
  }
  if (rig.neck[1] > 0.4 || rig.neck[1] < -0.4) {
    fragments.push('head turned to side');
  }
  return fragments.join(', ');
}
