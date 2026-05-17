import React, { useCallback, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import type { LinghuiRelightDirection } from '../../../../types/linghui';

type LightingViewMode = 'perspective' | 'front';

interface LinghuiLightingSpherePreviewProps {
  imageUrl?: string;
  direction: LinghuiRelightDirection;
  brightness: number;
  lightColor: string;
  rimLight: boolean;
  onDirectionChange?: (direction: LinghuiRelightDirection) => void;
}

const LIGHT_DIRECTION_VECTORS: Record<LinghuiRelightDirection, [number, number, number]> = {
  front: [0, 0, 1],
  'front-right': [0.707, 0, 0.707],
  right: [1, 0, 0],
  'back-right': [0.707, 0, -0.707],
  back: [0, 0, -1],
  'back-left': [-0.707, 0, -0.707],
  left: [-1, 0, 0],
  'front-left': [-0.707, 0, 0.707],
  'high-front': [0, 0.65, 0.76],
  'high-front-right': [0.54, 0.65, 0.54],
  'high-right': [0.76, 0.65, 0],
  'high-back-right': [0.54, 0.65, -0.54],
  'high-back': [0, 0.65, -0.76],
  'high-back-left': [-0.54, 0.65, -0.54],
  'high-left': [-0.76, 0.65, 0],
  'high-front-left': [-0.54, 0.65, 0.54],
  'low-front': [0, -0.65, 0.76],
  'low-front-right': [0.54, -0.65, 0.54],
  'low-right': [0.76, -0.65, 0],
  'low-back-right': [0.54, -0.65, -0.54],
  'low-back': [0, -0.65, -0.76],
  'low-back-left': [-0.54, -0.65, -0.54],
  'low-left': [-0.76, -0.65, 0],
  'low-front-left': [-0.54, -0.65, 0.54],
  top: [0, 1, 0],
  bottom: [0, -1, 0],
};

function isDomTestEnvironment(): boolean {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
}

function directionToVector(direction: LinghuiRelightDirection, radius = 4.2): THREE.Vector3 {
  const raw = LIGHT_DIRECTION_VECTORS[direction] ?? LIGHT_DIRECTION_VECTORS.front;
  return new THREE.Vector3(raw[0], raw[1], raw[2]).normalize().multiplyScalar(radius);
}

function vectorToPrimaryDirection(x: number, y: number): LinghuiRelightDirection {
  const absX = Math.abs(x);
  const absY = Math.abs(y);
  if (absY > absX * 1.12) {
    return y < 0 ? 'top' : 'bottom';
  }
  if (absX < 0.18 && absY < 0.18) return 'front';
  return x < 0 ? 'left' : 'right';
}

function ImageCard({ imageUrl }: { imageUrl?: string }) {
  const texture = useMemo(() => {
    if (!imageUrl) return null;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const tex = loader.load(imageUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [imageUrl]);

  return (
    <mesh position={[0, -1.42, 0.42]}>
      <boxGeometry args={[0.82, 0.82, 0.05]} />
      {texture ? (
        <meshStandardMaterial map={texture} roughness={0.62} metalness={0.04} />
      ) : (
        <meshStandardMaterial color="#d5dbe3" roughness={0.7} metalness={0.04} />
      )}
    </mesh>
  );
}

function DemoLightingSphere({ color }: { color: string }) {
  return (
    <group position={[0, 0.34, 0]}>
      <mesh>
        <sphereGeometry args={[1.12, 64, 32]} />
        <meshStandardMaterial color="#d5dbe3" roughness={0.55} metalness={0.02} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.15, 32, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} wireframe />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.28, 0.012, 8, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.62} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[1.28, 0.01, 8, 96]} />
        <meshBasicMaterial color="#9aa5b3" transparent opacity={0.28} />
      </mesh>
    </group>
  );
}

function LightOrb({
  position,
  color,
  opacity,
  size,
}: {
  position: THREE.Vector3;
  color: string;
  opacity: number;
  size: number;
}) {
  const quaternion = useMemo(() => {
    const helper = new THREE.Object3D();
    helper.position.copy(position);
    helper.lookAt(0, 0, 0);
    return helper.quaternion.clone();
  }, [position]);

  return (
    <group position={[position.x, position.y, position.z]} quaternion={quaternion}>
      <pointLight color={color} intensity={opacity * 4} distance={10} />
      <mesh>
        <sphereGeometry args={[size, 32, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.1} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0, 1.4]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[1.05, 3.2, 64, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={Math.max(0.12, opacity * 0.26)} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

function LightingScene({
  imageUrl,
  direction,
  brightness,
  lightColor,
  rimLight,
  viewMode,
}: LinghuiLightingSpherePreviewProps & { viewMode: LightingViewMode }) {
  const mainPosition = useMemo(() => directionToVector(direction), [direction]);
  const rimPosition = useMemo(() => directionToVector('back-left', 4.1), []);
  const intensity = Math.max(0.1, Math.min(1, brightness / 100));

  return (
    <>
      <ambientLight intensity={0.58} />
      <pointLight position={[mainPosition.x, mainPosition.y, mainPosition.z]} color={lightColor} intensity={4.8 * intensity} distance={14} />
      {rimLight && <pointLight position={[rimPosition.x, rimPosition.y, rimPosition.z]} color={lightColor} intensity={2.4} distance={12} />}
      <group rotation={viewMode === 'front' ? [0, 0, 0] : [-0.18, 0.42, 0]}>
        <mesh>
          <sphereGeometry args={[3.55, 48, 32]} />
          <meshBasicMaterial color="#7d8794" transparent opacity={0.16} wireframe />
        </mesh>
        <mesh>
          <sphereGeometry args={[3.44, 64, 32]} />
          <meshStandardMaterial color="#202631" transparent opacity={0.18} roughness={0.9} side={THREE.BackSide} />
        </mesh>
        <DemoLightingSphere color={lightColor} />
        <ImageCard imageUrl={imageUrl} />
        <LightOrb position={mainPosition} color={lightColor} opacity={intensity} size={0.2 + intensity * 0.12} />
        {rimLight && <LightOrb position={rimPosition} color={lightColor} opacity={0.58} size={0.16} />}
      </group>
    </>
  );
}

export const LinghuiLightingSpherePreview: React.FC<LinghuiLightingSpherePreviewProps> = ({
  imageUrl,
  direction,
  brightness,
  lightColor,
  rimLight,
  onDirectionChange,
}) => {
  const [viewMode, setViewMode] = useState<LightingViewMode>('perspective');

  const handlePointerDirection = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!onDirectionChange) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    onDirectionChange(vectorToPrimaryDirection(x, y));
  }, [onDirectionChange]);

  return (
    <div className="linghuiLightingSpherePreview">
      <div className="linghuiImageLibTVSegmented">
        <button type="button" className={viewMode === 'perspective' ? 'isActive' : ''} onClick={() => setViewMode('perspective')}>
          透视
        </button>
        <button type="button" className={viewMode === 'front' ? 'isActive' : ''} onClick={() => setViewMode('front')}>
          正面
        </button>
      </div>
      <div className="linghuiLightingSphereCanvas" onPointerDown={handlePointerDirection} onPointerMove={(event) => {
        if (event.buttons === 1) handlePointerDirection(event);
      }}>
        {isDomTestEnvironment() ? (
          <canvas aria-label="打光光球预览" />
        ) : (
          <Canvas
            camera={{
              position: viewMode === 'front' ? [0, 0.4, 9.8] : [6.6, 4.8, 7.4],
              fov: 48,
              near: 0.1,
              far: 100,
            }}
            gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
            dpr={[1, 2]}
          >
            <LightingScene
              imageUrl={imageUrl}
              direction={direction}
              brightness={brightness}
              lightColor={lightColor}
              rimLight={rimLight}
              viewMode={viewMode}
            />
          </Canvas>
        )}
      </div>
    </div>
  );
};
