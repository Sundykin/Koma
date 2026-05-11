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
  LinghuiDirector3DKeyframeActor,
  LinghuiDirector3DEasing,
  LinghuiDirector3DKeyframe,
  LinghuiDirector3DRig,
  LinghuiDirector3DScene,
  LinghuiDirector3DTimeline,
} from '../../../types/linghui';
import { DIRECTOR3D_ACTOR_COLOR_TOKENS } from './director3dColors';
import { describeRigForPrompt, lerpRig, resolveActorRig } from './director3dRig';
import {
  CREATURE_SPECIES_LIBRARY,
  findCreatureSpecies,
  lerpCreatureRig,
  resolveCreatureRig,
  type CreatureSpeciesKind,
} from './director3dCreature';

const TWO_PI = Math.PI * 2;
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
    type: overrides.type ?? 'mannequin',
    position: overrides.position ?? [0, 0, 0],
    rotationY: overrides.rotationY ?? 0,
    scale: overrides.scale ?? 1,
    color: overrides.color ?? ACTOR_DEFAULT_COLORS[indexHint] ?? ACTOR_DEFAULT_COLORS[0],
    posePreset: overrides.posePreset ?? 'idle',
    // formation 字段仅在 type='formation' 时使用，平时不写入 actor
    ...(overrides.formation ? { formation: overrides.formation } : {}),
    // creature 字段仅在 type='creature' 时使用
    ...(overrides.species ? { species: overrides.species } : {}),
    ...(overrides.creatureAction ? { creatureAction: overrides.creatureAction } : {}),
    ...(overrides.creatureRig ? { creatureRig: overrides.creatureRig } : {}),
    // 全局资产 snapshot：referenceImages 数组 + 来源 id（弱引用，未来用于同步更新）
    ...(Array.isArray(overrides.referenceImages) && overrides.referenceImages.length > 0
      ? { referenceImages: [...overrides.referenceImages] }
      : {}),
    ...(overrides.sourceGlobalAssetId ? { sourceGlobalAssetId: overrides.sourceGlobalAssetId } : {}),
  };
}

/**
 * 道具与场景模板：
 *  - DIRECTOR3D_PROP_LIBRARY 是左栏"道具"tab 的素材；每个条目 click 即在场景中心附近落一个 actor（type≠mannequin）
 *  - DIRECTOR3D_SCENE_TEMPLATES 是左栏"模板"tab 的素材；每个条目 click 会把当前场景的 actors 整体替换 + 调整相机
 *
 * 设计意图：道具复用 actor 数据结构（position/rotationY/scale/color），与假人共用拖拽与属性面板。
 */
export type Director3DPropCategory = 'basic' | 'furniture' | 'vehicle' | 'nature' | 'gear';

export const DIRECTOR3D_PROP_CATEGORY_LABELS: Record<Director3DPropCategory, string> = {
  basic: '基础',
  furniture: '家具',
  vehicle: '载具',
  nature: '自然',
  gear: '道具',
};

export interface Director3DPropPreset {
  id: string;
  label: string;
  category: Director3DPropCategory;
  // 仅道具几何类型；假人 / 低级假人 / 方阵 / 生物都通过专门入口添加，不进 prop 库
  type: Exclude<LinghuiDirector3DActor['type'], 'mannequin' | 'mannequin-lite' | 'formation' | 'creature'>;
  scale: number;
  defaultColor?: string;
  /** 写到 prompt fragment 时用的英文术语，让 AI 看懂"这是什么道具" */
  promptHint?: string;
}

// 20+ 道具变体：底层几何只有 5 种（box/cylinder/plane/camera/arrow），但通过
// 缩放 + 颜色 + label + promptHint 表达成不同道具语义，让 AI 在 prompt 中看到具体物件名
export const DIRECTOR3D_PROP_LIBRARY: Director3DPropPreset[] = [
  // 基础几何
  { id: 'prop-box', label: '方箱', category: 'basic', type: 'prop-box', scale: 1, defaultColor: 'var(--token-text-muted)', promptHint: 'wooden crate' },
  { id: 'prop-cylinder', label: '圆柱', category: 'basic', type: 'prop-cylinder', scale: 1, defaultColor: 'var(--token-text-muted)', promptHint: 'cylindrical barrel' },
  { id: 'prop-plane', label: '墙板', category: 'basic', type: 'prop-plane', scale: 1.2, defaultColor: 'var(--token-border-strong)', promptHint: 'wall panel / partition' },
  { id: 'prop-screen', label: '屏幕', category: 'basic', type: 'prop-plane', scale: 1, defaultColor: 'var(--token-text-primary)', promptHint: 'illuminated screen / display' },

  // 家具
  { id: 'prop-table', label: '长桌', category: 'furniture', type: 'prop-box', scale: 1.4, defaultColor: 'var(--token-text-muted)', promptHint: 'long dining table' },
  { id: 'prop-chair', label: '椅子', category: 'furniture', type: 'prop-box', scale: 0.5, defaultColor: 'var(--token-text-secondary)', promptHint: 'wooden chair' },
  { id: 'prop-stool', label: '凳子', category: 'furniture', type: 'prop-cylinder', scale: 0.5, defaultColor: 'var(--token-text-secondary)', promptHint: 'short stool' },
  { id: 'prop-bed', label: '床', category: 'furniture', type: 'prop-box', scale: 1.8, defaultColor: 'var(--token-bg-elevated)', promptHint: 'single bed' },
  { id: 'prop-cabinet', label: '柜子', category: 'furniture', type: 'prop-box', scale: 1.2, defaultColor: 'var(--token-text-muted)', promptHint: 'cabinet / wardrobe' },
  { id: 'prop-door', label: '门', category: 'furniture', type: 'prop-plane', scale: 1.0, defaultColor: 'var(--token-border-strong)', promptHint: 'door frame' },
  { id: 'prop-window', label: '窗', category: 'furniture', type: 'prop-plane', scale: 0.8, defaultColor: 'var(--token-status-info)', promptHint: 'window with daylight' },

  // 载具
  { id: 'prop-car', label: '汽车', category: 'vehicle', type: 'prop-box', scale: 2.2, defaultColor: 'var(--token-status-info)', promptHint: 'sedan car' },
  { id: 'prop-bike', label: '自行车', category: 'vehicle', type: 'prop-cylinder', scale: 0.8, defaultColor: 'var(--token-status-error)', promptHint: 'bicycle' },

  // 自然
  { id: 'prop-tree', label: '树', category: 'nature', type: 'prop-cylinder', scale: 2.5, defaultColor: 'var(--token-status-success)', promptHint: 'tall tree' },
  { id: 'prop-bush', label: '灌木', category: 'nature', type: 'prop-cylinder', scale: 0.7, defaultColor: 'var(--token-status-success)', promptHint: 'shrub / bush' },
  { id: 'prop-rock', label: '岩石', category: 'nature', type: 'prop-box', scale: 0.9, defaultColor: 'var(--token-text-muted)', promptHint: 'large rock' },

  // 道具
  { id: 'prop-camera', label: '副机位', category: 'gear', type: 'prop-camera', scale: 0.9, defaultColor: 'var(--token-status-info)', promptHint: 'secondary camera marker' },
  { id: 'prop-arrow', label: '方向箭头', category: 'gear', type: 'prop-arrow', scale: 1, defaultColor: 'var(--token-status-warning)', promptHint: 'directional cue arrow' },
  { id: 'prop-light', label: '聚光灯', category: 'gear', type: 'prop-camera', scale: 0.7, defaultColor: 'var(--token-status-warning)', promptHint: 'studio spotlight' },
  { id: 'prop-mic', label: '麦克风', category: 'gear', type: 'prop-cylinder', scale: 0.28, defaultColor: 'var(--token-text-primary)', promptHint: 'studio microphone on stand' },
  { id: 'prop-pedestal', label: '基座', category: 'gear', type: 'prop-cylinder', scale: 0.6, defaultColor: 'var(--token-text-muted)', promptHint: 'low pedestal' },
];

export function createDirector3DProp(preset: Director3DPropPreset, overrides: Partial<LinghuiDirector3DActor> = {}): LinghuiDirector3DActor {
  return createDirector3DActor({
    type: preset.type,
    label: overrides.label ?? preset.label,
    scale: overrides.scale ?? preset.scale,
    color: overrides.color ?? preset.defaultColor,
    ...overrides,
  });
}

/** 角色（mannequin）预设：体型 / 颜色 / 起始姿态的常用组合 */
export interface Director3DCharacterPreset {
  id: string;
  label: string;
  hint: string;
  color: string;
  scale: number;
  posePreset: LinghuiDirector3DActorPose;
  /** 用于写到 prompt fragment 的英文人设描述（性别/年龄/气质） */
  promptDescription?: string;
}

export const DIRECTOR3D_CHARACTER_PRESETS: Director3DCharacterPreset[] = [
  {
    id: 'char-young-male',
    label: '少年',
    hint: '匀称身形，冷色',
    color: 'var(--token-status-info)',
    scale: 0.94,
    posePreset: 'idle',
    promptDescription: 'young male, slim build, medium height',
  },
  {
    id: 'char-young-female',
    label: '少女',
    hint: '稍矮，暖色',
    color: 'var(--token-status-warning)',
    scale: 0.88,
    posePreset: 'idle',
    promptDescription: 'young female, slender build, slightly shorter than male reference',
  },
  {
    id: 'char-elder',
    label: '老者',
    hint: '佝偻，灰色',
    color: 'var(--token-text-muted)',
    scale: 0.86,
    posePreset: 'idle',
    promptDescription: 'elderly person, slightly hunched, modest height',
  },
  {
    id: 'char-bulky',
    label: '壮汉',
    hint: '高大威猛',
    color: 'var(--token-status-error)',
    scale: 1.1,
    posePreset: 'idle',
    promptDescription: 'tall, broad-shouldered muscular male',
  },
  {
    id: 'char-business',
    label: '商务',
    hint: '标准身材',
    color: 'var(--token-text-primary)',
    scale: 1.0,
    posePreset: 'idle',
    promptDescription: 'business professional, average build, formal posture',
  },
  {
    id: 'char-warrior',
    label: '战士',
    hint: '强健，备战',
    color: 'var(--token-accent-base)',
    scale: 1.05,
    posePreset: 'point',
    promptDescription: 'warrior figure, athletic build, ready stance',
  },
  {
    id: 'char-child',
    label: '小孩',
    hint: '矮小',
    color: 'var(--token-status-success)',
    scale: 0.7,
    posePreset: 'idle',
    promptDescription: 'child, small stature',
  },
  {
    id: 'char-runner',
    label: '奔跑者',
    hint: '动态预设',
    color: 'var(--token-accent-hover)',
    scale: 1.0,
    posePreset: 'run',
    promptDescription: 'figure mid-run, dynamic motion',
  },
];

export function createDirector3DCharacter(preset: Director3DCharacterPreset, overrides: Partial<LinghuiDirector3DActor> = {}): LinghuiDirector3DActor {
  return createDirector3DActor({
    type: 'mannequin',
    label: overrides.label ?? preset.label,
    scale: overrides.scale ?? preset.scale,
    color: overrides.color ?? preset.color,
    posePreset: overrides.posePreset ?? preset.posePreset,
    ...overrides,
  });
}

/**
 * 阵列布阵：构造一个**整体方阵 actor**（type='formation'），rows × cols 个胶囊小人
 * 渲染时由 Director3DFormation 派生，不存独立坐标。整个方阵作为一个单元拖拽 / 旋转 /
 * 删除，**不能单独移动其中某个成员**。
 *
 *  - rows / cols：行列规模，clamp 到 [1, 12]，最多 144 个小人位
 *  - spacing：相邻小人水平间距（米），默认 1.0
 *  - origin：方阵几何中心 [x, z]，缺省 (0, -1.4)
 *  - memberFacing：方阵内部成员的相对朝向（详见 LinghuiDirector3DFormationConfig）
 *  - color：方阵统一颜色，默认取色 token 列表第一项
 *  - scale：整体缩放（不影响 spacing，只缩放每个小人胶囊体积）
 */
export interface Director3DBattalionOptions {
  rows: number;
  cols: number;
  spacing?: number;
  origin?: [number, number]; // [x, z]
  memberFacing?: 'forward' | 'away' | 'inward' | 'outward';
  color?: string;
  scale?: number;
  /** 方阵 label，默认按已有方阵数量自动递增 */
  label?: string;
}

export function createDirector3DBattalion(options: Director3DBattalionOptions): LinghuiDirector3DActor {
  const rows = Math.max(1, Math.min(12, Math.round(options.rows)));
  const cols = Math.max(1, Math.min(12, Math.round(options.cols)));
  const spacing = options.spacing && options.spacing > 0 ? options.spacing : 1.0;
  const [originX, originZ] = options.origin ?? [0, -1.4];
  const memberFacing = options.memberFacing ?? 'forward';

  return createDirector3DActor({
    type: 'formation',
    id: `formation_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    label: options.label ?? `方阵 ${rows}×${cols}`,
    position: [Number(originX.toFixed(3)), 0, Number(originZ.toFixed(3))],
    rotationY: 0,
    scale: options.scale ?? 0.92,
    color: options.color ?? DIRECTOR3D_ACTOR_COLOR_TOKENS[0],
    posePreset: 'idle',
    formation: { rows, cols, spacing, memberFacing },
  });
}

/**
 * 单兵群演占位：一个独立的 mannequin-lite，可单独拖拽。与"派兵布阵"形态完全分离。
 */
export function createDirector3DLiteSoldier(overrides: Partial<LinghuiDirector3DActor> = {}): LinghuiDirector3DActor {
  return createDirector3DActor({
    type: 'mannequin-lite',
    label: overrides.label ?? '群演',
    scale: overrides.scale ?? 0.92,
    posePreset: 'idle',
    ...overrides,
  });
}

/**
 * 动物 / 玄幻生物。species 决定几何与配色，creatureAction 决定起始姿态。
 */
export function createDirector3DCreature(
  species: CreatureSpeciesKind,
  overrides: Partial<LinghuiDirector3DActor> = {},
): LinghuiDirector3DActor {
  const spec = findCreatureSpecies(species);
  return createDirector3DActor({
    type: 'creature',
    label: overrides.label ?? spec.label,
    color: overrides.color ?? spec.color,
    scale: overrides.scale ?? 1,
    species,
    creatureAction: overrides.creatureAction ?? 'idle',
    posePreset: 'idle',
    ...overrides,
  });
}

/** 暴露 species 库给 UI 资产 tab */
export { CREATURE_SPECIES_LIBRARY };

export interface Director3DSceneTemplate {
  id: string;
  label: string;
  hint: string;
  build: () => LinghuiDirector3DScene;
}

function templateActor(
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

export const DIRECTOR3D_SCENE_TEMPLATES: Director3DSceneTemplate[] = [
  {
    id: 'tpl-dialogue',
    label: '双人对话',
    hint: '两位角色面对面，平视 OTS 取景，间距 1.4m',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [2.4, 1.55, 2.4],
        target: [0, 1.55, 0],
        fov: 36,
        roll: 0,
        aspectRatio: '16:9',
      },
      actors: [
        templateActor(0, '角色A', [-0.7, 0, 0], Math.PI / 2),
        templateActor(1, '角色B', [0.7, 0, 0], -Math.PI / 2),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-monologue',
    label: '独白特写',
    hint: '单一角色面向相机，胸上景特写，平视',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 1.55, 2.2],
        target: [0, 1.55, 0],
        fov: 32,
        roll: 0,
        aspectRatio: '4:3',
      },
      actors: [
        templateActor(0, '主角', [0, 0, 0], 0),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-triangle',
    label: '三角构图',
    hint: '三人三角站位，前一后二，广角 50mm 等效',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 1.55, 4.5],
        target: [0, 1.4, 0],
        fov: 42,
        roll: 0,
        aspectRatio: '16:9',
      },
      actors: [
        templateActor(0, '前景角色', [0, 0, 0.8], 0),
        templateActor(1, '左后角色', [-1.0, 0, -0.6], Math.PI / 6),
        templateActor(2, '右后角色', [1.0, 0, -0.6], -Math.PI / 6),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-ots',
    label: '过肩 OTS',
    hint: '从一位角色的肩后取景另一位角色，常用反应镜头',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [-1.4, 1.7, 1.6],
        target: [0.6, 1.55, 0],
        fov: 36,
        roll: 0,
        aspectRatio: '16:9',
      },
      actors: [
        templateActor(0, '前景肩部', [-0.5, 0, 0.4], Math.PI / 2.5),
        templateActor(1, '被拍主角', [0.6, 0, -0.2], -Math.PI / 2.5),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-ensemble',
    label: '群戏排布',
    hint: '五人扇形展开，远景大全景',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 1.65, 6.5],
        target: [0, 1.4, 0],
        fov: 50,
        roll: 0,
        aspectRatio: '21:9',
      },
      actors: [
        templateActor(0, '中心角色', [0, 0, 0], 0),
        templateActor(1, '左近', [-1.1, 0, 0.25], Math.PI / 8),
        templateActor(2, '右近', [1.1, 0, 0.25], -Math.PI / 8),
        templateActor(3, '左远', [-2.0, 0, -0.4], Math.PI / 6),
        templateActor(4, '右远', [2.0, 0, -0.4], -Math.PI / 6),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-courtroom',
    label: '法庭审判',
    hint: '法官居中俯视，原告 / 被告两侧分坐',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 1.8, 5.5],
        target: [0, 1.3, 0],
        fov: 42,
        roll: 0,
        aspectRatio: '21:9',
      },
      actors: [
        templateActor(0, '法官', [0, 0, -1.6], 0, 'sit'),
        templateActor(1, '原告', [-1.6, 0, 0.6], Math.PI / 4),
        templateActor(2, '被告', [1.6, 0, 0.6], -Math.PI / 4),
        createDirector3DActor({ id: 'tpl_courtroom_bench', type: 'prop-box', label: '法官席', position: [0, 0, -1.9], rotationY: 0, scale: 1.5, color: 'var(--token-text-muted)' }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-stage',
    label: '舞台演讲',
    hint: '主角站台前，前方扇形观众群演',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 1.7, 7],
        target: [0, 1.4, 0],
        fov: 48,
        roll: 0,
        aspectRatio: '16:9',
      },
      actors: [
        templateActor(0, '演讲者', [0, 0, -0.8], 0, 'point'),
        createDirector3DActor({
          id: 'tpl_stage_audience',
          type: 'formation',
          label: '观众席',
          position: [0, 0, 2.4],
          rotationY: Math.PI,
          scale: 0.9,
          color: ACTOR_DEFAULT_COLORS[0],
          posePreset: 'idle',
          formation: { rows: 3, cols: 6, spacing: 0.9, memberFacing: 'forward' },
        }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-restaurant',
    label: '餐厅对坐',
    hint: '两人桌前对坐，长桌居中',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [-1.8, 1.6, 2.6],
        target: [0, 1.2, 0],
        fov: 36,
        roll: 0,
        aspectRatio: '16:9',
      },
      actors: [
        templateActor(0, '主角', [-0.7, 0, -0.6], Math.PI / 2, 'sit'),
        templateActor(1, '同伴', [0.7, 0, -0.6], -Math.PI / 2, 'sit'),
        createDirector3DActor({ id: 'tpl_restaurant_table', type: 'prop-box', label: '长桌', position: [0, 0, -0.6], rotationY: 0, scale: 1.3, color: 'var(--token-text-muted)' }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-car-interior',
    label: '车内对话',
    hint: '驾驶座 + 副驾，狭窄空间侧面捕捉',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [-2.4, 1.4, 0.4],
        target: [0, 1.2, 0],
        fov: 50,
        roll: 0,
        aspectRatio: '21:9',
      },
      actors: [
        templateActor(0, '司机', [-0.45, 0, 0], 0, 'sit'),
        templateActor(1, '乘客', [0.45, 0, 0], 0, 'sit'),
        createDirector3DActor({ id: 'tpl_car_box', type: 'prop-box', label: '车厢', position: [0, 0, 0], rotationY: 0, scale: 1.8, color: 'var(--token-status-info)' }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-confrontation',
    label: '紧张对峙',
    hint: '两人对峙，相距 ~2.2m，低角度拉紧',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 0.7, 3.4],
        target: [0, 1.5, 0],
        fov: 38,
        roll: 0,
        aspectRatio: '16:9',
      },
      actors: [
        templateActor(0, '主角', [-1.1, 0, 0], Math.PI / 2, 'idle'),
        templateActor(1, '对手', [1.1, 0, 0], -Math.PI / 2, 'idle'),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-alley',
    label: '街角伏击',
    hint: '一人靠墙，另一人从街角拐入',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [2.6, 1.4, 2.0],
        target: [0, 1.4, 0],
        fov: 38,
        roll: 0,
        aspectRatio: '21:9',
      },
      actors: [
        templateActor(0, '靠墙者', [-0.8, 0, 0], Math.PI / 6, 'idle'),
        templateActor(1, '突进者', [1.4, 0, -1.2], -Math.PI / 3, 'run'),
        createDirector3DActor({ id: 'tpl_alley_wall', type: 'prop-plane', label: '街墙', position: [-1.4, 0, 0], rotationY: Math.PI / 2, scale: 1.6, color: 'var(--token-border-strong)' }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-classroom',
    label: '教室授课',
    hint: '老师面向学生方阵',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 1.7, 6],
        target: [0, 1.3, 0],
        fov: 45,
        roll: 0,
        aspectRatio: '16:9',
      },
      actors: [
        templateActor(0, '老师', [0, 0, -1.5], 0, 'point'),
        createDirector3DActor({
          id: 'tpl_classroom_students',
          type: 'formation',
          label: '学生',
          position: [0, 0, 1.6],
          rotationY: Math.PI,
          scale: 0.85,
          color: ACTOR_DEFAULT_COLORS[2],
          posePreset: 'sit',
          formation: { rows: 3, cols: 5, spacing: 1.0, memberFacing: 'forward' },
        }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },

  // ─────── 玄幻场景 ───────
  {
    id: 'tpl-sword-duel',
    label: '剑修对峙',
    hint: '两位剑修隔山涧对峙，长剑指地，灵狐侧立',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 1.4, 5.5],
        target: [0, 1.5, 0],
        fov: 38,
        roll: 0,
        aspectRatio: '21:9',
      },
      actors: [
        templateActor(0, '剑修甲', [-1.6, 0, 0], Math.PI / 2.2, 'point'),
        templateActor(1, '剑修乙', [1.6, 0, 0], -Math.PI / 2.2, 'point'),
        createDirector3DCreature('fox', {
          id: 'tpl_sword_fox',
          position: [-1.6, 0, 0.8],
          scale: 0.6,
          creatureAction: 'idle',
        }),
        createDirector3DActor({ id: 'tpl_sword_pillar_l', type: 'prop-cylinder', label: '石柱', position: [-2.6, 0, -0.6], rotationY: 0, scale: 2.2, color: 'var(--token-text-muted)' }),
        createDirector3DActor({ id: 'tpl_sword_pillar_r', type: 'prop-cylinder', label: '石柱', position: [2.6, 0, -0.6], rotationY: 0, scale: 2.2, color: 'var(--token-text-muted)' }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-altar',
    label: '祭祀法坛',
    hint: '圆台居中，主祭手举法器，仙鹤盘旋',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 2.2, 5.5],
        target: [0, 1.0, 0],
        fov: 42,
        roll: 0,
        aspectRatio: '16:9',
      },
      actors: [
        templateActor(0, '主祭', [0, 0, 0], 0, 'wave'),
        createDirector3DCreature('crane', {
          id: 'tpl_altar_crane',
          position: [-1.4, 1.8, 0.6],
          scale: 0.9,
          creatureAction: 'fly',
        }),
        createDirector3DActor({ id: 'tpl_altar_dais', type: 'prop-cylinder', label: '法坛圆台', position: [0, 0, 0], rotationY: 0, scale: 1.6, color: 'var(--token-text-muted)' }),
        createDirector3DActor({ id: 'tpl_altar_pillar_1', type: 'prop-cylinder', label: '香烛', position: [-1.0, 0, 0.8], rotationY: 0, scale: 0.6, color: 'var(--token-status-warning)' }),
        createDirector3DActor({ id: 'tpl_altar_pillar_2', type: 'prop-cylinder', label: '香烛', position: [1.0, 0, 0.8], rotationY: 0, scale: 0.6, color: 'var(--token-status-warning)' }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-dragon-confront',
    label: '神龙降世',
    hint: '主角立于山巅，神龙盘旋俯视',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [3.0, 2.5, 6.5],
        target: [0, 2.0, 0],
        fov: 46,
        roll: 0,
        aspectRatio: '21:9',
      },
      actors: [
        templateActor(0, '主角', [0, 0, 0], -Math.PI / 6, 'point'),
        createDirector3DCreature('dragon', {
          id: 'tpl_dragon_main',
          position: [0, 2.8, -2.0],
          rotationY: Math.PI / 4,
          scale: 1.1,
          creatureAction: 'fly',
        }),
        createDirector3DActor({ id: 'tpl_dragon_peak', type: 'prop-cylinder', label: '山巅岩', position: [0, 0, 0], rotationY: 0, scale: 1.8, color: 'var(--token-text-muted)' }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-phoenix-rebirth',
    label: '凤凰涅槃',
    hint: '凤凰展翅升空，下方仰望者',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 0.6, 5.5],
        target: [0, 2.5, 0],
        fov: 50,
        roll: 0,
        aspectRatio: '9:16',
      },
      actors: [
        templateActor(0, '仰望者', [0, 0, 0], 0, 'idle'),
        createDirector3DCreature('phoenix', {
          id: 'tpl_phoenix_main',
          position: [0, 3.2, -0.4],
          rotationY: 0,
          scale: 1.0,
          creatureAction: 'fly',
        }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-cloud-summit',
    label: '云海仙境',
    hint: '仙鹤盘旋云上，仙人对坐论道',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 2.0, 6.0],
        target: [0, 1.6, 0],
        fov: 44,
        roll: 0,
        aspectRatio: '16:9',
      },
      actors: [
        templateActor(0, '仙人甲', [-1.2, 0, 0], Math.PI / 2, 'sit'),
        templateActor(1, '仙人乙', [1.2, 0, 0], -Math.PI / 2, 'sit'),
        createDirector3DCreature('crane', {
          id: 'tpl_cloud_crane_l',
          position: [-2.5, 2.0, -1.0],
          scale: 0.85,
          creatureAction: 'fly',
        }),
        createDirector3DCreature('crane', {
          id: 'tpl_cloud_crane_r',
          position: [2.5, 2.4, -1.2],
          scale: 0.85,
          creatureAction: 'fly',
        }),
        createDirector3DActor({ id: 'tpl_cloud_plinth', type: 'prop-cylinder', label: '云台', position: [0, 0, 0], rotationY: 0, scale: 1.4, color: 'var(--token-bg-elevated)' }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
  {
    id: 'tpl-mythical-battlefield',
    label: '玄幻战场',
    hint: '麒麟坐镇，士兵方阵冲锋',
    build: () => ({
      version: 1,
      background: defaultDirector3DBackground(),
      camera: {
        position: [0, 2.8, 7.5],
        target: [0, 1.0, 0],
        fov: 50,
        roll: 0,
        aspectRatio: '21:9',
      },
      actors: [
        createDirector3DCreature('qilin', {
          id: 'tpl_battle_qilin',
          position: [0, 0, -2.0],
          rotationY: 0,
          scale: 1.2,
          creatureAction: 'roar',
        }),
        createDirector3DActor({
          id: 'tpl_battle_army',
          type: 'formation',
          label: '将士',
          position: [0, 0, 2.5],
          rotationY: Math.PI,
          scale: 0.95,
          color: ACTOR_DEFAULT_COLORS[3],
          posePreset: 'idle',
          formation: { rows: 4, cols: 8, spacing: 0.85, memberFacing: 'forward' },
        }),
      ],
      render: { mode: 'lineart', showGrid: true, showCameraFrame: false, transparentBackground: false },
    }),
  },
];

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

  const mannequins = scene.actors.filter(actor => actor.type === 'mannequin');
  const liteMannequins = scene.actors.filter(actor => actor.type === 'mannequin-lite');
  const formations = scene.actors.filter(actor => actor.type === 'formation');
  const creatures = scene.actors.filter(actor => actor.type === 'creature');
  const props = scene.actors.filter(actor => (
    actor.type !== 'mannequin'
    && actor.type !== 'mannequin-lite'
    && actor.type !== 'formation'
    && actor.type !== 'creature'
  ));

  if (creatures.length > 0) {
    const creatureLines = creatures.map((actor) => {
      const pos = actor.position.map(v => v.toFixed(1)).join(', ');
      const facing = Math.round((actor.rotationY * 180) / Math.PI);
      const spec = findCreatureSpecies(actor.species);
      const action = actor.creatureAction ?? 'idle';
      // 把 species hint + 动作翻译成英文，让下游 AI 看到具体生物 + 姿态
      return `  - ${actor.label} (${spec.promptHint}) at (${pos}), facing ${facing}deg, ${action} pose`;
    });
    lines.push('Creatures / mythical beasts on scene:');
    lines.push(...creatureLines);
  }

  if (mannequins.length > 0) {
    const actorLines = mannequins.map((actor) => {
      const pos = actor.position.map(v => v.toFixed(1)).join(', ');
      const facing = Math.round((actor.rotationY * 180) / Math.PI);
      const pose = actor.posePreset;
      // 若 actor 调过骨骼，再附加细化的姿态描述（举手 / 弯膝 / 前倾 等），
      // 让下游 image / video 模型拿到更精确的动作语义
      const rigHint = actor.rig
        ? describeRigForPrompt(resolveActorRig(actor.rig, actor.posePreset))
        : '';
      const suffix = rigHint ? `, ${rigHint}` : '';
      return `  - ${actor.label} at (${pos}), facing ${facing}deg, pose ${pose}${suffix}`;
    });
    lines.push('Hero actor blocking:');
    lines.push(...actorLines);
  }

  if (liteMannequins.length > 0) {
    // 单兵群演占位：每人是一个独立位置的小人，AI 视为群演 / 路人
    const count = liteMannequins.length;
    const facingTally = new Map<number, number>();
    for (const actor of liteMannequins) {
      const facingDeg = Math.round((actor.rotationY * 180) / Math.PI);
      facingTally.set(facingDeg, (facingTally.get(facingDeg) ?? 0) + 1);
    }
    const facingSummary = Array.from(facingTally.entries())
      .map(([deg, count]) => `${count} facing ${deg}deg`)
      .join(', ');
    lines.push(`Background extras: ${count} non-hero placeholders, ${facingSummary}. Render as ordinary background characters, no individual identity.`);
  }

  if (formations.length > 0) {
    // 方阵：一组整齐排列的群演，告诉 AI 这是 "ranked formation / squad"，强调队列感
    const formationLines = formations.map((actor) => {
      const cfg = actor.formation;
      if (!cfg) return null;
      const pos = actor.position.map(v => v.toFixed(1)).join(', ');
      const facingDeg = Math.round((actor.rotationY * 180) / Math.PI);
      const memberFacing = cfg.memberFacing;
      const total = cfg.rows * cfg.cols;
      return `  - ${actor.label}: ${cfg.rows} rows × ${cfg.cols} cols (${total} extras in formation), spacing ${cfg.spacing.toFixed(1)}m, centered at (${pos}), formation facing ${facingDeg}deg, members facing ${memberFacing}`;
    }).filter((value): value is string => value !== null);
    if (formationLines.length > 0) {
      lines.push('Ranked formations / crowd squads (treat each formation as a single ordered group, do not render as scattered crowd):');
      lines.push(...formationLines);
    }
  }

  if (props.length > 0) {
    const propTypeLabels: Record<string, string> = {
      'prop-box': 'box / table prop',
      'prop-cylinder': 'cylindrical prop (barrel / pillar)',
      'prop-plane': 'flat panel (wall / screen)',
      'prop-camera': 'secondary camera marker',
      'prop-arrow': 'directional cue (motion or gaze)',
    };
    const propLines = props.map((actor) => {
      const pos = actor.position.map(v => v.toFixed(1)).join(', ');
      const facing = Math.round((actor.rotationY * 180) / Math.PI);
      const kind = propTypeLabels[actor.type] ?? actor.type;
      return `  - ${actor.label} (${kind}) at (${pos}), facing ${facing}deg`;
    });
    lines.push('Set dressing / blocking aids:');
    lines.push(...propLines);
  }

  if (scene.background.mode === 'panorama') {
    lines.push('Background: panoramic environment plate, treat as wraparound background.');
  } else if (scene.background.mode === 'image-plane') {
    lines.push('Background: a single wide background plate placed behind the actors.');
  } else if (scene.background.mode === 'color') {
    lines.push('Background: clean studio colour, no scenery.');
  }

  // 摄影机预设语言：把用户最近应用的预设 english 串成短语，让 AI 看到精确镜头术语
  const presetIds = scene.render.lastCameraPresetIds ?? [];
  if (presetIds.length > 0) {
    const seen = new Set<string>();
    const englishTerms: string[] = [];
    for (const id of presetIds) {
      const preset = DIRECTOR3D_CAMERA_PRESETS.find(item => item.id === id);
      if (!preset || seen.has(preset.english)) continue;
      seen.add(preset.english);
      englishTerms.push(preset.english);
    }
    if (englishTerms.length > 0) {
      lines.push(`Cinematography language: ${englishTerms.join('; ')}.`);
    }
  }

  lines.push('Use the attached line drawing as composition and pose reference. Keep camera angle, actor positions, body orientation and foreground/background depth consistent with the reference.');

  return lines.join('\n');
}

/* ============================================================================
 * 摄影机预设库（C-4）
 *
 * 30+ 镜头预设按 4 类分组，参考 Higgsfield Cinema Studio 的镜头语言抽象：
 *
 *  - 景别 shot-size：根据被摄主体在画面中的占比（ECU/CU/MCU/MS/MLS/LS/ELS）
 *  - 角度 angle：俯仰位置（low / eye / high / bird / pov / worm-eye）
 *  - 焦段 lens：真实焦段，仅改 FOV（24/35/50/85/135mm）
 *  - 经典组合 classic：行业术语镜头（OTS / Dolly / Hero / Establishing / Dutch...）
 *
 * 每个预设的 apply 函数读当前相机参数，返回新参数；
 * 预设之间可叠加（先选景别再选角度再选焦段），所以 apply 必须基于"当前"而非"零点"。
 *
 * preset.english 会写入 directorPromptFragment，让下游 AI 看到具体的镜头术语
 * （比如 "50mm medium close-up over-the-shoulder"），提升出图的镜头语言准确性。
 * ============================================================================ */

export type Director3DCameraPresetCategory = 'shot-size' | 'angle' | 'lens' | 'classic';

export interface Director3DCameraPreset {
  id: string;
  category: Director3DCameraPresetCategory;
  label: string;
  english: string;
  hint?: string;
  apply: (camera: LinghuiDirector3DCamera) => LinghuiDirector3DCamera;
}

/** 让相机沿当前视线方向移到指定的"主体距离"，target 不变 */
function moveAlongLineOfSight(camera: LinghuiDirector3DCamera, distance: number): LinghuiDirector3DCamera {
  const dx = camera.position[0] - camera.target[0];
  const dz = camera.position[2] - camera.target[2];
  const len = Math.sqrt(dx * dx + dz * dz);
  // len=0 时默认正前方退一步，避免除零
  const ux = len > 0.001 ? dx / len : 0;
  const uz = len > 0.001 ? dz / len : 1;
  return {
    ...camera,
    position: [
      Number((camera.target[0] + ux * distance).toFixed(3)),
      camera.position[1],
      Number((camera.target[2] + uz * distance).toFixed(3)),
    ],
  };
}

/** 改相机机位高度（眼高），target Y 不变 */
function setEyeHeight(camera: LinghuiDirector3DCamera, eyeY: number): LinghuiDirector3DCamera {
  return {
    ...camera,
    position: [camera.position[0], Number(eyeY.toFixed(3)), camera.position[2]],
  };
}

/** 改取景目标的高度（看高 / 看低），保留 X/Z */
function aimAtHeight(camera: LinghuiDirector3DCamera, targetY: number): LinghuiDirector3DCamera {
  return {
    ...camera,
    target: [camera.target[0], Number(targetY.toFixed(3)), camera.target[2]],
  };
}

/** 改 FOV（同时夹到 18~90 合法范围） */
function setFov(camera: LinghuiDirector3DCamera, fov: number): LinghuiDirector3DCamera {
  return { ...camera, fov: Math.max(18, Math.min(90, Number(fov.toFixed(2)))) };
}

/** 改荷兰角（roll） */
function setRoll(camera: LinghuiDirector3DCamera, roll: number): LinghuiDirector3DCamera {
  return { ...camera, roll: Number(roll.toFixed(2)) };
}

/** OTS 偏移：相机围绕 target 沿垂直视线方向横向偏移 dx 米（正=右，负=左） */
function strafe(camera: LinghuiDirector3DCamera, dx: number): LinghuiDirector3DCamera {
  const fx = camera.target[0] - camera.position[0];
  const fz = camera.target[2] - camera.position[2];
  const len = Math.sqrt(fx * fx + fz * fz);
  if (len < 0.001) return camera;
  // 右向量 = (fz, -fx) / |.|（XZ 平面 90° 顺时针）
  const rx = fz / len;
  const rz = -fx / len;
  return {
    ...camera,
    position: [
      Number((camera.position[0] + rx * dx).toFixed(3)),
      camera.position[1],
      Number((camera.position[2] + rz * dx).toFixed(3)),
    ],
    target: [
      Number((camera.target[0] + rx * dx).toFixed(3)),
      camera.target[1],
      Number((camera.target[2] + rz * dx).toFixed(3)),
    ],
  };
}

export const DIRECTOR3D_CAMERA_PRESETS: Director3DCameraPreset[] = [
  // —— 景别（shot-size） ——
  {
    id: 'shot-size/ecu',
    category: 'shot-size',
    label: '大特写',
    english: 'extreme close-up',
    hint: '主体（眼/手）几乎填满画面，距离 ~0.5m',
    apply: (cam) => setFov(moveAlongLineOfSight(aimAtHeight(cam, 1.65), 0.5), 38),
  },
  {
    id: 'shot-size/cu',
    category: 'shot-size',
    label: '特写',
    english: 'close-up',
    hint: '脸部主体，距离 ~0.9m',
    apply: (cam) => setFov(moveAlongLineOfSight(aimAtHeight(cam, 1.6), 0.9), 38),
  },
  {
    id: 'shot-size/mcu',
    category: 'shot-size',
    label: '中近景',
    english: 'medium close-up',
    hint: '胸上半身，距离 ~1.5m',
    apply: (cam) => setFov(moveAlongLineOfSight(aimAtHeight(cam, 1.5), 1.5), 36),
  },
  {
    id: 'shot-size/ms',
    category: 'shot-size',
    label: '中景',
    english: 'medium shot',
    hint: '腰上半身，距离 ~2.2m',
    apply: (cam) => setFov(moveAlongLineOfSight(aimAtHeight(cam, 1.4), 2.2), 35),
  },
  {
    id: 'shot-size/mls',
    category: 'shot-size',
    label: '中远景',
    english: 'medium long shot',
    hint: '膝上半身，距离 ~3.5m',
    apply: (cam) => setFov(moveAlongLineOfSight(aimAtHeight(cam, 1.2), 3.5), 38),
  },
  {
    id: 'shot-size/ls',
    category: 'shot-size',
    label: '远景',
    english: 'long shot',
    hint: '全身入画，距离 ~5.5m',
    apply: (cam) => setFov(moveAlongLineOfSight(aimAtHeight(cam, 1.0), 5.5), 42),
  },
  {
    id: 'shot-size/els',
    category: 'shot-size',
    label: '大远景',
    english: 'extreme long shot',
    hint: '主体小，环境为主，距离 ~9m',
    apply: (cam) => setFov(moveAlongLineOfSight(aimAtHeight(cam, 0.8), 9.0), 48),
  },
  {
    id: 'shot-size/cowboy',
    category: 'shot-size',
    label: '牛仔镜',
    english: 'cowboy shot, knee-up framing',
    hint: '膝盖以上入画，西部片招牌，距离 ~3.0m',
    apply: (cam) => setFov(moveAlongLineOfSight(aimAtHeight(cam, 1.3), 3.0), 36),
  },

  // —— 角度（angle） ——
  {
    id: 'angle/worm-eye',
    category: 'angle',
    label: '虫眼',
    english: 'worm-eye shot, ground-level low angle',
    hint: '近地面仰拍 ~0.2m，戏剧化高大感',
    apply: (cam) => setEyeHeight(aimAtHeight(cam, 1.5), 0.2),
  },
  {
    id: 'angle/low',
    category: 'angle',
    label: '低角度仰拍',
    english: 'low-angle shot',
    hint: '机位高度 ~0.6m，强势 / 英雄感',
    apply: (cam) => setEyeHeight(aimAtHeight(cam, 1.6), 0.6),
  },
  {
    id: 'angle/eye-level',
    category: 'angle',
    label: '平视',
    english: 'eye-level shot',
    hint: '机位与角色眼平齐 ~1.55m，中立',
    apply: (cam) => setEyeHeight(aimAtHeight(cam, 1.55), 1.55),
  },
  {
    id: 'angle/high',
    category: 'angle',
    label: '高角度俯拍',
    english: 'high-angle shot',
    hint: '机位 ~2.5m，弱势 / 全局感',
    apply: (cam) => setEyeHeight(aimAtHeight(cam, 1.2), 2.5),
  },
  {
    id: 'angle/bird-eye',
    category: 'angle',
    label: '鸟瞰',
    english: 'birds-eye view, top-down shot',
    hint: '机位 ~7m，俯视全场',
    apply: (cam) => setFov(setEyeHeight(aimAtHeight(cam, 0.0), 7.0), 50),
  },
  {
    id: 'angle/dutch',
    category: 'angle',
    label: '荷兰角',
    english: 'dutch tilt, canted angle',
    hint: '相机 roll 8° 倾斜，紧张 / 失衡',
    apply: (cam) => setRoll(cam, 8),
  },

  // —— 焦段（lens，仅改 FOV） ——
  {
    id: 'lens/24mm',
    category: 'lens',
    label: '24mm 超广角',
    english: '24mm ultra-wide lens',
    hint: '广角畸变 / 沉浸感（FOV ~73°）',
    apply: (cam) => setFov(cam, 73),
  },
  {
    id: 'lens/35mm',
    category: 'lens',
    label: '35mm 标准广角',
    english: '35mm standard wide lens',
    hint: '记录感 / 自然透视（FOV ~54°）',
    apply: (cam) => setFov(cam, 54),
  },
  {
    id: 'lens/50mm',
    category: 'lens',
    label: '50mm 标准',
    english: '50mm standard prime lens',
    hint: '接近人眼透视（FOV ~40°）',
    apply: (cam) => setFov(cam, 40),
  },
  {
    id: 'lens/85mm',
    category: 'lens',
    label: '85mm 中长焦',
    english: '85mm portrait lens',
    hint: '人像头像 / 背景虚化（FOV ~24°）',
    apply: (cam) => setFov(cam, 24),
  },
  {
    id: 'lens/135mm',
    category: 'lens',
    label: '135mm 长焦',
    english: '135mm telephoto lens',
    hint: '强空间压缩 / 远景特写（FOV ~18°）',
    apply: (cam) => setFov(cam, 18),
  },

  // —— 经典镜头（classic combinations） ——
  {
    id: 'classic/ots-left',
    category: 'classic',
    label: '过肩 OTS · 左',
    english: 'over-the-shoulder shot from left side',
    hint: '相机向左偏 0.6m，常用于对切',
    apply: (cam) => setFov(strafe(moveAlongLineOfSight(aimAtHeight(cam, 1.55), 1.6), -0.6), 36),
  },
  {
    id: 'classic/ots-right',
    category: 'classic',
    label: '过肩 OTS · 右',
    english: 'over-the-shoulder shot from right side',
    hint: '相机向右偏 0.6m，常用于对切',
    apply: (cam) => setFov(strafe(moveAlongLineOfSight(aimAtHeight(cam, 1.55), 1.6), 0.6), 36),
  },
  {
    id: 'classic/dolly-in',
    category: 'classic',
    label: '推近 Dolly In',
    english: 'dolly-in push, camera moves closer',
    hint: '当前距离 × 0.7',
    apply: (cam) => {
      const dx = cam.position[0] - cam.target[0];
      const dz = cam.position[2] - cam.target[2];
      const current = Math.sqrt(dx * dx + dz * dz);
      return moveAlongLineOfSight(cam, Math.max(0.6, current * 0.7));
    },
  },
  {
    id: 'classic/pull-back',
    category: 'classic',
    label: '拉远 Pull Back',
    english: 'pull-back reveal, camera retreats',
    hint: '当前距离 × 1.6',
    apply: (cam) => {
      const dx = cam.position[0] - cam.target[0];
      const dz = cam.position[2] - cam.target[2];
      const current = Math.sqrt(dx * dx + dz * dz);
      return moveAlongLineOfSight(cam, Math.min(20, current * 1.6));
    },
  },
  {
    id: 'classic/hero-low',
    category: 'classic',
    label: '英雄低镜',
    english: 'hero low-angle shot, wide lens upward tilt',
    hint: '0.5m 仰拍 + 24mm 广角',
    apply: (cam) => setFov(setEyeHeight(aimAtHeight(moveAlongLineOfSight(cam, 1.8), 1.7), 0.5), 60),
  },
  {
    id: 'classic/establishing',
    category: 'classic',
    label: '建立镜',
    english: 'establishing wide shot, master shot of the scene',
    hint: '远景 + 高机位 + 50mm，开场标配',
    apply: (cam) => setFov(setEyeHeight(aimAtHeight(moveAlongLineOfSight(cam, 9.0), 1.0), 4.0), 50),
  },
  {
    id: 'classic/2-shot',
    category: 'classic',
    label: '双人对话 2-Shot',
    english: 'two-shot framing two characters side by side',
    hint: '中景双人入画 ~3.5m，35mm',
    apply: (cam) => setFov(setEyeHeight(aimAtHeight(moveAlongLineOfSight(cam, 3.5), 1.4), 1.55), 50),
  },
  {
    id: 'classic/trailing',
    category: 'classic',
    label: '背身跟拍',
    english: 'trailing shot from behind the subject',
    hint: '镜头紧贴背后 ~1.4m',
    apply: (cam) => setFov(setEyeHeight(aimAtHeight(moveAlongLineOfSight(cam, 1.4), 1.5), 1.45), 40),
  },
  {
    id: 'classic/profile',
    category: 'classic',
    label: '侧面横移',
    english: 'profile / dolly side tracking shot',
    hint: '与角色平行的侧面镜头',
    apply: (cam) => setFov(strafe(setEyeHeight(aimAtHeight(moveAlongLineOfSight(cam, 2.0), 1.5), 1.5), 1.5), 35),
  },
  {
    id: 'classic/insert',
    category: 'classic',
    label: '插入镜',
    english: 'insert shot, tight detail close-up of an object',
    hint: '极近特写小物 / 道具，距离 ~0.4m',
    apply: (cam) => setFov(setEyeHeight(aimAtHeight(moveAlongLineOfSight(cam, 0.4), 1.0), 1.2), 32),
  },
  {
    id: 'classic/master',
    category: 'classic',
    label: '主镜 Master',
    english: 'master shot, full-coverage wide angle establishing the scene geometry',
    hint: '全场覆盖远景 + 35mm 标准广角',
    apply: (cam) => setFov(setEyeHeight(aimAtHeight(moveAlongLineOfSight(cam, 7.0), 1.2), 1.75), 54),
  },
  {
    id: 'classic/reaction',
    category: 'classic',
    label: '反应镜',
    english: 'reaction shot, tight close-up showing the listener',
    hint: '对话反打 + 中近景 + 长焦微压缩',
    apply: (cam) => setFov(setEyeHeight(aimAtHeight(moveAlongLineOfSight(cam, 1.4), 1.55), 1.55), 32),
  },
];

/** 按 category 分组 */
export function groupDirector3DCameraPresets(): Record<Director3DCameraPresetCategory, Director3DCameraPreset[]> {
  return DIRECTOR3D_CAMERA_PRESETS.reduce((acc, preset) => {
    acc[preset.category] = acc[preset.category] || [];
    acc[preset.category].push(preset);
    return acc;
  }, {} as Record<Director3DCameraPresetCategory, Director3DCameraPreset[]>);
}

export const DIRECTOR3D_CAMERA_PRESET_CATEGORY_LABELS: Record<Director3DCameraPresetCategory, string> = {
  'shot-size': '景别',
  angle: '角度',
  lens: '焦段',
  classic: '经典镜头',
};

/* ============================================================================
 * 时间轴（C-6 Phase 6A）
 *
 * 数据形态：
 *   scene.timeline = { keyframes[], duration, fps, easing }
 *   keyframes[] 按 time 升序，每个 keyframe 存该时刻所有 actor 的可动字段 +
 *   一个完整的 camera 快照 + 可选 background。
 *
 * 补间规则：
 *   - 给定时间 t：
 *     - t <= 第一个 keyframe.time → 返回第一个 keyframe 快照
 *     - t >= 最后一个 keyframe.time → 返回最后一个 keyframe 快照
 *     - 否则找夹住 t 的 [k1, k2]，alpha = easing((t - k1.time) / (k2.time - k1.time))
 *   - actors 按 id 匹配：两端都存在 → 线性插值 position/rotationY/scale；
 *     单端存在 → 沿用该端的值（不淡入淡出，简化语义）
 *   - camera：position / target 数组逐分量线性插值；fov / roll 线性插值
 *   - background：取 k1 的（不插值，避免 mode 切换中间状态）
 *
 * 关键约束：
 *   - 插值结果用于渲染（runtimeScene），**不**回写到持久化 scene.actors
 *   - actor 的非可动字段（label / color / posePreset / formation）从 scene.actors 取，
 *     避免每个 keyframe 重复存这些大字段
 * ============================================================================ */

export const DIRECTOR3D_DEFAULT_TIMELINE: LinghuiDirector3DTimeline = {
  version: 1,
  keyframes: [],
  duration: 8,
  fps: 24,
  easing: 'ease-in-out',
};

/** 创建一个空 timeline（一次性 helper，避免外部把 DEFAULT 当 mutable） */
export function createDefaultDirector3DTimeline(): LinghuiDirector3DTimeline {
  return {
    ...DIRECTOR3D_DEFAULT_TIMELINE,
    keyframes: [],
  };
}

/**
 * 把当前 scene 拍快照为关键帧（用于"加关键帧"按钮）。
 * actors / camera / background 全部克隆一份（含 pose / color / formation），
 * 避免后续编辑 scene 影响历史 keyframe。
 */
export function snapshotActorAsKeyframeActor(actor: LinghuiDirector3DActor): LinghuiDirector3DKeyframeActor {
  return {
    id: actor.id,
    position: [...actor.position] as [number, number, number],
    rotationY: actor.rotationY,
    scale: actor.scale,
    posePreset: actor.posePreset,
    color: actor.color,
    ...(actor.rig ? { rig: cloneRig(actor.rig) } : {}),
    ...(actor.formation ? { formation: { ...actor.formation } } : {}),
    ...(actor.creatureAction ? { creatureAction: actor.creatureAction } : {}),
    ...(actor.creatureRig ? {
      creatureRig: {
        spine: [...actor.creatureRig.spine] as [number, number, number],
        neck: [...actor.creatureRig.neck] as [number, number, number],
        frontLeftLeg: [...actor.creatureRig.frontLeftLeg] as [number, number, number],
        frontRightLeg: [...actor.creatureRig.frontRightLeg] as [number, number, number],
        rearLeftLeg: [...actor.creatureRig.rearLeftLeg] as [number, number, number],
        rearRightLeg: [...actor.creatureRig.rearRightLeg] as [number, number, number],
        tail: [...actor.creatureRig.tail] as [number, number, number],
      },
    } : {}),
  };
}

export function cloneCameraForKeyframe(camera: LinghuiDirector3DCamera): LinghuiDirector3DCamera {
  return {
    ...camera,
    position: [...camera.position] as [number, number, number],
    target: [...camera.target] as [number, number, number],
  };
}

export function captureSceneAsKeyframe(
  scene: LinghuiDirector3DScene,
  time: number,
  label?: string,
): LinghuiDirector3DKeyframe {
  return {
    id: `kf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    time: Math.max(0, Number(time.toFixed(3))),
    label,
    scope: 'scene',
    actors: scene.actors.map(snapshotActorAsKeyframeActor),
    camera: cloneCameraForKeyframe(scene.camera),
    background: scene.background ? { ...scene.background } : undefined,
  };
}

function applyEasing(t: number, easing: LinghuiDirector3DEasing): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (easing === 'linear') return t;
  if (easing === 'ease-in') return t * t;
  if (easing === 'ease-out') return 1 - (1 - t) * (1 - t);
  // ease-in-out（默认）：smoothstep
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha;
}

function cloneRig(rig: LinghuiDirector3DRig): LinghuiDirector3DRig {
  return {
    spine: [...rig.spine] as [number, number, number],
    neck: [...rig.neck] as [number, number, number],
    leftShoulder: [...rig.leftShoulder] as [number, number, number],
    rightShoulder: [...rig.rightShoulder] as [number, number, number],
    leftElbow: [...rig.leftElbow] as [number, number, number],
    rightElbow: [...rig.rightElbow] as [number, number, number],
    leftHip: [...rig.leftHip] as [number, number, number],
    rightHip: [...rig.rightHip] as [number, number, number],
    leftKnee: [...rig.leftKnee] as [number, number, number],
    rightKnee: [...rig.rightKnee] as [number, number, number],
  };
}

function lerpVec3(a: [number, number, number], b: [number, number, number], alpha: number): [number, number, number] {
  return [
    Number(lerp(a[0], b[0], alpha).toFixed(4)),
    Number(lerp(a[1], b[1], alpha).toFixed(4)),
    Number(lerp(a[2], b[2], alpha).toFixed(4)),
  ];
}

/** 在 360° 短弧上插值角度（弧度），避免 0↔2π 之间走长弧 */
function lerpAngle(a: number, b: number, alpha: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= TWO_PI;
  while (diff < -Math.PI) diff += TWO_PI;
  return a + diff * alpha;
}

/**
 * 二分查找夹住 time 的两个 keyframe 索引（左闭右开）。
 * 返回 [leftIdx, rightIdx]；若 time 在两端之外，左右相同。
 */
function locateKeyframeSegment(
  keyframes: LinghuiDirector3DKeyframe[],
  time: number,
): { left: number; right: number; alpha: number } {
  if (keyframes.length === 0) return { left: -1, right: -1, alpha: 0 };
  if (time <= keyframes[0].time) return { left: 0, right: 0, alpha: 0 };
  const last = keyframes.length - 1;
  if (time >= keyframes[last].time) return { left: last, right: last, alpha: 1 };

  // 线性扫描足够：典型场景 <= 32 个 keyframe
  for (let i = 0; i < last; i += 1) {
    const k1 = keyframes[i];
    const k2 = keyframes[i + 1];
    if (time >= k1.time && time <= k2.time) {
      const span = Math.max(0.001, k2.time - k1.time);
      return { left: i, right: i + 1, alpha: (time - k1.time) / span };
    }
  }
  return { left: last, right: last, alpha: 1 };
}

/**
 * 把 scene 在时间 t 处求值，返回用于渲染的 runtime 快照。
 * 不修改入参 scene；不动 actors 列表的非可动字段。
 */
export function interpolateSceneAt(
  scene: LinghuiDirector3DScene,
  time: number,
): LinghuiDirector3DScene {
  const timeline = scene.timeline;
  if (!timeline || timeline.keyframes.length === 0) {
    return scene;
  }

  // 按 scope 拆轨：每个 actor 一条 + camera 一条。'scene' 同时算入两边（兼容旧数据）
  const actorTracks = new Map<string, LinghuiDirector3DKeyframe[]>();
  const cameraTrack: LinghuiDirector3DKeyframe[] = [];
  for (const kf of timeline.keyframes) {
    const scope = kf.scope ?? 'scene';
    if (scope === 'scene' || scope === 'camera') {
      cameraTrack.push(kf);
    }
    if (scope === 'scene') {
      for (const actor of kf.actors) {
        const list = actorTracks.get(actor.id) ?? [];
        list.push(kf);
        actorTracks.set(actor.id, list);
      }
    } else if (scope.startsWith('actor:')) {
      const actorId = scope.slice('actor:'.length);
      const list = actorTracks.get(actorId) ?? [];
      list.push(kf);
      actorTracks.set(actorId, list);
    }
  }
  // 每条轨保持原排序（外层会保证 sorted by time）

  // 兼容老插值流程：用 scene 全量轨道找全局段（只为 background 兜底）
  const { left: sceneLeft } = locateKeyframeSegment(timeline.keyframes, time);
  const sceneSegmentLeft = sceneLeft >= 0 ? timeline.keyframes[sceneLeft] : null;

  const nextActors: LinghuiDirector3DActor[] = scene.actors.map((actor) => {
    const actorKeyframes = actorTracks.get(actor.id);
    if (!actorKeyframes || actorKeyframes.length === 0) {
      return actor;
    }
    const segment = locateKeyframeSegment(actorKeyframes, time);
    if (segment.left < 0) return actor;
    const k1 = actorKeyframes[segment.left];
    const k2 = actorKeyframes[segment.right];
    const a1 = k1.actors.find(a => a.id === actor.id);
    const a2 = k2.actors.find(a => a.id === actor.id);
    if (!a1 && !a2) return actor;
    const start = a1 ?? a2!;
    const end = a2 ?? a1!;
    const easedAlpha = segment.left === segment.right ? 0 : applyEasing(segment.alpha, timeline.easing);
    // 离散字段切换时机：alpha>=0.5 用 end 的值（避免逐帧抖动；端点态都用本端值）
    const pickDiscrete = <T>(s: T | undefined, e: T | undefined, fallback: T): T => {
      if (easedAlpha < 0.5) return s ?? e ?? fallback;
      return e ?? s ?? fallback;
    };

    const next: LinghuiDirector3DActor = {
      ...actor,
      position: lerpVec3(start.position, end.position, easedAlpha),
      rotationY: lerpAngle(start.rotationY, end.rotationY, easedAlpha),
      scale: lerp(start.scale, end.scale, easedAlpha),
      posePreset: pickDiscrete(start.posePreset, end.posePreset, actor.posePreset),
      color: pickDiscrete(start.color, end.color, actor.color),
    };

    // 骨骼连续插值：两端任一有 rig 时按关节 LERP，没有时回退 posePreset 老逻辑
    if (actor.type === 'mannequin' && (start.rig || end.rig)) {
      const startRig = start.rig ?? resolveActorRig(undefined, start.posePreset ?? actor.posePreset);
      const endRig = end.rig ?? resolveActorRig(undefined, end.posePreset ?? actor.posePreset);
      next.rig = lerpRig(startRig, endRig, easedAlpha);
    }

    // 生物动作 / rig 插值：creatureAction 离散切换，creatureRig 关节 LERP（缺失时按 action 兜底）
    if (actor.type === 'creature') {
      next.creatureAction = pickDiscrete(start.creatureAction, end.creatureAction, actor.creatureAction ?? 'idle');
      if (start.creatureRig || end.creatureRig) {
        const startRig = start.creatureRig ?? resolveCreatureRig(undefined, start.creatureAction ?? actor.creatureAction ?? 'idle');
        const endRig = end.creatureRig ?? resolveCreatureRig(undefined, end.creatureAction ?? actor.creatureAction ?? 'idle');
        next.creatureRig = lerpCreatureRig(startRig, endRig, easedAlpha);
      }
    }

    // formation 仅在该 actor type=='formation' 时参与插值
    if (actor.type === 'formation') {
      const f1 = start.formation;
      const f2 = end.formation;
      if (f1 || f2) {
        const fStart = f1 ?? f2!;
        const fEnd = f2 ?? f1!;
        next.formation = {
          // 行列数离散切换（整数）
          rows: pickDiscrete(fStart.rows, fEnd.rows, actor.formation?.rows ?? 1),
          cols: pickDiscrete(fStart.cols, fEnd.cols, actor.formation?.cols ?? 1),
          // 间距连续，spacing 体感是渐变的
          spacing: lerp(fStart.spacing, fEnd.spacing, easedAlpha),
          // memberFacing 离散切换
          memberFacing: pickDiscrete(
            fStart.memberFacing,
            fEnd.memberFacing,
            actor.formation?.memberFacing ?? 'forward',
          ),
        };
      }
    }

    return next;
  });

  // 相机独立轨：从 cameraTrack 取段（scope='camera' 或 'scene'）
  let nextCamera: LinghuiDirector3DCamera = scene.camera;
  if (cameraTrack.length > 0) {
    const camSegment = locateKeyframeSegment(cameraTrack, time);
    if (camSegment.left >= 0) {
      const c1 = cameraTrack[camSegment.left].camera;
      const c2 = cameraTrack[camSegment.right].camera;
      const camAlpha = camSegment.left === camSegment.right ? 0 : applyEasing(camSegment.alpha, timeline.easing);
      nextCamera = {
        ...c1,
        position: lerpVec3(c1.position, c2.position, camAlpha),
        target: lerpVec3(c1.target, c2.target, camAlpha),
        fov: Number(lerp(c1.fov, c2.fov, camAlpha).toFixed(2)),
        roll: Number(lerp(c1.roll, c2.roll, camAlpha).toFixed(2)),
        aspectRatio: c1.aspectRatio,
      };
    }
  }

  return {
    ...scene,
    actors: nextActors,
    camera: nextCamera,
    background: sceneSegmentLeft?.background ?? scene.background,
  };
}

