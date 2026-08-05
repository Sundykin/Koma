/**
 * Director3D 主视口。
 *
 * 包含：
 *  - 单一工作台相机：用户编辑视角即最终取景视角
 *  - 背景：none / color / image-plane / panorama（cylinder/sphere/equirect 自动按 projectionMode）
 *  - 地面网格、原点指示器
 *  - 假人列表（procedural mesh）
 *  - 命令式句柄 onCanvasReady：交给父组件做截图导出
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  LinghuiDirector3DRenderMode,
  LinghuiDirector3DScene,
} from '../../../types/linghui';
import { resolveDirector3DColor } from './director3dColors';
import { ActorDragLayer } from './Director3DActorDragLayer';
import {
  Background,
  GroundGrid,
  SkyDome,
  useBackgroundTexture,
} from './Director3DEnvironment';
import { CaptureRenderer } from './Director3DViewportCapture';

export interface Director3DCaptureOptions {
  width?: number;
  height?: number;
  /** 导出风格：lineart（默认） / silhouette / depth / composition */
  renderMode?: LinghuiDirector3DRenderMode;
  /** 临时相机参数。提供时使用该相机渲染（不改 viewport 当前视角），用于批量多视角导出 */
  cameraOverride?: LinghuiDirector3DScene['camera'];
  /**
   * 强制使用此 scene 渲染（不读 props.scene）。
   * 时间轴逐帧导出用：外部直接传入 interpolateSceneAt(scene, t) 算出来的快照，
   * 避免依赖 React state 更新链路导致 capture 闭包仍是旧 scene 而产出静态视频。
   */
  sceneOverride?: LinghuiDirector3DScene;
}

export interface Director3DViewportHandle {
  /** 渲染当前镜头视角并把画面导出为 PNG dataUrl。 */
  captureCurrentView: (options?: Director3DCaptureOptions) => Promise<string | null>;
  /** 返回当前工作台视角对应的相机参数。 */
  getCurrentCamera: () => LinghuiDirector3DScene['camera'];
  /**
   * 返回当前轨道相机的 yaw (累计弧度，不取模) / pitch / distance。
   * 用于关键帧记录环绕镜头：position 是 [x,y,z] 看不出转了几圈，但 yaw 累计可以。
   */
  getCurrentOrbit: () => { yaw: number; pitch: number; distance: number };
}

interface Director3DViewportProps {
  scene: LinghuiDirector3DScene;
  selectedActorId?: string | null;
  onActorClick?: (actorId: string) => void;
  onActorMove?: (actorId: string, position: [number, number, number]) => void;
  onActorRotate?: (actorId: string, rotationY: number) => void;
  onCanvasClick?: () => void;
  onCameraChange?: (
    camera: LinghuiDirector3DScene['camera'],
    orbit: { yaw: number; pitch: number; distance: number },
  ) => void;
  /** lineart 渲染模式（影响假人材质 / 背景显隐 / 网格颜色） */
  renderMode?: 'preview' | 'lineart' | 'silhouette';
  /**
   * 相机模式：
   *  - 'output'（默认）：拖动 / 缩放 / 视角预设 直接写到 scene.camera = 输出相机
   *    所有关键帧 / 导出 lineart / 时间轴插值用的就是这个
   *  - 'editor'：拖动 / 缩放只改 viewport 内部 ref，不写回 scene.camera，
   *    不影响最终输出。用于"我想从其他角度看一眼场景"。
   *    切回 output 模式时 viewport 视角会重新对齐到 scene.camera。
   */
  cameraMode?: 'output' | 'editor';
  className?: string;
}

const PIVOT = new THREE.Vector3(0, 0.8, 0);

/**
 * 离屏导出复用的 WebGL renderer。如果每帧都 new THREE.WebGLRenderer()，
 * 浏览器会很快撞到 WebGL context 数量上限（~16），导致老 context 被踢、
 * 渲染崩溃。这里全局复用一个 canvas + renderer，只在尺寸变化时 setSize。
 */
/**
 * 递归 dispose 整棵 scene 的临时 geometry / material 资源 —— 避免逐帧导出内存泄漏。
 */
const _WORLD_UP = new THREE.Vector3(0, 1, 0);
const _UNUSED_WIRE_MATERIAL = new THREE.LineBasicMaterial({ color: 0x000000 });

interface OrbitCameraState {
  yaw: number;
  pitch: number;
  distance: number;
  pan: THREE.Vector3;
}

function toCameraTuple(vector: THREE.Vector3): [number, number, number] {
  return [
    Number(vector.x.toFixed(4)),
    Number(vector.y.toFixed(4)),
    Number(vector.z.toFixed(4)),
  ];
}

function resolveOrbitCameraState(camera: LinghuiDirector3DScene['camera']): OrbitCameraState {
  const position = new THREE.Vector3().fromArray(camera.position);
  const target = new THREE.Vector3().fromArray(camera.target);
  const offset = position.clone().sub(target);
  const distance = Math.max(0.1, offset.length());
  const pitch = Math.asin(Math.max(-1, Math.min(1, offset.y / distance)));
  const yaw = Math.atan2(offset.x, offset.z);
  return {
    yaw,
    pitch,
    distance,
    pan: target.clone().sub(PIVOT),
  };
}

function buildCameraFromOrbit(
  yaw: number,
  pitch: number,
  distance: number,
  pan: THREE.Vector3,
  baseCamera: LinghuiDirector3DScene['camera'],
): LinghuiDirector3DScene['camera'] {
  const cosP = Math.cos(pitch);
  const target = new THREE.Vector3(
    pan.x + PIVOT.x,
    pan.y + PIVOT.y,
    pan.z + PIVOT.z,
  );
  const position = new THREE.Vector3(
    Math.sin(yaw) * cosP * distance + target.x,
    Math.sin(pitch) * distance + target.y,
    Math.cos(yaw) * cosP * distance + target.z,
  );
  return {
    ...baseCamera,
    position: toCameraTuple(position),
    target: toCameraTuple(target),
  };
}

interface CameraRigProps {
  yawTargetRef: React.MutableRefObject<number>;
  pitchTargetRef: React.MutableRefObject<number>;
  distanceRef: React.MutableRefObject<number>;
  panOffsetRef: React.MutableRefObject<THREE.Vector3>;
  sceneCamera: LinghuiDirector3DScene['camera'];
  cameraStateRef: React.MutableRefObject<LinghuiDirector3DScene['camera']>;
}

const EditorCameraRig: React.FC<CameraRigProps> = ({
  yawTargetRef,
  pitchTargetRef,
  distanceRef,
  panOffsetRef,
  sceneCamera,
  cameraStateRef,
}) => {
  const { camera } = useThree();
  const tmp = useRef(new THREE.Vector3());

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    perspectiveCamera.fov = sceneCamera.fov;
    perspectiveCamera.updateProjectionMatrix();
  }, [camera, sceneCamera.fov]);

  useFrame(() => {
    const currentCamera = buildCameraFromOrbit(
      yawTargetRef.current,
      pitchTargetRef.current,
      distanceRef.current,
      panOffsetRef.current,
      sceneCamera,
    );
    tmp.current.fromArray(currentCamera.position);
    camera.position.lerp(tmp.current, 0.2);
    camera.lookAt(new THREE.Vector3().fromArray(currentCamera.target));
    cameraStateRef.current = {
      ...currentCamera,
      position: toCameraTuple(camera.position),
    };
  });

  return null;
};

export const Director3DViewport = forwardRef<Director3DViewportHandle, Director3DViewportProps>(
  function Director3DViewportInner(
    {
      scene,
      selectedActorId,
      onActorClick,
      onActorMove,
      onActorRotate,
      onCanvasClick,
      onCameraChange,
      renderMode = 'preview',
      cameraMode = 'output',
      className,
    },
    ref,
  ) {
    const cameraModeRef = useRef<'output' | 'editor'>(cameraMode);
    const initialOrbit = useMemo(() => resolveOrbitCameraState(scene.camera), []);
    const yawTargetRef = useRef(initialOrbit.yaw);
    const pitchTargetRef = useRef(initialOrbit.pitch);
    const distanceRef = useRef(initialOrbit.distance);
    const panOffsetRef = useRef(initialOrbit.pan);
    const isPanningRef = useRef(false);
    const isActorDragActiveRef = useRef(false);
    const suppressNextCanvasClickRef = useRef(false);
    const lastPointer = useRef<{ x: number; y: number } | null>(null);
    const captureFnRef = useRef<Director3DViewportHandle['captureCurrentView']>(() => Promise.resolve(null));
    const cameraStateRef = useRef<LinghuiDirector3DScene['camera']>(scene.camera);
    const texture = useBackgroundTexture(scene);

    useImperativeHandle(ref, () => ({
      captureCurrentView: (options) => captureFnRef.current(options),
      // viewport 当前显示的相机参数（编辑模式下 ≠ scene.camera，输出模式下 = scene.camera）
      // 用法：编辑器调用 viewport.getCurrentCamera() 拿到编辑视角，写到 scene.camera 即"应用为输出"
      getCurrentCamera: () => buildCameraFromOrbit(
        yawTargetRef.current,
        pitchTargetRef.current,
        distanceRef.current,
        panOffsetRef.current,
        scene.camera,
      ),
      // 用户拖动相机时 yawTargetRef 是累计弧度（不取模），所以连续转两圈 yaw = 4π
      getCurrentOrbit: () => ({
        yaw: yawTargetRef.current,
        pitch: pitchTargetRef.current,
        distance: distanceRef.current,
      }),
    }), [scene.camera]);

    useEffect(() => {
      // 当 scene.camera（输出相机）变化、或 mode 切回 output 时，重置 viewport 视角到输出相机
      // mode 切到 editor 时不重置：保留用户当前视角作为编辑起点
      const previousMode = cameraModeRef.current;
      cameraModeRef.current = cameraMode;
      const switchedBackToOutput = previousMode === 'editor' && cameraMode === 'output';
      if (cameraMode === 'output' || switchedBackToOutput) {
        const orbit = resolveOrbitCameraState(scene.camera);
        yawTargetRef.current = orbit.yaw;
        pitchTargetRef.current = orbit.pitch;
        distanceRef.current = orbit.distance;
        panOffsetRef.current.copy(orbit.pan);
        cameraStateRef.current = scene.camera;
      }
    }, [scene.camera, cameraMode]);

    const commitCurrentCamera = useCallback(() => {
      const currentCamera = buildCameraFromOrbit(
        yawTargetRef.current,
        pitchTargetRef.current,
        distanceRef.current,
        panOffsetRef.current,
        scene.camera,
      );
      cameraStateRef.current = currentCamera;
      // 编辑模式：viewport 视角变化只留在本地 ref，不写回 scene.camera，
      // 也就不会影响关键帧 / 导出 lineart / 时间轴动画
      if (cameraModeRef.current === 'editor') return;
      onCameraChange?.(currentCamera, {
        yaw: yawTargetRef.current,
        pitch: pitchTargetRef.current,
        distance: distanceRef.current,
      });
    }, [onCameraChange, scene.camera]);

    const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      if (isActorDragActiveRef.current) return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      lastPointer.current = { x: e.clientX, y: e.clientY };
      // 中键 / Shift + 左键 = pan
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        isPanningRef.current = true;
      }
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      if (isActorDragActiveRef.current) return;
      const last = lastPointer.current;
      if (!last) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      lastPointer.current = { x: e.clientX, y: e.clientY };

      if (isPanningRef.current) {
        const speed = 0.005 * distanceRef.current;
        const yaw = yawTargetRef.current;
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const up = new THREE.Vector3(0, 1, 0);
        panOffsetRef.current.addScaledVector(right, -dx * speed);
        panOffsetRef.current.addScaledVector(up, dy * speed);
        return;
      }

      // orbit
      yawTargetRef.current -= dx * 0.005;
      pitchTargetRef.current = Math.max(
        -Math.PI * 0.45,
        Math.min(Math.PI * 0.48, pitchTargetRef.current - dy * 0.005),
      );
    }, []);

    const endCameraInteraction = useCallback(() => {
      lastPointer.current = null;
      isPanningRef.current = false;
    }, []);

    const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      endCameraInteraction();
      if (!isActorDragActiveRef.current && Math.abs(e.movementX) < 2 && Math.abs(e.movementY) < 2) {
        // 视为 click（命中检测交给 mesh 自身的 onPointerDown）
      }
      commitCurrentCamera();
    }, [commitCurrentCamera, endCameraInteraction]);

    const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
      if (isActorDragActiveRef.current) return;
      const next = distanceRef.current * (e.deltaY > 0 ? 1.08 : 0.92);
      distanceRef.current = Math.max(2.5, Math.min(20, next));
      commitCurrentCamera();
    }, [commitCurrentCamera]);

    const handleActorPress = useCallback((actorId: string) => {
      suppressNextCanvasClickRef.current = true;
      onActorClick?.(actorId);
    }, [onActorClick]);

    const handleActorDragStart = useCallback(() => {
      isActorDragActiveRef.current = true;
      isPanningRef.current = false;
      lastPointer.current = null;
    }, []);

    const handleActorDragEnd = useCallback(() => {
      isActorDragActiveRef.current = false;
      lastPointer.current = null;
    }, []);

    const handleViewportClick = useCallback(() => {
      if (suppressNextCanvasClickRef.current) {
        suppressNextCanvasClickRef.current = false;
        return;
      }
      onCanvasClick?.();
    }, [onCanvasClick]);

    const registerCapture = useCallback((fn: Director3DViewportHandle['captureCurrentView']) => {
      captureFnRef.current = fn;
    }, []);

    const _lineColor = renderMode === 'lineart'
      ? resolveDirector3DColor('var(--token-border-base)', 'gray')
      : resolveDirector3DColor('var(--token-border-strong)', 'slategray');

    return (
      <div
        className={`linghuiDirector3DViewport ${className || ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={endCameraInteraction}
        onPointerCancel={endCameraInteraction}
        onWheel={onWheel}
        onClick={handleViewportClick}
      >
        <Canvas
          camera={{ position: [5, 3, 5], fov: 35, near: 0.05, far: 200 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: false }}
          resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
        >
          <ambientLight intensity={0.85} />
          <directionalLight position={[6, 8, 4]} intensity={0.65} />
          <directionalLight position={[-4, 6, -6]} intensity={0.3} />
          <Background scene={scene} texture={texture} renderMode={renderMode} />
          <SkyDome visible={renderMode === 'preview'} />
          <GroundGrid visible={scene.render.showGrid} />

          {/* 原点指示 */}
          <axesHelper args={[1.2]} position={[0, 0.01, 0]} />

          <ActorDragLayer
            actors={scene.actors}
            selectedActorId={selectedActorId}
            renderMode={renderMode}
            onActorPress={handleActorPress}
            onActorMove={onActorMove}
            onActorRotate={onActorRotate}
            onActorDragStart={handleActorDragStart}
            onActorDragEnd={handleActorDragEnd}
          />

          <EditorCameraRig
            yawTargetRef={yawTargetRef}
            pitchTargetRef={pitchTargetRef}
            distanceRef={distanceRef}
            panOffsetRef={panOffsetRef}
            sceneCamera={scene.camera}
            cameraStateRef={cameraStateRef}
          />

          <CaptureRenderer scene={scene} texture={texture} cameraStateRef={cameraStateRef} registerCapture={registerCapture} />
        </Canvas>
      </div>
    );
  },
);

export default Director3DViewport;
