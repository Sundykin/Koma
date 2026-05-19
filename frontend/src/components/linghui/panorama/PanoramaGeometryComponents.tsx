import React, { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PanoramaViewerMode } from './panoramaProjection';
import { SCENE_BG_COLOR } from './panoramaViewerConstants';
import {
  buildPanoramaSphereFullMesh, buildPanoramaSphereBandMesh,
  buildPanoramaCylinderMesh, buildPanoramaFlatPlaneMesh,
  disposePanoramaMesh,
} from './panoramaSceneBuilder';

/**
 * 把 panoramaSceneBuilder 的纯 THREE.Mesh 挂到 R3F 树里，并管理生命周期。
 * 几何/材质参数与离屏 snapshot 共用同一份工厂，保证"所见即所抽"。
 */
function PanoramaMeshHost({
  build,
  texture,
  applyTextureAnisotropy,
}: {
  build: (texture: THREE.Texture) => THREE.Mesh;
  texture: THREE.Texture;
  applyTextureAnisotropy?: boolean;
}) {
  const { gl } = useThree();
  const mesh = useMemo(() => build(texture), [build, texture]);

  useEffect(() => () => disposePanoramaMesh(mesh), [mesh]);

  useEffect(() => {
    if (!applyTextureAnisotropy) return;
    const maxAnisotropy = gl?.capabilities?.getMaxAnisotropy?.() ?? 0;
    if (maxAnisotropy > 0 && texture.anisotropy !== maxAnisotropy) {
      texture.anisotropy = maxAnisotropy;
      texture.needsUpdate = true;
    }
  }, [applyTextureAnisotropy, gl, texture]);

  return <primitive object={mesh} />;
}

export function PanoramaSphereBand({ texture }: { texture: THREE.Texture }) {
  return <PanoramaMeshHost build={buildPanoramaSphereBandMesh} texture={texture} />;
}

export function PanoramaSphereFull({ texture }: { texture: THREE.Texture }) {
  return <PanoramaMeshHost build={buildPanoramaSphereFullMesh} texture={texture} applyTextureAnisotropy />;
}

export function PanoramaCylinder({ texture }: { texture: THREE.Texture }) {
  return <PanoramaMeshHost build={buildPanoramaCylinderMesh} texture={texture} />;
}

export function PanoramaFlatPlane({ texture }: { texture: THREE.Texture }) {
  return <PanoramaMeshHost build={buildPanoramaFlatPlaneMesh} texture={texture} />;
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
