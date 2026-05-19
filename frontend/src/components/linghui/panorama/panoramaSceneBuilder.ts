/**
 * Panorama 渲染管线的"单一事实源"：
 *   - 相机 lookAt 公式（yaw=0 → +Z；pitch>0 → 朝上；yaw>0 → 朝右）
 *   - sphere/cylinder/flat 几何参数 + scale=[-1,1,1] + BackSide 材质
 *
 * 预览（PanoramaViewer 内 CameraRig + PanoramaGeometry）与离屏抽取
 * （panoramaPerspectiveSnapshot）必须经由这里构造，避免出现"看到的是 +Z，截出来是 -Z"
 * 这类两套手算公式 drift 导致的前后/左右整体翻转。
 */
import * as THREE from 'three';
import type { PanoramaViewerMode } from './panoramaProjection';
import {
  SPHERE_RADIUS, SPHERE_BAND_THETA_START, SPHERE_BAND_THETA_LENGTH,
  SPHERE_FULL_THETA_START, SPHERE_FULL_THETA_LENGTH, CYLINDER_RADIUS,
} from './panoramaViewerConstants';

/** 与 PanoramaGeometryComponents 共用的 X 翻转，让等距柱状贴图朝内贴时方向不反 */
export const PANORAMA_MESH_SCALE: readonly [number, number, number] = [-1, 1, 1];

/**
 * Viewer 唯一的相机朝向公式。yaw=0 → 朝 +Z；pitch>0 → 朝上；yaw>0 → 朝右。
 * CameraRig 和 snapshot 都走这一个函数，公式不再各写一份。
 */
export function applyPanoramaCameraLookAt(
  camera: THREE.Camera,
  yaw: number,
  pitch: number,
): void {
  const cp = Math.cos(pitch);
  camera.position.set(0, 0, 0);
  camera.lookAt(
    Math.sin(yaw) * cp,
    Math.sin(pitch),
    Math.cos(yaw) * cp,
  );
}

function buildBackSideMaterial(texture: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, toneMapped: false });
}

export function buildPanoramaSphereFullMesh(texture: THREE.Texture): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(
    SPHERE_RADIUS, 96, 48,
    0, Math.PI * 2,
    SPHERE_FULL_THETA_START, SPHERE_FULL_THETA_LENGTH,
  );
  const mesh = new THREE.Mesh(geometry, buildBackSideMaterial(texture));
  mesh.scale.set(PANORAMA_MESH_SCALE[0], PANORAMA_MESH_SCALE[1], PANORAMA_MESH_SCALE[2]);
  return mesh;
}

export function buildPanoramaSphereBandMesh(texture: THREE.Texture): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(
    SPHERE_RADIUS, 64, 32,
    0, Math.PI * 2,
    SPHERE_BAND_THETA_START, SPHERE_BAND_THETA_LENGTH,
  );
  const mesh = new THREE.Mesh(geometry, buildBackSideMaterial(texture));
  mesh.scale.set(PANORAMA_MESH_SCALE[0], PANORAMA_MESH_SCALE[1], PANORAMA_MESH_SCALE[2]);
  return mesh;
}

function readTextureAspect(texture: THREE.Texture, fallback: number): number {
  const img = texture.image as { width?: number; height?: number } | undefined;
  if (img && typeof img.width === 'number' && typeof img.height === 'number' && img.height > 0) {
    return img.width / img.height;
  }
  return fallback;
}

export function buildPanoramaCylinderMesh(texture: THREE.Texture): THREE.Mesh {
  const aspect = readTextureAspect(texture, 21 / 9);
  const circumference = 2 * Math.PI * CYLINDER_RADIUS;
  const height = circumference / Math.max(aspect, 0.5);
  const geometry = new THREE.CylinderGeometry(CYLINDER_RADIUS, CYLINDER_RADIUS, height, 64, 1, true);
  const mesh = new THREE.Mesh(geometry, buildBackSideMaterial(texture));
  mesh.scale.set(PANORAMA_MESH_SCALE[0], PANORAMA_MESH_SCALE[1], PANORAMA_MESH_SCALE[2]);
  return mesh;
}

export function buildPanoramaFlatPlaneMesh(texture: THREE.Texture): THREE.Mesh {
  const aspect = readTextureAspect(texture, 16 / 9);
  const geometry = new THREE.PlaneGeometry(60 * aspect, 60);
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, -SPHERE_RADIUS * 0.6);
  return mesh;
}

export function buildPanoramaMesh(
  viewerMode: PanoramaViewerMode,
  texture: THREE.Texture,
): THREE.Mesh {
  if (viewerMode === 'equirect-sphere') return buildPanoramaSphereFullMesh(texture);
  if (viewerMode === 'sphere-band') return buildPanoramaSphereBandMesh(texture);
  if (viewerMode === 'cylinder-band') return buildPanoramaCylinderMesh(texture);
  return buildPanoramaFlatPlaneMesh(texture);
}

export function disposePanoramaMesh(mesh: THREE.Mesh): void {
  mesh.geometry?.dispose();
  const material = mesh.material;
  if (Array.isArray(material)) {
    material.forEach((item) => item.dispose());
  } else if (material) {
    material.dispose();
  }
}
