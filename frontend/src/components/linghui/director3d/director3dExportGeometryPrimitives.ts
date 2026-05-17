import * as THREE from 'three';

export interface ExportGeometryContext {
  drawEdges: boolean;
  wireMat: THREE.Material;
  fillMat: THREE.Material;
}

export function addMesh(
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

export function addBox(
  parent: THREE.Group,
  ctx: ExportGeometryContext,
  position: [number, number, number],
  size: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
) {
  addMesh(parent, new THREE.BoxGeometry(size[0], size[1], size[2]), ctx, position, rotation);
}

export function addCylinder(
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

export function addCone(
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

export function addSphere(
  parent: THREE.Group,
  ctx: ExportGeometryContext,
  position: [number, number, number],
  radius: number,
  scale: [number, number, number] = [1, 1, 1],
) {
  addMesh(parent, new THREE.SphereGeometry(radius, 14, 10), ctx, position, [0, 0, 0], scale);
}

export function addTorus(
  parent: THREE.Group,
  ctx: ExportGeometryContext,
  position: [number, number, number],
  radius: number,
  tube: number,
  rotation: [number, number, number] = [0, 0, 0],
) {
  addMesh(parent, new THREE.TorusGeometry(radius, tube, 8, 24), ctx, position, rotation);
}
