/**
 * 离屏导出（CaptureRenderer）用的 vanilla three.js 几何构建器。
 *
 * 为什么不复用 Director3DMannequin / Director3DCreatureMesh 组件？
 *   - 它们是 r3f JSX，必须挂在 Canvas 内才能渲染
 *   - CaptureRenderer 走的是离屏 WebGLRenderer，与主 Canvas 完全独立
 *
 * 这里直接对照那两个组件的层级结构 + rig 旋转，构造 THREE.Group，
 * 保证"所见即所得"——导出的关节姿势与 viewport 完全一致。
 */
import * as THREE from 'three';
import type { LinghuiDirector3DActor } from '../../../types/linghui';
import { resolveActorRig } from './director3dRig';
import { findCreatureSpecies, resolveCreatureRig } from './director3dCreature';

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

export interface ExportGeometryContext {
  drawEdges: boolean;
  wireMat: THREE.Material;
  fillMat: THREE.Material;
}

function addMesh(
  parent: THREE.Group,
  geometry: THREE.BufferGeometry,
  ctx: ExportGeometryContext,
  position: [number, number, number] = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(geometry, ctx.fillMat);
  mesh.position.set(position[0], position[1], position[2]);
  parent.add(mesh);
  if (ctx.drawEdges) {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), ctx.wireMat);
    edges.position.copy(mesh.position);
    parent.add(edges);
  }
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
    addMesh(legRoot, new THREE.CylinderGeometry(P.legRadius, P.legRadius * 0.9, P.thighLength, 12), ctx, [0, -P.thighLength * 0.5, 0]);
    const shinRoot = new THREE.Group();
    shinRoot.position.set(0, -P.thighLength, 0);
    shinRoot.rotation.set(kneeRot[0], kneeRot[1], kneeRot[2]);
    addMesh(shinRoot, new THREE.CylinderGeometry(P.legRadius * 0.9, P.legRadius * 0.75, P.shinLength, 12), ctx, [0, -P.shinLength * 0.5, 0]);
    addMesh(shinRoot, new THREE.BoxGeometry(0.12, 0.05, 0.22), ctx, [0, -P.shinLength - 0.025, 0.06]);
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

  // neck + head
  const neckRoot = new THREE.Group();
  neckRoot.position.set(0, P.torsoHeight * 0.5 + 0.02, 0);
  neckRoot.rotation.set(rig.neck[0], rig.neck[1], rig.neck[2]);
  addMesh(neckRoot, new THREE.SphereGeometry(P.headRadius, 24, 18), ctx, [0, P.headRadius + 0.04, 0]);
  // 鼻尖（指向）
  addMesh(neckRoot, new THREE.SphereGeometry(P.headRadius * 0.18, 12, 8), ctx, [0, P.headRadius + 0.04, P.headRadius * 0.85]);
  torsoCenter.add(neckRoot);

  // 双臂（shoulder → elbow → forearm + 手）
  (['left', 'right'] as const).forEach((side) => {
    const sign = side === 'left' ? 1 : -1;
    const shoulderRot = side === 'left' ? rig.leftShoulder : rig.rightShoulder;
    const elbowRot = side === 'left' ? rig.leftElbow : rig.rightElbow;
    const shoulderRoot = new THREE.Group();
    shoulderRoot.position.set(sx(sign), P.torsoHeight * 0.5 - 0.04, 0);
    shoulderRoot.rotation.set(shoulderRot[0], shoulderRot[1], shoulderRot[2]);
    addMesh(shoulderRoot, new THREE.CylinderGeometry(P.armRadius, P.armRadius * 0.9, P.upperArmLength, 12), ctx, [0, -P.upperArmLength * 0.5, 0]);
    const elbowRoot = new THREE.Group();
    elbowRoot.position.set(0, -P.upperArmLength, 0);
    elbowRoot.rotation.set(elbowRot[0], elbowRot[1], elbowRot[2]);
    addMesh(elbowRoot, new THREE.CylinderGeometry(P.armRadius * 0.9, P.armRadius * 0.75, P.forearmLength, 12), ctx, [0, -P.forearmLength * 0.5, 0]);
    addMesh(elbowRoot, new THREE.SphereGeometry(P.armRadius * 1.05, 12, 8), ctx, [0, -P.forearmLength - P.armRadius * 0.6, 0]);
    shoulderRoot.add(elbowRoot);
    torsoCenter.add(shoulderRoot);
  });

  spineRoot.add(torsoCenter);
  root.add(spineRoot);

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
  if (species.form === 'quadruped' || species.form === 'serpent-dragon') {
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
      root.add(legGroup);
    });
  } else if (species.form === 'avian') {
    // 两条立腿（rearLeft/Right）
    const legLen = species.bodyHeight * 0.4;
    const bodyHeight = species.bodyHeight * 0.45;
    ([rig.rearLeftLeg, rig.rearRightLeg]).forEach((rot, i) => {
      const legGroup = new THREE.Group();
      legGroup.position.set((i === 0 ? 1 : -1) * bodyHeight * 0.2, bodyY * 0.7, 0);
      legGroup.rotation.set(rot[0], rot[1], rot[2]);
      addMesh(legGroup, new THREE.CylinderGeometry(bodyHeight * 0.06, bodyHeight * 0.08, legLen, 8), ctx, [0, -legLen * 0.5, 0]);
      root.add(legGroup);
    });
  }

  return root;
}
