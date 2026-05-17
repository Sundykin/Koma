import type {
  LinghuiDirector3DActor,
  LinghuiDirector3DCamera,
  LinghuiDirector3DExportResolution,
  LinghuiDirector3DKeyframe,
  LinghuiDirector3DKeyframeActor,
  LinghuiDirector3DEasing,
  LinghuiDirector3DRig,
  LinghuiDirector3DScene,
  LinghuiDirector3DTimeline,
} from '../../../types/linghui';
import { lerpRig, resolveActorRig } from './director3dRig';
import { lerpCreatureRig, resolveCreatureRig } from './director3dCreature';

const TWO_PI = Math.PI * 2;

export const DIRECTOR3D_DEFAULT_TIMELINE: LinghuiDirector3DTimeline = {
  version: 1,
  keyframes: [],
  duration: 8,
  fps: 24,
  easing: 'ease-in-out',
  exportResolution: '720p',
};

/**
 * 视频导出分辨率档位 → 垂直像素数。宽度运行时按 aspectRatio 计算（width = round(h * ratio)），
 * 这样 16:9 给 1280×720、21:9 给 2520×1080，符合常见视频生成模型的输入预期。
 */
export const DIRECTOR3D_EXPORT_RESOLUTION_HEIGHTS: Record<LinghuiDirector3DExportResolution, number> = {
  '480p': 480,
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
  '2160p': 2160,
};

export const DIRECTOR3D_EXPORT_RESOLUTION_OPTIONS: Array<{
  value: LinghuiDirector3DExportResolution;
  label: string;
  hint: string;
}> = [
  { value: '480p', label: '480p', hint: '低质量预览，导出最快' },
  { value: '720p', label: '720p', hint: 'HD（默认）' },
  { value: '1080p', label: '1080p', hint: 'Full HD' },
  { value: '1440p', label: '1440p', hint: '2K' },
  { value: '2160p', label: '2160p', hint: '4K，耗时长 + 显存吃紧' },
];

/** 解析持久化数据里的 exportResolution，缺失或非法时回退到 720p */
export function resolveDirector3DExportResolution(
  value: unknown,
): LinghuiDirector3DExportResolution {
  if (value === '480p' || value === '720p' || value === '1080p' || value === '1440p' || value === '2160p') {
    return value;
  }
  return '720p';
}

/**
 * 把分辨率档位 + aspectRatio 转成最终输出 (width, height)。
 * 长边夹在 [256, 3840]；short edge 也保底 256。
 */
export function resolveDirector3DExportDimensions(
  resolution: LinghuiDirector3DExportResolution,
  aspectRatio: string,
): { width: number; height: number } {
  const targetHeight = DIRECTOR3D_EXPORT_RESOLUTION_HEIGHTS[resolution] ?? 720;
  const parts = (aspectRatio || '16:9').split(':');
  const ratio = parts.length === 2 ? Number(parts[0]) / Number(parts[1]) : 16 / 9;
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 16 / 9;
  const rawWidth = Math.round(targetHeight * safeRatio);
  // 编码器通常要求偶数尺寸；夹紧到 [256, 3840] 并 floor 到偶数
  const clamp = (value: number) => Math.max(256, Math.min(3840, value)) & ~1;
  return {
    width: clamp(rawWidth),
    height: clamp(targetHeight),
  };
}

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

export function cloneRig(rig: LinghuiDirector3DRig): LinghuiDirector3DRig {
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

  // 按 scope 拆轨。原则：scope-specific（actor:{id} / camera）优先；scene 帧只在没有
  // specific 帧时作为 fallback —— 让每个图层真正独立。
  const actorPrimaryTracks = new Map<string, LinghuiDirector3DKeyframe[]>();
  const actorFallbackTracks = new Map<string, LinghuiDirector3DKeyframe[]>();
  const cameraPrimaryTrack: LinghuiDirector3DKeyframe[] = [];
  const cameraFallbackTrack: LinghuiDirector3DKeyframe[] = [];
  for (const kf of timeline.keyframes) {
    const scope = kf.scope ?? 'scene';
    if (scope === 'camera') {
      cameraPrimaryTrack.push(kf);
    } else if (scope === 'scene') {
      cameraFallbackTrack.push(kf);
      for (const actor of kf.actors) {
        const list = actorFallbackTracks.get(actor.id) ?? [];
        list.push(kf);
        actorFallbackTracks.set(actor.id, list);
      }
    } else if (scope.startsWith('actor:')) {
      const actorId = scope.slice('actor:'.length);
      const list = actorPrimaryTracks.get(actorId) ?? [];
      list.push(kf);
      actorPrimaryTracks.set(actorId, list);
    }
  }
  // 每个 actor 选用的实际轨：有 primary 用 primary，否则 fallback
  const resolveActorTrack = (actorId: string): LinghuiDirector3DKeyframe[] => {
    const primary = actorPrimaryTracks.get(actorId);
    if (primary && primary.length > 0) return primary;
    return actorFallbackTracks.get(actorId) ?? [];
  };
  const cameraTrack = cameraPrimaryTrack.length > 0 ? cameraPrimaryTrack : cameraFallbackTrack;

  // 兼容老插值流程：用 scene 全量轨道找全局段（只为 background 兜底）
  const { left: sceneLeft } = locateKeyframeSegment(timeline.keyframes, time);
  const sceneSegmentLeft = sceneLeft >= 0 ? timeline.keyframes[sceneLeft] : null;

  const nextActors: LinghuiDirector3DActor[] = scene.actors.map((actor) => {
    const actorKeyframes = resolveActorTrack(actor.id);
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
      const kf1 = cameraTrack[camSegment.left];
      const kf2 = cameraTrack[camSegment.right];
      const c1 = kf1.camera;
      const c2 = kf2.camera;
      const camAlpha = camSegment.left === camSegment.right ? 0 : applyEasing(camSegment.alpha, timeline.easing);
      // 优先用 cameraOrbit (累计 yaw) 做轨道空间插值，重算 position
      // → 用户拍下 yaw=0 与 yaw=4π 的两帧时，插值真的走完两圈环绕
      if (kf1.cameraOrbit && kf2.cameraOrbit) {
        const yaw = lerp(kf1.cameraOrbit.yaw, kf2.cameraOrbit.yaw, camAlpha);
        const pitch = lerp(kf1.cameraOrbit.pitch, kf2.cameraOrbit.pitch, camAlpha);
        const distance = lerp(kf1.cameraOrbit.distance, kf2.cameraOrbit.distance, camAlpha);
        const target = lerpVec3(c1.target, c2.target, camAlpha);
        const cosP = Math.cos(pitch);
        const position: [number, number, number] = [
          Math.sin(yaw) * cosP * distance + target[0],
          Math.sin(pitch) * distance + target[1],
          Math.cos(yaw) * cosP * distance + target[2],
        ];
        nextCamera = {
          ...c1,
          position,
          target,
          fov: Number(lerp(c1.fov, c2.fov, camAlpha).toFixed(2)),
          roll: Number(lerp(c1.roll, c2.roll, camAlpha).toFixed(2)),
          aspectRatio: c1.aspectRatio,
        };
      } else {
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
  }

  return {
    ...scene,
    actors: nextActors,
    camera: nextCamera,
    background: sceneSegmentLeft?.background ?? scene.background,
  };
}
