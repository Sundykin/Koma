import type { LinghuiDirector3DActor, LinghuiDirector3DActorPose } from '../../../types/linghui';
import { DIRECTOR3D_ACTOR_COLOR_TOKENS } from './director3dColors';
import { EXTENDED_RIG_PRESETS } from './director3dRig';
import { CREATURE_SPECIES_LIBRARY, findCreatureSpecies, type CreatureSpeciesKind } from './director3dCreature';
import { cloneRig } from './director3dTimeline';

const ACTOR_DEFAULT_COLORS = DIRECTOR3D_ACTOR_COLOR_TOKENS;

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
    ...(overrides.groupId ? { groupId: overrides.groupId } : {}),
    ...(overrides.groupRole ? { groupRole: overrides.groupRole } : {}),
    ...(overrides.groupLabel ? { groupLabel: overrides.groupLabel } : {}),
    ...(overrides.rig ? { rig: cloneRig(overrides.rig) } : {}),
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

export interface Director3DRidingHorseOptions {
  groupId?: string;
  label?: string;
  position?: [number, number, number];
  rotationY?: number;
}

/**
 * 组合实体：人骑马。返回两个独立 actor（马 + 骑手），通过 groupId 轻量绑定。
 * 坐标仍是世界坐标，方便导出和时间轴沿用现有逻辑。
 */
export function createDirector3DRidingHorse(options: Director3DRidingHorseOptions = {}): LinghuiDirector3DActor[] {
  const groupId = options.groupId ?? `combo_riding_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const groupLabel = options.label ?? '人骑马';
  const [x, y, z] = options.position ?? [0, 0, 0];
  const rotationY = options.rotationY ?? 0;
  const horse = createDirector3DCreature('horse', {
    id: `${groupId}_horse`,
    label: `${groupLabel} · 马`,
    position: [x, y, z],
    rotationY,
    scale: 1.05,
    groupId,
    groupRole: 'mount',
    groupLabel,
    creatureAction: 'idle',
  });
  const rider = createDirector3DActor({
    id: `${groupId}_rider`,
    type: 'mannequin',
    label: `${groupLabel} · 骑手`,
    position: [x, Number((y + 0.46).toFixed(3)), Number((z - 0.05).toFixed(3))],
    rotationY,
    scale: 0.86,
    color: ACTOR_DEFAULT_COLORS[0],
    posePreset: 'idle',
    rig: EXTENDED_RIG_PRESETS.ride,
    groupId,
    groupRole: 'rider',
    groupLabel,
  });
  return [horse, rider];
}

/** 暴露 species 库给 UI 资产 tab */
export { CREATURE_SPECIES_LIBRARY };
