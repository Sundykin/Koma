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
  LinghuiDirector3DScene,
} from '../../../types/linghui';
import { DIRECTOR3D_ACTOR_COLOR_TOKENS } from './director3dColors';
import { describeRigForPrompt, resolveActorRig } from './director3dRig';
import {
  findCreatureSpecies,
} from './director3dCreature';
import { defaultDirector3DBackground, defaultDirector3DCamera } from './director3dDefaults';
export { defaultDirector3DBackground, defaultDirector3DCamera } from './director3dDefaults';
import { DIRECTOR3D_CAMERA_PRESETS } from './director3dCameraPresets';
export {
  DIRECTOR3D_ORBIT_9_DEGREES,
  DIRECTOR3D_SCENE_TEMPLATES,
  DIRECTOR3D_THREE_VIEW_DEGREES,
  buildOrbitCameras,
  buildTopDownCamera,
} from './director3dSceneTemplates';
export type { Director3DSceneTemplate } from './director3dSceneTemplates';
export {
  DIRECTOR3D_CAMERA_PRESETS,
  DIRECTOR3D_CAMERA_PRESET_CATEGORY_LABELS,
  groupDirector3DCameraPresets,
} from './director3dCameraPresets';
export type { Director3DCameraPreset, Director3DCameraPresetCategory } from './director3dCameraPresets';
import {
  createDirector3DActor,
} from './director3dAssetLibrary';
export {
  CREATURE_SPECIES_LIBRARY,
  DIRECTOR3D_CHARACTER_PRESETS,
  DIRECTOR3D_PROP_CATEGORY_LABELS,
  DIRECTOR3D_PROP_LIBRARY,
  createDirector3DActor,
  createDirector3DBattalion,
  createDirector3DCharacter,
  createDirector3DCreature,
  createDirector3DLiteSoldier,
  createDirector3DProp,
  createDirector3DRidingHorse,
} from './director3dAssetLibrary';
export type {
  Director3DBattalionOptions,
  Director3DCharacterPreset,
  Director3DPropCategory,
  Director3DPropPreset,
  Director3DRidingHorseOptions,
} from './director3dAssetLibrary';
export {
  DIRECTOR3D_DEFAULT_TIMELINE,
  DIRECTOR3D_EXPORT_RESOLUTION_HEIGHTS,
  DIRECTOR3D_EXPORT_RESOLUTION_OPTIONS,
  captureSceneAsKeyframe,
  cloneCameraForKeyframe,
  cloneRig,
  createDefaultDirector3DTimeline,
  interpolateSceneAt,
  resolveDirector3DExportDimensions,
  resolveDirector3DExportResolution,
  snapshotActorAsKeyframeActor,
} from './director3dTimeline';

const ACTOR_DEFAULT_COLORS = DIRECTOR3D_ACTOR_COLOR_TOKENS;

export const DIRECTOR3D_POSE_OPTIONS: Array<{ value: LinghuiDirector3DActorPose; label: string }> = [
  { value: 'idle', label: '站立' },
  { value: 'walk', label: '走路' },
  { value: 'run', label: '跑' },
  { value: 'sit', label: '坐' },
  { value: 'wave', label: '挥手' },
  { value: 'point', label: '指向' },
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
      return `  - ${actor.label} (${spec.promptHint}) at (${pos}), facing ${facing}deg, ${action} pose, procedural animal blocking with aligned feet-legs-torso-neck-head skeleton, readable eyes, muzzle/beak, ears/horns/antlers, tail, claws/hooves and species-specific markings`;
    });
    lines.push('Creatures / mythical beasts on scene:');
    lines.push(...creatureLines);
  }

  const comboGroups = new Map<string, LinghuiDirector3DActor[]>();
  for (const actor of scene.actors) {
    if (!actor.groupId) continue;
    const list = comboGroups.get(actor.groupId) ?? [];
    list.push(actor);
    comboGroups.set(actor.groupId, list);
  }
  const comboLines = Array.from(comboGroups.values())
    .filter(group => group.length > 1)
    .map((group) => {
      const label = group[0]?.groupLabel ?? 'linked entity group';
      const members = group
        .map(actor => `${actor.groupRole ?? 'linked'}:${actor.label}`)
        .join(', ');
      return `  - ${label}: linked composition group (${members}); keep relative spacing, shared facing and physical contact coherent.`;
    });
  if (comboLines.length > 0) {
    lines.push('Linked entity combinations:');
    lines.push(...comboLines);
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
      const detailHint = 'refined humanoid blocking model with visible face direction, eyes, nose bridge, mouth line, ears, chest front marker, back spine stripe, joint balls, hands with thumbs, and forward-pointing shoes';
      const suffix = rigHint ? `, ${rigHint}` : '';
      return `  - ${actor.label} at (${pos}), facing ${facing}deg, pose ${pose}, ${detailHint}${suffix}`;
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
    lines.push(`Background extras: ${count} non-hero placeholders with small face/chest/back direction markers, ${facingSummary}. Render as ordinary background characters, no individual identity.`);
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
      return `  - ${actor.label}: ${cfg.rows} rows × ${cfg.cols} cols (${total} extras in formation), spacing ${cfg.spacing.toFixed(1)}m, centered at (${pos}), formation facing ${facingDeg}deg, members facing ${memberFacing}, each member has simplified face/chest/back orientation marks`;
    }).filter((value): value is string => value !== null);
    if (formationLines.length > 0) {
      lines.push('Ranked formations / crowd squads (treat each formation as a single ordered group, do not render as scattered crowd):');
      lines.push(...formationLines);
    }
  }

  if (props.length > 0) {
    const propTypeLabels: Record<string, string> = {
      'prop-box': 'structured box-derived prop with separated material parts (furniture / vehicle / crate / rock)',
      'prop-cylinder': 'structured cylindrical prop with visible rings, spokes, legs, trunk or stand details',
      'prop-plane': 'framed flat prop (door / window / screen) with mullions, panels or bezels',
      'prop-camera': 'secondary camera / spotlight marker with lens, body, stand and direction cue',
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
