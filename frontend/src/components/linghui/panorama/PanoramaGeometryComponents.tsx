import React, { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PanoramaViewerMode } from './panoramaProjection';
import {
  SPHERE_RADIUS, SPHERE_BAND_THETA_START, SPHERE_BAND_THETA_LENGTH,
  SPHERE_FULL_THETA_START, SPHERE_FULL_THETA_LENGTH, CYLINDER_RADIUS,
  SCENE_BG_COLOR,
} from './panoramaViewerConstants';

function readTextureAspect(texture: THREE.Texture, fallback = 16 / 9): number {
  const img = texture.image as { width?: number; height?: number } | undefined;
  if (img && typeof img.width === 'number' && typeof img.height === 'number' && img.height > 0) return img.width / img.height;
  return fallback;
}

export function PanoramaSphereBand({ texture }: { texture: THREE.Texture }) {
  const args = useMemo<[number, number, number, number, number, number, number]>(
    () => [SPHERE_RADIUS, 64, 32, 0, Math.PI * 2, SPHERE_BAND_THETA_START, SPHERE_BAND_THETA_LENGTH], [],
  );
  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={args} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} />
    </mesh>
  );
}

export function PanoramaSphereFull({ texture }: { texture: THREE.Texture }) {
  const args = useMemo<[number, number, number, number, number, number, number]>(
    () => [SPHERE_RADIUS, 96, 48, 0, Math.PI * 2, SPHERE_FULL_THETA_START, SPHERE_FULL_THETA_LENGTH], [],
  );
  const { gl } = useThree();
  useEffect(() => {
    const maxAnisotropy = gl?.capabilities?.getMaxAnisotropy?.() ?? 0;
    if (maxAnisotropy > 0 && texture.anisotropy !== maxAnisotropy) {
      texture.anisotropy = maxAnisotropy;
      texture.needsUpdate = true;
    }
  }, [gl, texture]);
  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={args} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} />
    </mesh>
  );
}

export function PanoramaCylinder({ texture }: { texture: THREE.Texture }) {
  const args = useMemo<[number, number, number, number, number, boolean]>(() => {
    const aspect = readTextureAspect(texture, 21 / 9);
    const circumference = 2 * Math.PI * CYLINDER_RADIUS;
    const height = circumference / Math.max(aspect, 0.5);
    return [CYLINDER_RADIUS, CYLINDER_RADIUS, height, 64, 1, true];
  }, [texture]);
  return (
    <mesh scale={[-1, 1, 1]}>
      <cylinderGeometry args={args} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} />
    </mesh>
  );
}

export function PanoramaFlatPlane({ texture }: { texture: THREE.Texture }) {
  const args = useMemo<[number, number]>(() => {
    const aspect = readTextureAspect(texture, 16 / 9);
    return [60 * aspect, 60];
  }, [texture]);
  return (
    <mesh position={[0, 0, -SPHERE_RADIUS * 0.6]}>
      <planeGeometry args={args} />
      <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}

export function PanoramaGeometry({ texture, viewerMode }: { texture: THREE.Texture; viewerMode: PanoramaViewerMode }) {
  if (viewerMode === 'equirect-sphere') return <PanoramaSphereFull texture={texture} />;
  if (viewerMode === 'sphere-band') return <PanoramaSphereBand texture={texture} />;
  if (viewerMode === 'cylinder-band') return <PanoramaCylinder texture={texture} />;
  return <PanoramaFlatPlane texture={texture} />;
}

export function SceneBackdrop() {
  const { scene } = useThree();
  useEffect(() => {
    const oldBg = scene.background;
    scene.background = new THREE.Color(SCENE_BG_COLOR);
    return () => { scene.background = oldBg; };
  }, [scene]);
  return null;
}
