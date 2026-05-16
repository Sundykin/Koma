import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import * as THREE from 'three';
import type { LinghuiMultiAngleMode } from '../../../../types/linghui';
import { useTheme } from '../../../../theme/runtime';

interface MultiAngle3DViewportProps {
  imageUrl?: string;
  mode: LinghuiMultiAngleMode;
  rotation: number;
  tilt: number;
  scale: number;
  isWideAngle: boolean;
  onRotationTiltChange: (rotation: number, tilt: number) => void;
  onScaleChange: (scale: number) => void;
}

interface ThreePreviewColors {
  accent: string;
  base: string;
  panel: string;
  metal: string;
  text: string;
}

const TARGET_POINT = new THREE.Vector3(0, 1, 0);
const STAGE_CAMERA_POSITION = new THREE.Vector3(7.4, 5.2, 7.8);
const CAMERA_PREVIEW_FOV = 34;
const CAMERA_FIXED_ANGLES = [
  { rotation: 45, tilt: 0 },
  { rotation: -45, tilt: 0 },
  { rotation: 45, tilt: -30 },
  { rotation: -45, tilt: -30 },
  { rotation: 135, tilt: -30 },
  { rotation: -135, tilt: -30 },
  { rotation: 135, tilt: 60 },
  { rotation: -135, tilt: 60 },
  { rotation: 0, tilt: -30 },
  { rotation: 180, tilt: 0 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function snapCameraRotation(value: number): number {
  return ((Math.round(value / 45) * 45) % 360 + 360) % 360;
}

function snapCameraTilt(value: number): number {
  return clamp(Math.round(value / 30) * 30, -30, 60);
}

function scaleToZoom(scale: number): number {
  return 0.92 + clamp(scale, 0, 100) / 100 * 0.58;
}

function scaleToCameraRadius(scale: number): number {
  return 5.7 - clamp(scale, 0, 100) / 100 * 2.2;
}

function toWorldPosition(rotationDeg: number, tiltDeg: number, scale: number): THREE.Vector3 {
  const radius = scaleToCameraRadius(scale);
  const theta = THREE.MathUtils.degToRad(rotationDeg);
  const phi = THREE.MathUtils.degToRad(90 - tiltDeg);
  return new THREE.Vector3().setFromSpherical(new THREE.Spherical(radius, phi, theta)).add(TARGET_POINT);
}

function buildLookQuaternion(position: THREE.Vector3): THREE.Quaternion {
  const helper = new THREE.Object3D();
  helper.position.copy(position);
  helper.lookAt(TARGET_POINT);
  return helper.quaternion.clone();
}

function ImagePlane({ url, colors, scale }: { url?: string; colors: ThreePreviewColors; scale: number }) {
  const texture = useMemo(() => {
    if (!url) return null;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const tex = loader.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [url]);
  const width = 2.1 * scale;
  const height = 2.1 * scale;
  const geometry = useMemo(() => new THREE.BoxGeometry(width, height, 0.12), [height, width]);

  return (
    <mesh position={[0, 1, 0]}>
      <primitive object={geometry} attach="geometry" />
      {texture ? (
        <meshStandardMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} roughness={0.62} />
      ) : (
        <meshStandardMaterial color={colors.panel} side={THREE.DoubleSide} roughness={0.78} />
      )}
      <lineSegments>
        <edgesGeometry args={[geometry]} />
        <lineBasicMaterial color={colors.accent} transparent opacity={0.58} />
      </lineSegments>
    </mesh>
  );
}

function ReferenceCube({
  imageUrl,
  rotation,
  tilt,
  scale,
  mode,
  colors,
}: {
  imageUrl?: string;
  rotation: number;
  tilt: number;
  scale: number;
  mode: LinghuiMultiAngleMode;
  colors: ThreePreviewColors;
}) {
  const objectRotation: [number, number, number] = mode === 'object'
    ? [THREE.MathUtils.degToRad(-tilt), THREE.MathUtils.degToRad(rotation), 0]
    : [0, 0, 0];

  return (
    <group rotation={objectRotation}>
      <ImagePlane url={imageUrl} colors={colors} scale={scaleToZoom(scale)} />
      <mesh position={[0, -0.08, 0]}>
        <cylinderGeometry args={[1.15, 1.25, 0.08, 40]} />
        <meshStandardMaterial color={colors.base} roughness={0.8} metalness={0.18} />
      </mesh>
    </group>
  );
}

function SphereGrid({
  rotation,
  tilt,
  visible,
  colors,
  subtle = false,
}: {
  rotation: number;
  tilt: number;
  visible: boolean;
  colors: ThreePreviewColors;
  subtle?: boolean;
}) {
  if (!visible) return null;
  return (
    <group rotation={[THREE.MathUtils.degToRad(-tilt), THREE.MathUtils.degToRad(rotation), 0]}>
      <mesh position={[0, 1, 0]}>
        <sphereGeometry args={[2.65, 32, 18]} />
        <meshBasicMaterial color={colors.accent} transparent opacity={subtle ? 0.07 : 0.13} wireframe />
      </mesh>
      <mesh position={[0, 1, 0]}>
        <sphereGeometry args={[2.62, 32, 18]} />
        <meshBasicMaterial color={colors.text} transparent opacity={subtle ? 0.03 : 0.05} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

function ProjectionArea({ position, colors, isWideAngle }: { position: THREE.Vector3; colors: ThreePreviewColors; isWideAngle: boolean }) {
  const quaternion = useMemo(() => buildLookQuaternion(position), [position]);
  const forward = useMemo(() => TARGET_POINT.clone().sub(position).normalize(), [position]);
  const previewDistance = Math.max(position.distanceTo(TARGET_POINT) - 0.4, 0.9);
  const fov = isWideAngle ? CAMERA_PREVIEW_FOV * 1.35 : CAMERA_PREVIEW_FOV;
  const frameHeight = 2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)) * previewDistance;
  const frameWidth = frameHeight;
  const frameCenter = useMemo(() => position.clone().add(forward.clone().multiplyScalar(previewDistance)), [forward, position, previewDistance]);

  return (
    <group position={[frameCenter.x, frameCenter.y, frameCenter.z]} quaternion={quaternion}>
      <mesh>
        <planeGeometry args={[frameWidth, frameHeight]} />
        <meshBasicMaterial color={colors.accent} transparent opacity={isWideAngle ? 0.16 : 0.09} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.PlaneGeometry(frameWidth, frameHeight)]} />
        <lineBasicMaterial color={colors.accent} transparent opacity={0.84} />
      </lineSegments>
    </group>
  );
}

function CameraRig({
  rotation,
  tilt,
  scale,
  isWideAngle,
  colors,
  faint = false,
}: {
  rotation: number;
  tilt: number;
  scale: number;
  isWideAngle: boolean;
  colors: ThreePreviewColors;
  faint?: boolean;
}) {
  const position = useMemo(() => toWorldPosition(rotation, tilt, scale), [rotation, scale, tilt]);
  const quaternion = useMemo(() => buildLookQuaternion(position), [position]);
  const opacity = faint ? 0.22 : 1;

  return (
    <group>
      {!faint && <ProjectionArea position={position} colors={colors} isWideAngle={isWideAngle} />}
      <group position={[position.x, position.y, position.z]} quaternion={quaternion} scale={faint ? 0.58 : 1}>
        <mesh position={[0, 0, 0.12]}>
          <boxGeometry args={[0.56, 0.34, 0.32]} />
          <meshStandardMaterial color={colors.text} metalness={0.65} roughness={0.24} transparent opacity={opacity} />
        </mesh>
        <mesh position={[0, 0, -0.22]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.14, 0.28, 18]} />
          <meshStandardMaterial color={colors.base} metalness={0.56} roughness={0.34} transparent opacity={opacity} />
        </mesh>
        <mesh position={[0, 0, -0.38]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.11, 0.03, 10, 20]} />
          <meshStandardMaterial color={colors.accent} emissive={colors.accent} emissiveIntensity={faint ? 0.08 : 0.34} transparent opacity={opacity} />
        </mesh>
      </group>
    </group>
  );
}

function StageCamera() {
  const { camera } = useThree();
  React.useEffect(() => {
    camera.position.copy(STAGE_CAMERA_POSITION);
    camera.lookAt(TARGET_POINT);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

function Scene(props: MultiAngle3DViewportProps & { colors: ThreePreviewColors }) {
  const showCamera = props.mode === 'camera';
  return (
    <>
      <StageCamera />
      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 8, 4]} intensity={1.1} />
      <directionalLight position={[-4, 5, -6]} intensity={0.45} />
      <ReferenceCube
        imageUrl={props.imageUrl}
        rotation={props.rotation}
        tilt={props.tilt}
        scale={props.scale}
        mode={props.mode}
        colors={props.colors}
      />
      <SphereGrid
        rotation={props.rotation}
        tilt={props.tilt}
        visible
        colors={props.colors}
        subtle={!showCamera}
      />
      {showCamera ? (
        <>
          <CameraRig
            rotation={props.rotation}
            tilt={props.tilt}
            scale={props.scale}
            isWideAngle={props.isWideAngle}
            colors={props.colors}
          />
          {CAMERA_FIXED_ANGLES.map(angle => (
            <CameraRig
              key={`${angle.rotation}-${angle.tilt}`}
              rotation={angle.rotation}
              tilt={angle.tilt}
              scale={50}
              isWideAngle={false}
              colors={props.colors}
              faint
            />
          ))}
        </>
      ) : null}
    </>
  );
}

export const LinghuiMultiAngle3DViewport: React.FC<MultiAngle3DViewportProps> = ({
  mode,
  rotation,
  tilt,
  scale,
  isWideAngle,
  onRotationTiltChange,
  onScaleChange,
  ...sceneProps
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number; rotation: number; tilt: number } | null>(null);
  const { theme } = useTheme();
  const colors = useMemo<ThreePreviewColors>(() => ({
    accent: theme.tokens.status.info,
    base: theme.tokens.bg.app,
    panel: theme.tokens.bg.hover,
    metal: theme.tokens.text.tertiary,
    text: theme.tokens.text.secondary,
  }), [theme]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, rotation, tilt };
    setIsDragging(true);
  }, [rotation, tilt]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const nextRotation = mode === 'camera'
      ? snapCameraRotation(drag.rotation + dx * 0.8)
      : clamp(drag.rotation + dx * 0.55, -180, 180);
    const nextTilt = mode === 'camera'
      ? snapCameraTilt(drag.tilt - dy * 0.8)
      : clamp(drag.tilt + dy * 0.55, -90, 90);
    onRotationTiltChange(nextRotation, nextTilt);
  }, [mode, onRotationTiltChange]);

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setIsDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture can already be gone when React receives cancel/up.
    }
  }, []);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const step = mode === 'camera' ? 50 : 10;
    onScaleChange(clamp(scale + (event.deltaY > 0 ? -step : step), 0, 100));
  }, [mode, onScaleChange, scale]);

  const handleDirectionNudge = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    if (mode === 'camera') {
      const nextRotation = direction === 'left'
        ? snapCameraRotation(rotation - 45)
        : direction === 'right'
          ? snapCameraRotation(rotation + 45)
          : snapCameraRotation(rotation);
      const nextTilt = direction === 'up'
        ? snapCameraTilt(tilt + 30)
        : direction === 'down'
          ? snapCameraTilt(tilt - 30)
          : snapCameraTilt(tilt);
      onRotationTiltChange(nextRotation, nextTilt);
      return;
    }

    const nextRotation = direction === 'left'
      ? clamp(rotation - 15, -180, 180)
      : direction === 'right'
        ? clamp(rotation + 15, -180, 180)
        : rotation;
    const nextTilt = direction === 'up'
      ? clamp(tilt - 15, -90, 90)
      : direction === 'down'
        ? clamp(tilt + 15, -90, 90)
        : tilt;
    onRotationTiltChange(nextRotation, nextTilt);
  }, [mode, onRotationTiltChange, rotation, tilt]);

  const handleDirectionPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return (
    <div
      className={`linghuiMultiAngle3DViewport mode-${mode} ${isDragging ? 'isDragging' : ''} ${isWideAngle ? 'isWideAngle' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={handleWheel}
      role="presentation"
    >
      <Canvas
        camera={{
          position: [STAGE_CAMERA_POSITION.x, STAGE_CAMERA_POSITION.y, STAGE_CAMERA_POSITION.z],
          fov: isWideAngle ? 28 : 34,
          near: 0.1,
          far: 120,
        }}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
      >
        <Scene
          {...sceneProps}
          mode={mode}
          rotation={rotation}
          tilt={tilt}
          scale={scale}
          isWideAngle={isWideAngle}
          onRotationTiltChange={onRotationTiltChange}
          onScaleChange={onScaleChange}
          colors={colors}
        />
      </Canvas>
      <div className="linghuiMultiAngleDirectionPad" aria-label="视角方向控制">
        <button
          type="button"
          className="isUp"
          aria-label="向上"
          onPointerDown={handleDirectionPointerDown}
          onClick={() => handleDirectionNudge('up')}
        >
          <ChevronUp size={16} />
        </button>
        <button
          type="button"
          className="isDown"
          aria-label="向下"
          onPointerDown={handleDirectionPointerDown}
          onClick={() => handleDirectionNudge('down')}
        >
          <ChevronDown size={16} />
        </button>
        <button
          type="button"
          className="isLeft"
          aria-label="向左"
          onPointerDown={handleDirectionPointerDown}
          onClick={() => handleDirectionNudge('left')}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          className="isRight"
          aria-label="向右"
          onPointerDown={handleDirectionPointerDown}
          onClick={() => handleDirectionNudge('right')}
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="linghuiMultiAngle3DHint">
        {mode === 'camera' ? 'Camera · drag to orbit' : 'Object · drag cube'}
      </div>
    </div>
  );
};
