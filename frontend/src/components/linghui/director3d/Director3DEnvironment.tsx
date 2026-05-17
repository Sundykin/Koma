import React, { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  LinghuiDirector3DScene,
} from '../../../types/linghui';
import { safeFetch } from '../../../utils/safeFetch';
import { resolvePanoramaViewerMode } from '../panorama/panoramaProjection';
import { resolveDirector3DColor } from './director3dColors';

export const GROUND_RADIUS = 15;
export const SKY_RADIUS = 20;
export const GROUND_GRID_TOTAL = GROUND_RADIUS * 2;
export const GROUND_GRID_DIVISIONS = 30;

export const ENV_CLOUDS: Array<{ x: number; z: number; y: number; rx: number; rz: number }> = [
  { x: -8, z: -6, y: 11, rx: 2.0, rz: 1.4 },
  { x: 7, z: -9, y: 12, rx: 2.6, rz: 1.6 },
  { x: -4, z: 8, y: 13, rx: 1.8, rz: 1.1 },
  { x: 9, z: 5, y: 10, rx: 2.2, rz: 1.5 },
  { x: 0, z: 10, y: 14, rx: 2.4, rz: 1.4 },
  { x: -10, z: 1, y: 13, rx: 1.9, rz: 1.2 },
];

function generateGroundNoiseDataUrl(size = 128, seed = 0xa1b2c3): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#e0ddd5';
  ctx.fillRect(0, 0, size, size);
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  for (let i = 0; i < size * size * 0.55; i++) {
    const x = (rand() * size) | 0;
    const y = (rand() * size) | 0;
    const r = rand();
    const dim = r < 0.5 ? 28 : r < 0.8 ? 14 : 8;
    ctx.fillStyle = r < 0.5
      ? `rgba(180,176,168,${0.18 + rand() * 0.18})`
      : `rgba(255,253,246,${0.14 + rand() * 0.14})`;
    ctx.fillRect(x, y, 1, 1);
    if (dim > 8 && r > 0.7) {
      ctx.fillRect(x + 1, y, 1, 1);
      ctx.fillRect(x, y + 1, 1, 1);
    }
  }
  return canvas.toDataURL('image/png');
}

let groundNoiseTexture: THREE.Texture | null = null;

export function getGroundNoiseTexture(): THREE.Texture {
  if (groundNoiseTexture) return groundNoiseTexture;
  const loader = new THREE.TextureLoader();
  const url = generateGroundNoiseDataUrl();
  groundNoiseTexture = loader.load(url);
  groundNoiseTexture.wrapS = THREE.RepeatWrapping;
  groundNoiseTexture.wrapT = THREE.RepeatWrapping;
  groundNoiseTexture.repeat.set(8, 8);
  return groundNoiseTexture;
}

export function GroundGrid({ visible }: { visible: boolean; lineColor?: string }) {
  const groundTexture = useMemo(() => (visible ? getGroundNoiseTexture() : null), [visible]);
  if (!visible) return null;
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow={false}>
        <circleGeometry args={[GROUND_RADIUS, 48]} />
        <meshStandardMaterial
          color="#dcd6c9"
          roughness={0.95}
          metalness={0}
          map={groundTexture ?? undefined}
        />
      </mesh>
      <gridHelper
        args={[GROUND_GRID_TOTAL, GROUND_GRID_DIVISIONS, '#c8c4bd', '#dad6cd']}
        position={[0, 0.001, 0]}
      />
    </>
  );
}

export function SkyDome({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <>
      <mesh>
        <sphereGeometry args={[SKY_RADIUS, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        <meshBasicMaterial color="#9ec6e8" side={THREE.BackSide} />
      </mesh>
      {ENV_CLOUDS.map((cloud, i) => (
        <mesh key={`cloud-${i}`} position={[cloud.x, cloud.y, cloud.z]} scale={[cloud.rx, 0.45, cloud.rz]}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshBasicMaterial color="#fefefe" />
        </mesh>
      ))}
    </>
  );
}

export function Background({
  scene,
  texture,
  renderMode,
}: {
  scene: LinghuiDirector3DScene;
  texture: THREE.Texture | null;
  renderMode: 'preview' | 'lineart' | 'silhouette';
}) {
  const bg = scene.background;
  const { scene: threeScene } = useThree();

  useEffect(() => {
    if (renderMode === 'lineart') {
      threeScene.background = new THREE.Color(resolveDirector3DColor('var(--token-bg-base)', 'black'));
      return;
    }
    if (bg.mode === 'color' && bg.color) {
      threeScene.background = new THREE.Color(resolveDirector3DColor(bg.color, 'black'));
    } else if (bg.mode === 'none') {
      threeScene.background = new THREE.Color(resolveDirector3DColor('var(--token-bg-app)', 'black'));
    }
    return undefined;
  }, [bg.color, bg.mode, renderMode, threeScene]);

  if (renderMode === 'lineart' || renderMode === 'silhouette') {
    return null;
  }

  if (bg.mode === 'image-plane' && texture) {
    return (
      <mesh position={[0, 4, -10]}>
        <planeGeometry args={[24, 13.5]} />
        <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    );
  }

  if (bg.mode === 'panorama' && texture) {
    const tex = texture as THREE.Texture & { image?: { width?: number; height?: number } };
    const viewerMode = resolvePanoramaViewerMode({
      projectionMode: bg.projectionMode,
      width: tex.image?.width,
      height: tex.image?.height,
    });

    if (viewerMode === 'equirect-sphere') {
      return (
        <mesh scale={[-1, 1, 1]}>
          <sphereGeometry args={[40, 96, 48]} />
          <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} />
        </mesh>
      );
    }
    if (viewerMode === 'sphere-band') {
      return (
        <mesh scale={[-1, 1, 1]}>
          <sphereGeometry args={[40, 64, 32, 0, Math.PI * 2, Math.PI * 0.2, Math.PI * 0.6]} />
          <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} />
        </mesh>
      );
    }
    if (viewerMode === 'cylinder-band') {
      const aspect = (tex.image?.width && tex.image?.height) ? tex.image.width / tex.image.height : 21 / 9;
      const radius = 40;
      const circumference = 2 * Math.PI * radius;
      const height = circumference / Math.max(aspect, 0.5);
      return (
        <mesh scale={[-1, 1, 1]} position={[0, 1, 0]} rotation={[0, bg.yawOffset ?? 0, 0]}>
          <cylinderGeometry args={[radius, radius, height, 64, 1, true]} />
          <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} />
        </mesh>
      );
    }
    return (
      <mesh position={[0, 4, -10]}>
        <planeGeometry args={[24, 13.5]} />
        <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    );
  }

  return null;
}

export function useBackgroundTexture(scene: LinghuiDirector3DScene): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const sourceUrl = scene.background.mode === 'image-plane' || scene.background.mode === 'panorama'
    ? scene.background.source ?? ''
    : '';

  useEffect(() => {
    if (!sourceUrl) {
      setTexture(null);
      return;
    }
    let cancelled = false;
    let blobUrl: string | null = null;
    let createdTexture: THREE.Texture | null = null;

    const finalize = (url: string) => {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(url, (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        createdTexture = tex;
        setTexture(tex);
      });
    };

    if (/^https?:\/\//i.test(sourceUrl)) {
      (async () => {
        try {
          const res = await safeFetch(sourceUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          if (cancelled) return;
          blobUrl = URL.createObjectURL(blob);
          finalize(blobUrl);
        } catch {
          if (!cancelled) setTexture(null);
        }
      })();
    } else {
      finalize(sourceUrl);
    }

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (createdTexture) createdTexture.dispose();
    };
  }, [sourceUrl]);

  return texture;
}
