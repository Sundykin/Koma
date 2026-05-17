import type {
  LinghuiDirector3DActor,
  LinghuiDirector3DCamera,
  LinghuiDirector3DCreatureSpecies,
  LinghuiDirector3DKeyframe,
  LinghuiDirector3DScene,
} from '../../../../types/linghui';
import {
  createDirector3DActor,
  createDirector3DBattalion,
  createDirector3DCharacter,
  createDirector3DCreature,
  createDirector3DLiteSoldier,
  createDirector3DProp,
  createDirector3DRidingHorse,
  cloneCameraForKeyframe,
  snapshotActorAsKeyframeActor,
  type Director3DBattalionOptions,
  type Director3DCharacterPreset,
  type Director3DPropPreset,
} from '../../director3d/director3dScene';
import { normalizeDirector3DAngleRadians } from '../components/Director3DNodeEditorState';

function clampTimelineTime(scene: LinghuiDirector3DScene, currentTime: number): number {
  return Math.max(0, Math.min(scene.timeline?.duration ?? 0, Number(currentTime.toFixed(3))));
}

export function addDirector3DBattalionToScene(
  scene: LinghuiDirector3DScene,
  battalionConfig: {
    rows: number;
    cols: number;
    spacing: number;
    memberFacing: Director3DBattalionOptions['memberFacing'];
  },
): LinghuiDirector3DScene {
  const formationCount = scene.actors.filter(actor => actor.type === 'formation').length + 1;
  const formation = createDirector3DBattalion({
    rows: battalionConfig.rows,
    cols: battalionConfig.cols,
    spacing: battalionConfig.spacing,
    memberFacing: battalionConfig.memberFacing,
    label: `方阵 ${formationCount} (${battalionConfig.rows}×${battalionConfig.cols})`,
  });
  return { ...scene, actors: [...scene.actors, formation] };
}

export function addDirector3DLiteSoldierToScene(scene: LinghuiDirector3DScene): LinghuiDirector3DScene {
  const liteCount = scene.actors.filter(actor => actor.type === 'mannequin-lite').length;
  const lite = createDirector3DLiteSoldier({
    id: `lite_${Date.now().toString(36)}_${liteCount}`,
    label: `群演 ${liteCount + 1}`,
    position: [
      (liteCount % 2 === 0 ? 1 : -1) * 0.6 * (Math.floor(liteCount / 2) + 1),
      0,
      -0.8,
    ],
  });
  return { ...scene, actors: [...scene.actors, lite] };
}

export function addDirector3DCharacterToScene(
  scene: LinghuiDirector3DScene,
  preset: Director3DCharacterPreset,
): LinghuiDirector3DScene {
  const seq = scene.actors.filter(actor => actor.type === 'mannequin').length + 1;
  const offsetX = (seq % 2 === 1 ? 1 : -1) * 0.7 * Math.ceil(seq / 2);
  const character = createDirector3DCharacter(preset, {
    id: `char_${preset.id}_${Date.now().toString(36)}`,
    label: `${preset.label} ${seq}`,
    position: [Number(offsetX.toFixed(2)), 0, 0],
  });
  return { ...scene, actors: [...scene.actors, character] };
}

export function addDirector3DCreatureToScene(
  scene: LinghuiDirector3DScene,
  species: LinghuiDirector3DCreatureSpecies,
): LinghuiDirector3DScene {
  const seq = scene.actors.filter(actor => actor.type === 'creature').length + 1;
  const offsetX = (seq % 2 === 1 ? 1 : -1) * 1.2 * Math.ceil(seq / 2);
  const creature = createDirector3DCreature(species, {
    id: `creature_${species}_${Date.now().toString(36)}`,
    position: [Number(offsetX.toFixed(2)), 0, 0],
  });
  return { ...scene, actors: [...scene.actors, creature] };
}

export function createDirector3DRidingHorseInsertion(
  scene: LinghuiDirector3DScene,
): {
  scene: LinghuiDirector3DScene;
  riderId: string | null;
} {
  const seq = scene.actors.filter(actor => actor.groupRole === 'rider').length + 1;
  const offsetX = (seq % 2 === 1 ? 1 : -1) * 1.1 * Math.ceil(seq / 2);
  const combo = createDirector3DRidingHorse({
    label: `人骑马 ${seq}`,
    position: [Number(offsetX.toFixed(2)), 0, 0],
  });
  const riderId = combo.find(actor => actor.groupRole === 'rider')?.id ?? combo[0]?.id ?? null;
  return {
    scene: { ...scene, actors: [...scene.actors, ...combo] },
    riderId,
  };
}

export function addDirector3DActorToScene(scene: LinghuiDirector3DScene): LinghuiDirector3DScene {
  const id = `actor_${Date.now().toString(36)}`;
  const actor = createDirector3DActor({
    id,
    label: `角色${scene.actors.length + 1}`,
    position: [
      (scene.actors.length % 2 === 0 ? 1 : -1) * 0.6 * (Math.floor(scene.actors.length / 2) + 1),
      0,
      0,
    ],
  });
  return { ...scene, actors: [...scene.actors, actor] };
}

export function addDirector3DPropToScene(
  scene: LinghuiDirector3DScene,
  preset: Director3DPropPreset,
): LinghuiDirector3DScene {
  const propsInScene = scene.actors.filter(actor => actor.type === preset.type).length;
  const prop = createDirector3DProp(preset, {
    id: `${preset.type}_${Date.now().toString(36)}`,
    label: `${preset.label} ${propsInScene + 1}`,
    position: [
      (propsInScene % 2 === 0 ? 1 : -1) * 0.8 * (Math.floor(propsInScene / 2) + 1),
      0,
      -1.2,
    ],
  });
  return { ...scene, actors: [...scene.actors, prop] };
}

function applyActorGroupPatch(params: {
  scene: LinghuiDirector3DScene;
  actorId: string;
  patch: Partial<LinghuiDirector3DActor>;
}): {
  actors: LinghuiDirector3DActor[];
  changedActorIds: string[];
} {
  const { scene, actorId, patch } = params;
  const sourceActor = scene.actors.find(actor => actor.id === actorId);
  const groupId = sourceActor?.groupId;
  const shouldMoveGroup = Boolean(groupId && patch.position);
  const shouldRotateGroup = Boolean(groupId && typeof patch.rotationY === 'number');
  const deltaPosition = sourceActor && patch.position
    ? [
        patch.position[0] - sourceActor.position[0],
        patch.position[1] - sourceActor.position[1],
        patch.position[2] - sourceActor.position[2],
      ] as [number, number, number]
    : null;
  const deltaRotation = sourceActor && typeof patch.rotationY === 'number'
    ? normalizeDirector3DAngleRadians(patch.rotationY - sourceActor.rotationY)
    : 0;
  const groupMembers = groupId ? scene.actors.filter(actor => actor.groupId === groupId) : [];
  const mountPivot = groupMembers.find(actor => actor.groupRole === 'mount')?.position;
  const averagePivot: [number, number, number] | null = groupMembers.length > 0
    ? [
        groupMembers.reduce((sum, actor) => sum + actor.position[0], 0) / groupMembers.length,
        groupMembers.reduce((sum, actor) => sum + actor.position[1], 0) / groupMembers.length,
        groupMembers.reduce((sum, actor) => sum + actor.position[2], 0) / groupMembers.length,
      ]
    : null;
  const pivot: [number, number, number] = mountPivot ?? averagePivot ?? sourceActor?.position ?? [0, 0, 0];
  const actors: LinghuiDirector3DActor[] = scene.actors.map((actor): LinghuiDirector3DActor => {
    if (actor.id === actorId && !shouldRotateGroup) return { ...actor, ...patch };
    if (!groupId || actor.groupId !== groupId) return actor;
    if (shouldMoveGroup && deltaPosition) {
      return {
        ...actor,
        position: [
          Number((actor.position[0] + deltaPosition[0]).toFixed(4)),
          Number((actor.position[1] + deltaPosition[1]).toFixed(4)),
          Number((actor.position[2] + deltaPosition[2]).toFixed(4)),
        ] as [number, number, number],
      };
    }
    if (shouldRotateGroup) {
      const dx = actor.position[0] - pivot[0];
      const dz = actor.position[2] - pivot[2];
      const cos = Math.cos(deltaRotation);
      const sin = Math.sin(deltaRotation);
      const isSource = actor.id === actorId;
      return {
        ...actor,
        ...(isSource ? patch : {}),
        position: [
          Number((pivot[0] + dx * cos - dz * sin).toFixed(4)),
          isSource && patch.position ? patch.position[1] : actor.position[1],
          Number((pivot[2] + dx * sin + dz * cos).toFixed(4)),
        ] as [number, number, number],
        rotationY: normalizeDirector3DAngleRadians(actor.rotationY + deltaRotation),
      };
    }
    return actor;
  });
  const changedActorIds = groupId && (shouldMoveGroup || shouldRotateGroup)
    ? actors.filter(actor => actor.groupId === groupId).map(actor => actor.id)
    : [actorId];
  return { actors, changedActorIds };
}

export function applyDirector3DActorChange(params: {
  scene: LinghuiDirector3DScene;
  actorId: string;
  patch: Partial<LinghuiDirector3DActor>;
  currentTime: number;
}): LinghuiDirector3DScene {
  const { scene, actorId, patch, currentTime } = params;
  const { actors, changedActorIds } = applyActorGroupPatch({ scene, actorId, patch });
  const tl = scene.timeline;
  if (!tl || tl.keyframes.length === 0) {
    return { ...scene, actors };
  }
  const nextActor = actors.find(actor => actor.id === actorId);
  if (!nextActor) return { ...scene, actors };
  const t = clampTimelineTime(scene, currentTime);
  let nextKeyframes = tl.keyframes;
  for (const changedActorId of changedActorIds) {
    const actorForSnapshot = actors.find(actor => actor.id === changedActorId);
    if (!actorForSnapshot) continue;
    const scope = `actor:${changedActorId}` as const;
    const existing = nextKeyframes.find(k => k.scope === scope && Math.abs(k.time - t) < 0.02);
    const snapshot = snapshotActorAsKeyframeActor(actorForSnapshot);
    if (existing) {
      nextKeyframes = nextKeyframes.map(k => (k.id === existing.id ? { ...k, actors: [snapshot] } : k));
    } else {
      const newKf: LinghuiDirector3DKeyframe = {
        id: `kf_${Date.now().toString(36)}_${changedActorId}_${Math.random().toString(36).slice(2, 5)}`,
        time: t,
        scope,
        actors: [snapshot],
        camera: scene.camera,
      };
      nextKeyframes = [...nextKeyframes, newKf].sort((a, b) => a.time - b.time);
    }
  }
  return {
    ...scene,
    actors,
    timeline: { ...tl, keyframes: nextKeyframes },
  };
}

export function applyDirector3DCameraChange(params: {
  scene: LinghuiDirector3DScene;
  camera: LinghuiDirector3DCamera;
  orbit?: { yaw: number; pitch: number; distance: number };
  currentTime: number;
}): LinghuiDirector3DScene {
  const { scene, camera, orbit, currentTime } = params;
  const tl = scene.timeline;
  if (!tl || tl.keyframes.length === 0) {
    return { ...scene, camera };
  }
  const t = clampTimelineTime(scene, currentTime);
  const cameraClone = cloneCameraForKeyframe(camera);
  const cameraOrbit = orbit ? { ...orbit } : undefined;
  const existing = tl.keyframes.find(k => k.scope === 'camera' && Math.abs(k.time - t) < 0.02);
  let nextKeyframes = tl.keyframes;
  if (existing) {
    nextKeyframes = nextKeyframes.map(k => (k.id === existing.id ? { ...k, camera: cameraClone, ...(cameraOrbit ? { cameraOrbit } : {}) } : k));
  } else {
    const newKf: LinghuiDirector3DKeyframe = {
      id: `kf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      time: t,
      scope: 'camera',
      actors: [],
      camera: cameraClone,
      ...(cameraOrbit ? { cameraOrbit } : {}),
    };
    nextKeyframes = [...nextKeyframes, newKf].sort((a, b) => a.time - b.time);
  }
  return { ...scene, camera, timeline: { ...tl, keyframes: nextKeyframes } };
}
