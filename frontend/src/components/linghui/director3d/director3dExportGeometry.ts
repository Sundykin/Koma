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
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
) {
  const mesh = new THREE.Mesh(geometry, ctx.fillMat);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  parent.add(mesh);
  if (ctx.drawEdges) {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), ctx.wireMat);
    edges.position.copy(mesh.position);
    edges.rotation.copy(mesh.rotation);
    edges.scale.copy(mesh.scale);
    parent.add(edges);
  }
}

function propKind(label: string): string {
  const text = label.toLowerCase();
  if (text.includes('长桌') || text.includes('table')) return 'table';
  if (text.includes('椅') || text.includes('chair')) return 'chair';
  if (text.includes('凳') || text.includes('stool')) return 'stool';
  if (text.includes('床') || text.includes('bed')) return 'bed';
  if (text.includes('柜') || text.includes('cabinet') || text.includes('wardrobe')) return 'cabinet';
  if (text.includes('汽车') || text.includes('car') || text.includes('车厢')) return 'car';
  if (text.includes('自行车') || text.includes('bike') || text.includes('bicycle')) return 'bike';
  if (text.includes('树') || text.includes('tree')) return 'tree';
  if (text.includes('灌木') || text.includes('bush')) return 'bush';
  if (text.includes('岩石') || text.includes('rock') || text.includes('山巅岩')) return 'rock';
  if (text.includes('门') || text.includes('door')) return 'door';
  if (text.includes('窗') || text.includes('window')) return 'window';
  if (text.includes('屏幕') || text.includes('screen') || text.includes('display')) return 'screen';
  if (text.includes('聚光灯') || text.includes('light') || text.includes('spotlight')) return 'light';
  if (text.includes('麦克风') || text.includes('mic') || text.includes('microphone')) return 'mic';
  if (text.includes('基座') || text.includes('pedestal') || text.includes('圆台') || text.includes('云台')) return 'pedestal';
  if (text.includes('方箱') || text.includes('crate')) return 'crate';
  if (text.includes('圆柱') || text.includes('barrel')) return 'barrel';
  return 'generic';
}

function addBox(
  parent: THREE.Group,
  ctx: ExportGeometryContext,
  position: [number, number, number],
  size: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
) {
  addMesh(parent, new THREE.BoxGeometry(size[0], size[1], size[2]), ctx, position, rotation);
}

function addCylinder(
  parent: THREE.Group,
  ctx: ExportGeometryContext,
  position: [number, number, number],
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments = 12,
  rotation: [number, number, number] = [0, 0, 0],
) {
  addMesh(parent, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), ctx, position, rotation);
}

function addCone(
  parent: THREE.Group,
  ctx: ExportGeometryContext,
  position: [number, number, number],
  radius: number,
  height: number,
  segments = 10,
  rotation: [number, number, number] = [0, 0, 0],
) {
  addMesh(parent, new THREE.ConeGeometry(radius, height, segments), ctx, position, rotation);
}

function addSphere(
  parent: THREE.Group,
  ctx: ExportGeometryContext,
  position: [number, number, number],
  radius: number,
  scale: [number, number, number] = [1, 1, 1],
) {
  addMesh(parent, new THREE.SphereGeometry(radius, 14, 10), ctx, position, [0, 0, 0], scale);
}

function addTorus(
  parent: THREE.Group,
  ctx: ExportGeometryContext,
  position: [number, number, number],
  radius: number,
  tube: number,
  rotation: [number, number, number] = [0, 0, 0],
) {
  addMesh(parent, new THREE.TorusGeometry(radius, tube, 8, 24), ctx, position, rotation);
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
    if (species.hasHorns) {
      [-1, 1].forEach(sign => {
        addCylinder(neckRoot, ctx, [sign * headSize * 0.35, neckLength * 0.7, neckLength * 0.78], headSize * 0.045, headSize * 0.075, headSize * 1.15, 6, [-0.35, 0, sign * 0.35]);
      });
    }
    spineRoot.add(neckRoot);

    const tailRoot = new THREE.Group();
    tailRoot.position.set(0, bodyHeight * 0.08, -bodyLength * 0.46);
    tailRoot.rotation.set(rig.tail[0], rig.tail[1], rig.tail[2]);
    addCylinder(tailRoot, ctx, [0, 0, -tailLength * 0.42], tailRadius * 0.4, tailRadius, tailLength, 8, [Math.PI / 2, 0, 0]);
    if (species.kind === 'fox') {
      [-1, 0, 1].forEach(i => addCone(tailRoot, ctx, [i * tailRadius * 1.8, tailRadius * 0.7, -tailLength * 0.95], tailRadius * 1.8, tailLength * 0.28, 10, [Math.PI / 2, 0, i * 0.25]));
    } else if (species.kind === 'lion') {
      addSphere(tailRoot, ctx, [0, tailRadius * 0.1, -tailLength * 0.98], tailRadius * 2.3);
    }
    spineRoot.add(tailRoot);
    root.add(spineRoot);

    [
      { rot: rig.frontLeftLeg, pos: [sideX, shoulderY + bodyHeight * 0.18, frontZ] as [number, number, number] },
      { rot: rig.frontRightLeg, pos: [-sideX, shoulderY + bodyHeight * 0.18, frontZ] as [number, number, number] },
      { rot: rig.rearLeftLeg, pos: [sideX, shoulderY - bodyHeight * 0.03, rearZ] as [number, number, number] },
      { rot: rig.rearRightLeg, pos: [-sideX, shoulderY - bodyHeight * 0.03, rearZ] as [number, number, number] },
    ].forEach((leg) => {
      const legGroup = new THREE.Group();
      legGroup.position.set(leg.pos[0], leg.pos[1], leg.pos[2]);
      legGroup.rotation.set(leg.rot[0], leg.rot[1], leg.rot[2]);
      addMesh(legGroup, new THREE.CapsuleGeometry(legRadius, legLen, 4, 8), ctx, [0, -legLen * 0.5, 0]);
      if (species.kind === 'horse' || species.kind === 'deer' || species.kind === 'qilin') {
        addCylinder(legGroup, ctx, [0, -legLen - legRadius * 0.14, 0], legRadius * 0.9, legRadius * 1.06, legRadius * 1.4, 8);
        addBox(legGroup, ctx, [0, -legLen - legRadius, footZ + legRadius * 0.5], [legRadius * 1.85, legRadius * 0.74, legRadius * 1.5]);
      } else {
        addSphere(legGroup, ctx, [0, -legLen, footZ], legRadius * (species.kind === 'bear' ? 1.45 : 1.05), [1.35, species.kind === 'bear' ? 0.55 : 0.45, species.kind === 'bear' ? 2.05 : 1.8]);
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
      root.add(legGroup);
    });
  }

  return root;
}

export function buildExportPropGroup(
  actor: LinghuiDirector3DActor,
  ctx: ExportGeometryContext,
): THREE.Group {
  const root = new THREE.Group();
  root.position.fromArray(actor.position);
  root.rotation.y = actor.rotationY;
  root.scale.setScalar(actor.scale);

  const kind = propKind(actor.label);

  if (actor.type === 'prop-box') {
    if (kind === 'table') {
      addBox(root, ctx, [0, 0.72, 0], [1.35, 0.12, 0.72]);
      [-1, 1].forEach(x => [-1, 1].forEach(z => addCylinder(root, ctx, [x * 0.55, 0.34, z * 0.25], 0.035, 0.035, 0.68, 8)));
      addBox(root, ctx, [0, 0.58, 0.31], [1.18, 0.055, 0.04]);
      addBox(root, ctx, [0, 0.58, -0.31], [1.18, 0.055, 0.04]);
      addBox(root, ctx, [-0.55, 0.3, 0], [0.035, 0.04, 0.5]);
      addBox(root, ctx, [0.55, 0.3, 0], [0.035, 0.04, 0.5]);
      return root;
    }
    if (kind === 'chair') {
      addBox(root, ctx, [0, 0.46, 0], [0.6, 0.1, 0.55]);
      addBox(root, ctx, [0, 0.82, -0.23], [0.62, 0.62, 0.08], [0.18, 0, 0]);
      [-0.18, 0, 0.18].forEach(x => addBox(root, ctx, [x, 0.82, -0.17], [0.035, 0.46, 0.018]));
      [-1, 1].forEach(x => [-1, 1].forEach(z => addCylinder(root, ctx, [x * 0.22, 0.21, z * 0.2], 0.026, 0.026, 0.42, 8)));
      addBox(root, ctx, [0, 0.26, 0.22], [0.44, 0.035, 0.028]);
      addBox(root, ctx, [-0.24, 0.28, 0], [0.03, 0.035, 0.38]);
      addBox(root, ctx, [0.24, 0.28, 0], [0.03, 0.035, 0.38]);
      return root;
    }
    if (kind === 'bed') {
      addBox(root, ctx, [0, 0.34, 0], [1.55, 0.24, 0.9]);
      addBox(root, ctx, [0, 0.51, 0.02], [1.42, 0.11, 0.78]);
      addBox(root, ctx, [0, 0.59, -0.04], [1.24, 0.045, 0.55]);
      addBox(root, ctx, [0, 0.64, -0.38], [1.48, 0.54, 0.08]);
      addBox(root, ctx, [0, 0.63, 0.28], [0.48, 0.12, 0.25]);
      [-0.42, 0, 0.42].forEach(x => addBox(root, ctx, [x, 0.66, -0.33], [0.04, 0.42, 0.035]));
      return root;
    }
    if (kind === 'cabinet') {
      addBox(root, ctx, [0, 0.65, 0], [0.82, 1.25, 0.5]);
      addBox(root, ctx, [0, 0.65, 0.26], [0.02, 1.12, 0.02]);
      [-1, 1].forEach(sign => addSphere(root, ctx, [sign * 0.12, 0.68, 0.285], 0.035));
      [0.32, 0.68, 1.04].forEach(y => addBox(root, ctx, [0, y, 0.29], [0.7, 0.025, 0.03]));
      [-1, 1].forEach(sign => addBox(root, ctx, [sign * 0.2, 0.65, 0.285], [0.3, 0.92, 0.025]));
      return root;
    }
    if (kind === 'car') {
      addBox(root, ctx, [0, 0.38, 0], [1.4, 0.35, 0.72]);
      addBox(root, ctx, [0, 0.53, 0.38], [1.18, 0.18, 0.2]);
      addBox(root, ctx, [0, 0.63, -0.04], [0.78, 0.28, 0.46]);
      [-1, 1].forEach(sign => addBox(root, ctx, [sign * 0.41, 0.65, -0.04], [0.064, 0.22, 0.4]));
      addBox(root, ctx, [0, 0.52, 0.38], [1.26, 0.12, 0.05]);
      [-1, 1].forEach(x => [-1, 1].forEach(z => {
        addCylinder(root, ctx, [x * 0.72, 0.2, z * 0.28], 0.15, 0.15, 0.08, 18, [0, 0, Math.PI / 2]);
        addCylinder(root, ctx, [x * 0.765, 0.2, z * 0.28], 0.07, 0.07, 0.09, 16, [0, 0, Math.PI / 2]);
      }));
      addBox(root, ctx, [0, 0.39, 0.38], [0.62, 0.08, 0.035]);
      addBox(root, ctx, [0, 0.38, -0.38], [0.54, 0.06, 0.035]);
      return root;
    }
    if (kind === 'rock') {
      addMesh(root, new THREE.DodecahedronGeometry(0.55, 0), ctx, [0, 0.38, 0], [0.08, 0.18, -0.12], [1.05, 0.82, 0.75]);
      addMesh(root, new THREE.DodecahedronGeometry(0.35, 0), ctx, [0.22, 0.56, 0.08], [0.1, -0.35, 0.18], [0.52, 0.36, 0.4]);
      return root;
    }
    if (kind === 'crate') {
      addBox(root, ctx, [0, 0.4, 0], [0.9, 0.8, 0.6]);
      [-0.24, 0, 0.24].forEach(x => addBox(root, ctx, [x, 0.4, 0.334], [0.035, 0.68, 0.018]));
      addBox(root, ctx, [0, 0.4, 0.31], [0.82, 0.08, 0.025]);
      addBox(root, ctx, [0, 0.78, 0.32], [0.88, 0.055, 0.03]);
      addBox(root, ctx, [0, 0.03, 0.32], [0.88, 0.055, 0.03]);
      addBox(root, ctx, [-0.43, 0.4, 0.32], [0.055, 0.78, 0.03]);
      addBox(root, ctx, [0.43, 0.4, 0.32], [0.055, 0.78, 0.03]);
      addBox(root, ctx, [0, 0.4, 0.315], [0.9, 0.055, 0.025], [0, 0, 0.68]);
      addBox(root, ctx, [0, 0.4, 0.318], [0.9, 0.055, 0.025], [0, 0, -0.68]);
      return root;
    }
    addBox(root, ctx, [0, 0.4, 0], [0.9, 0.8, 0.6]);
    return root;
  }

  if (actor.type === 'prop-cylinder') {
    if (kind === 'tree') {
      addCylinder(root, ctx, [0, 0.68, 0], 0.12, 0.18, 1.35, 12);
      [0, 1, 2].forEach(i => addSphere(root, ctx, [(i - 1) * 0.18, 1.42 + (i % 2) * 0.12, (i % 2) * 0.1], 0.45 - i * 0.03, [1, 0.82, 1]));
      [-0.08, 0.08].forEach(x => addCylinder(root, ctx, [x, 1.05, 0.08], 0.025, 0.04, 0.46, 8, [0.8, 0, x > 0 ? -0.55 : 0.55]));
      return root;
    }
    if (kind === 'bush') {
      [-1, 0, 1].forEach(x => addSphere(root, ctx, [x * 0.22, 0.34 + Math.abs(x) * 0.08, 0], 0.32, [1, 0.72, 1]));
      return root;
    }
    if (kind === 'bike') {
      [-1, 1].forEach(sign => {
        addTorus(root, ctx, [sign * 0.42, 0.34, 0], 0.22, 0.018);
        addCylinder(root, ctx, [sign * 0.42, 0.34, 0], 0.045, 0.045, 0.035, 12, [Math.PI / 2, 0, 0]);
      });
      [
        { pos: [0, 0.43, 0] as [number, number, number], rot: 0, len: 0.72 },
        { pos: [0.2, 0.52, 0] as [number, number, number], rot: -0.7, len: 0.48 },
        { pos: [-0.2, 0.52, 0] as [number, number, number], rot: 0.7, len: 0.48 },
        { pos: [0, 0.62, 0] as [number, number, number], rot: 0, len: 0.52 },
      ].forEach(bar => addCylinder(root, ctx, bar.pos, 0.016, 0.016, bar.len, 8, [0, 0, Math.PI / 2 + bar.rot]));
      addCylinder(root, ctx, [0.42, 0.56, 0], 0.014, 0.014, 0.48, 8, [0, 0, 0.16]);
      addCylinder(root, ctx, [-0.24, 0.59, 0], 0.014, 0.014, 0.32, 8, [0, 0, -0.08]);
      addBox(root, ctx, [0.12, 0.66, 0], [0.25, 0.045, 0.12]);
      addBox(root, ctx, [0.5, 0.76, 0], [0.24, 0.025, 0.06], [0, 0, 0.18]);
      addCylinder(root, ctx, [0.48, 0.72, 0], 0.012, 0.012, 0.3, 8, [0, 0, 0.18]);
      return root;
    }
    if (kind === 'mic') {
      addCylinder(root, ctx, [0, 0.48, 0], 0.025, 0.025, 0.86, 10);
      addSphere(root, ctx, [0, 0.93, 0], 0.12);
      addCylinder(root, ctx, [0, 0.08, 0], 0.22, 0.22, 0.04, 18);
      return root;
    }
    if (kind === 'stool') {
      addCylinder(root, ctx, [0, 0.46, 0], 0.32, 0.32, 0.1, 18);
      [0, 1, 2].forEach(i => {
        const a = i * (Math.PI * 2 / 3);
        addCylinder(root, ctx, [Math.cos(a) * 0.18, 0.21, Math.sin(a) * 0.18], 0.026, 0.026, 0.42, 8);
      });
      return root;
    }
    if (kind === 'pedestal') {
      addCylinder(root, ctx, [0, 0.38, 0], 0.28, 0.34, 0.76, 24);
      addCylinder(root, ctx, [0, 0.79, 0], 0.38, 0.34, 0.12, 24);
      return root;
    }
    addCylinder(root, ctx, [0, 0.45, 0], 0.34, 0.39, 0.9, 18);
    if (kind === 'barrel') {
      [0.2, 0.45, 0.7].forEach((y, i) => addTorus(root, ctx, [0, y, 0], i === 1 ? 0.355 : 0.36, i === 1 ? 0.018 : 0.025, [Math.PI / 2, 0, 0]));
      Array.from({ length: 6 }).forEach((_, i) => {
        const a = i * (Math.PI * 2 / 6);
        addBox(root, ctx, [Math.cos(a) * 0.35, 0.45, Math.sin(a) * 0.35], [0.032, 0.78, 0.018], [0, -a, 0]);
      });
    }
    return root;
  }

  if (actor.type === 'prop-plane') {
    addBox(root, ctx, [0, 1, 0], [1.6, 2, 0.05]);
    if (kind === 'door') {
      addBox(root, ctx, [0, 1.9, 0.08], [1.48, 0.08, 0.08]);
      addBox(root, ctx, [-0.72, 1, 0.08], [0.08, 1.84, 0.08]);
      addBox(root, ctx, [0.72, 1, 0.08], [0.08, 1.84, 0.08]);
      addBox(root, ctx, [0, 1, 0.035], [1.36, 1.72, 0.035]);
      addBox(root, ctx, [0, 1.35, 0.075], [1.02, 0.045, 0.03]);
      addBox(root, ctx, [0, 0.68, 0.075], [1.02, 0.045, 0.03]);
      addSphere(root, ctx, [0.48, 0.98, 0.07], 0.055);
      return root;
    }
    if (kind === 'window') {
      addBox(root, ctx, [0, 1.73, 0.085], [1.48, 0.075, 0.055]);
      addBox(root, ctx, [0, 0.27, 0.085], [1.48, 0.075, 0.055]);
      addBox(root, ctx, [-0.72, 1, 0.085], [0.075, 1.48, 0.055]);
      addBox(root, ctx, [0.72, 1, 0.085], [0.075, 1.48, 0.055]);
      addBox(root, ctx, [0, 1, 0.04], [1.32, 1.42, 0.035]);
      addBox(root, ctx, [0, 1, 0.08], [1.36, 0.055, 0.035]);
      addBox(root, ctx, [0, 1, 0.085], [0.055, 1.42, 0.035]);
      return root;
    }
    if (kind === 'screen') {
      addBox(root, ctx, [0, 1, 0.04], [1.42, 1.72, 0.025]);
      addBox(root, ctx, [0, 1.88, 0.08], [1.56, 0.055, 0.04]);
      addBox(root, ctx, [0, 0.12, 0.08], [1.56, 0.055, 0.04]);
      addBox(root, ctx, [-0.78, 1, 0.08], [0.055, 1.76, 0.04]);
      addBox(root, ctx, [0.78, 1, 0.08], [0.055, 1.76, 0.04]);
      addCylinder(root, ctx, [0, 0.1, 0], 0.09, 0.09, 0.2, 14);
      addBox(root, ctx, [0, -0.03, 0], [0.62, 0.045, 0.28]);
    }
    return root;
  }

  if (actor.type === 'prop-camera') {
    addBox(root, ctx, [0, 0.5, 0], [0.4, 0.3, 0.55]);
    addCylinder(root, ctx, [0, 0.5, 0.4], 0.12, 0.16, 0.25, 18, [Math.PI / 2, 0, 0]);
    if (kind === 'light') {
      addCone(root, ctx, [0, 0.5, 0.58], 0.26, 0.38, 20, [Math.PI / 2, 0, 0]);
      addCone(root, ctx, [0, 0.5, 0.8], 0.38, 0.82, 24, [Math.PI / 2, 0, 0]);
    } else {
      addBox(root, ctx, [0, 0.72, -0.08], [0.22, 0.08, 0.12]);
      addCylinder(root, ctx, [0, 0.18, -0.08], 0.035, 0.035, 0.64, 8);
    }
    addCylinder(root, ctx, [0, 0.5, 1.05], 0.01, 0.01, 1.2, 8, [Math.PI / 2, 0, 0]);
    return root;
  }

  if (actor.type === 'prop-arrow') {
    addCylinder(root, ctx, [0, 0.1, 0.5], 0.05, 0.05, 1, 12, [Math.PI / 2, 0, 0]);
    addCone(root, ctx, [0, 0.1, 1.1], 0.16, 0.32, 18, [-Math.PI / 2, 0, 0]);
  }

  return root;
}
