import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  LinghuiMultiAngleAzimuth,
  LinghuiMultiAngleDistance,
  LinghuiMultiAngleElevation,
} from '../../../../types/linghui';
import {
  LINGHUI_MULTI_ANGLE_AZIMUTHS,
  LINGHUI_MULTI_ANGLE_DISTANCES,
  LINGHUI_MULTI_ANGLE_ELEVATIONS,
} from '../../../../types/linghui';
import { useTheme } from '../../../../theme/runtime';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MultiAngle3DViewportProps {
  imageUrl?: string;
  azimuth: LinghuiMultiAngleAzimuth;
  elevation: LinghuiMultiAngleElevation;
  distance: LinghuiMultiAngleDistance;
  onAngleChange: (azimuth: LinghuiMultiAngleAzimuth, elevation: LinghuiMultiAngleElevation) => void;
  onDistanceChange: (distance: LinghuiMultiAngleDistance) => void;
}

interface StageDragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startAzimuthIndex: number;
  startElevationIndex: number;
  lastAzimuthIndex: number;
  lastElevationIndex: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const AZIMUTH_VALUES = LINGHUI_MULTI_ANGLE_AZIMUTHS.map(item => item.value);
const ELEVATION_VALUES = LINGHUI_MULTI_ANGLE_ELEVATIONS.map(item => item.value);
const DISTANCE_VALUES = LINGHUI_MULTI_ANGLE_DISTANCES.map(item => item.value);

const BASE_RADIUS = 4;
const DRAG_AZIMUTH_STEP_PX = 54;
const DRAG_ELEVATION_STEP_PX = 52;
const WHEEL_DISTANCE_STEP = 44;
const PREVIEW_FOV = 34;
const PREVIEW_ASPECT = 1;
const TARGET_POINT = new THREE.Vector3(0, 1, 0);
const STAGE_CAMERA_POSITION = new THREE.Vector3(7.2, 4.8, 7.4);

interface ThreePreviewColors {
  accent: string;
  base: string;
  panel: string;
  metal: string;
  text: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function wrapIndex(value: number, length: number): number {
  return ((value % length) + length) % length;
}

function distanceToRadius(distance: LinghuiMultiAngleDistance): number {
  if (distance === 0.6) return BASE_RADIUS * 0.7;
  if (distance === 1) return BASE_RADIUS;
  return BASE_RADIUS * 1.5;
}

function getAzimuthIndex(value: LinghuiMultiAngleAzimuth): number {
  return Math.max(0, AZIMUTH_VALUES.indexOf(value));
}

function getElevationIndex(value: LinghuiMultiAngleElevation): number {
  return Math.max(0, ELEVATION_VALUES.indexOf(value));
}

function getDistanceIndex(value: LinghuiMultiAngleDistance): number {
  return Math.max(0, DISTANCE_VALUES.indexOf(value));
}

function toSpherical(azimuthDeg: number, elevationDeg: number, radius: number): THREE.Spherical {
  const theta = THREE.MathUtils.degToRad(azimuthDeg);
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  return new THREE.Spherical(radius, phi, theta);
}

function toWorldPosition(
  azimuth: number,
  elevation: number,
  distance: LinghuiMultiAngleDistance,
): THREE.Vector3 {
  const spherical = toSpherical(azimuth, elevation, distanceToRadius(distance));
  return new THREE.Vector3().setFromSpherical(spherical).add(TARGET_POINT);
}

function buildLookQuaternion(position: THREE.Vector3): THREE.Quaternion {
  const helper = new THREE.Object3D();
  helper.position.copy(position);
  helper.lookAt(TARGET_POINT);
  return helper.quaternion.clone();
}

/* ------------------------------------------------------------------ */
/*  ImagePlane                                                         */
/* ------------------------------------------------------------------ */

function ImagePlane({ url, colors }: { url: string; colors: ThreePreviewColors }) {
  const texture = useLoader(THREE.TextureLoader, url);
  const aspect = useMemo(() => {
    if (!texture.image) return 1;
    return texture.image.width / texture.image.height;
  }, [texture]);

  const width = aspect >= 1 ? 2.2 : 2.2 * aspect;
  const height = aspect >= 1 ? 2.2 / aspect : 2.2;

  return (
    <group>
      <mesh position={[0, height / 2, 0]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.04, 0]}>
        <cylinderGeometry args={[0.95, 1.05, 0.08, 32]} />
        <meshStandardMaterial color={colors.base} metalness={0.15} roughness={0.78} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  PlaceholderPlane                                                   */
/* ------------------------------------------------------------------ */

function PlaceholderPlane({ colors }: { colors: ThreePreviewColors }) {
  return (
    <group>
      <mesh position={[0, 1.05, 0]}>
        <planeGeometry args={[2, 2]} />
        <meshStandardMaterial color={colors.panel} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.04, 0]}>
        <cylinderGeometry args={[0.95, 1.05, 0.08, 32]} />
        <meshStandardMaterial color={colors.base} metalness={0.15} roughness={0.78} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  ProjectionArea — camera preview rectangle without connector rails  */
/* ------------------------------------------------------------------ */

function ProjectionArea({ position, colors }: { position: THREE.Vector3; colors: ThreePreviewColors }) {
  const quaternion = useMemo(() => buildLookQuaternion(position), [position]);
  const forward = useMemo(() => TARGET_POINT.clone().sub(position).normalize(), [position]);
  const previewDistance = Math.max(position.distanceTo(TARGET_POINT) - 0.55, 0.92);
  const frameHeight = 2 * Math.tan(THREE.MathUtils.degToRad(PREVIEW_FOV / 2)) * previewDistance;
  const frameWidth = frameHeight * PREVIEW_ASPECT;

  const frameCenter = useMemo(() => (
    position.clone().add(forward.clone().multiplyScalar(previewDistance))
  ), [forward, position, previewDistance]);

  const borderPositions = useMemo(() => (
    new Float32Array([
      -frameWidth / 2, frameHeight / 2, 0,
      frameWidth / 2, frameHeight / 2, 0,
      frameWidth / 2, frameHeight / 2, 0,
      frameWidth / 2, -frameHeight / 2, 0,
      frameWidth / 2, -frameHeight / 2, 0,
      -frameWidth / 2, -frameHeight / 2, 0,
      -frameWidth / 2, -frameHeight / 2, 0,
      -frameWidth / 2, frameHeight / 2, 0,
    ])
  ), [frameHeight, frameWidth]);

  return (
    <group position={[frameCenter.x, frameCenter.y, frameCenter.z]} quaternion={quaternion}>
      <mesh>
        <planeGeometry args={[frameWidth, frameHeight]} />
        <meshBasicMaterial color={colors.accent} transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={borderPositions.length / 3}
            array={borderPositions}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={colors.accent} transparent opacity={0.8} />
      </lineSegments>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  CameraRig — active camera icon                                     */
/* ------------------------------------------------------------------ */

function CameraRig({
  azimuth,
  elevation,
  distance,
  colors,
}: {
  azimuth: LinghuiMultiAngleAzimuth;
  elevation: LinghuiMultiAngleElevation;
  distance: LinghuiMultiAngleDistance;
  colors: ThreePreviewColors;
}) {
  const position = useMemo(() => toWorldPosition(azimuth, elevation, distance), [azimuth, elevation, distance]);
  const quaternion = useMemo(() => buildLookQuaternion(position), [position]);

  return (
    <group>
      <ProjectionArea position={position} colors={colors} />
      <group position={[position.x, position.y, position.z]} quaternion={quaternion}>
        <mesh scale={1.06}>
          <sphereGeometry args={[0.42, 18, 18]} />
          <meshBasicMaterial color={colors.accent} transparent opacity={0.07} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0, 0.12]}>
          <boxGeometry args={[0.58, 0.34, 0.34]} />
          <meshStandardMaterial color={colors.text} metalness={0.7} roughness={0.22} />
        </mesh>
        <mesh position={[0, 0, -0.22]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.14, 0.28, 18]} />
          <meshStandardMaterial color={colors.base} metalness={0.56} roughness={0.34} />
        </mesh>
        <mesh position={[0, 0, -0.38]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.11, 0.03, 10, 20]} />
          <meshStandardMaterial color={colors.accent} emissive={colors.accent} emissiveIntensity={0.34} />
        </mesh>
        <mesh position={[0, 0.23, 0.1]}>
          <boxGeometry args={[0.18, 0.12, 0.18]} />
          <meshStandardMaterial color={colors.metal} metalness={0.48} roughness={0.44} />
        </mesh>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  StageCamera                                                        */
/* ------------------------------------------------------------------ */

function StageCamera() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.copy(STAGE_CAMERA_POSITION);
    camera.lookAt(TARGET_POINT);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

/* ------------------------------------------------------------------ */
/*  Scene                                                              */
/* ------------------------------------------------------------------ */

function Scene({
  imageUrl,
  azimuth,
  elevation,
  distance,
  onAngleChange,
  onDistanceChange,
  colors,
}: MultiAngle3DViewportProps & { colors: ThreePreviewColors }) {
  return (
    <>
      <StageCamera />
      <ambientLight intensity={0.8} />
      <directionalLight position={[6, 8, 4]} intensity={1.1} />
      <directionalLight position={[-4, 5, -6]} intensity={0.45} />
      <spotLight position={[0, 8, 0]} intensity={0.4} angle={0.48} penumbra={0.8} />

      {imageUrl ? <ImagePlane url={imageUrl} colors={colors} /> : <PlaceholderPlane colors={colors} />}

      <CameraRig azimuth={azimuth} elevation={elevation} distance={distance} colors={colors} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Viewport (exported)                                                */
/* ------------------------------------------------------------------ */

export const LinghuiMultiAngle3DViewport: React.FC<MultiAngle3DViewportProps> = ({
  azimuth,
  elevation,
  distance,
  onAngleChange,
  onDistanceChange,
  ...sceneProps
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<StageDragState | null>(null);
  const wheelDeltaRef = useRef(0);
  const latestDistanceIndexRef = useRef(getDistanceIndex(distance));
  const { theme } = useTheme();
  const threeColors = useMemo<ThreePreviewColors>(() => ({
    accent: theme.tokens.status.info,
    base: theme.tokens.bg.app,
    panel: theme.tokens.bg.hover,
    metal: theme.tokens.text.tertiary,
    text: theme.tokens.text.secondary,
  }), [theme]);

  useEffect(() => {
    latestDistanceIndexRef.current = getDistanceIndex(distance);
  }, [distance]);

  const applyWheelDelta = useCallback((deltaY: number) => {
    wheelDeltaRef.current += deltaY;
    const stepCount = wheelDeltaRef.current > 0
      ? Math.floor(wheelDeltaRef.current / WHEEL_DISTANCE_STEP)
      : Math.ceil(wheelDeltaRef.current / WHEEL_DISTANCE_STEP);

    if (stepCount === 0) return;

    wheelDeltaRef.current -= stepCount * WHEEL_DISTANCE_STEP;

    const nextDistanceIndex = clamp(
      latestDistanceIndexRef.current + stepCount,
      0,
      DISTANCE_VALUES.length - 1,
    );

    if (nextDistanceIndex === latestDistanceIndexRef.current) return;

    latestDistanceIndexRef.current = nextDistanceIndex;
    onDistanceChange(DISTANCE_VALUES[nextDistanceIndex]);
  }, [onDistanceChange]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheelEvent = (event: WheelEvent) => {
      event.preventDefault();
      applyWheelDelta(event.deltaY);
    };

    viewport.addEventListener('wheel', handleWheelEvent, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', handleWheelEvent);
    };
  }, [applyWheelDelta]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    const startAzimuthIndex = getAzimuthIndex(azimuth);
    const startElevationIndex = getElevationIndex(elevation);

    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startAzimuthIndex,
      startElevationIndex,
      lastAzimuthIndex: startAzimuthIndex,
      lastElevationIndex: startElevationIndex,
    };
    setIsDragging(true);
  }, [azimuth, elevation]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startClientX;
    const deltaY = event.clientY - dragState.startClientY;
    const azimuthStepOffset = Math.round(deltaX / DRAG_AZIMUTH_STEP_PX);
    const elevationStepOffset = Math.round(-deltaY / DRAG_ELEVATION_STEP_PX);

    const nextAzimuthIndex = wrapIndex(dragState.startAzimuthIndex + azimuthStepOffset, AZIMUTH_VALUES.length);
    const nextElevationIndex = clamp(
      dragState.startElevationIndex + elevationStepOffset,
      0,
      ELEVATION_VALUES.length - 1,
    );

    if (nextAzimuthIndex === dragState.lastAzimuthIndex && nextElevationIndex === dragState.lastElevationIndex) {
      return;
    }

    dragState.lastAzimuthIndex = nextAzimuthIndex;
    dragState.lastElevationIndex = nextElevationIndex;
    onAngleChange(AZIMUTH_VALUES[nextAzimuthIndex], ELEVATION_VALUES[nextElevationIndex]);
  }, [onAngleChange]);

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    dragStateRef.current = null;
    setIsDragging(false);

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore browsers that release capture earlier than React notifies us.
    }
  }, []);

  return (
    <div
      ref={viewportRef}
      className={`linghuiMultiAngle3DViewport ${isDragging ? 'isDragging' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="presentation"
    >
      <Canvas
        camera={{
          position: [STAGE_CAMERA_POSITION.x, STAGE_CAMERA_POSITION.y, STAGE_CAMERA_POSITION.z],
          fov: 34,
          near: 0.1,
          far: 120,
        }}
        gl={{ antialias: true, alpha: true }}
      >
        <Scene
          {...sceneProps}
          azimuth={azimuth}
          elevation={elevation}
          distance={distance}
          onAngleChange={onAngleChange}
          onDistanceChange={onDistanceChange}
          colors={threeColors}
        />
      </Canvas>
    </div>
  );
};
