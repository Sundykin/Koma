import * as THREE from 'three';
import type { LinghuiDirector3DActor } from '../../../types/linghui';
import {
  addBox,
  addCone,
  addCylinder,
  addMesh,
  addSphere,
  addTorus,
  type ExportGeometryContext,
} from './director3dExportGeometryPrimitives';

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
  if (text.includes('石柱') || text.includes('柱') || text.includes('pillar') || text.includes('column')) return 'pillar';
  if (text.includes('香烛') || text.includes('蜡烛') || text.includes('candle')) return 'candle';
  if (text.includes('门') || text.includes('door')) return 'door';
  if (text.includes('窗') || text.includes('window')) return 'window';
  if (text.includes('墙') || text.includes('wall')) return 'wall';
  if (text.includes('屏幕') || text.includes('screen') || text.includes('display')) return 'screen';
  if (text.includes('聚光灯') || text.includes('light') || text.includes('spotlight')) return 'light';
  if (text.includes('麦克风') || text.includes('mic') || text.includes('microphone')) return 'mic';
  if (text.includes('基座') || text.includes('pedestal') || text.includes('圆台') || text.includes('云台')) return 'pedestal';
  if (text.includes('方箱') || text.includes('crate')) return 'crate';
  if (text.includes('圆柱') || text.includes('barrel')) return 'barrel';
  return 'generic';
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
        [0, 1, 2].forEach(i => addBox(root, ctx, [x * 0.772, 0.2, z * 0.28], [0.012, 0.19, 0.012], [0, 0, i * Math.PI / 3]));
      }));
      [-1, 1].forEach(sign => addBox(root, ctx, [sign * 0.32, 0.45, 0.382], [0.018, 0.22, 0.018]));
      addBox(root, ctx, [0, 0.39, 0.38], [0.62, 0.08, 0.035]);
      addBox(root, ctx, [0, 0.38, -0.38], [0.54, 0.06, 0.035]);
      return root;
    }
    if (kind === 'rock') {
      addMesh(root, new THREE.DodecahedronGeometry(0.55, 0), ctx, [0, 0.38, 0], [0.08, 0.18, -0.12], [1.05, 0.82, 0.75]);
      addMesh(root, new THREE.DodecahedronGeometry(0.35, 0), ctx, [0.22, 0.56, 0.08], [0.1, -0.35, 0.18], [0.52, 0.36, 0.4]);
      [0, 1, 2].forEach(i => addBox(root, ctx, [-0.2 + i * 0.18, 0.65 - i * 0.08, 0.43], [0.22, 0.018, 0.018], [0, 0, -0.55 + i * 0.28]));
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
      Array.from({ length: 5 }).forEach((_, i) => addBox(root, ctx, [0, 0.42 + i * 0.18, 0.145], [0.028, 0.16, 0.018], [0.08, 0, (i % 2 === 0 ? 1 : -1) * 0.12]));
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
        [0, 1, 2, 3].forEach(i => addBox(root, ctx, [sign * 0.42, 0.34, 0], [0.01, 0.39, 0.01], [0, 0, i * Math.PI / 4]));
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
      [0, 1, 2].forEach(i => addTorus(root, ctx, [0, 0.91 + i * 0.035, 0], 0.104 - i * 0.01, 0.004, [Math.PI / 2, 0, 0]));
      addCylinder(root, ctx, [0, 0.08, 0], 0.22, 0.22, 0.04, 18);
      return root;
    }
    if (kind === 'pillar') {
      addCylinder(root, ctx, [0, 0.5, 0], 0.18, 0.2, 1, 18);
      [0.08, 0.5, 0.92].forEach((y, i) => addTorus(root, ctx, [0, y, 0], 0.2, i === 1 ? 0.012 : 0.024, [Math.PI / 2, 0, 0]));
      addCylinder(root, ctx, [0, 1.04, 0], 0.26, 0.22, 0.12, 18);
      return root;
    }
    if (kind === 'candle') {
      addCylinder(root, ctx, [0, 0.28, 0], 0.07, 0.08, 0.56, 16);
      addCone(root, ctx, [0, 0.6, 0], 0.09, 0.22, 14, [0, 0, Math.PI]);
      addSphere(root, ctx, [0, 0.62, 0], 0.045);
      addCylinder(root, ctx, [0, 0.02, 0], 0.16, 0.16, 0.04, 18);
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
    if (kind === 'wall') {
      Array.from({ length: 5 }).forEach((_, i) => addBox(root, ctx, [0, 0.28 + i * 0.36, 0.065], [1.52, 0.028, 0.03]));
      [-0.48, 0, 0.48].forEach(x => addBox(root, ctx, [x, 1, 0.07], [0.028, 1.58, 0.026]));
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
