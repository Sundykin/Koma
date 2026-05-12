import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDirector3DActor, createDirector3DCreature } from './director3dScene';
import { buildExportCreatureGroup, buildExportPropGroup, type ExportGeometryContext } from './director3dExportGeometry';

const ctx: ExportGeometryContext = {
  drawEdges: true,
  wireMat: new THREE.LineBasicMaterial({ color: 0x111111 }),
  fillMat: new THREE.MeshBasicMaterial({ color: 0xffffff }),
};

function countMeshes(group: THREE.Object3D): number {
  let count = 0;
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) count += 1;
  });
  return count;
}

describe('director3dExportGeometry', () => {
  it('导出汽车不退化成单个盒子，而是包含车身、车窗和四轮结构', () => {
    const actor = createDirector3DActor({ type: 'prop-box', label: '汽车' });
    const group = buildExportPropGroup(actor, ctx);

    expect(countMeshes(group)).toBeGreaterThanOrEqual(14);
    expect(group.position.toArray()).toEqual(actor.position);
  });

  it('导出自行车保留轮圈和三角车架结构', () => {
    const actor = createDirector3DActor({ type: 'prop-cylinder', label: '自行车' });
    const group = buildExportPropGroup(actor, ctx);

    expect(countMeshes(group)).toBeGreaterThanOrEqual(12);
    const torusCount = group.children.filter(child => (
      child instanceof THREE.Mesh && child.geometry instanceof THREE.TorusGeometry
    )).length;
    expect(torusCount).toBe(2);
  });

  it('导出门窗类平面道具包含框架细节', () => {
    const actor = createDirector3DActor({ type: 'prop-plane', label: '窗' });
    const group = buildExportPropGroup(actor, ctx);

    expect(countMeshes(group)).toBeGreaterThanOrEqual(8);
  });

  it('导出四足动物保留身体和四肢，不再只有躯干占位', () => {
    const actor = createDirector3DCreature('deer', { id: 'deer_1' });
    const group = buildExportCreatureGroup(actor, ctx);

    expect(countMeshes(group)).toBeGreaterThanOrEqual(7);
  });
});
