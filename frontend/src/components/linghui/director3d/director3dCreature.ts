/**
 * 动物 / 玄幻生物 (creature) 统一系统。
 *
 * 设计目标：
 *  - 同一 actor type = 'creature'，通过 species 区分（lion / wolf / tiger / dragon / phoenix ...）
 *  - 几何统一为"四足骨架 + 头 + 尾 + 可选翅"，每 species 调比例 + 颜色 + 翅/角开关
 *  - 预置动作（idle / walk / run / pounce / fly）：每动作记录骨架关节角度，
 *    与人形 mannequin 的 rig 系统类比，支持时间轴关节级插值动画
 *  - prompt fragment 把 species + 动作 + 配色写成英文，让下游 AI 看懂"a lion in mid-pounce"
 */

export type CreatureSpeciesKind =
  // 现实动物
  | 'lion' | 'wolf' | 'tiger' | 'bear' | 'horse' | 'eagle'
  // 玄幻生物
  | 'dragon' | 'phoenix' | 'qilin' | 'fox' | 'deer' | 'crane';

export type CreatureFormFactor =
  /** 四足陆地：lion / wolf / tiger / bear / horse / qilin / fox / deer */
  | 'quadruped'
  /** 飞禽：eagle / phoenix / crane（双足 + 大翅膀） */
  | 'avian'
  /** 巨蛇/龙形（四足 + 翅 + 长躯干，玄幻东方 dragon） */
  | 'serpent-dragon';

export interface CreatureSpeciesSpec {
  kind: CreatureSpeciesKind;
  label: string;
  english: string;
  form: CreatureFormFactor;
  /** 身高（米，从脚到躯干顶；avian 用站立高度） */
  bodyHeight: number;
  /** 身长（米） */
  bodyLength: number;
  /** 默认配色（CSS 颜色） */
  color: string;
  /** 是否有翅膀 */
  hasWings: boolean;
  /** 是否有犄角 / 鹿角 */
  hasHorns: boolean;
  /** 鬣毛 / 颈毛（lion / qilin）；渲染时颈部加一圈 */
  hasMane: boolean;
  /** prompt 描述短语（让 AI 看懂气质） */
  promptHint: string;
}

export const CREATURE_SPECIES_LIBRARY: CreatureSpeciesSpec[] = [
  // ───── 现实动物 ─────
  { kind: 'lion', label: '狮子', english: 'lion', form: 'quadruped',
    bodyHeight: 1.1, bodyLength: 2.0, color: '#c9966b', hasWings: false, hasHorns: false, hasMane: true,
    promptHint: 'majestic adult lion with thick mane, muscular build, golden fur',
  },
  { kind: 'wolf', label: '狼', english: 'wolf', form: 'quadruped',
    bodyHeight: 0.85, bodyLength: 1.6, color: '#7a7a7a', hasWings: false, hasHorns: false, hasMane: false,
    promptHint: 'lean grey wolf with sharp eyes, alert posture, dense fur',
  },
  { kind: 'tiger', label: '老虎', english: 'tiger', form: 'quadruped',
    bodyHeight: 1.0, bodyLength: 2.2, color: '#d97a3a', hasWings: false, hasHorns: false, hasMane: false,
    promptHint: 'powerful tiger with vivid orange-and-black stripes, muscular shoulders',
  },
  { kind: 'bear', label: '熊', english: 'bear', form: 'quadruped',
    bodyHeight: 1.4, bodyLength: 2.1, color: '#5a3a26', hasWings: false, hasHorns: false, hasMane: false,
    promptHint: 'massive brown bear, heavy frame, thick fur, broad muzzle',
  },
  { kind: 'horse', label: '马', english: 'horse', form: 'quadruped',
    bodyHeight: 1.6, bodyLength: 2.4, color: '#6b4630', hasWings: false, hasHorns: false, hasMane: true,
    promptHint: 'athletic horse with flowing mane and tail, long legs, sleek body',
  },
  { kind: 'eagle', label: '鹰', english: 'eagle', form: 'avian',
    bodyHeight: 0.9, bodyLength: 1.0, color: '#3a2818', hasWings: true, hasHorns: false, hasMane: false,
    promptHint: 'golden eagle with broad wingspan, hooked beak, sharp talons',
  },

  // ───── 玄幻生物 ─────
  { kind: 'dragon', label: '神龙', english: 'eastern dragon', form: 'serpent-dragon',
    bodyHeight: 1.6, bodyLength: 6.0, color: '#3a8a4a', hasWings: true, hasHorns: true, hasMane: true,
    promptHint: 'eastern dragon, long serpentine body, scaled skin, antlers, flowing whiskers, claws',
  },
  { kind: 'phoenix', label: '凤凰', english: 'phoenix', form: 'avian',
    bodyHeight: 1.4, bodyLength: 1.6, color: '#d4452e', hasWings: true, hasHorns: false, hasMane: false,
    promptHint: 'mythical phoenix with flaming red-gold plumage, long tail feathers, radiant aura',
  },
  { kind: 'qilin', label: '麒麟', english: 'qilin', form: 'quadruped',
    bodyHeight: 1.5, bodyLength: 2.3, color: '#c9a058', hasWings: false, hasHorns: true, hasMane: true,
    promptHint: 'qilin with deer-like body, dragon-scale armor, antlers, fiery mane',
  },
  { kind: 'fox', label: '灵狐', english: 'spirit fox', form: 'quadruped',
    bodyHeight: 0.55, bodyLength: 1.1, color: '#e08454', hasWings: false, hasHorns: false, hasMane: false,
    promptHint: 'mystical nine-tailed fox spirit, slender body, multiple flowing tails, ethereal glow',
  },
  { kind: 'deer', label: '神鹿', english: 'sacred deer', form: 'quadruped',
    bodyHeight: 1.3, bodyLength: 1.8, color: '#a87a52', hasWings: false, hasHorns: true, hasMane: false,
    promptHint: 'sacred deer with elegant antlers, slender legs, glowing markings',
  },
  { kind: 'crane', label: '仙鹤', english: 'celestial crane', form: 'avian',
    bodyHeight: 1.5, bodyLength: 1.4, color: '#f0f0f0', hasWings: true, hasHorns: false, hasMane: false,
    promptHint: 'white celestial crane with crimson crown, long elegant neck, large outstretched wings',
  },
];

export function findCreatureSpecies(kind: CreatureSpeciesKind | undefined): CreatureSpeciesSpec {
  return CREATURE_SPECIES_LIBRARY.find(s => s.kind === kind) ?? CREATURE_SPECIES_LIBRARY[0];
}

/**
 * 生物骨架关节。比 mannequin 简单：4 条腿/翅 + 头 + 尾 + 躯干。
 * 飞禽 species：frontLegs* 解读为翅膀。
 */
export interface CreatureRig {
  /** 躯干俯仰 / 转身 / 侧倾，弧度 */
  spine: [number, number, number];
  /** 颈部 + 头部 */
  neck: [number, number, number];
  /** 左前腿（avian：左翼根部，serpent-dragon：前左爪） */
  frontLeftLeg: [number, number, number];
  frontRightLeg: [number, number, number];
  /** 后腿（avian：站立小腿） */
  rearLeftLeg: [number, number, number];
  rearRightLeg: [number, number, number];
  /** 尾巴（弯曲） */
  tail: [number, number, number];
}

const ZERO: [number, number, number] = [0, 0, 0];

export const CREATURE_NEUTRAL_RIG: CreatureRig = {
  spine: ZERO, neck: ZERO,
  frontLeftLeg: ZERO, frontRightLeg: ZERO,
  rearLeftLeg: ZERO, rearRightLeg: ZERO,
  tail: ZERO,
};

export type CreatureAction = 'idle' | 'walk' | 'run' | 'pounce' | 'fly' | 'roar';

/**
 * 每个动作对应一份关节角度。所有 species 共享这套动作（quadruped / avian / dragon），
 * 渲染时 avian species 把"前腿"关节当翼根用、"后腿"当站立腿用。
 */
export const CREATURE_ACTION_RIGS: Record<CreatureAction, CreatureRig> = {
  idle: {
    ...CREATURE_NEUTRAL_RIG,
  },
  walk: {
    spine: [0, 0, 0], neck: [0.05, 0, 0],
    frontLeftLeg: [0.35, 0, 0], frontRightLeg: [-0.35, 0, 0],
    rearLeftLeg: [-0.35, 0, 0], rearRightLeg: [0.35, 0, 0],
    tail: [-0.15, 0.2, 0],
  },
  run: {
    spine: [-0.15, 0, 0], neck: [0.15, 0, 0],
    frontLeftLeg: [0.9, 0, 0], frontRightLeg: [-0.6, 0, 0],
    rearLeftLeg: [-0.9, 0, 0], rearRightLeg: [0.6, 0, 0],
    tail: [-0.3, 0, 0],
  },
  pounce: {
    spine: [-0.55, 0, 0], neck: [0.4, 0, 0],
    frontLeftLeg: [1.2, 0, 0.2], frontRightLeg: [1.2, 0, -0.2],
    rearLeftLeg: [-0.8, 0, 0.1], rearRightLeg: [-0.8, 0, -0.1],
    tail: [-0.5, 0, 0],
  },
  fly: {
    // 飞行：spine 微抬，"前腿"轴 0 大幅外摆（翼根上抬）
    spine: [-0.05, 0, 0], neck: [0.1, 0, 0],
    frontLeftLeg: [0, 0, 1.0], frontRightLeg: [0, 0, -1.0],
    rearLeftLeg: [0.4, 0, 0], rearRightLeg: [0.4, 0, 0],
    tail: [0.2, 0, 0],
  },
  roar: {
    spine: [-0.1, 0, 0], neck: [-0.5, 0, 0],
    frontLeftLeg: [0, 0, 0.1], frontRightLeg: [0, 0, -0.1],
    rearLeftLeg: ZERO, rearRightLeg: ZERO,
    tail: [-0.1, 0, 0],
  },
};

export const CREATURE_ACTION_OPTIONS: Array<{ key: CreatureAction; label: string }> = [
  { key: 'idle', label: '站立' },
  { key: 'walk', label: '行走' },
  { key: 'run', label: '奔跑' },
  { key: 'pounce', label: '扑击' },
  { key: 'fly', label: '飞行' },
  { key: 'roar', label: '咆哮' },
];

export function resolveCreatureRig(rig: CreatureRig | undefined, action: CreatureAction): CreatureRig {
  if (rig) return rig;
  return CREATURE_ACTION_RIGS[action] ?? CREATURE_ACTION_RIGS.idle;
}

function lerpScalar(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function lerpJoint(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [lerpScalar(a[0], b[0], t), lerpScalar(a[1], b[1], t), lerpScalar(a[2], b[2], t)];
}

export function lerpCreatureRig(start: CreatureRig | undefined, end: CreatureRig | undefined, t: number): CreatureRig {
  const a = start ?? CREATURE_NEUTRAL_RIG;
  const b = end ?? CREATURE_NEUTRAL_RIG;
  if (t <= 0) return a;
  if (t >= 1) return b;
  return {
    spine: lerpJoint(a.spine, b.spine, t),
    neck: lerpJoint(a.neck, b.neck, t),
    frontLeftLeg: lerpJoint(a.frontLeftLeg, b.frontLeftLeg, t),
    frontRightLeg: lerpJoint(a.frontRightLeg, b.frontRightLeg, t),
    rearLeftLeg: lerpJoint(a.rearLeftLeg, b.rearLeftLeg, t),
    rearRightLeg: lerpJoint(a.rearRightLeg, b.rearRightLeg, t),
    tail: lerpJoint(a.tail, b.tail, t),
  };
}
