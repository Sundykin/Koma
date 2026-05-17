/**
 * Director3D 共享程序化几何构建器。
 *
 * 画布预览和离屏导出都必须从这里构造 actor 的 THREE.Group。不要再在
 * r3f JSX 与 CaptureRenderer 里各自重画一套模型，否则动物 / 道具 /
 * 姿势细节会再次出现“画布正确，导出视频不一致”的漂移。
 */
import * as THREE from 'three';
import type { LinghuiDirector3DActor, LinghuiDirector3DFormationConfig } from '../../../types/linghui';
import { resolveActorRig } from './director3dRig';
import { findCreatureSpecies, resolveCreatureRig } from './director3dCreature';
import { buildExportPropGroup } from './director3dExportPropGeometry';
import {
  addBox,
  addCone,
  addCylinder,
  addMesh,
  addSphere,
  type ExportGeometryContext,
} from './director3dExportGeometryPrimitives';

const MANNEQUIN_PROPORTIONS = {
  headRadius: 0.12,
  torsoHeight: 0.6,
  torsoWidth: 0.36,
  torsoDepth: 0.2,
  upperArmLength: 0.28,
  forearmLength: 0.27,
  armRadius: 0.06,
  thighLength: 0.45,
  shinLength: 0.41,
  legRadius: 0.08,
  hipWidth: 0.18,
  shoulderWidth: 0.36,
};

export type { ExportGeometryContext } from './director3dExportGeometryPrimitives';
export { buildExportPropGroup } from './director3dExportPropGeometry';

interface FormationMember {
  key: string;
  x: number;
  z: number;
  rotationY: number;
}

function deriveExportFormationMembers(config: LinghuiDirector3DFormationConfig): FormationMember[] {
  const rows = Math.max(1, Math.min(12, Math.round(config.rows)));
  const cols = Math.max(1, Math.min(12, Math.round(config.cols)));
  const spacing = config.spacing > 0 ? config.spacing : 1;
  const halfColSpan = ((cols - 1) * spacing) / 2;
  const halfRowSpan = ((rows - 1) * spacing) / 2;
  const members: FormationMember[] = [];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = c * spacing - halfColSpan;
      const z = r * spacing - halfRowSpan;
      let rotationY = 0;
      if (config.memberFacing === 'forward') rotationY = 0;
      else if (config.memberFacing === 'away') rotationY = Math.PI;
      else if (config.memberFacing === 'inward') rotationY = Math.atan2(-x, -z);
      else if (config.memberFacing === 'outward') rotationY = Math.atan2(x, z);
      members.push({ key: `${r}-${c}`, x, z, rotationY });
    }
  }
  return members;
}

/**
 * 主角假人导出几何。复刻 Director3DMannequin.tsx 的层级结构：
 *   root → 髋部锚点（双腿，挂在 root 不随 spine 倾斜）
 *        → spine（躯干，含 neck/头、双臂 shoulder→elbow→forearm→hand）
 */
export function buildExportMannequinGroup(
  actor: LinghuiDirector3DActor,
  ctx: ExportGeometryContext,
): THREE.Group {
  const P = MANNEQUIN_PROPORTIONS;
  const rig = resolveActorRig(actor.rig, actor.posePreset);
  const hipY = P.thighLength + P.shinLength;
  const sx = (sign: number) => (P.shoulderWidth * 0.5 + P.armRadius * 0.5) * sign;
  const hx = (sign: number) => (P.hipWidth * 0.5 + P.legRadius * 0.5) * sign;

  const root = new THREE.Group();
  root.position.fromArray(actor.position);
  root.rotation.y = actor.rotationY;
  root.scale.setScalar(actor.scale);

  // 髋部锚点（双腿）—— 不随 spine 倾斜，仅自身旋转控制髋 / 膝
  const hipAnchor = new THREE.Group();
  hipAnchor.position.set(0, hipY, 0);
  (['left', 'right'] as const).forEach((side) => {
    const sign = side === 'left' ? 1 : -1;
    const hipRot = side === 'left' ? rig.leftHip : rig.rightHip;
    const kneeRot = side === 'left' ? rig.leftKnee : rig.rightKnee;
    const legRoot = new THREE.Group();
    legRoot.position.set(hx(sign), 0, 0);
    legRoot.rotation.set(hipRot[0], hipRot[1], hipRot[2]);
    addMesh(legRoot, new THREE.SphereGeometry(P.legRadius * 1.05, 16, 10), ctx);
    addMesh(legRoot, new THREE.CylinderGeometry(P.legRadius, P.legRadius * 0.9, P.thighLength, 12), ctx, [0, -P.thighLength * 0.5, 0]);
    const shinRoot = new THREE.Group();
    shinRoot.position.set(0, -P.thighLength, 0);
    shinRoot.rotation.set(kneeRot[0], kneeRot[1], kneeRot[2]);
    addMesh(shinRoot, new THREE.SphereGeometry(P.legRadius * 1.08, 16, 10), ctx);
    addMesh(shinRoot, new THREE.CylinderGeometry(P.legRadius * 0.9, P.legRadius * 0.75, P.shinLength, 12), ctx, [0, -P.shinLength * 0.5, 0]);
    addMesh(shinRoot, new THREE.BoxGeometry(0.12, 0.05, 0.22), ctx, [0, -P.shinLength - 0.025, 0.06]);
    addMesh(shinRoot, new THREE.ConeGeometry(0.06, 0.08, 12), ctx, [0, -P.shinLength - 0.018, 0.18], [Math.PI / 2, 0, 0]);
    legRoot.add(shinRoot);
    hipAnchor.add(legRoot);
  });
  root.add(hipAnchor);

  // spine → torso → head + arms
  const spineRoot = new THREE.Group();
  spineRoot.position.set(0, hipY, 0);
  spineRoot.rotation.set(rig.spine[0], rig.spine[1], rig.spine[2]);
  const torsoCenter = new THREE.Group();
  torsoCenter.position.set(0, P.torsoHeight * 0.5, 0);
  addMesh(torsoCenter, new THREE.BoxGeometry(P.torsoWidth, P.torsoHeight, P.torsoDepth), ctx);
  addMesh(torsoCenter, new THREE.BoxGeometry(P.torsoWidth * 0.48, 0.18, 0.012), ctx, [0, 0.12, P.torsoDepth * 0.51]);
  addMesh(torsoCenter, new THREE.BoxGeometry(P.torsoWidth * 0.34, 0.035, 0.012), ctx, [-P.torsoWidth * 0.13, 0.245, P.torsoDepth * 0.535], [0, 0, -0.55]);
  addMesh(torsoCenter, new THREE.BoxGeometry(P.torsoWidth * 0.34, 0.035, 0.012), ctx, [P.torsoWidth * 0.13, 0.245, P.torsoDepth * 0.535], [0, 0, 0.55]);
  addMesh(torsoCenter, new THREE.BoxGeometry(P.torsoWidth * 0.94, 0.035, 0.014), ctx, [0, -0.17, P.torsoDepth * 0.53]);
  addMesh(torsoCenter, new THREE.BoxGeometry(0.055, P.torsoHeight * 0.72, 0.014), ctx, [0, 0.02, -P.torsoDepth * 0.53]);
  addMesh(torsoCenter, new THREE.BoxGeometry(P.shoulderWidth * 1.04, 0.055, P.torsoDepth * 1.12), ctx, [0, P.torsoHeight * 0.5 - 0.035, 0]);

  // neck + head
  const neckRoot = new THREE.Group();
  neckRoot.position.set(0, P.torsoHeight * 0.5 + 0.02, 0);
  neckRoot.rotation.set(rig.neck[0], rig.neck[1], rig.neck[2]);
  addMesh(neckRoot, new THREE.SphereGeometry(P.headRadius, 24, 18), ctx, [0, P.headRadius + 0.04, 0]);
  [-1, 1].forEach(sign => addSphere(neckRoot, ctx, [sign * P.headRadius * 0.42, P.headRadius + 0.07, P.headRadius * 0.88], P.headRadius * 0.11));
  addMesh(neckRoot, new THREE.BoxGeometry(P.headRadius * 0.98, P.headRadius * 0.06, P.headRadius * 0.08), ctx, [0, P.headRadius + 0.105, P.headRadius * 0.9]);
  addMesh(neckRoot, new THREE.ConeGeometry(P.headRadius * 0.16, P.headRadius * 0.14, 12), ctx, [0, P.headRadius + 0.025, P.headRadius * 0.98], [Math.PI / 2, 0, 0]);
  addMesh(neckRoot, new THREE.BoxGeometry(P.headRadius * 0.56, P.headRadius * 0.045, P.headRadius * 0.05), ctx, [0, P.headRadius - 0.04, P.headRadius * 0.91]);
  [-1, 1].forEach(sign => addSphere(neckRoot, ctx, [sign * P.headRadius * 0.98, P.headRadius + 0.035, 0], P.headRadius * 0.22, [0.55, 0.82, 0.22]));
  addMesh(neckRoot, new THREE.BoxGeometry(P.headRadius * 0.82, P.headRadius * 0.18, P.headRadius * 0.08), ctx, [0, P.headRadius + 0.12, -P.headRadius * 0.82]);
  torsoCenter.add(neckRoot);

  // 双臂（shoulder → elbow → forearm + 手）
  (['left', 'right'] as const).forEach((side) => {
    const sign = side === 'left' ? 1 : -1;
    const shoulderRot = side === 'left' ? rig.leftShoulder : rig.rightShoulder;
    const elbowRot = side === 'left' ? rig.leftElbow : rig.rightElbow;
    const shoulderRoot = new THREE.Group();
    shoulderRoot.position.set(sx(sign), P.torsoHeight * 0.5 - 0.04, 0);
    shoulderRoot.rotation.set(shoulderRot[0], shoulderRot[1], shoulderRot[2]);
    addMesh(shoulderRoot, new THREE.SphereGeometry(P.armRadius * 1.18, 16, 10), ctx);
    addMesh(shoulderRoot, new THREE.CylinderGeometry(P.armRadius, P.armRadius * 0.9, P.upperArmLength, 12), ctx, [0, -P.upperArmLength * 0.5, 0]);
    const elbowRoot = new THREE.Group();
    elbowRoot.position.set(0, -P.upperArmLength, 0);
    elbowRoot.rotation.set(elbowRot[0], elbowRot[1], elbowRot[2]);
    addMesh(elbowRoot, new THREE.SphereGeometry(P.armRadius * 1.05, 14, 10), ctx);
    addMesh(elbowRoot, new THREE.CylinderGeometry(P.armRadius * 0.9, P.armRadius * 0.75, P.forearmLength, 12), ctx, [0, -P.forearmLength * 0.5, 0]);
    addMesh(elbowRoot, new THREE.SphereGeometry(P.armRadius * 1.05, 12, 8), ctx, [0, -P.forearmLength - P.armRadius * 0.6, 0]);
    addSphere(elbowRoot, ctx, [sign * P.armRadius * 0.7, -P.forearmLength - P.armRadius * 0.5, P.armRadius * 0.58], P.armRadius * 0.38);
    shoulderRoot.add(elbowRoot);
    torsoCenter.add(shoulderRoot);
  });

  spineRoot.add(torsoCenter);
  root.add(spineRoot);

  return root;
}

export function buildExportLiteMannequinGroup(
  actor: LinghuiDirector3DActor,
  ctx: ExportGeometryContext,
): THREE.Group {
  const root = new THREE.Group();
  root.position.fromArray(actor.position);
  root.rotation.y = actor.rotationY;
  root.scale.setScalar(actor.scale);

  const headRadius = 0.11;
  const shoulderWidth = 0.36;
  const hipWidth = 0.26;
  const torsoTop = 0.18;
  const torsoBot = 0.13;
  const torsoHeight = 0.55;
  const armRadius = 0.045;
  const armLength = 0.5;
  const legRadius = 0.07;
  const legLength = 0.75;
  const torsoCenter = legLength + torsoHeight / 2;
  const shoulderY = legLength + torsoHeight - 0.06;
  const headCenter = shoulderY + headRadius + 0.04;
  const shoulderX = shoulderWidth / 2 + armRadius * 0.6;
  const hipX = hipWidth / 2 - legRadius * 0.2;

  addCylinder(root, ctx, [0, torsoCenter, 0], torsoTop, torsoBot, torsoHeight, 14);
  addBox(root, ctx, [0, torsoCenter + 0.04, torsoTop * 0.96], [shoulderWidth * 0.36, 0.14, 0.012]);
  addBox(root, ctx, [0, torsoCenter, -torsoTop * 0.98], [0.04, torsoHeight * 0.64, 0.012]);
  addSphere(root, ctx, [0, headCenter, 0], headRadius);
  addBox(root, ctx, [0, headCenter + headRadius * 0.08, headRadius * 0.92], [headRadius * 0.72, headRadius * 0.12, headRadius * 0.07]);
  addCone(root, ctx, [0, headCenter - headRadius * 0.18, headRadius * 0.98], headRadius * 0.12, headRadius * 0.12, 10, [Math.PI / 2, 0, 0]);
  [-1, 1].forEach((sign) => {
    addCylinder(root, ctx, [sign * shoulderX, shoulderY - armLength / 2, 0], armRadius, armRadius, armLength, 10);
    addCylinder(root, ctx, [sign * hipX, legLength / 2, 0], legRadius, legRadius, legLength, 10);
    addBox(root, ctx, [sign * hipX, 0.03, 0.08], [0.11, 0.055, 0.18]);
  });

  return root;
}

export function buildExportFormationGroup(
  actor: LinghuiDirector3DActor,
  ctx: ExportGeometryContext,
): THREE.Group {
  const root = new THREE.Group();
  root.position.fromArray(actor.position);
  root.rotation.y = actor.rotationY;
  root.scale.setScalar(actor.scale);

  const config = actor.formation ?? { rows: 1, cols: 1, spacing: 1, memberFacing: 'forward' as const };
  const members = deriveExportFormationMembers(config);
  const headRadius = 0.10;
  const torsoTop = 0.16;
  const torsoBot = 0.12;
  const torsoHeight = 0.50;
  const legRadius = 0.065;
  const legLength = 0.70;
  const hipWidth = 0.22;
  const torsoCenterY = legLength + torsoHeight / 2;
  const shoulderY = legLength + torsoHeight - 0.05;
  const headCenterY = shoulderY + headRadius + 0.03;
  const hipX = hipWidth / 2 - legRadius * 0.2;

  members.forEach((member) => {
    const memberGroup = new THREE.Group();
    memberGroup.position.set(member.x, 0, member.z);
    memberGroup.rotation.y = member.rotationY;
    addCylinder(memberGroup, ctx, [0, torsoCenterY, 0], torsoTop, torsoBot, torsoHeight, 12);
    addBox(memberGroup, ctx, [0, torsoCenterY + 0.035, torsoTop * 0.96], [torsoTop * 0.72, 0.11, 0.01]);
    addBox(memberGroup, ctx, [0, torsoCenterY, -torsoTop * 0.98], [0.034, torsoHeight * 0.56, 0.01]);
    addSphere(memberGroup, ctx, [0, headCenterY, 0], headRadius);
    addBox(memberGroup, ctx, [0, headCenterY + headRadius * 0.08, headRadius * 0.92], [headRadius * 0.58, headRadius * 0.1, headRadius * 0.06]);
    addCone(memberGroup, ctx, [0, headCenterY - headRadius * 0.16, headRadius * 0.96], headRadius * 0.1, headRadius * 0.1, 8, [Math.PI / 2, 0, 0]);
    [-1, 1].forEach(sign => addCylinder(memberGroup, ctx, [sign * hipX, legLength / 2, 0], legRadius, legRadius, legLength, 10));
    root.add(memberGroup);
  });

  return root;
}

/**
 * 生物（动物 / 玄幻生物）导出几何。简化版的 Director3DCreatureMesh：
 * 按 form factor（四足 / 飞禽 / 龙）拼几何 + 套用 creatureRig 关节旋转。
 */
export function buildExportCreatureGroup(
  actor: LinghuiDirector3DActor,
  ctx: ExportGeometryContext,
): THREE.Group {
  const root = new THREE.Group();
  root.position.fromArray(actor.position);
  root.rotation.y = actor.rotationY;
  root.scale.setScalar(actor.scale);

  const species = findCreatureSpecies(actor.species);
  const rig = resolveCreatureRig(actor.creatureRig, actor.creatureAction ?? 'idle');
  if (species.form === 'quadruped') {
    const legLen = species.bodyHeight * (species.kind === 'bear' ? 0.36 : species.kind === 'horse' || species.kind === 'deer' || species.kind === 'qilin' ? 0.58 : 0.46);
    const shoulderY = legLen;
    const bodyLength = species.bodyLength * (species.kind === 'bear' ? 0.72 : 0.78);
    const bodyWidth = species.bodyLength * (species.kind === 'bear' ? 0.34 : species.kind === 'horse' ? 0.22 : 0.26);
    const bodyHeight = species.bodyHeight * (species.kind === 'bear' ? 0.36 : 0.3);
    const legRadius = bodyWidth * (species.kind === 'bear' ? 0.17 : 0.12);
    const frontZ = bodyLength * 0.36;
    const rearZ = -bodyLength * 0.34;
    const sideX = bodyWidth * 0.42;
    const neckLength = species.bodyHeight * (species.kind === 'horse' || species.kind === 'deer' || species.kind === 'qilin' ? 0.38 : species.kind === 'bear' ? 0.18 : 0.24);
    const headSize = species.bodyHeight * (species.kind === 'bear' ? 0.2 : species.kind === 'horse' ? 0.17 : 0.16);
    const muzzleLength = headSize * (species.kind === 'horse' || species.kind === 'deer' ? 1.35 : species.kind === 'wolf' || species.kind === 'fox' ? 1.22 : species.kind === 'bear' ? 0.75 : 0.88);
    const tailLength = species.bodyLength * (species.kind === 'horse' ? 0.48 : species.kind === 'fox' ? 0.62 : 0.38);
    const tailRadius = Math.max(0.025, bodyWidth * 0.08);
    const footZ = species.kind === 'bear' ? 0.12 : 0.08;
    const legAnchors = [
      { rot: rig.frontLeftLeg, pos: [sideX, shoulderY + bodyHeight * 0.18, frontZ] as [number, number, number] },
      { rot: rig.frontRightLeg, pos: [-sideX, shoulderY + bodyHeight * 0.18, frontZ] as [number, number, number] },
      { rot: rig.rearLeftLeg, pos: [sideX, shoulderY - bodyHeight * 0.03, rearZ] as [number, number, number] },
      { rot: rig.rearRightLeg, pos: [-sideX, shoulderY - bodyHeight * 0.03, rearZ] as [number, number, number] },
    ];

    const spineRoot = new THREE.Group();
    spineRoot.position.set(0, shoulderY, 0);
    spineRoot.rotation.set(rig.spine[0], rig.spine[1], rig.spine[2]);
    addMesh(spineRoot, new THREE.CapsuleGeometry(bodyWidth * 0.46, bodyLength * 0.5, 5, 12), ctx, [0, bodyHeight * 0.08, bodyLength * 0.1], [Math.PI / 2, 0, 0]);
    addMesh(spineRoot, new THREE.CapsuleGeometry(bodyWidth * (species.kind === 'bear' ? 0.58 : 0.42), bodyLength * 0.35, 5, 12), ctx, [0, -bodyHeight * 0.02, -bodyLength * 0.23], [Math.PI / 2, 0, 0]);

    const neckRoot = new THREE.Group();
    neckRoot.position.set(0, bodyHeight * 0.2, frontZ);
    neckRoot.rotation.set(rig.neck[0], rig.neck[1], rig.neck[2]);
    addMesh(neckRoot, new THREE.CapsuleGeometry(headSize * 0.35, neckLength * 0.65, 4, 10), ctx, [0, neckLength * 0.12, neckLength * 0.45], [Math.PI / 2.25, 0, 0]);
    addSphere(neckRoot, ctx, [0, neckLength * 0.18, neckLength * 0.88], headSize * 0.78, [1, 0.82, 1.08]);
    addBox(neckRoot, ctx, [0, neckLength * 0.05, neckLength * 1.25], [headSize * 0.9, headSize * 0.55, muzzleLength]);
    addSphere(neckRoot, ctx, [0, neckLength * 0.03, neckLength * 1.25 + muzzleLength * 0.52], headSize * 0.14, [1, 0.6, 0.3]);
    [-1, 1].forEach(sign => addSphere(neckRoot, ctx, [sign * headSize * 0.28, neckLength * 0.28, neckLength * 1.14], headSize * 0.065));
    if (species.hasHorns) {
      [-1, 1].forEach(sign => {
        addCylinder(neckRoot, ctx, [sign * headSize * 0.35, neckLength * 0.7, neckLength * 0.78], headSize * 0.045, headSize * 0.075, headSize * 1.15, 6, [-0.35, 0, sign * 0.35]);
        if (species.kind === 'deer' || species.kind === 'qilin') {
          [0.34, 0.62].forEach((offset, i) => addCylinder(neckRoot, ctx, [sign * headSize * (0.43 + i * 0.04), neckLength * 0.7 + headSize * offset, neckLength * 0.78], headSize * 0.018, headSize * 0.032, headSize * 0.42, 6, [0.46, 0, sign * (0.68 + i * 0.18)]));
        }
      });
    }
    spineRoot.add(neckRoot);

    const tailRoot = new THREE.Group();
    tailRoot.position.set(0, bodyHeight * 0.08, -bodyLength * 0.46);
    tailRoot.rotation.set(rig.tail[0], rig.tail[1], rig.tail[2]);
    addCylinder(tailRoot, ctx, [0, 0, -tailLength * 0.42], tailRadius * 0.4, tailRadius, tailLength, 8, [Math.PI / 2, 0, 0]);
    if (species.kind === 'fox') {
      [-2, -1, 0, 1, 2].forEach(i => addCone(tailRoot, ctx, [i * tailRadius * 1.55, tailRadius * 0.7, -tailLength * 0.95], tailRadius * 1.8, tailLength * 0.28, 10, [Math.PI / 2, 0, i * 0.18]));
    } else if (species.kind === 'lion') {
      addSphere(tailRoot, ctx, [0, tailRadius * 0.1, -tailLength * 0.98], tailRadius * 2.3);
    }
    spineRoot.add(tailRoot);
    root.add(spineRoot);

    legAnchors.forEach((leg) => {
      addSphere(root, ctx, leg.pos, legRadius * (species.kind === 'bear' ? 1.45 : 1.16), [1.2, 0.78, 1.08]);
      const legGroup = new THREE.Group();
      legGroup.position.set(leg.pos[0], leg.pos[1], leg.pos[2]);
      legGroup.rotation.set(leg.rot[0], leg.rot[1], leg.rot[2]);
      addMesh(legGroup, new THREE.CapsuleGeometry(legRadius, legLen * 0.52, 4, 8), ctx, [0, -legLen * 0.27, 0]);
      addSphere(legGroup, ctx, [0, -legLen * 0.54, footZ * 0.08], legRadius * 1.05);
      addMesh(legGroup, new THREE.CapsuleGeometry(legRadius * 0.82, legLen * 0.46, 4, 8), ctx, [0, -legLen * 0.78, footZ * 0.12]);
      if (species.kind === 'horse' || species.kind === 'deer' || species.kind === 'qilin') {
        addCylinder(legGroup, ctx, [0, -legLen - legRadius * 0.14, 0], legRadius * 0.9, legRadius * 1.06, legRadius * 1.4, 8);
        addBox(legGroup, ctx, [0, -legLen - legRadius, footZ + legRadius * 0.5], [legRadius * 1.85, legRadius * 0.74, legRadius * 1.5]);
      } else {
        addSphere(legGroup, ctx, [0, -legLen, footZ], legRadius * (species.kind === 'bear' ? 1.45 : 1.05), [1.35, species.kind === 'bear' ? 0.55 : 0.45, species.kind === 'bear' ? 2.05 : 1.8]);
        (species.kind === 'bear' ? [-0.7, 0, 0.7] : [-0.48, 0.48]).forEach(toe => {
          addCone(legGroup, ctx, [toe * legRadius, -legLen - legRadius * 0.12, footZ + legRadius * 1.16], legRadius * (species.kind === 'bear' ? 0.64 : 0.46), legRadius * 1.15, 8, [Math.PI / 2, 0, toe * 0.18]);
        });
      }
      root.add(legGroup);
    });

    return root;
  }

  const bodyY = species.bodyHeight * 0.62;

  // 躯干（spine 旋转）
  const spineRoot = new THREE.Group();
  spineRoot.position.set(0, bodyY, 0);
  spineRoot.rotation.set(rig.spine[0], rig.spine[1], rig.spine[2]);

  if (species.form === 'serpent-dragon') {
    // 蛇形 5 段
    const segCount = 5;
    const segLen = species.bodyLength / segCount;
    const r = species.bodyHeight * 0.18;
    for (let i = 0; i < segCount; i++) {
      const offset = (i - (segCount - 1) / 2) * segLen;
      const tapered = r * (1 - Math.abs(offset) / species.bodyLength * 0.6);
      const cyl = new THREE.CylinderGeometry(tapered, r, segLen * 1.05, 10);
      cyl.rotateX(Math.PI / 2);
      addMesh(spineRoot, cyl, ctx, [0, 0, offset]);
      addCone(spineRoot, ctx, [0, r * 0.68, offset], r * 0.32, r * 0.38, 6, [Math.PI / 2, 0, 0]);
    }
  } else {
    const bodyHeight = species.bodyHeight * 0.4;
    if (species.form === 'avian') {
      const cyl = new THREE.CylinderGeometry(bodyHeight * 0.4, bodyHeight * 0.3, species.bodyLength * 0.7, 12);
      cyl.rotateX(Math.PI / 2);
      addMesh(spineRoot, cyl, ctx);
    } else {
      addMesh(spineRoot, new THREE.BoxGeometry(species.bodyLength * 0.28, bodyHeight, species.bodyLength * 0.7), ctx);
    }
  }

  // 颈 + 头
  const neckRoot = new THREE.Group();
  if (species.form === 'serpent-dragon') {
    neckRoot.position.set(0, species.bodyHeight * 0.18 * 0.6, species.bodyLength * 0.5);
  } else if (species.form === 'avian') {
    neckRoot.position.set(0, species.bodyHeight * 0.45 * 0.35, species.bodyLength * 0.25);
  } else {
    neckRoot.position.set(0, species.bodyHeight * 0.4 * 0.4, species.bodyLength * 0.32 * 0.55);
  }
  neckRoot.rotation.set(rig.neck[0], rig.neck[1], rig.neck[2]);
  const headSize = species.bodyHeight * 0.2;
  addMesh(neckRoot, new THREE.SphereGeometry(headSize, 16, 12), ctx, [0, headSize + 0.04, 0]);
  if (species.form === 'serpent-dragon') {
    const r = species.bodyHeight * 0.18;
    addBox(neckRoot, ctx, [0, headSize * 0.78, headSize * 0.95], [r * 0.82, r * 0.38, r * 0.72]);
    [-1, 1].forEach(sign => {
      addSphere(neckRoot, ctx, [sign * r * 0.34, headSize * 1.08, r * 0.86], r * 0.09);
      [-1, 1].forEach(row => addCylinder(neckRoot, ctx, [sign * r * 0.55, headSize * (0.82 + row * 0.08), r * 1.08], r * 0.025, r * 0.025, r * 1.45, 6, [Math.PI / 2, 0, sign * (0.58 + row * 0.14)]));
      addCone(neckRoot, ctx, [sign * r * 0.5, headSize * 1.6, r * 0.2], r * 0.15, r * 1.1, 6, [-0.3, 0, sign * 0.3]);
      [0.34, 0.62].forEach((height, i) => addCone(neckRoot, ctx, [sign * r * (0.54 + i * 0.04), headSize * 1.55 + r * height, r * 0.2], r * 0.045, r * 0.5, 6, [-0.08, 0, sign * (0.78 + i * 0.16)]));
    });
  } else if (species.form === 'avian') {
    addCone(neckRoot, ctx, [0, headSize + 0.04, headSize * 1.05], headSize * 0.46, species.bodyHeight * (species.kind === 'crane' ? 0.18 : 0.14), 7, [Math.PI / 2, 0, 0]);
  }
  spineRoot.add(neckRoot);

  // 尾巴
  const tailRoot = new THREE.Group();
  tailRoot.position.set(0, 0, -species.bodyLength * 0.34);
  tailRoot.rotation.set(rig.tail[0], rig.tail[1], rig.tail[2]);
  const tailLen = species.bodyLength * (species.form === 'serpent-dragon' ? 0.8 : 0.45);
  const tailGeo = new THREE.ConeGeometry(species.bodyLength * 0.05, tailLen, 8);
  tailGeo.rotateX(Math.PI / 2);
  addMesh(tailRoot, tailGeo, ctx, [0, 0, -tailLen * 0.5]);
  spineRoot.add(tailRoot);

  root.add(spineRoot);

  // 四肢 / 翅膀（挂在 root，不随 spine）
  if (species.form === 'serpent-dragon') {
    const legLen = species.bodyHeight * 0.55;
    const legRadius = species.bodyLength * 0.05;
    const sideX = species.bodyLength * 0.14;
    const frontZ = species.bodyLength * 0.32;
    const rearZ = -species.bodyLength * 0.32;
    const legs = [
      { rot: rig.frontLeftLeg, pos: [sideX, bodyY * 0.78, frontZ] as [number, number, number] },
      { rot: rig.frontRightLeg, pos: [-sideX, bodyY * 0.78, frontZ] as [number, number, number] },
      { rot: rig.rearLeftLeg, pos: [sideX, bodyY * 0.78, rearZ] as [number, number, number] },
      { rot: rig.rearRightLeg, pos: [-sideX, bodyY * 0.78, rearZ] as [number, number, number] },
    ];
    legs.forEach((leg) => {
      const legGroup = new THREE.Group();
      legGroup.position.set(leg.pos[0], leg.pos[1], leg.pos[2]);
      legGroup.rotation.set(leg.rot[0], leg.rot[1], leg.rot[2]);
      addMesh(legGroup, new THREE.CylinderGeometry(legRadius * 0.7, legRadius, legLen, 8), ctx, [0, -legLen * 0.5, 0]);
      [-1, 0, 1].forEach(toe => addCone(legGroup, ctx, [toe * legRadius * 0.26, -legLen - legRadius * 0.08, legRadius * 0.6], legRadius * 0.18, legRadius * 0.56, 6, [Math.PI / 2, 0, toe * 0.18]));
      root.add(legGroup);
    });
  } else if (species.form === 'avian') {
    const wingSpan = species.bodyLength * (species.kind === 'crane' ? 1.45 : 1.95);
    const wingChord = species.bodyLength * 0.34;
    const featherCount = species.kind === 'phoenix' ? 7 : species.kind === 'crane' ? 6 : 5;
    const leftWing = new THREE.Group();
    leftWing.position.set(0, bodyY + species.bodyHeight * 0.08, species.bodyLength * 0.02);
    leftWing.rotation.set(rig.frontLeftLeg[0], rig.frontLeftLeg[1], rig.frontLeftLeg[2]);
    addBox(leftWing, ctx, [wingSpan * 0.18, 0, -wingChord * 0.02], [wingSpan * 0.36, wingChord * 0.3, 0.035], [Math.PI / 2, 0, -0.16]);
    Array.from({ length: featherCount }).forEach((_, i) => {
      const t = i / Math.max(1, featherCount - 1);
      addCone(leftWing, ctx, [wingSpan * (0.18 + t * 0.34), -wingChord * (0.1 + t * 0.36), -wingChord * (0.03 + t * 0.06)], wingChord * (0.11 - t * 0.025), wingChord * (0.5 + t * 0.18), 7, [Math.PI / 2, 0, -0.3 + t * 0.18]);
    });
    root.add(leftWing);

    const rightWing = new THREE.Group();
    rightWing.position.set(0, bodyY + species.bodyHeight * 0.08, species.bodyLength * 0.02);
    rightWing.rotation.set(rig.frontRightLeg[0], rig.frontRightLeg[1], rig.frontRightLeg[2]);
    addBox(rightWing, ctx, [-wingSpan * 0.18, 0, -wingChord * 0.02], [wingSpan * 0.36, wingChord * 0.3, 0.035], [Math.PI / 2, 0, 0.16]);
    Array.from({ length: featherCount }).forEach((_, i) => {
      const t = i / Math.max(1, featherCount - 1);
      addCone(rightWing, ctx, [-wingSpan * (0.18 + t * 0.34), -wingChord * (0.1 + t * 0.36), -wingChord * (0.03 + t * 0.06)], wingChord * (0.11 - t * 0.025), wingChord * (0.5 + t * 0.18), 7, [Math.PI / 2, 0, 0.3 - t * 0.18]);
    });
    root.add(rightWing);

    // 两条立腿（rearLeft/Right）
    const legLen = species.bodyHeight * 0.4;
    const bodyHeight = species.bodyHeight * 0.45;
    ([rig.rearLeftLeg, rig.rearRightLeg]).forEach((rot, i) => {
      const legGroup = new THREE.Group();
      legGroup.position.set((i === 0 ? 1 : -1) * bodyHeight * 0.2, bodyY * 0.7, 0);
      legGroup.rotation.set(rot[0], rot[1], rot[2]);
      addMesh(legGroup, new THREE.CylinderGeometry(bodyHeight * 0.06, bodyHeight * 0.08, legLen, 8), ctx, [0, -legLen * 0.5, 0]);
      [-1, 0, 1].forEach(toe => addCone(legGroup, ctx, [toe * bodyHeight * 0.055, -legLen, bodyHeight * 0.09], bodyHeight * 0.028, bodyHeight * 0.11, 6, [Math.PI / 2, 0, toe * 0.54]));
      root.add(legGroup);
    });
  }

  return root;
}

export function buildDirector3DActorGroup(
  actor: LinghuiDirector3DActor,
  ctx: ExportGeometryContext,
): THREE.Group {
  if (actor.type === 'mannequin') {
    return buildExportMannequinGroup(actor, ctx);
  }
  if (actor.type === 'mannequin-lite') {
    return buildExportLiteMannequinGroup(actor, ctx);
  }
  if (actor.type === 'formation') {
    return buildExportFormationGroup(actor, ctx);
  }
  if (actor.type === 'creature') {
    return buildExportCreatureGroup(actor, ctx);
  }
  return buildExportPropGroup(actor, ctx);
}
